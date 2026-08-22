/**
 * Authoritative game manager.
 *
 * The server — and only the server — owns game state. Clients send
 * actions ("move stone X to Y"); this manager validates via the pure
 * Game Rules Engine, persists to PostgreSQL, then broadcasts the new
 * authoritative state. Reconnection = full state resync.
 */

import type { Prisma, User } from '@prisma/client';
import { prisma } from '@/lib/db';
import { generateRoomCode } from '@/lib/roomCode';
import {
  applyMove,
  createInitialState,
  deserializeState,
  serializeState,
} from '@/game/engine';
import { DEFAULT_RULES, type EngineState, type Side } from '@/game/types';
import {
  MOVE_ERROR_AR,
  type GamePlayerInfo,
  type GameStatePayload,
  type InvitationPayload,
  type LastMove,
} from '@/shared/events';
import { chooseMove, evaluateBoard } from '@/game/ai';
import { ensureBotUser, botUserId } from './botUser';
import type { ProfileMeta } from './live';
import { presence } from './presence';

type EmitFn = (userId: string, event: string, payload: unknown) => void;
type BroadcastFn = (event: string, payload: unknown) => void;

interface LivePlayer {
  userId: string;
  username: string;
  displayName: string;
  hasAvatar: boolean;
  avatarIcon: string | null;
  connected: boolean;
}

interface LiveGame {
  id: string;
  status: 'waiting' | 'active' | 'finished' | 'abandoned';
  roomCode: string | null;
  state: EngineState | null;
  players: { A: LivePlayer | null; B: LivePlayer | null };
  lastMove: LastMove | null;
  drawOfferFrom: Side | null;
  rematchOfferFrom: Side | null;
  endInfo: GameStatePayload['endInfo'];
  disconnectTimers: Partial<Record<Side, NodeJS.Timeout>>;
}

const DISCONNECT_GRACE_SECONDS = Number(process.env.DISCONNECT_GRACE_SECONDS ?? 60);
const INVITE_TTL_MS = 60_000;

function otherSide(s: Side): Side {
  return s === 'A' ? 'B' : 'A';
}

export class GameManager {
  private games = new Map<string, LiveGame>();
  private inviteTimers = new Map<string, NodeJS.Timeout>();
  private botTimers = new Map<string, NodeJS.Timeout>();
  private botIdCache: string | null = null;

  constructor(
    private emitToUser: EmitFn,
    private broadcast: BroadcastFn,
  ) {}

  // ─────────────────────────────── helpers ───────────────────────────────

  /** The bot user id (cached for sync access from toPayload). */
  private async botId(): Promise<string> {
    if (this.botIdCache) return this.botIdCache;
    this.botIdCache = await botUserId();
    return this.botIdCache;
  }

  private playerInfo(p: LivePlayer): GamePlayerInfo {
    return {
      userId: p.userId,
      username: p.username,
      displayName: p.displayName,
      hasAvatar: p.hasAvatar,
      avatarIcon: p.avatarIcon,
      // The bot never holds a socket but must always look online.
      connected: p.userId === this.botIdCache ? true : p.connected,
    };
  }

  private toPayload(game: LiveGame, recipientUserId: string | null): GameStatePayload {
    const yourSide: Side | null =
      game.players.A?.userId === recipientUserId
        ? 'A'
        : game.players.B?.userId === recipientUserId
          ? 'B'
          : null;
    return {
      gameId: game.id,
      status: game.status,
      roomCode: game.roomCode,
      state: game.state,
      players: {
        A: game.players.A ? this.playerInfo(game.players.A) : null,
        B: game.players.B ? this.playerInfo(game.players.B) : null,
      },
      yourSide,
      lastMove: game.lastMove,
      drawOfferFrom: game.drawOfferFrom,
      rematchOfferFrom: game.rematchOfferFrom,
      endInfo: game.endInfo,
    };
  }

  private broadcastState(game: LiveGame): void {
    for (const side of ['A', 'B'] as Side[]) {
      const p = game.players[side];
      if (p) this.emitToUser(p.userId, 'game:state', this.toPayload(game, p.userId));
    }
  }

  private sideOf(game: LiveGame, userId: string): Side | null {
    if (game.players.A?.userId === userId) return 'A';
    if (game.players.B?.userId === userId) return 'B';
    return null;
  }

