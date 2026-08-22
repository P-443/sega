import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { updateProfileSchema } from '@/lib/validation';
import { assertSameOrigin, firstIssue, jsonError } from '@/lib/http';

export async function PATCH(req: Request) {
  if (!assertSameOrigin(req)) return jsonError('طلب مرفوض', 403);
  const user = await getCurrentUser();
  if (!user) return jsonError('سجل دخولك الأول', 401);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonError('بيانات غير صالحة');
  }
  const parsed = updateProfileSchema.safeParse(body);
  if (!parsed.success) return jsonError(firstIssue(parsed.error));

  const updated = await prisma.user.update({
    where: { id: user.id },
    data: {
      displayName: parsed.data.displayName ?? user.displayName,
      // null clears the choice → back to the deterministic default icon
      ...(parsed.data.avatarIcon !== undefined ? { avatarIcon: parsed.data.avatarIcon } : {}),
    },
  });
  return NextResponse.json({ ok: true, displayName: updated.displayName, avatarIcon: updated.avatarIcon });
}
