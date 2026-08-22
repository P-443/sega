import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { jsonError } from '@/lib/http';

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return jsonError('سجل دخولك الأول', 401);

  const games = await prisma.game.findMany({
    where: { status: 'FINISHED', players: { some: { userId: user.id } } },
    orderBy: { finishedAt: 'desc' },
    take: 10,
    include: {
      players: {
        include: {
          user: { select: { id: true, username: true, displayName: true, avatarData: true, avatarIcon: true } },
        },
      },
    },
  });

  return NextResponse.json({
    games: games.map((g) => {
      const me = g.players.find((p) => p.userId === user.id);
      const opponent = g.players.find((p) => p.userId !== user.id);
      const result =
        g.winnerId === null ? 'draw' : g.winnerId === user.id ? 'win' : 'loss';
      return {
        gameId: g.id,
        finishedAt: g.finishedAt,
        result,
        mySide: me?.side ?? null,
        opponent: opponent
          ? {
              userId: opponent.user.id,
              username: opponent.user.username,
              displayName: opponent.user.displayName,
              hasAvatar: opponent.user.avatarData !== null,
              avatarIcon: opponent.user.avatarIcon,
            }
          : null,
      };
    }),
  });
}
