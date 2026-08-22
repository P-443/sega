import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Avatar } from '@/components/Avatar';
import { PresenceDot, PRESENCE_AR } from '@/components/PresenceDot';
import { Card, PageShell } from '@/components/ui';
import { getCurrentUser } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { presence } from '@/server/presence';

export const dynamic = 'force-dynamic';

export default async function ProfilePage({ params }: { params: Promise<{ username: string }> }) {
  const { username } = await params;
  const user = await prisma.user.findFirst({
    where: { username: { equals: username, mode: 'insensitive' } },
  });
  if (!user) notFound();

  const me = await getCurrentUser();
  const isMe = me?.id === user.id;

  const recent = await prisma.game.findMany({
    where: { status: 'FINISHED', players: { some: { userId: user.id } } },
    orderBy: { finishedAt: 'desc' },
    take: 8,
    include: {
      players: {
        include: {
          user: { select: { id: true, username: true, displayName: true, avatarData: true, avatarIcon: true } },
        },
      },
    },
  });

  const status = presence.statusOf(user.id);
  const winRate = user.gamesPlayed > 0 ? Math.round((user.wins / user.gamesPlayed) * 100) : 0;

  return (
    <PageShell>
      <Link href="/lobby" className="text-sm font-bold text-amber-400 hover:text-amber-300">
        → رجوع للرئيسية
      </Link>

      <Card className="flex items-center gap-4 p-5">
        <Avatar
          userId={user.id}
          displayName={user.displayName}
          hasAvatar={user.avatarData !== null}
          avatarIcon={user.avatarIcon}
          username={user.username}
          size="xl"
        />
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-2xl font-extrabold text-zinc-50">{user.displayName}</h1>
          <p className="text-sm text-zinc-400">@{user.username}</p>
          <p className="mt-1 flex items-center gap-1.5 text-xs text-zinc-400">
            <PresenceDot status={status} />
            {PRESENCE_AR[status]}
            {status === 'offline' &&
              user.lastSeenAt &&
              ` — آخر ظهور ${new Date(user.lastSeenAt).toLocaleString('ar-EG', { dateStyle: 'short', timeStyle: 'short' })}`}
          </p>
        </div>
        {isMe && (
          <Link
            href="/settings"
            className="shrink-0 rounded-xl bg-zinc-800 px-3 py-2 text-xs font-bold text-zinc-200 transition hover:bg-zinc-700"
          >
            تعديل ⚙️
          </Link>
        )}
      </Card>

      <div className="grid grid-cols-4 gap-2 text-center">
        {[
          { n: user.wins, l: 'فوز', c: 'text-emerald-400 bg-emerald-500/10' },
          { n: user.losses, l: 'خسارة', c: 'text-red-400 bg-red-500/10' },
          { n: user.draws, l: 'تعادل', c: 'text-zinc-300 bg-zinc-500/10' },
          { n: `${winRate}%`, l: 'نسبة الفوز', c: 'text-amber-300 bg-amber-500/10' },
        ].map((s) => (
          <div key={s.l} className={`rounded-2xl p-3 ${s.c.split(' ')[1]}`}>
            <p className={`text-xl font-extrabold ${s.c.split(' ')[0]}`}>{s.n}</p>
            <p className="text-xs text-zinc-400">{s.l}</p>
          </div>
        ))}
      </div>

      <Card>
        <h2 className="mb-3 text-lg font-extrabold">آخر المباريات</h2>
        {recent.length === 0 ? (
          <p className="py-3 text-center text-sm text-zinc-500">لسه مفيش مباريات</p>
        ) : (
          <ul className="flex flex-col divide-y divide-zinc-800">
            {recent.map((g) => {
              const opp = g.players.find((p) => p.userId !== user.id)?.user;
              const result = g.winnerId === null ? 'draw' : g.winnerId === user.id ? 'win' : 'loss';
              return (
                <li key={g.id} className="flex items-center justify-between gap-2 py-2.5 text-sm">
                  <span className="flex min-w-0 items-center gap-2">
                    {opp && (
                      <Avatar
                        userId={opp.id}
                        displayName={opp.displayName}
                        hasAvatar={opp.avatarData !== null}
                        avatarIcon={opp.avatarIcon}
                        username={opp.username}
                        size="sm"
                      />
                    )}
                    <span className="truncate text-zinc-300">{opp?.displayName ?? '—'}</span>
                  </span>
                  <span className="shrink-0 text-xs font-bold">
                    {result === 'win' ? 'كسب ✅' : result === 'loss' ? 'خسر ❌' : 'تعادل 🤝'}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </PageShell>
  );
}