  /** Load a game from DB into memory (resume after restart / first touch). */
  private async getOrLoad(gameId: string): Promise<LiveGame | null> {
    const cached = this.games.get(gameId);
    if (cached) return cached;

    const row = await prisma.game.findUnique({
      where: { id: gameId },
      include: { players: { include: { user: true } } },
    });
    if (!row) return null;

    const players: LiveGame['players'] = { A: null, B: null };
    const botId = await this.botId();
    this.botIdCache = botId;
    for (const gp of row.players) {
      players[gp.side] = {
        userId: gp.userId,
        username: gp.user.username,
        displayName: gp.user.displayName,
        hasAvatar: gp.user.avatarData !== null,
        avatarIcon: gp.user.avatarIcon,
        connected: gp.userId === botId ? true : presence.isOnline(gp.userId),
      };
    }

    const statusMap: Record<string, LiveGame['status']> = {
      WAITING: 'waiting',
      ACTIVE: 'active',
      FINISHED: 'finished',
      ABANDONED: 'abandoned',
    };

    const reasonMap: Record<string, string> = {
      LINE: 'line',
      NO_MOVES: 'no_moves',
      DRAW_MAX_PLIES: 'max_plies',
      OPPONENT_LEFT: 'opponent_left',
      OPPONENT_DISCONNECTED: 'opponent_disconnected',
      DRAW_AGREEMENT: 'draw_agreement',
    };

    const game: LiveGame = {
      id: row.id,
      status: statusMap[row.status] ?? 'abandoned',
      roomCode: row.roomCode,
      state: row.boardState ? deserializeState(JSON.stringify(row.boardState)) : null,
      players,
      lastMove: null,
      drawOfferFrom: null,
      rematchOfferFrom: null,
      endInfo:
        row.status === 'FINISHED' || row.status === 'ABANDONED'
          ? {
              winnerUserId: row.winnerId,
              winnerSide: row.winnerSide,
              reason: row.winReason ? reasonMap[row.winReason] : null,
            }
          : null,
      disconnectTimers: {},
    };
    // Only keep live games in memory
    if (game.status === 'active' || game.status === 'waiting') {
      this.games.set(gameId, game);
    }
    return game;
  }

  /** The game a user is currently busy with (WAITING or ACTIVE). */
  async currentGameIdOf(userId: string): Promise<string | null> {
    const gp = await prisma.gamePlayer.findFirst({
      where: { userId, game: { status: { in: ['WAITING', 'ACTIVE'] } } },
      select: { gameId: true },
      orderBy: { game: { createdAt: 'desc' } },
    });
    return gp?.gameId ?? null;
  }

  private async createGameBetween(
    userA: User,
    userB: User,
    opts: { roomCode?: string; waiting?: boolean } = {},
  ): Promise<LiveGame> {
    const state = opts.waiting ? null : createInitialState();
    const row = await prisma.game.create({
      data: {
        status: opts.waiting ? 'WAITING' : 'ACTIVE',
        roomCode: opts.roomCode ?? null,
        boardState: state ? (JSON.parse(serializeState(state)) as object) : undefined,
        currentTurn: 'A',
        startedAt: opts.waiting ? null : new Date(),
        players: {
          create: [
            { userId: userA.id, side: 'A' },
            ...(opts.waiting ? [] : [{ userId: userB.id, side: 'B' as const }]),
          ],
        },
      },
    });

    const mk = (u: User): LivePlayer => ({
      userId: u.id,
      username: u.username,
      displayName: u.displayName,
      hasAvatar: u.avatarData !== null,
      avatarIcon: u.avatarIcon,
      connected: true,
    });

    const game: LiveGame = {
      id: row.id,
      status: opts.waiting ? 'waiting' : 'active',
      roomCode: opts.roomCode ?? null,
      state,
      players: { A: mk(userA), B: opts.waiting ? null : mk(userB) },
      lastMove: null,
      drawOfferFrom: null,
      rematchOfferFrom: null,
      endInfo: null,
      disconnectTimers: {},
    };
    this.games.set(game.id, game);

    if (!opts.waiting) {
      for (const u of [userA, userB]) {
        presence.setInGame(u.id, true);
        this.notifyPresence(u.id);
      }
    }
    return game;
  }

  private notifyPresence(userId: string): void {
    const status = presence.changedStatus(userId);
    const meta = presence.metaOf(userId);
    if (status && meta) {
      this.broadcast('presence:update', {
        userId,
        username: meta.username,
        displayName: meta.displayName,
        status,
      });
    }
  }

