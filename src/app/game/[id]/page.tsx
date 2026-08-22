'use client';

import { useParams, useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Avatar } from '@/components/Avatar';
import { Board } from '@/components/Board';
import { useAuth, useToast } from '@/components/providers';
import { Button, Card, PageShell } from '@/components/ui';
import { emitAck, getSocket } from '@/lib/socket';
import { isMuted, setMuted, sounds } from '@/lib/sound';
import { cn } from '@/lib/utils';
import type { GameStatePayload } from '@/shared/events';

function resultText(p: GameStatePayload, myUserId: string): { title: string; sub: string } {
  const info = p.endInfo;
  if (!info) return { title: '', sub: '' };
  if (info.winnerUserId === null) {
    return {
      title: 'تعادل 🤝',
      sub: info.reason === 'max_plies' ? 'وصلتوا لحد الحركات الأقصى' : 'اتفقتوا على التعادل',
    };
  }
  const iWon = info.winnerUserId === myUserId;
  if (iWon) {
    if (info.reason === 'opponent_left') return { title: 'كسبت 🎉', sub: 'الخصم انسحب من المباراة' };
    if (info.reason === 'opponent_disconnected') return { title: 'كسبت 🎉', sub: 'الخصم فصل ومرجعش في الوقت' };
    if (info.reason === 'no_moves') return { title: 'مبروك! أنت كسبت 🎉', sub: 'حاصرت الخصم — ماعندوش حركة' };
    return { title: 'مبروك! أنت كسبت 🎉', sub: 'عملت خط كامل — سيجا! ⚡' };
  }
  if (info.reason === 'no_moves') return { title: 'المباراة انتهت', sub: 'اتحاصرت — ماعندكش حركة' };
  return { title: 'المباراة انتهت', sub: 'الخصم عمل خط كامل' };
}

