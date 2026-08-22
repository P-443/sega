'use client';

/**
 * The 3×3 board. Pure presentation — every state shown here came from
 * the server. Move hints are computed locally for UX only; the server
 * re-validates everything.
 *
 * Rendered from the current player's perspective: my stones are always
 * at the bottom (opponent's view is rotated 180°).
 */

import { useMemo } from 'react';
import { legalTargetsFor } from '@/game/engine';
import type { EngineState, Side, Stone } from '@/game/types';
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

function rowCol(pos: number): { row: number; col: number } {
  return { row: Math.floor(pos / 3), col: pos % 3 };
}

/** Crown badge for khawaja stones (never-moved) */
function KhawajaBadge() {
  return (
    <span
      className="absolute -top-1.5 start-1/2 z-10 flex h-5 w-5 -translate-x-1/2 items-center justify-center rounded-full bg-amber-300 text-[10px] font-extrabold text-amber-900 shadow-md ring-1 ring-amber-500"
      title="حجر خواجة — لسه ماتحركش"
      aria-label="حجر خواجة"
    >
      خ
    </span>
  );
}

function StoneDisc({ stone, mine }: { stone: Stone; mine: boolean }) {
  return (
    <span
      className={cn(
        'relative flex h-[72%] w-[72%] items-center justify-center rounded-full shadow-lg transition-transform duration-150',
        mine
          ? 'bg-gradient-to-br from-amber-300 to-amber-600 ring-2 ring-amber-200/70'
          : 'bg-gradient-to-br from-sky-300 to-sky-600 ring-2 ring-sky-200/60',
        !stone.moved && 'shadow-[0_0_14px_2px_rgba(252,211,77,0.45)]',
      )}
    >
      {!stone.moved && <KhawajaBadge />}
      <span className="sr-only">{stone.moved ? 'حجر' : 'حجر خواجة'}</span>
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
  const rotate = mySide === 'B'; // B sees the board flipped so own stones sit at the bottom

  const legalTargets = useMemo(() => {
    if (!selectedStoneId || !myTurn) return new Set<number>();
    return new Set(legalTargetsFor(state, selectedStoneId));
  }, [state, selectedStoneId, myTurn]);

  const winCells = useMemo(() => new Set(state.winLine ?? []), [state.winLine]);

  // Stones positioned over the grid; CSS transition animates the slide
  const stones = state.board.filter((s): s is Stone => s !== null);

  const mapPos = (pos: number) => (rotate ? 8 - pos : pos);

  return (
    <div dir="ltr" className="relative mx-auto w-full max-w-[min(92vw,26rem)] select-none">
      <div className="relative aspect-square rounded-3xl border border-zinc-700/80 bg-gradient-to-br from-zinc-800/80 to-zinc-900/90 p-2 shadow-2xl">
        {/* click targets */}
        <div className="grid h-full w-full grid-cols-3 grid-rows-3 gap-1.5">
          {Array.from({ length: 9 }, (_, visualPos) => {
            const logicalPos = rotate ? 8 - visualPos : visualPos;
            const isLegal = legalTargets.has(logicalPos);
            const isWin = winCells.has(logicalPos);
            const isLast = lastMoveTo === logicalPos;
            return (
              <button
                key={visualPos}
                type="button"
                aria-label={`خانة ${logicalPos}`}
                disabled={disabled || (!isLegal && myTurn && selectedStoneId !== null)}
                onClick={() => isLegal && onTarget(logicalPos)}
                className={cn(
                  'relative rounded-2xl border transition-colors duration-150',
                  'border-zinc-700/60 bg-zinc-800/50',
                  isLegal &&
                    'cursor-pointer border-emerald-400/70 bg-emerald-400/15 animate-pulse-soft hover:bg-emerald-400/25',
                  isWin && 'border-amber-300 bg-amber-400/20',
                  isLast && !isWin && 'border-zinc-500 bg-zinc-700/40',
                )}
              />
            );
          })}
        </div>

        {/* stones layer */}
        <div className="pointer-events-none absolute inset-2">
          {stones.map((stone) => {
            const v = rowCol(mapPos(stone.pos));
            const mine = mySide !== null && stone.side === mySide;
            const selectable = myTurn && mine && !disabled;
            const selected = selectedStoneId === stone.id;
            return (
              <div
                key={stone.id}
                className="absolute flex items-center justify-center transition-transform duration-150 ease-out"
                style={{
                  width: `${100 / 3}%`,
                  height: `${100 / 3}%`,
                  transform: `translate(${v.col * 100}%, ${v.row * 100}%)`,
                }}
              >
                <button
                  type="button"
                  aria-label={mine ? `حجرك ${stone.moved ? '' : 'خواجة '}${stone.id}` : `حجر الخصم ${stone.id}`}
                  aria-pressed={selected}
                  disabled={!selectable}
                  onClick={() => selectable && onSelectStone(stone.id)}
                  className={cn(
                    'pointer-events-auto flex h-full w-full items-center justify-center rounded-2xl',
                    selectable && 'cursor-pointer',
                    selected && 'scale-110',
                  )}
                >
                  <span className={cn('transition-transform duration-150', selected && 'scale-110')}>
                    <StoneDisc stone={stone} mine={mine} />
                  </span>
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {/* khawaja legend */}
      <p className="mt-2 text-center text-xs text-zinc-500">
        الحجر اللي عليه <span className="font-bold text-amber-300">خ</span> = خواجة (لسه ماتحركش) — خط
        أفقي أو رأسي فيه خواجة مش بيتحسب فوز
      </p>
    </div>
  );
}
