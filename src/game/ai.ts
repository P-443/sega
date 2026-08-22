/**
 * Egyptian Sega 3x3 — AI opponent ("التوبور 🤖").
 *
 * Pure and deterministic: minimax with alpha-beta pruning, a transposition
 * table keyed by the true game state (stone identity is irrelevant — only
 * side + moved flag per cell matter), move ordering, and iterative deepening
 * with a node budget ("adaptive depth" for this tiny 6-stones-on-9-cells
 * space). No I/O, no timers, no randomness — safe on the server and in tests.
 */

import { LINES, applyMove, otherSide } from './engine';
import type { EngineState, Side } from './types';

export interface AiMove {
  stoneId: string;
  target: number;
}

export interface AiConfig {
  /** Maximum search depth (plies). */
  maxDepth: number;
  /** Node budget — iterative deepening stops once this is exceeded. */
  maxNodes: number;
}

export const DEFAULT_AI_CONFIG: AiConfig = {
  maxDepth: 7,
  maxNodes: 60_000,
};

/** A win is worth this much (minus ply, so faster wins score slightly higher). */
const WIN = 1_000_000;

const CENTER_BONUS = 4;
const CORNER_BONUS = 1;
const CORNERS = new Set([0, 2, 6, 8]);

interface TTEntry {
  depth: number;
  value: number;
  flag: 'exact' | 'lower' | 'upper';
}

interface SearchCtx {
  tt: Map<string, TTEntry>;
  nodes: number;
  maxNodes: number;
}

/** Every legal move for `side`: each of its stones to each empty cell. */
function legalMoves(state: EngineState, side: Side): AiMove[] {
  const moves: AiMove[] = [];
  for (const cell of state.board) {
    if (!cell || cell.side !== side) continue;
    for (let pos = 0; pos < 9; pos++) {
      if (state.board[pos] === null) moves.push({ stoneId: cell.id, target: pos });
    }
  }
  return moves;
}

/** Terminal score from `side`'s perspective, or null while the game is live. */
function finishedScore(state: EngineState, side: Side): number | null {
  if (state.status !== 'finished') return null;
  if (state.winner === null) return 0; // draw
  return state.winner === side ? WIN - state.ply : -(WIN - state.ply);
}

/**
 * Count "threats" for `side`: a line holding exactly two of its stones and one
 * empty cell that would still count as a win (i.e. the khawaja rule does not
 * block it). With free movement the third stone can always reach that cell,
 * so each threat is a real one-move-to-win.
 */
function countThreats(state: EngineState, side: Side): number {
  let threats = 0;
  for (const { cells, type } of LINES) {
    const stones = cells.map((c) => state.board[c]);
    if (stones.some((s) => s && s.side !== side)) continue; // opponent occupies it
    const mine = stones.filter((s): s is NonNullable<typeof s> => !!s && s.side === side);
    const empties = cells.filter((_, i) => stones[i] === null).length;
    if (mine.length !== 2 || empties !== 1) continue;
    // Horizontal/vertical lines still containing a khawaja stone never count.
    if (type !== 'diagonal' && mine.some((s) => !s.moved)) continue;
    threats++;
  }
  return threats;
}

/** Static heuristic: threat difference plus a small centre/corner term. */
export function evaluateBoard(state: EngineState, side: Side): number {
  const fin = finishedScore(state, side);
  if (fin !== null) return fin;

  let score = 0;
  const opp = otherSide(side);
  score += countThreats(state, side) * 100;
  score -= countThreats(state, opp) * 100;
  for (const cell of state.board) {
    if (!cell) continue;
    const bonus = cell.pos === 4 ? CENTER_BONUS : CORNERS.has(cell.pos) ? CORNER_BONUS : 0;
    score += cell.side === side ? bonus : -bonus;
  }
  return score;
}

/** True state key: turn + per-cell side & moved flag (stone ids are irrelevant). */
function stateKey(state: EngineState): string {
  const cells = state.board.map((c) => (c ? c.side + (c.moved ? 'm' : 'k') : '.')).join('');
  return state.turn + cells;
}

