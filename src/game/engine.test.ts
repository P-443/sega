/**
 * Unit tests for the Egyptian Sega 3x3 Game Rules Engine.
 *
 * Layout strings are 9 chars, positions 0..8:
 *   0 1 2
 *   3 4 5
 *   6 7 8
 * 'A' / 'B' = stone of that side, '.' = empty.
 * Built stones are moved=true by default; pass `unmoved: [positions]`
 * to make specific stones khawaja (moved=false).
 */

import { describe, expect, it } from 'vitest';
import {
  applyMove,
  checkWinner,
  createInitialState,
  deserializeState,
  findBlockedLines,
  getStone,
  hasAnyLegalMove,
  legalTargetsFor,
  serializeState,
} from './engine';
import { DEFAULT_RULES, EngineState, RulesConfig, Side, Stone } from './types';

function buildState(
  layout: string,
  opts: { turn?: Side; unmoved?: number[]; ply?: number; rules?: RulesConfig } = {},
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
    ply: opts.ply ?? 0,
    status: 'active',
    winner: null,
    winLine: null,
    winType: null,
    blockedLines: [],
    endReason: null,
  };
  state.blockedLines = findBlockedLines(state, opts.rules);
  return state;
}

function stoneAt(state: EngineState, pos: number): Stone {
  const s = state.board[pos];
  if (!s) throw new Error(`no stone at ${pos}`);
  return s;
}

describe('initial state', () => {
  it('places 3 stones per side on home rows, all khawaja (moved=false)', () => {
    const s = createInitialState();
    expect(s.board[6]?.side).toBe('A');
    expect(s.board[7]?.side).toBe('A');
    expect(s.board[8]?.side).toBe('A');
    expect(s.board[0]?.side).toBe('B');
    expect(s.board[1]?.side).toBe('B');
    expect(s.board[2]?.side).toBe('B');
    expect(s.board.every((c) => c === null || c.moved === false)).toBe(true);
    expect(s.turn).toBe('A');
    expect(s.status).toBe('active');
    expect(s.ply).toBe(0);
  });

  it('does NOT count the initial formation rows as wins (khawaja rule)', () => {
    const s = createInitialState();
    expect(checkWinner(s)).toBeNull();
    // Both home rows are completed lines blocked by khawaja stones
    expect(s.blockedLines).toHaveLength(2);
    expect(s.blockedLines.map((b) => b.type)).toEqual(['horizontal', 'horizontal']);
  });

  it('stone ids are stable and unique', () => {
    const s = createInitialState();
    const ids = s.board.filter(Boolean).map((c) => (c as Stone).id);
    expect(new Set(ids).size).toBe(6);
  });
});

