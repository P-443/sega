import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { AVATAR_MAX_BYTES, AVATAR_MIME_TYPES } from '@/lib/validation';
import { clientIp, rateLimit } from '@/lib/rateLimit';
import { assertSameOrigin, jsonError } from '@/lib/http';
import { pushProfileMeta } from '@/server/live';

/**
 * Avatar upload — stored in the database (BYTEA) so no volume is needed
 * on Coolify. Type + size are strictly validated; avatars are served
 * through /api/avatar/[userId] with cache headers.
 */
export async function POST(req: Request) {
  if (!assertSameOrigin(req)) return jsonError('طلب مرفوض', 403);
  if (!rateLimit(`avatar:${clientIp(req)}`, 10, 10 * 60_000)) {
    return jsonError('محاولات كتير — جرب بعد شوية', 429);
  }
  const user = await getCurrentUser();
  if (!user) return jsonError('سجل دخولك الأول', 401);

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return jsonError('بيانات غير صالحة');
  }
  const file = form.get('avatar');
  if (!(file instanceof File)) return jsonError('اختار صورة');
  if (!(AVATAR_MIME_TYPES as readonly string[]).includes(file.type)) {
    return jsonError('الصورة لازم تكون PNG أو JPG أو WebP');
  }
  if (file.size > AVATAR_MAX_BYTES) return jsonError('الصورة أكبر من 512KB');

  const buffer = Buffer.from(await file.arrayBuffer());
  const updated = await prisma.user.update({
    where: { id: user.id },
    data: { avatarMime: file.type, avatarData: buffer },
  });
  pushProfileMeta(updated.id, {
    username: updated.username,
    displayName: updated.displayName,
    hasAvatar: updated.avatarData !== null,
    avatarIcon: updated.avatarIcon,
  });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  if (!assertSameOrigin(req)) return jsonError('طلب مرفوض', 403);
  const user = await getCurrentUser();
  if (!user) return jsonError('سجل دخولك الأول', 401);
  const updated = await prisma.user.update({
    where: { id: user.id },
    data: { avatarMime: null, avatarData: null },
  });
  pushProfileMeta(updated.id, {
    username: updated.username,
    displayName: updated.displayName,
    hasAvatar: false,
    avatarIcon: updated.avatarIcon,
  });
  return NextResponse.json({ ok: true });
}
