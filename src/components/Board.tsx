'use client';

/**
 * The 3×3 board. Pure presentation — every state shown here came from
 * the server. Move hints are computed locally for UX only; the server
 * re-validates everything.
 *
 * Rendered from the current player's perspective: my bricks are always
 * at the bottom (opponent's view is rotated 180°).
 *
 * Interaction: click a brick then a square — or press a brick and DRAG it
 * onto a square (pointer events; works with mouse and touch).
 */

import { useMemo, useRef, useState } from 'react';
import { legalTargetsFor } from '@/game/engine';
import type { EngineState, Side, Stone } from '@/game/types';
import { sounds } from '@/lib/sound';
import { cn } from '@/lib/utils';

interface BoardProps {
  state: EngineState;
  mySide: Side | null;
  selectedStoneId: string | null;
  onSelectStone: (stoneId: string) => void;
  onTarget: (pos: number) => void;
  lastMoveTo: number | null;
  disabled: boolean;
}

interface DragState {
  stoneId: string;
  /** pointer position within the stones layer (px) */
  x: number;
  y: number;
  /** layer cell size at last move event (px) */
  cw: number;
  ch: number;
  /** legal logical position currently hovered, else null */
  over: number | null;
}

function rowCol(pos: number): { row: number; col: number } {
  return { row: Math.floor(pos / 3), col: pos % 3 };
}

/** Badge for khawaja bricks (never moved yet) */
function KhawajaBadge() {
  return (
    <span
      className="absolute -top-2 start-1/2 z-10 flex h-5 w-5 -translate-x-1/2 items-center justify-center rounded-full bg-amber-300 text-[10px] font-extrabold text-amber-900 shadow-md ring-1 ring-amber-500"
      title="طوبة خواجة — لسه ماتحركتش"
      aria-label="طوبة خواجة"
    >
      خ
    </span>
  );
}

/**
 * A real brick. Each player's three bricks share one material:
 *   side A → red fired clay (طوب أحمر) · side B → white limestone (طوب أبيض)
 * 3D look is pure CSS: top bevel highlight, bottom thickness shadow, strata.
 */
function Brick({ stone, lifted }: { stone: Stone; lifted: boolean }) {
  const clay = stone.side === 'A';
  return (
    <span
      className={cn(
        'relative block h-[58%] w-[82%] rounded-md transition-transform duration-150',
        clay
          ? 'bg-gradient-to-b from-[#e2704a] via-[#c34e2a] to-[#93311a] ring-1 ring-[#5f1d0d] shadow-[inset_0_2px_0_rgba(255,235,220,0.45),inset_0_-3px_0_rgba(0,0,0,0.4),0_5px_10px_rgba(0,0,0,0.55)]'
          : 'bg-gradient-to-b from-[#f6eeda] via-[#e0d2b2] to-[#bfae8a] ring-1 ring-[#8a7a58] shadow-[inset_0_2px_0_rgba(255,255,255,0.75),inset_0_-3px_0_rgba(120,100,70,0.5),0_5px_10px_rgba(0,0,0,0.5)]',
        lifted && 'scale-110',
      )}
    >
      {/* baked-clay / limestone strata */}
      <span
        className={cn(
          'pointer-events-none absolute inset-0 rounded-md',
          clay
            ? 'bg-[repeating-linear-gradient(0deg,transparent_0px,transparent_5px,rgba(0,0,0,0.09)_5px,rgba(0,0,0,0.09)_6px)]'
            : 'bg-[repeating-linear-gradient(0deg,transparent_0px,transparent_5px,rgba(120,100,70,0.14)_5px,rgba(120,100,70,0.14)_6px)]',
        )}
      />
      {!stone.moved && <KhawajaBadge />}
      <span className="sr-only">{stone.moved ? 'طوبة' : 'طوبة خواجة'}</span>
    </span>
  );
}