  // ─────────────────────────────── rooms ───────────────────────────────

  async roomCreate(user: User): Promise<{ gameId: string; code: string } | { error: string }> {
    if (await this.currentGameIdOf(user.id)) {
      return { error: 'أنت بالفعل في مباراة أو غرفة — اتركها الأول' };
    }
    for (let attempt = 0; attempt < 5; attempt++) {
      const code = generateRoomCode();
      try {
        const game = await this.createGameBetween(user, user, { roomCode: code, waiting: true });
        return { gameId: game.id, code };
      } catch {
        // unique collision on roomCode — retry
      }
    }
    return { error: 'حصلت مشكلة، جرب تاني' };
  }

  async roomJoin(user: User, codeRaw: string): Promise<{ gameId: string } | { error: string }> {
    const code = codeRaw.trim().toUpperCase();
    if (!/^[A-Z0-9]{4,8}$/.test(code)) return { error: 'الكود غير صالح' };
    if (await this.currentGameIdOf(user.id)) {
      return { error: 'أنت بالفعل في مباراة أو غرفة — اتركها الأول' };
    }
    const row = await prisma.game.findUnique({
      where: { roomCode: code },
      include: { players: { include: { user: true } } },
    });
    if (!row || row.status !== 'WAITING') return { error: 'الغرفة مش موجودة أو بدأت خلاص' };
    const host = row.players[0]?.user;
    if (!host) return { error: 'الغرفة غير صالحة' };
    if (host.id === user.id) return { error: 'دي غرفتك أنت — ابعت الكود لصديقك' };

    const state = createInitialState();
    await prisma.game.update({
      where: { id: row.id },
      data: {
        status: 'ACTIVE',
        boardState: JSON.parse(serializeState(state)) as object,
        startedAt: new Date(),
        players: { create: [{ userId: user.id, side: 'B' }] },
      },
    });

    const game = await this.getOrLoad(row.id);
    if (!game) return { error: 'حصلت مشكلة، جرب تاني' };
    game.status = 'active';
    game.state = state;
    game.players.B = {
      userId: user.id,
      username: user.username,
      displayName: user.displayName,
      hasAvatar: user.avatarData !== null,
      avatarIcon: user.avatarIcon,
      connected: true,
    };

    for (const u of [host, user]) {
      presence.setInGame(u.id, true);
      this.notifyPresence(u.id);
    }
    this.emitToUser(host.id, 'game:start', { gameId: game.id });
    this.broadcastState(game);
    return { gameId: game.id };
  }

  async roomLeave(user: User, gameId: string): Promise<{ error?: string }> {
    const game = await this.getOrLoad(gameId);
    if (!game) return {};
    if (game.status !== 'waiting') return { error: 'الغرفة بدأت خلاص' };
    if (game.players.A?.userId !== user.id) return { error: 'مش غرفتك' };
    this.games.delete(gameId);
    await prisma.game.delete({ where: { id: gameId } }).catch(() => {});
    return {};
  }

  // ─────────────────────────────── invitations ───────────────────────────────

  async inviteSend(user: User, toUsernameRaw: string): Promise<{ invitationId: string } | { error: string }> {
    const toUsername = toUsernameRaw.trim();
    if (!toUsername) return { error: 'اكتب اسم اللاعب' };
    if (toUsername.toLowerCase() === user.username.toLowerCase()) {
      return { error: 'مينفعش تدعو نفسك 😄' };
    }
    if (await this.currentGameIdOf(user.id)) {
      return { error: 'اترك مباراتك الحالية الأول' };
    }
    const target = await prisma.user.findFirst({
      where: { username: { equals: toUsername, mode: 'insensitive' } },
    });
    if (!target) return { error: 'اللاعب ده مش موجود' };
    if (!presence.isOnline(target.id)) return { error: 'اللاعب مش متصل دلوقتي' };
    if (presence.statusOf(target.id) === 'in-game') return { error: 'اللاعب في مباراة حاليًا' };

    const existing = await prisma.invitation.findFirst({
      where: { fromUserId: user.id, toUserId: target.id, status: 'PENDING' },
    });
    if (existing) return { error: 'أنت مرسله دعوة بالفعل — استنى رده' };

    const inv = await prisma.invitation.create({
      data: { fromUserId: user.id, toUserId: target.id },
    });

    const payload: InvitationPayload = {
      id: inv.id,
      fromUser: { userId: user.id, username: user.username, displayName: user.displayName },
      createdAt: inv.createdAt.getTime(),
    };
    this.emitToUser(target.id, 'invite:received', payload);

    const timer = setTimeout(() => {
      this.inviteTimers.delete(inv.id);
      prisma.invitation
        .updateMany({ where: { id: inv.id, status: 'PENDING' }, data: { status: 'EXPIRED' } })
        .then((r) => {
          if (r.count > 0) {
            this.emitToUser(user.id, 'invite:updated', { invitationId: inv.id, status: 'expired' });
            this.emitToUser(target.id, 'invite:updated', { invitationId: inv.id, status: 'expired' });
          }
        })
        .catch(() => {});
    }, INVITE_TTL_MS);
    timer.unref?.();
    this.inviteTimers.set(inv.id, timer);

    return { invitationId: inv.id };
  }