describe('move validation', () => {
  it('rejects move when not your turn', () => {
    const s = createInitialState();
    const r = applyMove(s, 'B', 'B0', 3);
    expect(r).toEqual({ ok: false, error: 'not_your_turn' });
  });

  it('rejects moving the opponent stone', () => {
    const s = createInitialState();
    const r = applyMove(s, 'A', 'B0', 3);
    expect(r).toEqual({ ok: false, error: 'not_your_stone' });
  });

  it('rejects unknown stone id', () => {
    const s = createInitialState();
    expect(applyMove(s, 'A', 'X9', 3)).toEqual({ ok: false, error: 'stone_not_found' });
  });

  it('rejects occupied target cell', () => {
    const s = createInitialState();
    expect(applyMove(s, 'A', 'A0', 7)).toEqual({ ok: false, error: 'cell_occupied' });
  });

  it('allows moving to ANY empty cell — free movement, no adjacency rule', () => {
    const s = createInitialState();
    // 6 → 5: two columns away, still legal
    const far = applyMove(s, 'A', 'A0', 5);
    expect(far.ok).toBe(true);
    // long jump across the whole board
    const corner = applyMove(buildState('B......AA', { turn: 'A' }), 'A', 'A0', 4);
    expect(corner.ok).toBe(true);
    if (corner.ok) {
      expect(corner.state.board[4]?.id).toBe('A0');
      expect(corner.state.board[7]).toBeNull();
    }
  });

  it('rejects out-of-range / non-integer targets', () => {
    const s = createInitialState();
    expect(applyMove(s, 'A', 'A0', 9)).toEqual({ ok: false, error: 'invalid_target' });
    expect(applyMove(s, 'A', 'A0', -1)).toEqual({ ok: false, error: 'invalid_target' });
    expect(applyMove(s, 'A', 'A0', 2.5)).toEqual({ ok: false, error: 'invalid_target' });
  });

  it('rejects moves after the game is over', () => {
    // Immediate diagonal threat: build nearly-finished game
    const s = buildState('BB.AA..BA', { turn: 'A', unmoved: [0, 1] });
    // finish it via a real sequence instead: simple finished-state guard
    const finished: EngineState = { ...s, status: 'finished', winner: 'A' };
    expect(applyMove(finished, 'A', 'A0', 4)).toEqual({ ok: false, error: 'game_over' });
  });

  it('alternates turns and increments ply', () => {
    const s0 = createInitialState();
    const r1 = applyMove(s0, 'A', 'A0', 3);
    if (!r1.ok) throw new Error('move 1 failed');
    expect(r1.state.turn).toBe('B');
    expect(r1.state.ply).toBe(1);
    const r2 = applyMove(r1.state, 'B', 'B0', 4);
    if (!r2.ok) throw new Error('move 2 failed');
    expect(r2.state.turn).toBe('A');
    expect(r2.state.ply).toBe(2);
  });

  it('does not mutate the input state (immutable updates)', () => {
    const s = createInitialState();
    const before = serializeState(s);
    applyMove(s, 'A', 'A0', 3);
    expect(serializeState(s)).toBe(before);
    expect(s.board[6]?.id).toBe('A0');
  });
});

describe('khawaja (moved flag)', () => {
  it('flips moved=false → true on first move and never back', () => {
    const s0 = createInitialState();
    expect(getStone(s0, 'A0')?.moved).toBe(false);
    const r1 = applyMove(s0, 'A', 'A0', 3);
    if (!r1.ok) throw new Error('move failed');
    expect(getStone(r1.state, 'A0')?.moved).toBe(true);
    const r2 = applyMove(r1.state, 'B', 'B0', 4);
    if (!r2.ok) throw new Error('move failed');
    const r3 = applyMove(r2.state, 'A', 'A0', 0);
    if (!r3.ok) throw new Error('move failed');
    expect(getStone(r3.state, 'A0')?.moved).toBe(true);
  });

  it('legal targets are ALL empty cells (free movement)', () => {
    const s = createInitialState();
    // A0 at 6: every empty cell — 3,4,5 — is a target, near or far
    expect(legalTargetsFor(s, 'A0').sort()).toEqual([3, 4, 5]);
    expect(legalTargetsFor(s, 'A1').sort()).toEqual([3, 4, 5]);
    // mid-game: any of the empties, including the far corners
    const mid = buildState('BB..A.AA.', { turn: 'A' }); // empties 2,3,5,8
    expect(legalTargetsFor(mid, 'A0').sort()).toEqual([2, 3, 5, 8]);
  });
});

