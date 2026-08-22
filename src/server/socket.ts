/**
 * Socket.IO layer: authentication, rate limiting, event routing.
 * All game logic lives in GameManager / the engine — this file only
 * validates transport-level concerns and forwards actions.
 */

import type { Server as HttpServer } from 'node:http';
import { Server } from 'socket.io';
import type { User } from '@prisma/client';
import { tokenFromCookieHeader, validateSessionToken } from '@/lib/auth';
import { rateLimit } from '@/lib/rateLimit';
import { prisma } from '@/lib/db';
import type { ClientEvents, ServerEvents } from '@/shared/events';
import { GameManager } from './gameManager';
import { presence } from './presence';
import { registerLiveBridge } from './live';

type IO = Server<ClientEvents, ServerEvents>;

export function attachSocketServer(httpServer: HttpServer): IO {
  const io: IO = new Server(httpServer, {
    // Same-origin only — reject cross-origin WebSocket hijacking attempts
    allowRequest(req, allow) {
      const origin = req.headers.origin;
      if (!origin) return allow(null, true); // non-browser clients / same-origin
      try {
        const host = new URL(origin).host;
        return allow(null, host === req.headers.host);
      } catch {
        return allow(null, false);
      }
    },
    // Long-polling fallback kept off on purpose: one websocket per client,
    // no polling — per product requirements.
    transports: ['websocket'],
    pingInterval: 10_000,
    pingTimeout: 8_000,
  });

  const emitToUser = (userId: string, event: string, payload: unknown): void => {
    for (const sid of presence.socketIdsOf(userId)) {
      const sock = io.sockets.sockets.get(sid);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (sock?.emit as any)?.(event, payload);
    }
  };
  const broadcast = (event: string, payload: unknown): void => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (io.emit as any)(event, payload);
  };

  const games = new GameManager(emitToUser, broadcast);

  // ── Auth middleware: session cookie → user ──
  io.use(async (socket, next) => {
    try {
      const token = tokenFromCookieHeader(socket.request.headers.cookie);
      if (!token) return next(new Error('unauthorized'));
      const user = await validateSessionToken(token);
      if (!user) return next(new Error('unauthorized'));
      socket.data.user = user;
      return next();
    } catch {
      return next(new Error('unauthorized'));
    }
  });

  io.on('connection', (socket) => {
    const user = socket.data.user as User;

    const becameOnline = presence.addSocket(user.id, socket.id, {
      username: user.username,
      displayName: user.displayName,
      hasAvatar: user.avatarData !== null,
      avatarIcon: user.avatarIcon,
    });
    if (becameOnline) {
      prisma.user.update({ where: { id: user.id }, data: { lastSeenAt: new Date() } }).catch(() => {});
      const status = presence.changedStatus(user.id);
      if (status) {
        broadcast('presence:update', {
          userId: user.id,
          username: user.username,
          displayName: user.displayName,
          status,
        });
      }
      games.onUserOnline(user.id);
    }

    /** Wrap a handler: catch errors, rate-limit, guarantee an ack. */
    function on<E extends keyof ClientEvents>(
      event: E,
      opts: { limit: number; windowMs: number },
      handler: (
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        payload: any,
        user: User,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ) => Promise<Record<string, unknown> | any[] | undefined | { error?: string }>,
    ): void {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (socket.on as any)(event as string, async (...args: any[]) => {
        const ack = typeof args[args.length - 1] === 'function' ? args[args.length - 1] : null;
        const payload = args.length > 1 ? args[0] : undefined;
        try {
          if (!rateLimit(`${event}:${user.id}`, opts.limit, opts.windowMs)) {
            ack?.({ ok: false, error: 'طلبات كتير — اهدى شوية' });
            return;
          }
          const result = await handler(payload, user);
          if (ack) {
            if (result && typeof result === 'object' && !Array.isArray(result) && 'error' in result && result.error) {
              ack({ ok: false, error: result.error });
            } else if (result !== undefined && result !== null && Object.keys(result).length > 0) {
              ack({ ok: true, data: result });
            } else {
              ack({ ok: true });
            }
          }
        } catch (err) {
          console.error(`[socket] ${event} failed`, err);
          ack?.({ ok: false, error: 'مشكلة في السيرفر' });
        }
      });
    }

    // ── Rooms ──
    on('room:create', { limit: 10, windowMs: 60_000 }, async (_p, u) => games.roomCreate(u));
    on('room:join', { limit: 15, windowMs: 60_000 }, async (p, u) => games.roomJoin(u, String(p?.code ?? '')));
    on('room:leave', { limit: 20, windowMs: 60_000 }, async (p, u) => games.roomLeave(u, String(p?.gameId ?? '')));

    // ── Invitations ──
    on('invite:send', { limit: 10, windowMs: 60_000 }, async (p, u) =>
      games.inviteSend(u, String(p?.toUsername ?? '')),
    );
    on('invite:respond', { limit: 30, windowMs: 60_000 }, async (p, u) =>
      games.inviteRespond(u, String(p?.invitationId ?? ''), p?.accept === true),
    );
    on('invite:cancel', { limit: 30, windowMs: 60_000 }, async (p, u) =>
      games.inviteCancel(u, String(p?.invitationId ?? '')),
    );

    // ── Gameplay ──
    on('game:move', { limit: 12, windowMs: 1_000 }, async (p, u) =>
      games.move(u, String(p?.gameId ?? ''), String(p?.stoneId ?? ''), Number(p?.target)),
    );
    on('game:sync', { limit: 30, windowMs: 10_000 }, async (p, u) => {
      const res = await games.sync(u, String(p?.gameId ?? ''));
      if ('error' in res) return res;
      return res as unknown as Record<string, unknown>;
    });
    on('game:leave', { limit: 10, windowMs: 60_000 }, async (p, u) => games.leave(u, String(p?.gameId ?? '')));
    on('game:draw-offer', { limit: 5, windowMs: 60_000 }, async (p, u) => games.drawOffer(u, String(p?.gameId ?? '')));
    on('game:draw-respond', { limit: 10, windowMs: 60_000 }, async (p, u) =>
      games.drawRespond(u, String(p?.gameId ?? ''), p?.accept === true),
    );
    on('game:rematch', { limit: 5, windowMs: 60_000 }, async (p, u) => games.rematch(u, String(p?.gameId ?? '')));
    on('game:rematch-respond', { limit: 10, windowMs: 60_000 }, async (p, u) =>
      games.rematchRespond(u, String(p?.gameId ?? ''), p?.accept === true),
    );
    on('bot:start', { limit: 8, windowMs: 60_000 }, async (_p, u) => games.botStart(u));

    // ── Presence ──
    on('presence:list', { limit: 20, windowMs: 10_000 }, async () => ({ list: presence.listOnline() }));

    socket.on('disconnect', () => {
      const wentOffline = presence.removeSocket(user.id, socket.id);
      if (wentOffline) {
        prisma.user.update({ where: { id: user.id }, data: { lastSeenAt: new Date() } }).catch(() => {});
        const status = presence.changedStatus(user.id);
        if (status) {
          broadcast('presence:update', {
            userId: user.id,
            username: user.username,
            displayName: user.displayName,
            status,
          });
        }
        games.onUserOffline(user.id);
      }
    });
  });

  // Live profile-meta bridge: profile/avatar API routes (a separate module
  // instance under Next.js) dispatch here via globalThis so connected users
  // and live games reflect display-name / avatar changes immediately.
  registerLiveBridge((userId, meta) => {
    presence.updateMeta(userId, meta);
    games.refreshPlayerMeta(userId, meta);
    if (presence.isOnline(userId)) {
      broadcast('presence:update', {
        userId,
        username: meta.username,
        displayName: meta.displayName,
        status: presence.statusOf(userId),
      });
    }
  });

  return io;
}