export function Board({
  state,
  mySide,
  selectedStoneId,
  onSelectStone,
  onTarget,
  lastMoveTo,
  disabled,
}: BoardProps) {
  const myTurn = mySide !== null && state.turn === mySide && state.status === 'active';
  const rotate = mySide === 'B'; // B sees the board flipped so own bricks sit at the bottom

  const layerRef = useRef<HTMLDivElement>(null);
  const pendingRef = useRef<{ stoneId: string; pointerId: number; startX: number; startY: number } | null>(null);
  const [drag, setDrag] = useState<DragState | null>(null);

  // Targets for the click-selected brick
  const legalTargets = useMemo(() => {
    if (!selectedStoneId || !myTurn) return new Set<number>();
    return new Set(legalTargetsFor(state, selectedStoneId));
  }, [state, selectedStoneId, myTurn]);

  // Targets for the dragged brick (selection state lags one render — compute directly)
  const dragTargets = useMemo(() => {
    if (!drag) return new Set<number>();
    return new Set(legalTargetsFor(state, drag.stoneId));
  }, [state, drag]);

  const activeTargets = drag ? dragTargets : legalTargets;
  const winCells = useMemo(() => new Set(state.winLine ?? []), [state.winLine]);

  const stones = state.board.filter((s): s is Stone => s !== null);
  const mapPos = (pos: number) => (rotate ? 8 - pos : pos);

  // Cells holding never-moved bricks get shaded (الخواجة مظلّل)
  const khawajaCells = useMemo(
    () => new Set(stones.filter((s) => !s.moved).map((s) => s.pos)),
    [stones],
  );

  // Cancel the drag if its brick vanished (state resync mid-drag)
  const liveDrag = drag && stones.some((s) => s.id === drag.stoneId) ? drag : null;

  function handlePointerDown(e: React.PointerEvent<HTMLButtonElement>, stone: Stone, selectable: boolean) {
    if (!selectable) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    pendingRef.current = { stoneId: stone.id, pointerId: e.pointerId, startX: e.clientX, startY: e.clientY };
  }

  function handlePointerMove(e: React.PointerEvent<HTMLButtonElement>, stone: Stone) {
    const pending = pendingRef.current;
    if (!pending || pending.pointerId !== e.pointerId || pending.stoneId !== stone.id) return;
    const layer = layerRef.current;
    if (!layer) return;

    if (!drag && Math.hypot(e.clientX - pending.startX, e.clientY - pending.startY) < 10) return;
    if (!drag) {
      // drag begins — make sure the brick is selected so hints show
      if (selectedStoneId !== stone.id) onSelectStone(stone.id);
      sounds.pick();
    }
    const rect = layer.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const cw = rect.width / 3;
    const ch = rect.height / 3;
    const col = Math.min(2, Math.max(0, Math.floor(x / cw)));
    const row = Math.min(2, Math.max(0, Math.floor(y / ch)));
    const visualPos = row * 3 + col;
    const logicalPos = rotate ? 8 - visualPos : visualPos;
    const targets = legalTargetsFor(state, stone.id);
    setDrag({ stoneId: stone.id, x, y, cw, ch, over: targets.includes(logicalPos) ? logicalPos : null });
  }

  function handlePointerUp(e: React.PointerEvent<HTMLButtonElement>, stone: Stone, selectable: boolean) {
    const pending = pendingRef.current;
    if (!pending || pending.pointerId !== e.pointerId) return;
    pendingRef.current = null;

    if (drag && drag.stoneId === stone.id) {
      const over = drag.over;
      setDrag(null);
      if (over !== null) {
        sounds.place();
        onTarget(over);
      } else {
        sounds.invalid();
      }
      return;
    }
    // plain click: toggle selection
    if (selectable) {
      const wasSelected = selectedStoneId === stone.id;
      onSelectStone(stone.id);
      if (!wasSelected) sounds.pick();
    }
  }

  function handlePointerCancel() {
    pendingRef.current = null;
    setDrag(null);
  }

  return (
    <div dir="ltr" className="relative mx-auto w-full max-w-[min(92vw,26rem)] select-none">
      <div className="relative aspect-square rounded-3xl border border-zinc-700/80 bg-gradient-to-br from-zinc-800/80 to-zinc-900/90 p-2 shadow-2xl">
        {/* squares (click targets) */}
        <div className="grid h-full w-full grid-cols-3 grid-rows-3 gap-1.5">
          {Array.from({ length: 9 }, (_, visualPos) => {
            const logicalPos = rotate ? 8 - visualPos : visualPos;
            const isLegal = activeTargets.has(logicalPos);
            const isOver = liveDrag?.over === logicalPos;
            const isWin = winCells.has(logicalPos);
            const isLast = lastMoveTo === logicalPos;
            const isKhawaja = khawajaCells.has(logicalPos);
            return (
              <button
                key={visualPos}
                type="button"
                aria-label={`خانة ${logicalPos}`}
                disabled={disabled || (!isLegal && myTurn && (selectedStoneId !== null || liveDrag !== null))}
                onClick={() => isLegal && onTarget(logicalPos)}
                className={cn(
                  'relative rounded-2xl border transition-all duration-150',
                  'border-zinc-700/60 bg-zinc-800/50',
                  // shaded square under a khawaja brick
                  isKhawaja && 'border-amber-700/50 bg-amber-950/50 shadow-[inset_0_2px_8px_rgba(0,0,0,0.55)]',
                  isLegal &&
                    'cursor-pointer border-emerald-400/70 bg-emerald-400/15 animate-pulse-soft hover:bg-emerald-400/25',
                  isOver && 'scale-[1.04] border-emerald-300 bg-emerald-400/35 shadow-[0_0_16px_2px_rgba(52,211,153,0.45)]',
                  isWin && 'border-amber-300 bg-amber-400/20',
                  isLast && !isWin && 'border-zinc-500 bg-zinc-700/40',
                )}
              />
            );
          })}
        </div>

        {/* bricks layer */}
        <div ref={layerRef} className="pointer-events-none absolute inset-2">
          {stones.map((stone) => {
            const v = rowCol(mapPos(stone.pos));
            const mine = mySide !== null && stone.side === mySide;
            const selectable = myTurn && mine && !disabled;
            const selected = selectedStoneId === stone.id;
            const isDragging = liveDrag?.stoneId === stone.id;
            return (
              <div
                key={stone.id}
                className={cn(
                  'absolute flex items-center justify-center',
                  isDragging ? 'z-20 transition-none' : 'transition-transform duration-150 ease-out',
                )}
                style={
                  isDragging
                    ? {
                        width: `${100 / 3}%`,
                        height: `${100 / 3}%`,
                        transform: `translate(${liveDrag.x - liveDrag.cw / 2}px, ${liveDrag.y - liveDrag.ch / 2}px)`,
                      }
                    : {
                        width: `${100 / 3}%`,
                        height: `${100 / 3}%`,
                        transform: `translate(${v.col * 100}%, ${v.row * 100}%)`,
                      }
                }
              >
                <button
                  type="button"
                  aria-label={mine ? `طوبتك ${stone.moved ? '' : 'خواجة '}${stone.id}` : `طوبة الخصم ${stone.id}`}
                  aria-pressed={selected}
                  disabled={!selectable}
                  onPointerDown={(e) => handlePointerDown(e, stone, selectable)}
                  onPointerMove={(e) => handlePointerMove(e, stone)}
                  onPointerUp={(e) => handlePointerUp(e, stone, selectable)}
                  onPointerCancel={handlePointerCancel}
                  className={cn(
                    'group pointer-events-auto flex h-full w-full touch-none items-center justify-center rounded-2xl',
                    selectable && 'cursor-grab active:cursor-grabbing',
                  )}
                >
                  {/* keyed by position → the settle animation replays on every move */}
                  <span
                    key={`${stone.id}:${stone.pos}`}
                    className={cn(
                      'flex h-full w-full items-center justify-center animate-stone-settle transition-transform duration-150',
                      selectable && 'group-hover:-translate-y-1 group-active:scale-90',
                      selected && !isDragging && 'scale-110',
                    )}
                  >
                    <Brick stone={stone} lifted={selected || isDragging} />
                  </span>
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {/* khawaja legend */}
      <p className="mt-2 text-center text-xs text-zinc-500">
        الطوبة اللي عليها <span className="font-bold text-amber-300">خ</span> = خواجة (لسه ماتحركتش، وخانتها مظللة)
        — خط أفقي أو رأسي فيه خواجة مش بيتحسب فوز
      </p>
    </div>
  );
}