/** Order moves best-first (wins first, then shallow score) to improve pruning. */
function orderedMoves(state: EngineState, side: Side): AiMove[] {
  const scored = legalMoves(state, side).map((m) => {
    const r = applyMove(state, side, m.stoneId, m.target);
    if (!r.ok) return { m, score: -Infinity };
    const s = r.state.status === 'finished' ? finishedScore(r.state, side) ?? 0 : evaluateBoard(r.state, side);
    return { m, score: s };
  });
  scored.sort((a, b) => b.score - a.score);
  return scored.map((s) => s.m);
}

function negamax(
  state: EngineState,
  side: Side,
  depth: number,
  alpha: number,
  beta: number,
  ctx: SearchCtx,
): number {
  const fin = finishedScore(state, side);
  if (fin !== null) return fin;

  const key = stateKey(state);
  const cached = ctx.tt.get(key);
  if (cached && cached.depth >= depth) {
    if (cached.flag === 'exact') return cached.value;
    if (cached.flag === 'lower' && cached.value > alpha) alpha = cached.value;
    if (cached.flag === 'upper' && cached.value < beta) beta = cached.value;
    if (alpha >= beta) return cached.value;
  }

  if (depth <= 0 || ctx.nodes >= ctx.maxNodes) {
    return evaluateBoard(state, side);
  }

  const origAlpha = alpha;
  let best = -Infinity;
  for (const m of orderedMoves(state, side)) {
    ctx.nodes++;
    const r = applyMove(state, side, m.stoneId, m.target);
    if (!r.ok) continue;
    const val = -negamax(r.state, otherSide(side), depth - 1, -beta, -alpha, ctx);
    if (val > best) best = val;
    if (best > alpha) alpha = best;
    if (alpha >= beta) break;
  }
  if (best === -Infinity) best = evaluateBoard(state, side); // no legal move (draw)

  const flag: TTEntry['flag'] = best <= origAlpha ? 'upper' : best >= beta ? 'lower' : 'exact';
  ctx.tt.set(key, { depth, value: best, flag });
  return best;
}

/** Best move for `side` on `state`, or null when there is no legal move. */
export function chooseMove(state: EngineState, side: Side, config: AiConfig = DEFAULT_AI_CONFIG): AiMove | null {
  if (state.status !== 'active') return null;
  const moves = legalMoves(state, side);
  if (moves.length === 0) return null;

  // 1) take an immediate win
  for (const m of moves) {
    const r = applyMove(state, side, m.stoneId, m.target);
    if (r.ok && r.state.status === 'finished' && r.state.winner === side) return m;
  }

  // 2) block the opponent's immediate win if one exists
  const opp = otherSide(side);
  const oppWinTargets = new Set<number>();
  for (const m of legalMoves(state, opp)) {
    const r = applyMove(state, opp, m.stoneId, m.target);
    if (r.ok && r.state.status === 'finished' && r.state.winner === opp) oppWinTargets.add(m.target);
  }
  const blocking = moves.filter((m) => oppWinTargets.has(m.target));
  const pool = blocking.length > 0 ? blocking : moves;

  // 3) iterative deepening minimax over the candidate pool
  const ctx: SearchCtx = { tt: new Map(), nodes: 0, maxNodes: config.maxNodes };
  let best = pool[0];
  for (let depth = 1; depth <= config.maxDepth; depth++) {
    let iterBest = pool[0];
    let iterBestVal = -Infinity;
    for (const m of pool) {
      ctx.nodes++;
      const r = applyMove(state, side, m.stoneId, m.target);
      if (!r.ok) continue;
      const val = -negamax(r.state, otherSide(side), depth - 1, -Infinity, Infinity, ctx);
      if (val > iterBestVal) {
        iterBestVal = val;
        iterBest = m;
      }
    }
    best = iterBest;
    if (iterBestVal >= WIN / 2 || ctx.nodes >= ctx.maxNodes) break;
  }
  return best;
}