  async inviteRespond(
    user: User,
    invitationId: string,
    accept: boolean,
  ): Promise<{ gameId?: string; error?: string }> {
    const inv = await prisma.invitation.findUnique({
      where: { id: invitationId },
      include: { fromUser: true, toUser: true },
    });
    if (!inv || inv.toUserId !== user.id) return { error: 'الدعوة غير موجودة' };
    if (inv.status !== 'PENDING') return { error: 'الدعوة انتهت أو اترد عليها قبل كده' };

    const timer = this.inviteTimers.get(invitationId);
    if (timer) {
      clearTimeout(timer);
      this.inviteTimers.delete(invitationId);
    }

    if (!accept) {
      await prisma.invitation.update({ where: { id: inv.id }, data: { status: 'DECLINED' } });
      this.emitToUser(inv.fromUserId, 'invite:updated', { invitationId: inv.id, status: 'declined' });
      return {};
    }

    if ((await this.currentGameIdOf(user.id)) || (await this.currentGameIdOf(inv.fromUserId))) {
      await prisma.invitation.update({ where: { id: inv.id }, data: { status: 'CANCELLED' } });
      this.emitToUser(inv.fromUserId, 'invite:updated', { invitationId: inv.id, status: 'cancelled' });
      return { error: 'أحدكما دخل مباراة أخرى' };
    }

    // Inviter plays side A (moves first), accepter plays side B
    const game = await this.createGameBetween(inv.fromUser, user);
    await prisma.invitation.update({
      where: { id: inv.id },
      data: { status: 'ACCEPTED', gameId: game.id },
    });
    this.emitToUser(inv.fromUserId, 'invite:updated', {
      invitationId: inv.id,
      status: 'accepted',
      gameId: game.id,
    });
    this.emitToUser(inv.fromUserId, 'game:start', { gameId: game.id });
    this.broadcastState(game);
    return { gameId: game.id };
  }

  async inviteCancel(user: User, invitationId: string): Promise<{ error?: string }> {
    const inv = await prisma.invitation.findUnique({ where: { id: invitationId } });
    if (!inv || inv.fromUserId !== user.id) return { error: 'الدعوة غير موجودة' };
    if (inv.status !== 'PENDING') return {};
    const timer = this.inviteTimers.get(invitationId);
    if (timer) {
      clearTimeout(timer);
      this.inviteTimers.delete(invitationId);
    }
    await prisma.invitation.update({ where: { id: inv.id }, data: { status: 'CANCELLED' } });
    this.emitToUser(inv.toUserId, 'invite:updated', { invitationId: inv.id, status: 'cancelled' });
    return {};
  }

  // ─────────────────────────────── gameplay ───────────────────────────────

  async move(
    user: User,
    gameId: string,
    stoneId: string,
    target: number,
  ): Promise<{ error?: string }> {
    const game = await this.getOrLoad(gameId);
    if (!game || game.status !== 'active' || !game.state) return { error: 'المباراة غير متاحة' };
    const side = this.sideOf(game, user.id);
    if (!side) return { error: 'لست لاعبًا في هذه المباراة' };

    const res = await this.applyMoveToGame(game, side, user.id, stoneId, target);
    if (res.error) return res;

    // If the opponent is the bot and it's now its turn, schedule the reply.
    void this.ensureBotMoveScheduled(game);
    return {};
  }

