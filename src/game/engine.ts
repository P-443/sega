/**
 * Egyptian Sega 3x3 — Game Rules Engine.
 *
 * Pure functions only. No I/O, no timers, no React, no database.
 * The server is the only authority that applies moves; the client
 * never decides outcomes.
 *
 * Board positions:
 *   0 1 2
 *   3 4 5
 *   6 7 8
 *
 * Initial formation: side B on the top row (0,1,2), side A on the
 * bottom row (6,7,8). Every stone starts as a "khawaja" (moved=false).
 */

import {
  BlockedLine,
  DEFAULT_RULES,
  EngineState,
  LineType,
  MoveResult,
  RulesConfig,
  Side,
  Stone,
} from './types';

export const BOARD_SIZE = 9;

const ROWS: number[][] = [
  [0, 1, 2],
  [3, 4, 5],
  [6, 7, 8],
];
const COLS: number[][] = [
  [0, 3, 6],
  [1, 4, 7],
  [2, 5, 8],
];
const DIAGS: number[][] = [
  [0, 4, 8],
  [2, 4, 6],
];

export const LINES: { cells: number[]; type: LineType }[] = [
  ...ROWS.map((cells) => ({ cells, type: 'horizontal' as LineType })),
  ...COLS.map((cells) => ({ cells, type: 'vertical' as LineType })),
  ...DIAGS.map((cells) => ({ cells, type: 'diagonal' as LineType })),
];

export const HOME_POSITIONS: Record<Side, number[]> = {
  A: [6, 7, 8],
  B: [0, 1, 2],
};

export function otherSide(side: Side): Side {
  return side === 'A' ? 'B' : 'A';
}

export function createInitialState(): EngineState {
  const board: (Stone | null)[] = new Array(BOARD_SIZE).fill(null);
  (['A', 'B'] as Side[]).forEach((side) => {
    HOME_POSITIONS[side].forEach((pos, i) => {
      board[pos] = { id: `${side}${i}`, side, pos, homePos: pos, moved: false };
    });
  });
  const state: EngineState = {
    board,
    turn: 'A',
    ply: 0,
    status: 'active',
    winner: null,
    winLine: null,
    winType: null,
    blockedLines: [],
    endReason: null,
  };
  state.blockedLines = findBlockedLines(state, DEFAULT_RULES);
  return state;
}

function cloneBoard(board: (Stone | null)[]): (Stone | null)[] {
  return board.map((s) => (s ? { ...s } : null));
}

export function getStone(state: EngineState, stoneId: string): Stone | null {
  for (const cell of state.board) {
    if (cell && cell.id === stoneId) return cell;
  }
  return null;
}

/** Every empty cell is a legal target — free movement, no adjacency rule. */
export function legalTargetsFor(state: EngineState, stoneId: string): number[] {
  const stone = getStone(state, stoneId);
  if (!stone || state.status !== 'active') return [];
  const targets: number[] = [];
  for (let pos = 0; pos < BOARD_SIZE; pos++) {
    if (state.board[pos] === null) targets.push(pos);
  }
  return targets;
}

export function hasAnyLegalMove(state: EngineState, side: Side): boolean {
  if (state.status !== 'active') return false;
  for (const cell of state.board) {
    if (cell && cell.side === side && legalTargetsFor(state, cell.id).length > 0) return true;
  }
  return false;
}

/**
 * A completed line is a WIN unless the khawaja rule blocks it.
 * A line is blocked when it contains at least one stone that has
 * never moved (moved === false) and the rules say that line type
 * is protected by the khawaja rule.
 */
function lineOutcome(
  state: EngineState,
  cells: number[],
  type: LineType,
  rules: RulesConfig,
): { kind: 'none' } | { kind: 'win'; side: Side } | { kind: 'blocked'; blocked: BlockedLine } {
  const stones = cells.map((c) => state.board[c]);
  if (stones.some((s) => s === null)) return { kind: 'none' };
  const side = (stones[0] as Stone).side;
  if (!stones.every((s) => (s as Stone).side === side)) return { kind: 'none' };

  const khawajaApplies =
    (type === 'horizontal' && rules.khawajaBlocksHorizontal) ||
    (type === 'vertical' && rules.khawajaBlocksVertical) ||
    (type === 'diagonal' && rules.khawajaBlocksDiagonal);

  const unmoved = (stones as Stone[]).filter((s) => !s.moved);
  if (khawajaApplies && unmoved.length > 0) {
    return {
      kind: 'blocked',
      blocked: { line: cells, type, side, unmovedStoneIds: unmoved.map((s) => s.id) },
    };
  }
  return { kind: 'win', side };
}

