import { prisma } from '@/lib/db';

export async function GET(_req: Request, { params }: { params: Promise<{ userId: string }> }) {
  const { userId } = await params;
  if (!/^[a-z0-9]+$/i.test(userId) || userId.length > 40) {
    return new Response(null, { status: 404 });
  }
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { avatarData: true, avatarMime: true, updatedAt: true },
  });
  if (!user?.avatarData || !user.avatarMime) {
    return new Response(null, { status: 404 });
  }
  return new Response(new Uint8Array(user.avatarData), {
    headers: {
      'Content-Type': user.avatarMime,
      'Cache-Control': 'public, max-age=300',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