  /** Engine-validate, persist and broadcast a move — shared by humans and the bot. */
  private async applyMoveToGame(
    game: LiveGame,
    side: Side,
    playerId: string,
    stoneId: string,
    target: number,
  ): Promise<{ error?: string }> {
    if (!game.state) return { error: 'المباراة غير متاحة' };

    // Pure engine validation — the only rule authority
    const result = applyMove(game.state, side, stoneId, target, DEFAULT_RULES);
    if (!result.ok) {
      return { error: MOVE_ERROR_AR[result.error] ?? 'حركة غير قانونية' };
    }

    const fromPos = game.state.board.findIndex((c) => c?.id === stoneId);
    game.state = result.state;
    game.lastMove = { stoneId, from: fromPos, to: target };
    game.drawOfferFrom = null; // any move cancels a pending draw offer

    const finished = result.state.status === 'finished';
    const winnerSide = result.state.winner;
    const winnerId = winnerSide ? game.players[winnerSide]?.userId ?? null : null;
    const winReason =
      result.state.endReason === 'line'
        ? 'LINE'
        : result.state.endReason === 'no_moves'
          ? 'NO_MOVES'
          : result.state.endReason === 'max_plies'
            ? 'DRAW_MAX_PLIES'
            : null;

    // Persist first (transaction), then broadcast — spec order, still ~ms
    try {
      const ops: Prisma.PrismaPromise<unknown>[] = [
        prisma.game.update({
          where: { id: game.id },
          data: {
            boardState: JSON.parse(serializeState(result.state)) as object,
            currentTurn: result.state.turn,
            ply: result.state.ply,
            ...(finished
              ? {
                  status: 'FINISHED',
                  winnerSide: winnerSide ?? null,
                  winnerId,
                  winReason,
                  finishedAt: new Date(),
                }
              : {}),
          },
        }),
        prisma.gameMove.create({
          data: {
            gameId: game.id,
            playerId,
            stoneId,
            fromPos,
            toPos: target,
            ply: result.state.ply,
          },
        }),
      ];
      if (finished) {
        ops.push(...this.statsUpdateOps(game, winnerSide));
      }
      await prisma.$transaction(ops);
    } catch (err) {
      console.error('[game] persist move failed', err);
      return { error: 'مشكلة في السيرفر — جرب تاني' };
    }

    if (finished) {
      game.status = 'finished';
      game.endInfo = {
        winnerUserId: winnerId,
        winnerSide,
        reason:
          result.state.endReason === 'line'
            ? 'line'
            : result.state.endReason === 'no_moves'
              ? 'no_moves'
              : 'max_plies',
      };
      this.clearGameTimers(game);
      for (const s of ['A', 'B'] as Side[]) {
        const p = game.players[s];
        if (p) {
          presence.setInGame(p.userId, false);
          this.notifyPresence(p.userId);
        }
      }
    }

    this.broadcastState(game);

    // Khawaja hint — a completed line was blocked by an unmoved stone
    for (const blocked of result.events.newlyBlocked) {
      const owner = game.players[blocked.side];
      if (owner) {
        this.emitToUser(owner.userId, 'toast', {
          kind: 'info',
          message: 'خط مكتمل لكنه مش محسوب — فيه حجر خواجة لسه ماتحركش',
        });
      }
    }
    return {};
  }

  private statsUpdateOps(game: LiveGame, winnerSide: Side | null): Prisma.PrismaPromise<unknown>[] {
    const a = game.players.A;
    const b = game.players.B;
    if (!a || !b) return [];
    if (winnerSide === null) {
      return [
        prisma.user.update({ where: { id: a.userId }, data: { draws: { increment: 1 }, gamesPlayed: { increment: 1 } } }),
        prisma.user.update({ where: { id: b.userId }, data: { draws: { increment: 1 }, gamesPlayed: { increment: 1 } } }),
      ];
    }
    const winner = winnerSide === 'A' ? a : b;
    const loser = winnerSide === 'A' ? b : a;
    return [
      prisma.user.update({ where: { id: winner.userId }, data: { wins: { increment: 1 }, gamesPlayed: { increment: 1 } } }),
      prisma.user.update({ where: { id: loser.userId }, data: { losses: { increment: 1 }, gamesPlayed: { increment: 1 } } }),
    ];
  }

  private clearGameTimers(game: LiveGame): void {
    for (const s of ['A', 'B'] as Side[]) {
      const t = game.disconnectTimers[s];
      if (t) clearTimeout(t);
    }
    game.disconnectTimers = {};
  }