export default function GamePage() {
  const params = useParams<{ id: string }>();
  const gameId = params.id;
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const { push } = useToast();

  const [payload, setPayload] = useState<GameStatePayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [muted, setMutedState] = useState(false);
  const syncedOnce = useRef(false);
  const prevSoundRef = useRef<{ myTurn: boolean; finished: boolean } | null>(null);

  // Sync on mount + on every (re)connect — the reconnection contract
  useEffect(() => {
    const socket = getSocket();
    let cancelled = false;

    async function sync() {
      const res = await emitAck<GameStatePayload>('game:sync', { gameId });
      if (cancelled) return;
      if (!res.ok || !res.data) {
        setError(res.ok ? 'المباراة غير موجودة' : res.error);
        return;
      }
      setError(null);
      setPayload(res.data);
      syncedOnce.current = true;
    }

    if (socket.connected) void sync();
    const onConnect = () => void sync();
    const onState = (p: GameStatePayload) => {
      if (p.gameId !== gameId) return;
      setPayload(p);
      setSelected(null);
    };
    socket.on('connect', onConnect);
    socket.on('game:state', onState);
    return () => {
      cancelled = true;
      socket.off('connect', onConnect);
      socket.off('game:state', onState);
    };
  }, [gameId]);

  useEffect(() => {
    if (!authLoading && !user) router.replace('/login');
  }, [authLoading, user, router]);

  const mySide = payload?.yourSide ?? null;
  const myTurn = payload?.status === 'active' && payload.state?.turn === mySide;

  // tactile sound feedback on turn change / game end
  useEffect(() => {
    if (!payload || !user) return;
    const finishedNow = payload.status === 'finished' || payload.status === 'abandoned';
    const prev = prevSoundRef.current;
    prevSoundRef.current = { myTurn: !!myTurn, finished: finishedNow };
    if (!prev) return; // first sync — don't blast sounds on page load
    if (finishedNow && !prev.finished && payload.endInfo) {
      if (payload.endInfo.winnerUserId === user.id) sounds.win();
      else if (payload.endInfo.winnerUserId !== null) sounds.lose();
    } else if (myTurn && !prev.myTurn && !finishedNow) {
      sounds.turn();
    }
  }, [payload, myTurn, user]);

  useEffect(() => {
    setMutedState(isMuted());
  }, []);

  function toggleMute() {
    const next = !muted;
    setMuted(next);
    setMutedState(next);
  }

  const opponent = useMemo(() => {
    if (!payload || !mySide) return null;
    return payload.players[mySide === 'A' ? 'B' : 'A'];
  }, [payload, mySide]);
  const me = useMemo(() => {
    if (!payload || !mySide) return null;
    return payload.players[mySide];
  }, [payload, mySide]);

  const onSelectStone = useCallback((stoneId: string) => {
    setSelected((cur) => (cur === stoneId ? null : stoneId));
  }, []);

  const onTarget = useCallback(
    (pos: number) => {
      if (!selected) return;
      const stoneId = selected;
      setSelected(null);
      void emitAck('game:move', { gameId, stoneId, target: pos }).then((res) => {
        if (!res.ok) push('error', res.error);
      });
    },
    [selected, gameId, push],
  );

  async function copyCode() {
    if (!payload?.roomCode) return;
    try {
      await navigator.clipboard.writeText(payload.roomCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      push('info', `الكود: ${payload.roomCode}`);
    }
  }

  async function leave() {
    if (payload?.status === 'waiting') {
      await emitAck('room:leave', { gameId });
    } else {
      await emitAck('game:leave', { gameId });
    }
    router.push('/lobby');
  }

  async function offerDraw() {
    const res = await emitAck('game:draw-offer', { gameId });
    if (!res.ok) push('error', res.error);
    else push('info', 'عرضت التعادل — مستنيين رد الخصم');
  }

  async function respondDraw(accept: boolean) {
    await emitAck('game:draw-respond', { gameId, accept });
  }

  async function askRematch() {
    const res = await emitAck('game:rematch', { gameId });
    if (!res.ok) push('error', res.error);
  }

  async function respondRematch(accept: boolean) {
    const res = await emitAck<{ gameId?: string }>('game:rematch-respond', { gameId, accept });
    if (!res.ok) {
      push('error', res.error);
      return;
    }
    if (accept && res.data?.gameId) router.push(`/game/${res.data.gameId}`);
  }

  // ── render ──

  if (error) {
    return (
      <PageShell>
        <Card className="mt-20 text-center">
          <p className="mb-4 text-lg font-bold text-zinc-200">{error}</p>
          <Button onClick={() => router.push('/lobby')}>العودة للرئيسية</Button>
        </Card>
      </PageShell>
    );
  }

  if (!payload || !user) {
    return (
      <PageShell>
        <div className="flex flex-1 items-center justify-center text-zinc-500">…</div>
      </PageShell>
    );
  }

  // ── waiting room ──
  if (payload.status === 'waiting') {
    return (
      <PageShell>
        <Card className="mt-10 flex flex-col items-center gap-4 p-6 text-center">
          <h1 className="text-xl font-extrabold text-zinc-100">الغرفة جاهزة 🎯</h1>
          <p className="text-sm text-zinc-400">ابعت الكود ده لصاحبك، وأول ما يدخل هتبدأ المباراة فورًا</p>
          <button
            onClick={() => void copyCode()}
            className="rounded-2xl border-2 border-dashed border-amber-500/60 bg-amber-500/10 px-8 py-4 font-mono text-4xl font-extrabold tracking-[0.3em] text-amber-300 transition hover:bg-amber-500/20"
            aria-label="نسخ الكود"
          >
            {payload.roomCode}
          </button>
          <Button variant="secondary" onClick={() => void copyCode()}>
            {copied ? 'اتنسخ ✅' : 'نسخ الكود'}
          </Button>
          <p className="animate-pulse-soft text-sm text-zinc-500">مستنيين الخصم…</p>
          <Button variant="ghost" onClick={() => void leave()}>
            إلغاء الغرفة
          </Button>
        </Card>
      </PageShell>
    );
  }

  const state = payload.state;
  const finished = payload.status === 'finished' || payload.status === 'abandoned';
  const result = finished ? resultText(payload, user.id) : null;
  const iOfferedRematch = payload.rematchOfferFrom === mySide;
  const opponentOfferedRematch = payload.rematchOfferFrom !== null && payload.rematchOfferFrom !== mySide;
  const opponentOfferedDraw = payload.drawOfferFrom !== null && payload.drawOfferFrom !== mySide;

  return (
    <PageShell>
      {/* opponent card */}
      <Card className="flex items-center justify-between gap-3 py-3">
        <div className="flex min-w-0 items-center gap-3">
          {opponent && (
            <>
              <Avatar
                userId={opponent.userId}
                displayName={opponent.displayName}
                hasAvatar={opponent.hasAvatar}
                avatarIcon={opponent.avatarIcon}
                username={opponent.username}
              />
              <div className="min-w-0">
                <p className="truncate font-bold">{opponent.displayName}</p>
                <p className={cn('text-xs', opponent.connected ? 'text-emerald-400' : 'text-red-400')}>
                  {opponent.connected ? 'متصل' : 'فصل — مستنيينه يرجع…'}
                </p>
              </div>
            </>
          )}
        </div>
        {!myTurn && !finished && (
          <span className="shrink-0 rounded-full bg-sky-500/15 px-3 py-1 text-xs font-bold text-sky-300">
            دوره
          </span>
        )}
        <button
          type="button"
          onClick={toggleMute}
          aria-label={muted ? 'تشغيل الصوت' : 'كتم الصوت'}
          title={muted ? 'تشغيل الصوت' : 'كتم الصوت'}
          className="shrink-0 rounded-full px-2 py-1 text-base transition hover:bg-zinc-800 active:scale-90"
        >
          {muted ? '🔇' : '🔊'}
        </button>
      </Card>

      {/* turn status */}
      {!finished && (
        <p
          className={cn(
            'text-center text-lg font-extrabold transition-colors',
            myTurn ? 'text-amber-300' : 'text-zinc-400',
          )}
          role="status"
        >
          {myTurn ? 'دورك — حرك حجر' : `دور ${opponent?.displayName ?? 'الخصم'}`}
        </p>
      )}

      {/* board */}
      {state && (
        <Board
          state={state}
          mySide={mySide}
          selectedStoneId={selected}
          onSelectStone={onSelectStone}
          onTarget={onTarget}
          lastMoveTo={payload.lastMove?.to ?? null}
          disabled={finished}
        />
      )}

      {/* draw offer from opponent */}
      {opponentOfferedDraw && !finished && (
        <Card className="flex items-center justify-between gap-3 border-amber-500/40 py-3">
          <p className="text-sm font-bold text-amber-200">الخصم عارض التعادل 🤝</p>
          <div className="flex gap-2">
            <Button className="min-h-9 px-3 py-1 text-xs" onClick={() => void respondDraw(true)}>
              قبول
            </Button>
            <Button variant="secondary" className="min-h-9 px-3 py-1 text-xs" onClick={() => void respondDraw(false)}>
              رفض
            </Button>
          </div>
        </Card>
      )}

      {/* my card + actions */}
      <Card className="flex items-center justify-between gap-3 py-3">
        <div className="flex min-w-0 items-center gap-3">
          {me && (
            <Avatar
              userId={me.userId}
              displayName={me.displayName}
              hasAvatar={me.hasAvatar}
              avatarIcon={me.avatarIcon}
              username={me.username}
            />
          )}
          <div className="min-w-0">
            <p className="truncate font-bold">{me?.displayName ?? 'أنت'}</p>
            <p className="text-xs text-zinc-400">أنت</p>
          </div>
        </div>
        {myTurn && !finished && (
          <span className="shrink-0 animate-pulse-soft rounded-full bg-amber-500/15 px-3 py-1 text-xs font-bold text-amber-300">
            دورك
          </span>
        )}
        {!finished && (
          <div className="flex shrink-0 gap-2">
            <Button variant="secondary" className="min-h-9 px-3 py-1 text-xs" onClick={() => void offerDraw()}>
              تعادل
            </Button>
            <Button variant="danger" className="min-h-9 px-3 py-1 text-xs" onClick={() => void leave()}>
              انسحاب
            </Button>
          </div>
        )}
      </Card>

      {/* finished overlay */}
      {finished && result && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/80 p-4 backdrop-blur-sm animate-fade-in">
          <Card className="w-full max-w-sm animate-slide-up p-6 text-center">
            <p className="text-2xl font-extrabold text-zinc-50">{result.title}</p>
            <p className="mt-1 text-sm text-zinc-400">{result.sub}</p>

            <div className="mt-5 flex flex-col gap-2">
              {opponentOfferedRematch ? (
                <>
                  <p className="text-sm font-bold text-amber-300">الخصم عايز إعادة 🔁</p>
                  <div className="flex gap-2">
                    <Button className="flex-1" onClick={() => void respondRematch(true)}>
                      موافق — يلا!
                    </Button>
                    <Button variant="secondary" className="flex-1" onClick={() => void respondRematch(false)}>
                      لأ
                    </Button>
                  </div>
                </>
              ) : iOfferedRematch ? (
                <p className="animate-pulse-soft text-sm text-zinc-400">طلبت الإعادة — مستنيين الخصم…</p>
              ) : (
                <Button onClick={() => void askRematch()}>إعادة المباراة 🔁</Button>
              )}
              <Button variant="secondary" onClick={() => router.push('/lobby')}>
                العودة للرئيسية
              </Button>
            </div>
          </Card>
        </div>
      )}
    </PageShell>
  );
}
