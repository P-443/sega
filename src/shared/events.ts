/**
 * Shared WebSocket event contracts between client and server.
 * The client sends ACTIONS only — never game state.
 */

import type { EngineState, Side } from '@/game/types';

export type PresenceStatus = 'online' | 'in-game' | 'offline';

export interface PublicPlayer {
  userId: string;
  username: string;
  displayName: string;
  hasAvatar: boolean;
  status: PresenceStatus;
}

export interface GamePlayerInfo {
  userId: string;
  username: string;
  displayName: string;
  hasAvatar: boolean;
  connected: boolean;
}

export interface LastMove {
  stoneId: string;
  from: number;
  to: number;
}

export type GameStatusStr = 'waiting' | 'active' | 'finished' | 'abandoned';

export interface GameStatePayload {
  gameId: string;
  status: GameStatusStr;
  roomCode: string | null;
  /** Full authoritative engine state (server-computed) */
  state: EngineState | null;
  players: { A: GamePlayerInfo | null; B: GamePlayerInfo | null };
  /** Which side the RECIPIENT plays on (null = spectator) */
  yourSide: Side | null;
  lastMove: LastMove | null;
  drawOfferFrom: Side | null;
  rematchOfferFrom: Side | null;
  /** Why the game ended (when finished) */
  endInfo: {
    winnerUserId: string | null;
    winnerSide: Side | null;
    reason: string | null; // 'line' | 'no_moves' | 'max_plies' | 'opponent_left' | 'opponent_disconnected' | 'draw_agreement'
  } | null;
}

export interface InvitationPayload {
  id: string;
  fromUser: { userId: string; username: string; displayName: string };
  createdAt: number;
}

export interface AckOk<T = undefined> {
  ok: true;
  data?: T;
}
export interface AckErr {
  ok: false;
  error: string;
}
export type Ack<T = undefined> = AckOk<T> | AckErr;

/** client → server */
export interface ClientEvents {
  'room:create': (ack: (res: Ack<{ gameId: string; code: string }>) => void) => void;
  'room:join': (payload: { code: string }, ack: (res: Ack<{ gameId: string }>) => void) => void;
  'room:leave': (payload: { gameId: string }, ack: (res: Ack) => void) => void;
  'invite:send': (payload: { toUsername: string }, ack: (res: Ack<{ invitationId: string }>) => void) => void;
  'invite:respond': (
    payload: { invitationId: string; accept: boolean },
    ack: (res: Ack<{ gameId?: string }>) => void,
  ) => void;
  'invite:cancel': (payload: { invitationId: string }, ack: (res: Ack) => void) => void;
  'game:move': (
    payload: { gameId: string; stoneId: string; target: number },
    ack: (res: Ack) => void,
  ) => void;
  'game:sync': (payload: { gameId: string }, ack: (res: Ack<GameStatePayload>) => void) => void;
  'game:leave': (payload: { gameId: string }, ack: (res: Ack) => void) => void;
  'game:draw-offer': (payload: { gameId: string }, ack: (res: Ack) => void) => void;
  'game:draw-respond': (payload: { gameId: string; accept: boolean }, ack: (res: Ack) => void) => void;
  'game:rematch': (payload: { gameId: string }, ack: (res: Ack) => void) => void;
  'game:rematch-respond': (payload: { gameId: string; accept: boolean }, ack: (res: Ack<{ gameId?: string }>) => void) => void;
  'presence:list': (ack: (res: Ack<{ list: PublicPlayer[] }>) => void) => void;
}

/** server → client */
export interface ServerEvents {
  'presence:update': (p: { userId: string; username: string; displayName: string; status: PresenceStatus }) => void;
  'invite:received': (inv: InvitationPayload) => void;
  'invite:updated': (p: { invitationId: string; status: 'accepted' | 'declined' | 'cancelled' | 'expired'; gameId?: string }) => void;
  'game:start': (p: { gameId: string }) => void;
  'game:state': (payload: GameStatePayload) => void;
  'room:closed': (p: { gameId: string }) => void;
  toast: (p: { kind: 'info' | 'success' | 'error'; message: string }) => void;
}

/** Arabic messages for engine move errors — single source of truth on the server */
export const MOVE_ERROR_AR: Record<string, string> = {
  game_over: 'المباراة انتهت',
  not_your_turn: 'مش دورك دلوقتي',
  stone_not_found: 'الحجر ده مش موجود',
  not_your_stone: 'ده حجر الخصم، مش حجرك',
  invalid_target: 'الخانة دي مش صالحة',
  cell_occupied: 'الخانة دي مشغولة',
  not_adjacent: 'لازم تتحرك لخانة مجاورة فاضية',
};
