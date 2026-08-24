/**
 * Unit tests for the Sega 3x3 AI (minimax + alpha-beta + TT).
 * Layout strings match engine.test.ts: 9 chars, positions 0..8, 'A'/'B'/'.'.
 */

import { describe, expect, it } from 'vitest';
import { findBlockedLines } from './engine';
import type { EngineState, Side, Stone } from './types';
import { chooseMove, evaluateBoard } from './ai';

function buildState(
  layout: string,
  opts: { turn?: Side; unmoved?: number[] } = {},
): EngineState {
  if (layout.length !== 9) throw new Error(`layout must be 9 chars, got "${layout}"`);
  const board: (Stone | null)[] = new Array(9).fill(null);
  const counters: Record<Side, number> = { A: 0, B: 0 };
  const unmoved = new Set(opts.unmoved ?? []);
  for (let i = 0; i < 9; i++) {
    const ch = layout[i];
    if (ch === 'A' || ch === 'B') {
      const side = ch as Side;
      const idx = counters[side]++;
      board[i] = { id: `${side}${idx}`, side, pos: i, homePos: -1, moved: !unmoved.has(i) };
    } else if (ch !== '.') {
      throw new Error(`bad layout char: ${ch}`);
    }
  }
  if (counters.A > 3 || counters.B > 3) {
    throw new Error(`layout has more than 3 stones per side: ${layout}`);
  }
  const state: EngineState = {
    board,
    turn: opts.turn ?? 'A',
    ply: 0,
    status: 'active',
    winner: null,
    winLine: null,
    winType: null,
    blockedLines: [],
    endReason: null,
  };
  state.blockedLines = findBlockedLines(state);
  return state;
}

function expectLegal(state: EngineState, side: Side, mv: ReturnType<typeof chooseMove>): void {
  expect(mv).not.toBeNull();
  const stone = state.board.find((c) => c?.id === mv!.stoneId);
  expect(stone?.side).toBe(side);
  expect(state.board[mv!.target]).toBeNull();
}

describe('chooseMove', () => {
  it('returns null when the game is over', () => {
    const s = buildState('BAAABB...', { turn: 'B', unmoved: [4] });
    const finished: EngineState = { ...s, status: 'finished', winner: 'B' };
    expect(chooseMove(finished, 'B')).toBeNull();
  });

  it('takes an immediate winning move (diagonal)', () => {
    // B at 0,4,5 (all moved) — only the 0-4-8 diagonal wins: B2@5 → 8.
    const s = buildState('BAAABB...', { turn: 'B' });
    expect(chooseMove(s, 'B')).toEqual({ stoneId: 'B2', target: 8 });
  });

  it('blocks an immediate loss by occupying the opponent winning cell', () => {
    // A threatens only 0-4-8 (fill 8). B has no win of its own → must block 8.
    const s = buildState('AB.BAA.B.', { turn: 'B' });
    const mv = chooseMove(s, 'B');
    expect(mv?.target).toBe(8);
    expect(mv?.stoneId.startsWith('B')).toBe(true);
  });

  it('always returns a legal move for the side to play', () => {
    const cases: [string, Side][] = [
      ['BAAABB...', 'B'],
      ['AB.BAA.B.', 'B'],
      ['BBBAAA...', 'A'],
      ['..AABB..B', 'A'],
    ];
    for (const [layout, turn] of cases) {
      const s = buildState(layout, { turn });
      expectLegal(s, turn, chooseMove(s, turn));
    }
  });

  it('is deterministic', () => {
    const s = buildState('AB.BAA.B.', { turn: 'B' });
    expect(chooseMove(s, 'B')).toEqual(chooseMove(s, 'B'));
  });

  it('answers fast enough for a live move', () => {
    const s = buildState('AB.BAA.B.', { turn: 'B' });
    const t0 = performance.now();
    chooseMove(s, 'B');
    expect(performance.now() - t0).toBeLessThan(1000);
  });
});

describe('evaluateBoard', () => {
  it('scores a win higher than any live position and a draw as 0', () => {
    const live = buildState('BAAABB...', { turn: 'B' });
    const winState: EngineState = { ...live, status: 'finished', winner: 'B' };
    const drawState: EngineState = { ...live, status: 'finished', winner: null };
    expect(evaluateBoard(winState, 'B')).toBeGreaterThan(evaluateBoard(live, 'B'));
    expect(evaluateBoard(drawState, 'B')).toBe(0);
  });

  it('prefers the side with more real threats', () => {
    // A threatens 0-4-8 (fill 8); B has no completed threat.
    const s = buildState('AB.BAA.B.', { turn: 'B' }); // A@0,4,5 ; B@1,3,7
    expect(evaluateBoard(s, 'A')).toBeGreaterThan(evaluateBoard(s, 'B'));
  });
});
