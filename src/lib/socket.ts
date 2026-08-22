'use client';

import { io, type Socket } from 'socket.io-client';
import type { Ack, ClientEvents, ServerEvents } from '@/shared/events';

export type AppSocket = Socket<ServerEvents, ClientEvents>;

let socket: AppSocket | null = null;

/** One WebSocket per client, auto-reconnect with backoff. No polling. */
export function getSocket(): AppSocket {
  if (!socket) {
    socket = io({
      transports: ['websocket'],
      reconnection: true,
      reconnectionDelay: 400,
      reconnectionDelayMax: 4_000,
      withCredentials: true,
    });
  }
  return socket;
}

/** Promise-based emit with ack + timeout */
export function emitAck<T = undefined>(
  event: keyof ClientEvents,
  payload?: unknown,
  timeoutMs = 8_000,
): Promise<Ack<T>> {
  const s = getSocket();
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve({ ok: false, error: 'السيرفر ماردش — جرب تاني' }), timeoutMs);
    const ackFn = (res: Ack<T>) => {
      clearTimeout(timer);
      resolve(res);
    };
    if (payload === undefined) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (s.emit as any)(event, ackFn);
    } else {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (s.emit as any)(event, payload, ackFn);
    }
  });
}