  async sync(user: User, gameId: string): Promise<GameStatePayload | { error: string }> {
    const game = await this.getOrLoad(gameId);
    if (!game) return { error: 'المباراة غير موجودة' };
    if (!this.sideOf(game, user.id)) return { error: 'لست لاعبًا في هذه المباراة' };
    void this.ensureBotMoveScheduled(game);
    return this.toPayload(game, user.id);
  }

  async leave(user: User, gameId: string): Promise<{ error?: string }> {
    const game = await this.getOrLoad(gameId);
    if (!game) return {};
    const side = this.sideOf(game, user.id);
    if (!side) return { error: 'لست لاعبًا في هذه المباراة' };

    if (game.status === 'waiting') {
      this.games.delete(gameId);
      await prisma.game.delete({ where: { id: gameId } }).catch(() => {});
      return {};
    }
    if (game.status !== 'active') return {};

    if (this.isBotGame(game)) {
      await this.abandonNoPenalty(game);
      return {};
    }
    await this.finishGame(game, otherSide(side), 'OPPONENT_LEFT');
    return {};
  }

  private async finishGame(
    game: LiveGame,
    winnerSide: Side | null,
    reason: 'OPPONENT_LEFT' | 'OPPONENT_DISCONNECTED' | 'DRAW_AGREEMENT',
  ): Promise<void> {
    const winnerId = winnerSide ? game.players[winnerSide]?.userId ?? null : null;
    game.status = 'finished';
    game.endInfo = {
      winnerUserId: winnerId,
      winnerSide,
      reason:
        reason === 'OPPONENT_LEFT'
          ? 'opponent_left'
          : reason === 'OPPONENT_DISCONNECTED'
            ? 'opponent_disconnected'
            : 'draw_agreement',
    };
    this.clearGameTimers(game);
    try {
      await prisma.$transaction([
        prisma.game.update({
          where: { id: game.id },
          data: {
            status: 'FINISHED',
            winnerSide: winnerSide ?? null,
            winnerId,
            winReason: reason,
            finishedAt: new Date(),
          },
        }),
        ...this.statsUpdateOps(game, winnerSide),
      ]);
    } catch (err) {
      console.error('[game] finishGame persist failed', err);
    }
    for (const s of ['A', 'B'] as Side[]) {
      const p = game.players[s];
      if (p) {
        presence.setInGame(p.userId, false);
        this.notifyPresence(p.userId);
      }
    }
    this.broadcastState(game);
  }

  // ─────────────────────────────── draw offers ───────────────────────────────

  async drawOffer(user: User, gameId: string): Promise<{ error?: string }> {
    const game = await this.getOrLoad(gameId);
    if (!game || game.status !== 'active') return { error: 'المباراة غير متاحة' };
    const side = this.sideOf(game, user.id);
    if (!side) return { error: 'لست لاعبًا في هذه المباراة' };
    if (game.drawOfferFrom === side) return { error: 'أنت عرضت التعادل بالفعل' };

    // The bot auto-answers a draw offer by evaluating its position.
    if (this.isBotGame(game) && game.state) {
      if (evaluateBoard(game.state, otherSide(side)) > 0) {
        this.emitToUser(user.id, 'toast', {
          kind: 'info',
          message: 'التوبور رفض التعادل — شايف نفسه كسبان 😤',
        });
        return {};
      }
      await this.finishGame(game, null, 'DRAW_AGREEMENT');
      return {};
    }

    game.drawOfferFrom = side;
    this.broadcastState(game);
    return {};
  }

  async drawRespond(user: User, gameId: string, accept: boolean): Promise<{ error?: string }> {
    const game = await this.getOrLoad(gameId);
    if (!game || game.status !== 'active') return { error: 'المباراة غير متاحة' };
    const side = this.sideOf(game, user.id);
    if (!side) return { error: 'لست لاعبًا في هذه المباراة' };
    if (!game.drawOfferFrom || game.drawOfferFrom === side) return { error: 'مفيش عرض تعادل' };
    game.drawOfferFrom = null;
    if (accept) {
      await this.finishGame(game, null, 'DRAW_AGREEMENT');
    } else {
      this.broadcastState(game);
    }
    return {};
  }

  // ─────────────────────────────── rematch ───────────────────────────────

