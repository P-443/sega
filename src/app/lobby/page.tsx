'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Avatar } from '@/components/Avatar';
import { PresenceDot, PRESENCE_AR } from '@/components/PresenceDot';
import { useAuth, useSocket, useToast } from '@/components/providers';
import { Button, Card, Input, PageShell } from '@/components/ui';
import { emitAck, getSocket } from '@/lib/socket';
import type { PublicPlayer } from '@/shared/events';

interface SearchResult extends PublicPlayer {
  wins: number;
  gamesPlayed: number;
}

interface RecentGame {
  gameId: string;
  finishedAt: string;
  result: 'win' | 'loss' | 'draw';
  opponent: { userId: string; username: string; displayName: string; hasAvatar: boolean } | null;
}

const RESULT_AR = { win: 'كسبت ✅', loss: 'خسرت ❌', draw: 'تعادل 🤝' } as const;

export default function LobbyPage() {
  const router = useRouter();
  const { user, loading, currentGameId, logout } = useAuth();
  const { presence } = useSocket();
  const { push } = useToast();

  const [online, setOnline] = useState<PublicPlayer[]>([]);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [recent, setRecent] = useState<RecentGame[]>([]);
  const [roomCode, setRoomCode] = useState('');
  const [inviting, setInviting] = useState<string | null>(null);
  const [busyRoom, setBusyRoom] = useState(false);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Redirect when not logged in
  useEffect(() => {
    if (!loading && !user) router.replace('/login');
  }, [loading, user, router]);

  // Online list via socket (once + live presence updates)
  const refreshOnline = useCallback(async () => {
    const res = await emitAck<{ list: PublicPlayer[] }>('presence:list');
    if (res.ok && res.data) setOnline(res.data.list.filter((p) => p.userId !== user?.id));
  }, [user?.id]);

  useEffect(() => {
    if (!user) return;
    const socket = getSocket();
    if (socket.connected) void refreshOnline();
    const onConnect = () => void refreshOnline();
    const onPresence = () => void refreshOnline();
    socket.on('connect', onConnect);
    socket.on('presence:update', onPresence);
    return () => {
      socket.off('connect', onConnect);
      socket.off('presence:update', onPresence);
    };
  }, [user, refreshOnline]);

  // Recent games
  useEffect(() => {
    if (!user) return;
    fetch('/api/games/recent', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : { games: [] }))
      .then((d) => setRecent(d.games))
      .catch(() => {});
  }, [user]);

  // Debounced player search
  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    if (!query.trim()) {
      setResults([]);
      return;
    }
    searchTimer.current = setTimeout(() => {
      fetch(`/api/players/search?q=${encodeURIComponent(query.trim())}`, { cache: 'no-store' })
        .then((r) => (r.ok ? r.json() : { players: [] }))
        .then((d) => setResults(d.players))
        .catch(() => {});
    }, 250);
    return () => {
      if (searchTimer.current) clearTimeout(searchTimer.current);
    };
  }, [query]);

  async function createRoom() {
    if (busyRoom) return;
    setBusyRoom(true);
    const res = await emitAck<{ gameId: string; code: string }>('room:create');
    setBusyRoom(false);
    if (!res.ok || !res.data) {
      push('error', res.ok ? 'حصلت مشكلة' : res.error);
      return;
    }
    router.push(`/game/${res.data.gameId}`);
  }

  async function joinRoom() {
    const code = roomCode.trim().toUpperCase();
    if (!code || busyRoom) return;
    setBusyRoom(true);
    const res = await emitAck<{ gameId: string }>('room:join', { code });
    setBusyRoom(false);
    if (!res.ok || !res.data) {
      push('error', res.ok ? 'حصلت مشكلة' : res.error);
      return;
    }
    router.push(`/game/${res.data.gameId}`);
  }

  async function invite(username: string) {
    if (inviting) return;
    setInviting(username);
    const res = await emitAck('invite:send', { toUsername: username });
    setInviting(null);
    if (!res.ok) {
      push('error', res.error);
    } else {
      push('success', 'الدعوة اتبعتت — مستنيين رده ⚔️');
    }
  }

  if (loading || !user) {
    return (
      <PageShell>
        <div className="flex flex-1 items-center justify-center text-zinc-500">…</div>
      </PageShell>
    );
  }

  const shownPlayers = query.trim() ? results : online;

  return (
    <PageShell>
      {/* Header */}
      <header className="flex items-center justify-between gap-3">
        <Link href={`/profile/${user.username}`} className="flex min-w-0 items-center gap-3">
          <Avatar userId={user.id} displayName={user.displayName} hasAvatar={user.hasAvatar} />
          <div className="min-w-0">
            <p className="truncate font-bold leading-tight">{user.displayName}</p>
            <p className="flex items-center gap-1.5 text-xs text-zinc-400">
              <PresenceDot status={presence[user.id] ?? user.status} /> متصل
            </p>
          </div>
        </Link>
        <div className="flex items-center gap-1">
          <Link href="/settings" aria-label="الإعدادات">
            <Button variant="ghost" className="px-3" aria-label="الإعدادات">
              ⚙️
            </Button>
          </Link>
          <Button variant="ghost" className="px-3" onClick={() => void logout()} aria-label="خروج">
            خروج
          </Button>
        </div>
      </header>

      {/* Resume banner */}
      {currentGameId && (
        <button
          onClick={() => router.push(`/game/${currentGameId}`)}
          className="animate-slide-up rounded-2xl border border-amber-500/50 bg-amber-500/10 p-4 text-right transition hover:bg-amber-500/15"
        >
          <p className="font-bold text-amber-300">عندك مباراة شغالة! 🔥</p>
          <p className="text-sm text-amber-200/80">اضغط هنا للاستكمال</p>
        </button>
      )}

      {/* Play actions */}
      <Card>
        <h2 className="mb-3 text-lg font-extrabold text-zinc-100">العب دلوقتي 🎮</h2>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <Button onClick={() => void createRoom()} disabled={busyRoom}>
            إنشاء غرفة جديدة
          </Button>
          <div className="flex gap-2">
            <Input
              value={roomCode}
              onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
              placeholder="كود الغرفة"
              maxLength={8}
              className="text-center font-mono tracking-widest"
              aria-label="كود الغرفة"
              onKeyDown={(e) => e.key === 'Enter' && void joinRoom()}
            />
            <Button variant="secondary" onClick={() => void joinRoom()} disabled={busyRoom || !roomCode.trim()}>
              دخول
            </Button>
          </div>
        </div>
      </Card>

      {/* Players */}
      <Card>
        <h2 className="mb-3 text-lg font-extrabold text-zinc-100">
          {query.trim() ? 'نتائج البحث' : 'اللاعبون المتصلون'} 🟢
        </h2>
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="ابحث عن لاعب بالاسم…"
          aria-label="بحث عن لاعب"
          className="mb-3"
        />
        {shownPlayers.length === 0 ? (
          <p className="py-4 text-center text-sm text-zinc-500">
            {query.trim() ? 'مفيش نتائج' : 'مفيش حد متصل غيرك دلوقتي — ابعت كود غرفة لصاحبك!'}
          </p>
        ) : (
          <ul className="flex flex-col divide-y divide-zinc-800">
            {shownPlayers.map((p) => {
              const status = presence[p.userId] ?? p.status;
              return (
                <li key={p.userId} className="flex items-center gap-3 py-2.5">
                  <Link href={`/profile/${p.username}`} className="flex min-w-0 flex-1 items-center gap-3">
                    <Avatar userId={p.userId} displayName={p.displayName} hasAvatar={p.hasAvatar} size="sm" />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold">{p.displayName}</p>
                      <p className="flex items-center gap-1.5 text-xs text-zinc-400">
                        <PresenceDot status={status} />
                        {PRESENCE_AR[status]}
                      </p>
                    </div>
                  </Link>
                  <Button
                    variant="secondary"
                    className="min-h-9 px-3 py-1 text-xs"
                    disabled={status !== 'online' || inviting === p.username}
                    onClick={() => void invite(p.username)}
                  >
                    {status === 'in-game' ? 'في مباراة' : inviting === p.username ? '…' : 'دعوة ⚔️'}
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      {/* Stats + recent */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Card>
          <h2 className="mb-3 text-lg font-extrabold text-zinc-100">إحصائياتي 📊</h2>
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="rounded-xl bg-emerald-500/10 p-3">
              <p className="text-2xl font-extrabold text-emerald-400">{user.wins}</p>
              <p className="text-xs text-zinc-400">فوز</p>
            </div>
            <div className="rounded-xl bg-red-500/10 p-3">
              <p className="text-2xl font-extrabold text-red-400">{user.losses}</p>
              <p className="text-xs text-zinc-400">خسارة</p>
            </div>
            <div className="rounded-xl bg-zinc-500/10 p-3">
              <p className="text-2xl font-extrabold text-zinc-300">{user.draws}</p>
              <p className="text-xs text-zinc-400">تعادل</p>
            </div>
          </div>
        </Card>

        <Card>
          <h2 className="mb-3 text-lg font-extrabold text-zinc-100">آخر المباريات 🕘</h2>
          {recent.length === 0 ? (
            <p className="py-3 text-center text-sm text-zinc-500">لسه مالعبتش — يلا نبدأ!</p>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {recent.slice(0, 5).map((g) => (
                <li key={g.gameId} className="flex items-center justify-between gap-2 text-sm">
                  <span className="flex min-w-0 items-center gap-2">
                    {g.opponent && (
                      <Avatar
                        userId={g.opponent.userId}
                        displayName={g.opponent.displayName}
                        hasAvatar={g.opponent.hasAvatar}
                        size="sm"
                      />
                    )}
                    <span className="truncate text-zinc-300">{g.opponent?.displayName ?? '—'}</span>
                  </span>
                  <span className="shrink-0 text-xs font-bold">{RESULT_AR[g.result]}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </PageShell>
  );
}