describe('khawaja rule — horizontal lines', () => {
  it('spec example: A A A / B B . / . . . with one khawaja A is NOT a win', () => {
    const s = buildState('AAABB....', { turn: 'B', unmoved: [0] });
    expect(checkWinner(s)).toBeNull();
    const blocked = findBlockedLines(s);
    expect(blocked).toHaveLength(1);
    expect(blocked[0].line).toEqual([0, 1, 2]);
    expect(blocked[0].type).toBe('horizontal');
    expect(blocked[0].side).toBe('A');
    expect(blocked[0].unmovedStoneIds).toEqual(['A0']);
  });

  it('same line wins after the khawaja stone moves out and back (moved=true)', () => {
    // A A A on the top row, A0 is khawaja; B far away on the bottom row
    const s0 = buildState('AAA...BBB', { turn: 'A', unmoved: [0, 6, 7, 8] });
    // A0 leaves the line
    const r1 = applyMove(s0, 'A', 'A0', 3);
    expect(r1.ok).toBe(true);
    if (!r1.ok) return;
    expect(getStone(r1.state, 'A0')?.moved).toBe(true);
    expect(checkWinner(r1.state)).toBeNull();
    // B makes a harmless move
    const r2 = applyMove(r1.state, 'B', 'B0', 4);
    expect(r2.ok).toBe(true);
    if (!r2.ok) return;
    // A0 returns — now all three stones have moved
    const r3 = applyMove(r2.state, 'A', 'A0', 0);
    expect(r3.ok).toBe(true);
    if (!r3.ok) return;
    expect(r3.state.status).toBe('finished');
    expect(r3.state.winner).toBe('A');
    expect(r3.state.winType).toBe('horizontal');
    expect(r3.state.winLine).toEqual([0, 1, 2]);
    expect(r3.events.win?.side).toBe('A');
  });

  it('horizontal line of fully-moved stones IS a win', () => {
    const s = buildState('BBB...AAA', { turn: 'B' });
    const win = checkWinner(s);
    expect(win).not.toBeNull();
    expect(win?.winner).toBe('A');
    expect(win?.type).toBe('horizontal');
  });

  it('reports a newly blocked line in move events (for UI hint)', () => {
    // A0 khawaja at 0, A1 at 1, A2 at 5 moves into 2 → completes a blocked row
    const s = buildState('AA.BBA..B', { turn: 'A', unmoved: [0, 3, 4, 8] });
    const r = applyMove(s, 'A', 'A2', 2);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.state.winner).toBeNull();
    expect(r.state.status).toBe('active');
    expect(r.events.newlyBlocked).toHaveLength(1);
    expect(r.events.newlyBlocked[0].line).toEqual([0, 1, 2]);
    expect(r.events.newlyBlocked[0].unmovedStoneIds).toEqual(['A0']);
  });
});

describe('khawaja rule — vertical lines', () => {
  it('vertical line with a khawaja stone is NOT a win', () => {
    // A on column 0 (positions 0,3,6), stone at 6 is khawaja; B at 2,5,7
    const s = buildState('A.BA.BAB.', { turn: 'B', unmoved: [6] });
    expect(checkWinner(s)).toBeNull();
    const blocked = findBlockedLines(s);
    const v = blocked.find((b) => b.type === 'vertical');
    expect(v).toBeDefined();
    expect(v?.line).toEqual([0, 3, 6]);
    expect(v?.unmovedStoneIds).toEqual(['A2']);
  });

  it('vertical line wins once every stone has moved', () => {
    const s0 = buildState('A.BA.BAB.', { turn: 'A', unmoved: [6] });
    // A2 steps off column 0
    const r1 = applyMove(s0, 'A', 'A2', 4);
    expect(r1.ok).toBe(true);
    if (!r1.ok) return;
    // B0 shuffles
    const r2 = applyMove(r1.state, 'B', 'B0', 1);
    expect(r2.ok).toBe(true);
    if (!r2.ok) return;
    // A2 returns to complete the column — all moved now
    const r3 = applyMove(r2.state, 'A', 'A2', 6);
    expect(r3.ok).toBe(true);
    if (!r3.ok) return;
    expect(r3.state.status).toBe('finished');
    expect(r3.state.winner).toBe('A');
    expect(r3.state.winType).toBe('vertical');
    expect(r3.state.winLine).toEqual([0, 3, 6]);
  });
});

describe('diagonal lines (khawaja rule applies by default)', () => {
  it('diagonal with a khawaja stone is NOT a win', () => {
    // A on main diagonal 0,4,8 — stone at 0 is khawaja; B at 1,2,5
    const s = buildState('ABB.AB..A', { turn: 'B', unmoved: [0] });
    expect(checkWinner(s)).toBeNull();
    const blocked = findBlockedLines(s);
    const d = blocked.find((b) => b.type === 'diagonal');
    expect(d).toBeDefined();
    expect(d?.line).toEqual([0, 4, 8]);
    expect(d?.unmovedStoneIds).toEqual(['A0']);
  });

  it('anti-diagonal (2,4,6) is also blocked with a khawaja stone', () => {
    // A at 2,4,6 — khawaja at 6; B at 0,1,7
    const s = buildState('BBA.A.AB.', { turn: 'B', unmoved: [6] });
    expect(checkWinner(s)).toBeNull();
    const blocked = findBlockedLines(s);
    expect(blocked.some((b) => b.type === 'diagonal' && b.line.join(',') === '2,4,6')).toBe(true);
  });

  it('diagonal wins once every stone has moved', () => {
    const s = buildState('ABB.AB..A', { turn: 'B' }); // all moved
    const win = checkWinner(s);
    expect(win?.winner).toBe('A');
    expect(win?.type).toBe('diagonal');
    expect(win?.line).toEqual([0, 4, 8]);
  });

  it('diagonal still wins when rules.khawajaBlocksDiagonal = false (legacy)', () => {
    const rules: RulesConfig = { ...DEFAULT_RULES, khawajaBlocksDiagonal: false };
    const s = buildState('ABB.AB..A', { turn: 'B', unmoved: [0], rules });
    expect(checkWinner(s, rules)).not.toBeNull();
  });
});