  async rematch(user: User, gameId: string): Promise<{ gameId?: string; error?: string }> {
    const game = await this.getOrLoad(gameId);
    if (!game || game.status !== 'finished') return { error: 'المباراة لسه شغالة' };
    const side = this.sideOf(game, user.id);
    if (!side) return { error: 'لست لاعبًا في هذه المباراة' };
    if (game.rematchOfferFrom === side) return { error: 'أنت طلبت إعادة بالفعل' };

    // Against the bot a rematch is accepted instantly (human always side A).
    if (this.isBotGame(game)) {
      const human = await prisma.user.findUnique({ where: { id: user.id } });
      if (!human) return { error: 'حصلت مشكلة' };
      const bot = await ensureBotUser();
      this.botIdCache = bot.id;
      const newGame = await this.createGameBetween(human, bot);
      this.emitToUser(user.id, 'game:start', { gameId: newGame.id });
      this.broadcastState(newGame);
      return { gameId: newGame.id };
    }

    game.rematchOfferFrom = side;
    this.broadcastState(game);
    return {};
  }

  async rematchRespond(
    user: User,
    gameId: string,
    accept: boolean,
  ): Promise<{ gameId?: string; error?: string }> {
    const game = await this.getOrLoad(gameId);
    if (!game || game.status !== 'finished') return { error: 'المباراة لسه شغالة' };
    const side = this.sideOf(game, user.id);
    if (!side) return { error: 'لست لاعبًا في هذه المباراة' };
    if (!game.rematchOfferFrom || game.rematchOfferFrom === side) return { error: 'مفيش طلب إعادة' };

    const offerSide = game.rematchOfferFrom;
    game.rematchOfferFrom = null;
    const offerer = game.players[offerSide];
    if (!offerer) return { error: 'حصلت مشكلة' };

    if (!accept) {
      this.emitToUser(offerer.userId, 'toast', { kind: 'info', message: 'الخصم رفض الإعادة' });
      this.broadcastState(game);
      return {};
    }

    const userA = await prisma.user.findUnique({ where: { id: offerer.userId } });
    const userB = await prisma.user.findUnique({ where: { id: user.id } });
    if (!userA || !userB) return { error: 'حصلت مشكلة' };

    if (await this.currentGameIdOf(userA.id)) return { error: 'الخصم دخل مباراة أخرى' };

    // Swap sides compared to the finished game for fairness
    const prevASide = game.players.A?.userId;
    const first = prevASide === userA.id ? userB : userA; // previous B starts as A
    const second = first.id === userA.id ? userB : userA;
    const newGame = await this.createGameBetween(first, second);
    this.emitToUser(userA.id, 'game:start', { gameId: newGame.id });
    this.emitToUser(userB.id, 'game:start', { gameId: newGame.id });
    this.broadcastState(newGame);
    return { gameId: newGame.id };
  }

  // ─────────────────────────────── bot ───────────────────────────────

  /** Start a practice match vs the bot — the human always plays side A. */
  async botStart(user: User): Promise<{ gameId: string } | { error: string }> {
    if (await this.currentGameIdOf(user.id)) {
      return { error: 'أنت بالفعل في مباراة أو غرفة — اتركها الأول' };
    }
    const bot = await ensureBotUser();
    this.botIdCache = bot.id;
    const game = await this.createGameBetween(user, bot);
    this.emitToUser(user.id, 'game:start', { gameId: game.id });
    this.broadcastState(game);
    return { gameId: game.id };
  }

  private scheduleBotMove(gameId: string): void {
    if (this.botTimers.has(gameId)) return;
    // 0.5–1 s — the reply feels deliberate rather than instant.
    const delay = 500 + Math.random() * 500;
    const timer = setTimeout(() => {
      void this.botMove(gameId);
    }, delay);
    timer.unref?.();
    this.botTimers.set(gameId, timer);
  }

  private async botMove(gameId: string): Promise<void> {
    this.botTimers.delete(gameId);
    const game = await this.getOrLoad(gameId);
    if (!game || game.status !== 'active' || !game.state) return;
    const botId = await this.botId();
    const botSide =
      game.players.A?.userId === botId ? 'A' : game.players.B?.userId === botId ? 'B' : null;
    if (!botSide || game.state.turn !== botSide) return;

    const mv = chooseMove(game.state, botSide);
    if (!mv) return; // no legal move — cannot happen while active
    await this.applyMoveToGame(game, botSide, botId, mv.stoneId, mv.target);
  }

