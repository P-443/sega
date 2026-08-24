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
  /** Optimistic stone positions (stoneId → logical cell) shown before server echo */
  optimisticPos?: Record<string, number> | null;
  /** Khawaja bricks to pulse-highlight (blocked a completed line) */
  highlightStoneIds?: string[] | null;
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
 * A real brick, drawn as a three-face SVG: light top surface, mid-tone front
 * face, dark side face. Side A → red fired clay (cracks + mud dots + chisel
 * engraving) · side B → white limestone (fine strata). An oval shadow sits
 * underneath. No heavy filters — crisp at any size.
 */
function Brick({ stone, lifted }: { stone: Stone; lifted: boolean }) {
  const clay = stone.side === 'A';
  const c = clay
    ? {
        top: '#e98a61',
        front: '#be4926',
        side: '#7d2913',
        line: '#5b1c0c',
        crack: 'rgba(255,235,220,0.4)',
        speck: 'rgba(50,16,8,0.55)',
      }
    : {
        top: '#faf3e0',
        front: '#e3d4b0',
        side: '#bca97f',
        line: '#84734f',
        crack: 'rgba(255,255,255,0.55)',
        speck: 'rgba(110,95,60,0.35)',
      };

  return (
    <span
      className={cn(
        'relative block h-[64%] w-[90%] transition-transform duration-150',
        lifted && 'scale-110',
      )}
    >
      <svg viewBox="0 0 100 56" className="pointer-events-none h-full w-full overflow-visible" aria-hidden>
        {/* oval shadow */}
        <ellipse cx="50" cy="51" rx="38" ry="3.2" fill="rgba(0,0,0,0.42)" />
        {/* top face (light) */}
        <polygon points="20,16 42,5 90,5 68,16" fill={c.top} stroke={c.line} strokeWidth="1.1" strokeLinejoin="round" />
        {/* front face */}
        <polygon points="20,16 68,16 68,47 20,47" fill={c.front} stroke={c.line} strokeWidth="1.1" strokeLinejoin="round" />
        {/* side face (dark) */}
        <polygon points="68,16 90,5 90,36 68,47" fill={c.side} stroke={c.line} strokeWidth="1.1" strokeLinejoin="round" />

        {clay ? (
          <>
            {/* chisel engraving */}
            <path d="M23 28 H65" stroke={c.speck} strokeWidth="1" strokeLinecap="round" opacity="0.5" />
            <path d="M23 33 H65" stroke={c.speck} strokeWidth="1" strokeLinecap="round" opacity="0.35" />
            <path d="M23 38 H65" stroke={c.speck} strokeWidth="1" strokeLinecap="round" opacity="0.25" />
            {/* cracks */}
            <path d="M31 16 L29 24 L32 32 L29 40 L31 47" fill="none" stroke={c.crack} strokeWidth="1.3" strokeLinecap="round" />
            <path d="M55 16 L57 23 L54 30" fill="none" stroke={c.crack} strokeWidth="1.1" strokeLinecap="round" />
            {/* mud dots */}
            <circle cx="47" cy="22" r="1" fill={c.speck} opacity="0.6" />
            <circle cx="60" cy="37" r="0.9" fill={c.speck} opacity="0.5" />
            <circle cx="40" cy="43" r="0.8" fill={c.speck} opacity="0.45" />
          </>
        ) : (
          <>
            {/* limestone strata */}
            <path d="M22 27 H66" stroke={c.speck} strokeWidth="1" strokeLinecap="round" opacity="0.35" />
            <path d="M22 34 H66" stroke={c.speck} strokeWidth="1" strokeLinecap="round" opacity="0.28" />
            <path d="M22 41 H66" stroke={c.speck} strokeWidth="1" strokeLinecap="round" opacity="0.2" />
            <circle cx="50" cy="23" r="0.8" fill={c.speck} opacity="0.4" />
            <circle cx="38" cy="40" r="0.7" fill={c.speck} opacity="0.35" />
          </>
        )}
      </svg>
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
  optimisticPos,
  highlightStoneIds,
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

  // Winning line endpoints in the visual (rotated) 0..300 coordinate space,
  // so the slow-motion line lands on the right cells for both perspectives.
  const winLinePath = useMemo(() => {
    if (state.status !== 'finished' || !state.winLine || state.winLine.length < 3) return null;
    const vs = state.winLine.map((p) => (rotate ? 8 - p : p));
    const c = (vp: number) => ({ x: (vp % 3) * 100 + 50, y: Math.floor(vp / 3) * 100 + 50 });
    const a = c(vs[0]);
    const b = c(vs[2]);
    return { x1: a.x, y1: a.y, x2: b.x, y2: b.y };
  }, [state.status, state.winLine, rotate]);

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
            const renderPos = optimisticPos?.[stone.id] ?? stone.pos;
            const v = rowCol(mapPos(renderPos));
            const mine = mySide !== null && stone.side === mySide;
            const selectable = myTurn && mine && !disabled;
            const selected = selectedStoneId === stone.id;
            const isDragging = liveDrag?.stoneId === stone.id;
            const highlighted = !!highlightStoneIds?.includes(stone.id);
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
                    highlighted && 'animate-khawaja-warn',
                  )}
                >
                  {/* keyed by position → the settle animation replays on every move */}
                  <span
                    key={`${stone.id}:${renderPos}`}
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

        {/* winning line — drawn in slow motion once the game is over */}
        {winLinePath && (
          <svg
            viewBox="0 0 300 300"
            className="pointer-events-none absolute inset-2 z-10 h-full w-full overflow-visible"
            aria-hidden
          >
            <line
              x1={winLinePath.x1}
              y1={winLinePath.y1}
              x2={winLinePath.x2}
              y2={winLinePath.y2}
              stroke="#fbbf24"
              strokeWidth="8"
              strokeLinecap="round"
              pathLength={1}
              strokeDasharray="1"
              strokeDashoffset="1"
              className="animate-win-line"
              style={{ filter: 'drop-shadow(0 0 6px rgba(251,191,36,0.9))' }}
            />
          </svg>
        )}
      </div>

      {/* khawaja legend */}
      <p className="mt-2 text-center text-xs text-zinc-500">
        الطوبة اللي عليها <span className="font-bold text-amber-300">خ</span> = خواجة (لسه ماتحركتش، وخانتها مظللة)
        — أي خط (أفقي / رأسي / قطري) فيه خواجة مش بيتحسب فوز
      </p>
    </div>
  );
}