export function findBlockedLines(state: EngineState, rules: RulesConfig = DEFAULT_RULES): BlockedLine[] {
  const blocked: BlockedLine[] = [];
  for (const { cells, type } of LINES) {
    const outcome = lineOutcome(state, cells, type, rules);
    if (outcome.kind === 'blocked') blocked.push(outcome.blocked);
  }
  return blocked;
}

/**
 * Win check. A line of three same-side stones wins, EXCEPT:
 *  - horizontal/vertical lines containing a khawaja stone (moved=false) — blocked;
 *  - diagonals count immediately unless rules.khawajaBlocksDiagonal is enabled.
 */
export function checkWinner(
  state: EngineState,
  rules: RulesConfig = DEFAULT_RULES,
): { winner: Side; line: number[]; type: LineType } | null {
  // The player who just moved is the only one who can have formed a new line,
  // but we scan both sides defensively; mover (opposite of current turn) first.
  const mover = otherSide(state.turn);
  for (const preferred of [mover, otherSide(mover)]) {
    for (const { cells, type } of LINES) {
      const outcome = lineOutcome(state, cells, type, rules);
      if (outcome.kind === 'win' && outcome.side === preferred) {
        return { winner: preferred, line: cells, type };
      }
    }
  }
  return null;
}

/**
 * Validate and apply a move. The ONLY entry point the server uses.
 * Never mutates the input state.
 */
export function applyMove(
  state: EngineState,
  side: Side,
  stoneId: string,
  target: number,
  rules: RulesConfig = DEFAULT_RULES,
): MoveResult {
  if (state.status !== 'active') return { ok: false, error: 'game_over' };
  if (state.turn !== side) return { ok: false, error: 'not_your_turn' };
  if (!Number.isInteger(target) || target < 0 || target > 8) return { ok: false, error: 'invalid_target' };

  const stone = getStone(state, stoneId);
  if (!stone) return { ok: false, error: 'stone_not_found' };
  if (stone.side !== side) return { ok: false, error: 'not_your_stone' };
  if (state.board[target] !== null) return { ok: false, error: 'cell_occupied' };
  // Free movement: any empty cell on the board is a legal target.

  const blockedBefore = findBlockedLines(state, rules);

  const board = cloneBoard(state.board);
  const movedStone: Stone = { ...(board[stone.pos] as Stone), pos: target, moved: true };
  board[stone.pos] = null;
  board[target] = movedStone;

  const next: EngineState = {
    ...state,
    board,
    turn: otherSide(side),
    ply: state.ply + 1,
    winner: null,
    winLine: null,
    winType: null,
    blockedLines: [],
    endReason: null,
  };

  const win = checkWinner(next, rules);
  const blockedAfter = findBlockedLines(next, rules);
  next.blockedLines = blockedAfter;

  const beforeKeys = new Set(blockedBefore.map((b) => b.line.join(',')));
  const newlyBlocked = blockedAfter.filter((b) => !beforeKeys.has(b.line.join(',')));

  const resultEvents = {
    win: null as { side: Side; line: number[]; type: LineType } | null,
    newlyBlocked,
    opponentStuck: false,
    draw: false,
  };

  if (win) {
    next.status = 'finished';
    next.winner = win.winner;
    next.winLine = win.line;
    next.winType = win.type;
    next.endReason = 'line';
    resultEvents.win = { side: win.winner, line: win.line, type: win.type };
    return { ok: true, state: next, events: resultEvents };
  }

  if (!hasAnyLegalMove(next, next.turn)) {
    // The player to move has no legal move — they lose (classic sega rule).
    next.status = 'finished';
    next.winner = side;
    next.endReason = 'no_moves';
    resultEvents.opponentStuck = true;
    return { ok: true, state: next, events: resultEvents };
  }

  if (next.ply >= rules.maxPlies) {
    next.status = 'finished';
    next.winner = null;
    next.endReason = 'max_plies';
    resultEvents.draw = true;
    return { ok: true, state: next, events: resultEvents };
  }

  return { ok: true, state: next, events: resultEvents };
}

/** Serialize for storage in Game.boardState (JSON column). */
export function serializeState(state: EngineState): string {
  return JSON.stringify(state);
}

export function deserializeState(json: string): EngineState {
  const parsed = JSON.parse(json) as EngineState;
  if (!parsed || !Array.isArray(parsed.board) || parsed.board.length !== BOARD_SIZE) {
    throw new Error('Invalid serialized game state');
  }
  return parsed;
}