  /** Start the bot thinking when a resumable match is waiting on it. */
  private async ensureBotMoveScheduled(game: LiveGame): Promise<void> {
    if (game.status !== 'active' || !game.state) return;
    const botId = await this.botId();
    const botSide =
      game.players.A?.userId === botId ? 'A' : game.players.B?.userId === botId ? 'B' : null;
    if (!botSide || game.state.turn !== botSide) return;
    this.scheduleBotMove(game.id);
  }

  private isBotGame(game: LiveGame): boolean {
    return (
      game.players.A?.userId === this.botIdCache || game.players.B?.userId === this.botIdCache
    );
  }

  /** End a bot practice match without recording a win/loss for either side. */
  private async abandonNoPenalty(game: LiveGame): Promise<void> {
    game.status = 'abandoned';
    game.endInfo = { winnerUserId: null, winnerSide: null, reason: 'abandoned' };
    this.clearGameTimers(game);
    this.botTimers.delete(game.id);
    try {
      await prisma.game.update({
        where: { id: game.id },
        data: { status: 'ABANDONED', finishedAt: new Date() },
      });
    } catch (err) {
      console.error('[game] abandon persist failed', err);
    }
    for (const s of ['A', 'B'] as Side[]) {
      const p = game.players[s];
      if (p) {
        presence.setInGame(p.userId, false);
        this.notifyPresence(p.userId);
      }
    }
    this.broadcastState(game);
  }

  /** End an active game when a player fails to return in the grace window. */
  private async endGameOnDisconnect(game: LiveGame, offlineSide: Side): Promise<void> {
    if (this.isBotGame(game)) {
      // Practice vs the bot — a disconnect never counts as a loss.
      await this.abandonNoPenalty(game);
    } else {
      await this.finishGame(game, otherSide(offlineSide), 'OPPONENT_DISCONNECTED');
    }
  }

  /** Push a profile update into every live game this user is part of. */
  refreshPlayerMeta(userId: string, meta: ProfileMeta): void {
    for (const game of this.games.values()) {
      const side = this.sideOf(game, userId);
      if (!side) continue;
      const p = game.players[side];
      if (!p) continue;
      p.username = meta.username;
      p.displayName = meta.displayName;
      p.hasAvatar = meta.hasAvatar;
      p.avatarIcon = meta.avatarIcon;
      if (game.status === 'active' || game.status === 'waiting') this.broadcastState(game);
    }
  }

  // ─────────────────────────────── connection lifecycle ───────────────────────────────

  /** User lost their last socket — start grace timers for their active games. */
  onUserOffline(userId: string): void {
    for (const game of this.games.values()) {
      const side = this.sideOf(game, userId);
      if (!side) continue;
      const player = game.players[side];
      if (!player) continue;
      player.connected = false;

      if (game.status === 'waiting') {
        // Host left a waiting room — close it
        this.games.delete(game.id);
        prisma.game.delete({ where: { id: game.id } }).catch(() => {});
        continue;
      }
      if (game.status !== 'active') continue;

      this.broadcastState(game); // show opponent "غير متصل"
      const opponent = game.players[otherSide(side)];
      if (opponent) {
        this.emitToUser(opponent.userId, 'toast', {
          kind: 'info',
          message: 'الخصم فصل — عنده دقيقة يرجع فيها',
        });
      }

      const timer = setTimeout(() => {
        void this.endGameOnDisconnect(game, side);
      }, DISCONNECT_GRACE_SECONDS * 1000);
      timer.unref?.();
      game.disconnectTimers[side] = timer;
    }
  }

  /** User reconnected — cancel grace timers, mark connected. */
  onUserOnline(userId: string): void {
    for (const game of this.games.values()) {
      const side = this.sideOf(game, userId);
      if (!side) continue;
      const player = game.players[side];
      if (!player) continue;
      player.connected = true;
      const timer = game.disconnectTimers[side];
      if (timer) {
        clearTimeout(timer);
        delete game.disconnectTimers[side];
        if (game.status === 'active') {
          const opponent = game.players[otherSide(side)];
          if (opponent) {
            this.emitToUser(opponent.userId, 'toast', { kind: 'success', message: 'الخصم رجع متصل تاني' });
          }
        }
      }
      if (game.status === 'active') {
        this.broadcastState(game);
        void this.ensureBotMoveScheduled(game);
      }
    }
  }
}
