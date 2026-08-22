import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { presence } from '@/server/presence';

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ user: null }, { status: 401 });

  // A game the user should be dropped back into after reload
  const busy = await prisma.gamePlayer.findFirst({
    where: { userId: user.id, game: { status: { in: ['WAITING', 'ACTIVE'] } } },
    select: { gameId: true },
    orderBy: { game: { createdAt: 'desc' } },
  });

  return NextResponse.json({
    user: {
      id: user.id,
      username: user.username,
      displayName: user.displayName,
      hasAvatar: user.avatarData !== null,
      avatarIcon: user.avatarIcon,
      wins: user.wins,
      losses: user.losses,
      draws: user.draws,
      gamesPlayed: user.gamesPlayed,
      status: presence.statusOf(user.id),
    },
    currentGameId: busy?.gameId ?? null,
  });
}
