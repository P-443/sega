'use client';

/**
 * App-wide client providers:
 *  - AuthProvider    → current user from /api/auth/me
 *  - ToastProvider   → lightweight toasts
 *  - SocketProvider  → single WebSocket, presence map, global events
 *    (incoming invites with accept/decline, game:start redirects, toasts)
 */

import { useRouter } from 'next/navigation';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { emitAck, getSocket } from '@/lib/socket';
import type {
  GameStatePayload,
  InvitationPayload,
  PresenceStatus,
} from '@/shared/events';

// ────────────────────────── Auth ──────────────────────────

export interface MeUser {
  id: string;
  username: string;
  displayName: string;
  hasAvatar: boolean;
  avatarIcon: string | null;
  wins: number;
  losses: number;
  draws: number;
  gamesPlayed: number;
  status: PresenceStatus;
}

interface AuthCtx {
  user: MeUser | null;
  loading: boolean;
  currentGameId: string | null;
  refresh: () => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthCtx | null>(null);

export function useAuth(): AuthCtx {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth outside provider');
  return ctx;
}

// ────────────────────────── Toasts ──────────────────────────

export interface ToastItem {
  id: number;
  kind: 'info' | 'success' | 'error';
  message: string;
}

interface ToastCtx {
  push: (kind: ToastItem['kind'], message: string) => void;
}

const ToastContext = createContext<ToastCtx | null>(null);

export function useToast(): ToastCtx {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast outside provider');
  return ctx;
}

// ────────────────────────── Socket ──────────────────────────

interface SocketCtx {
  connected: boolean;
  presence: Record<string, PresenceStatus>;
}

const SocketContext = createContext<SocketCtx>({ connected: false, presence: {} });

export function useSocket(): SocketCtx {
  return useContext(SocketContext);
}

// ────────────────────────── Provider ──────────────────────────

let toastId = 0;

export function Providers({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [user, setUser] = useState<MeUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [currentGameId, setCurrentGameId] = useState<string | null>(null);
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [connected, setConnected] = useState(false);
  const [presenceMap, setPresenceMap] = useState<Record<string, PresenceStatus>>({});
  const [invites, setInvites] = useState<InvitationPayload[]>([]);
  const userRef = useRef<MeUser | null>(null);
  userRef.current = user;

  const push = useCallback((kind: ToastItem['kind'], message: string) => {
    const id = ++toastId;
    setToasts((t) => [...t.slice(-3), { id, kind, message }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3500);
  }, []);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch('/api/auth/me', { cache: 'no-store' });
      if (!res.ok) {
        setUser(null);
        setCurrentGameId(null);
        return;
      }
      const data = await res.json();
      setUser(data.user);
      setCurrentGameId(data.currentGameId ?? null);
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  const logout = useCallback(async () => {
    await fetch('/api/auth/logout', { method: 'POST' }).catch(() => {});
    getSocket().disconnect();
    setUser(null);
    router.push('/login');
    router.refresh();
  }, [router]);

  // Load session on mount
  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Socket lifecycle — connect once we know the user is logged in
  useEffect(() => {
    if (!user) return;
    const socket = getSocket();
    if (!socket.connected) socket.connect();

    const onConnect = () => setConnected(true);
    const onDisconnect = () => setConnected(false);
    const onPresence = (p: { userId: string; status: PresenceStatus }) => {
      setPresenceMap((m) => ({ ...m, [p.userId]: p.status }));
    };
    const onToast = (p: { kind: ToastItem['kind']; message: string }) => push(p.kind, p.message);
    const onInvite = (inv: InvitationPayload) => {
      setInvites((list) => [inv, ...list.filter((i) => i.id !== inv.id)]);
    };
    const onInviteUpdated = (p: { invitationId: string; status: string; gameId?: string }) => {
      setInvites((list) => list.filter((i) => i.id !== p.invitationId));
      if (p.status === 'declined') push('info', 'الخصم رفض الدعوة');
      if (p.status === 'expired') push('info', 'الدعوة انتهت');
      if (p.status === 'accepted' && p.gameId) {
        push('success', 'الدعوة اتقبلت — يلا بينا!');
        router.push(`/game/${p.gameId}`);
      }
    };
    const onGameStart = (p: { gameId: string }) => {
      router.push(`/game/${p.gameId}`);
    };

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('presence:update', onPresence);
    socket.on('toast', onToast);
    socket.on('invite:received', onInvite);
    socket.on('invite:updated', onInviteUpdated);
    socket.on('game:start', onGameStart);

    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('presence:update', onPresence);
      socket.off('toast', onToast);
      socket.off('invite:received', onInvite);
      socket.off('invite:updated', onInviteUpdated);
      socket.off('game:start', onGameStart);
    };
  }, [user, push, router]);

  const respondInvite = useCallback(
    async (invitationId: string, accept: boolean) => {
      setInvites((list) => list.filter((i) => i.id !== invitationId));
      const res = await emitAck<{ gameId?: string }>('invite:respond', { invitationId, accept });
      if (!res.ok) {
        push('error', res.error);
        return;
      }
      if (accept && res.data?.gameId) {
        router.push(`/game/${res.data.gameId}`);
      }
    },
    [push, router],
  );

  const authValue = useMemo<AuthCtx>(
    () => ({ user, loading, currentGameId, refresh, logout }),
    [user, loading, currentGameId, refresh, logout],
  );
  const toastValue = useMemo<ToastCtx>(() => ({ push }), [push]);
  const socketValue = useMemo<SocketCtx>(() => ({ connected, presence: presenceMap }), [connected, presenceMap]);

  return (
    <AuthContext.Provider value={authValue}>
      <ToastContext.Provider value={toastValue}>
        <SocketContext.Provider value={socketValue}>
          {children}

          {/* Toast stack */}
          <div className="fixed bottom-4 inset-x-0 z-[70] flex flex-col items-center gap-2 px-4 pointer-events-none">
            {toasts.map((t) => (
              <div
                key={t.id}
                role="status"
                className={`pointer-events-auto animate-slide-up rounded-xl px-4 py-2.5 text-sm font-semibold shadow-lg backdrop-blur-md border max-w-sm text-center ${
                  t.kind === 'error'
                    ? 'bg-red-500/90 border-red-400/50 text-white'
                    : t.kind === 'success'
                      ? 'bg-emerald-500/90 border-emerald-400/50 text-white'
                      : 'bg-zinc-800/90 border-zinc-600/50 text-zinc-100'
                }`}
              >
                {t.message}
              </div>
            ))}
          </div>

          {/* Incoming invitations */}
          <div className="fixed top-4 inset-x-0 z-[80] flex flex-col items-center gap-2 px-4 pointer-events-none">
            {invites.map((inv) => (
              <div
                key={inv.id}
                className="pointer-events-auto animate-slide-up w-full max-w-sm rounded-2xl border border-amber-400/40 bg-zinc-900/95 p-4 shadow-2xl backdrop-blur-md"
              >
                <p className="text-sm text-zinc-200">
                  <span className="font-bold text-amber-300">{inv.fromUser.displayName}</span>{' '}
                  بيدعوك لمباراة سيجا ⚔️
                </p>
                <div className="mt-3 flex gap-2">
                  <button
                    onClick={() => void respondInvite(inv.id, true)}
                    className="flex-1 rounded-xl bg-amber-500 py-2 text-sm font-bold text-zinc-950 transition hover:bg-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-300"
                  >
                    قبول
                  </button>
                  <button
                    onClick={() => void respondInvite(inv.id, false)}
                    className="flex-1 rounded-xl bg-zinc-700 py-2 text-sm font-bold text-zinc-100 transition hover:bg-zinc-600 focus:outline-none focus:ring-2 focus:ring-zinc-400"
                  >
                    رفض
                  </button>
                </div>
              </div>
            ))}
          </div>
        </SocketContext.Provider>
      </ToastContext.Provider>
    </AuthContext.Provider>
  );
}

/** Re-export for game page convenience */
export type { GameStatePayload };