describe('endgame conditions', () => {
  it('with free movement a side always has a legal move (no blockade is possible)', () => {
    // Old adjacency rules let A trap B on the top row; now B escapes anywhere.
    const s = buildState('BBBAAA...', { turn: 'B', unmoved: [3, 0, 1, 2] });
    expect(hasAnyLegalMove(s, 'B')).toBe(true);
    expect(legalTargetsFor(s, 'B0').sort()).toEqual([6, 7, 8]);
    const escape = applyMove(s, 'B', 'B0', 8);
    expect(escape.ok).toBe(true);
  });

  it('reaching maxPlies is a draw', () => {
    const rules: RulesConfig = { ...DEFAULT_RULES, maxPlies: 2 };
    const s0 = createInitialState();
    const r1 = applyMove(s0, 'A', 'A0', 3, rules);
    if (!r1.ok) throw new Error('move 1 failed');
    const r2 = applyMove(r1.state, 'B', 'B0', 4, rules);
    if (!r2.ok) throw new Error('move 2 failed');
    expect(r2.state.status).toBe('finished');
    expect(r2.state.winner).toBeNull();
    expect(r2.state.endReason).toBe('max_plies');
    expect(r2.events.draw).toBe(true);
  });

  it('line win takes priority over no-moves', () => {
    // A completes a real (fully moved) middle row that also traps B
    const s = buildState('BBBAA..A.', { turn: 'A' }); // all moved → row 3,4,5 will be a true win
    const r = applyMove(s, 'A', 'A2', 5);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.state.status).toBe('finished');
    expect(r.state.winner).toBe('A');
    expect(r.state.endReason).toBe('line');
    expect(r.state.winType).toBe('horizontal');
  });
});

describe('serialization', () => {
  it('round-trips through JSON', () => {
    const s0 = createInitialState();
    const r = applyMove(s0, 'A', 'A1', 4);
    if (!r.ok) throw new Error('move failed');
    const restored = deserializeState(serializeState(r.state));
    expect(restored).toEqual(r.state);
  });

  it('rejects corrupted payloads', () => {
    expect(() => deserializeState('{"board":[1,2]}')).toThrow();
  });
});

describe('full game scenario (integration)', () => {
  it('plays a realistic game to a horizontal win', () => {
    let s = createInitialState();
    const seq: [Side, string, number][] = [
      ['A', 'A0', 3], // A: 6→3
      ['B', 'B0', 4], // B: 0→4
      ['A', 'A0', 0], // A: 3→0
      ['B', 'B0', 3], // B: 4→3
      ['A', 'A1', 4], // A: 7→4  (diagonal 0-4-8 blocked: A2 still khawaja)
      ['B', 'B1', 7], // B: 1→7
      ['A', 'A1', 1], // A: 4→1
      ['B', 'B2', 4], // B: 2→4
      ['A', 'A2', 2], // A: 8→2  — top row A0,A1,A2 all moved → win
    ];
    for (const [side, stone, target] of seq) {
      const r = applyMove(s, side, stone, target);
      expect(r.ok).toBe(true);
      if (!r.ok) throw new Error(`unexpected illegal move ${stone}→${target}`);
      s = r.state;
    }
    expect(s.status).toBe('finished');
    expect(s.winner).toBe('A');
    expect(s.winType).toBe('horizontal');
    expect(s.winLine).toEqual([0, 1, 2]);
  });
});
