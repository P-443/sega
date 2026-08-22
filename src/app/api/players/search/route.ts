import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { presence } from '@/server/presence';
import { jsonError } from '@/lib/http';

export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) return jsonError('سجل دخولك الأول', 401);

  const q = new URL(req.url).searchParams.get('q')?.trim() ?? '';
  if (q.length < 1 || q.length > 40) return NextResponse.json({ players: [] });

  const users = await prisma.user.findMany({
    where: {
      id: { not: user.id },
      OR: [
        { username: { contains: q, mode: 'insensitive' } },
        { displayName: { contains: q, mode: 'insensitive' } },
      ],
    },
    select: {
      id: true,
      username: true,
      displayName: true,
      avatarData: true,
      wins: true,
      gamesPlayed: true,
    },
    take: 10,
    orderBy: { username: 'asc' },
  });

  return NextResponse.json({
    players: users.map((u) => ({
      userId: u.id,
      username: u.username,
      displayName: u.displayName,
      hasAvatar: u.avatarData !== null,
      wins: u.wins,
      gamesPlayed: u.gamesPlayed,
      status: presence.statusOf(u.id),
    })),
  });
}
