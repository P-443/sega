/**
 * Egyptian Sega 3x3 — core game types.
 * Pure domain model: no I/O, no React, no database.
 */

export type Side = 'A' | 'B';

export interface Stone {
  /** Stable id, e.g. "A0", "B2" */
  id: string;
  side: Side;
  /** Current board position 0..8 */
  pos: number;
  /** Original starting position — never changes */
  homePos: number;
  /**
   * "Khawaja" rule: a stone that has never moved is a khawaja stone.
   * Once moved === true it stays true forever.
   */
  moved: boolean;
}

export type LineType = 'horizontal' | 'vertical' | 'diagonal';

export interface BlockedLine {
  line: number[];
  type: LineType;
  side: Side;
  /** Stones in the line that are still khawaja (moved === false) */
  unmovedStoneIds: string[];
}

export type EngineStatus = 'active' | 'finished';

export interface EngineState {
  /** 9 cells; each holds a stone or null. Index = position 0..8 */
  board: (Stone | null)[];
  turn: Side;
  ply: number;
  status: EngineStatus;
  /** null winner + finished = draw */
  winner: Side | null;
  winLine: number[] | null;
  winType: LineType | null;
  /** Completed lines that do NOT count as a win because of a khawaja stone */
  blockedLines: BlockedLine[];
  /** Why the game ended (informational) */
  endReason: 'line' | 'no_moves' | 'max_plies' | null;
}

export interface RulesConfig {
  /** A completed horizontal line with an unmoved (khawaja) stone is NOT a win */
  khawajaBlocksHorizontal: boolean;
  /** A completed vertical line with an unmoved (khawaja) stone is NOT a win */
  khawajaBlocksVertical: boolean;
  /** Same rule for diagonals — off by default (classic Egyptian rule) */
  khawajaBlocksDiagonal: boolean;
  /** Safety cap: game is a draw when ply reaches this */
  maxPlies: number;
}

export const DEFAULT_RULES: RulesConfig = {
  khawajaBlocksHorizontal: true,
  khawajaBlocksVertical: true,
  khawajaBlocksDiagonal: false,
  maxPlies: 300,
};

export type MoveErrorCode =
  | 'game_over'
  | 'not_your_turn'
  | 'stone_not_found'
  | 'not_your_stone'
  | 'invalid_target'
  | 'cell_occupied'
  | 'not_adjacent';

export interface MoveEvents {
  /** Set when this move wins the game */
  win: { side: Side; line: number[]; type: LineType } | null;
  /** Blocked lines that appeared as a result of THIS move */
  newlyBlocked: BlockedLine[];
  /** Opponent has no legal move after this move (mover wins) */
  opponentStuck: boolean;
  draw: boolean;
}

export type MoveResult =
  | { ok: true; state: EngineState; events: MoveEvents }
  | { ok: false; error: MoveErrorCode };
