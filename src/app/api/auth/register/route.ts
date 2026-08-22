import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { hashPassword } from '@/lib/password';
import { createSession, SESSION_COOKIE, sessionCookieOptions } from '@/lib/auth';
import { registerSchema } from '@/lib/validation';
import { clientIp, rateLimit } from '@/lib/rateLimit';
import { assertSameOrigin, firstIssue, jsonError } from '@/lib/http';

export async function POST(req: Request) {
  if (!assertSameOrigin(req)) return jsonError('طلب مرفوض', 403);
  if (!rateLimit(`register:${clientIp(req)}`, 5, 10 * 60_000)) {
    return jsonError('محاولات كتير — جرب بعد شوية', 429);
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonError('بيانات غير صالحة');
  }
  const parsed = registerSchema.safeParse(body);
  if (!parsed.success) return jsonError(firstIssue(parsed.error));

  const username = parsed.data.username.toLowerCase();
  const existing = await prisma.user.findUnique({ where: { username } });
  if (existing) return jsonError('اسم المستخدم ده محجوز — جرب اسم تاني', 409);

  const user = await prisma.user.create({
    data: {
      username,
      displayName: parsed.data.displayName,
      passwordHash: await hashPassword(parsed.data.password),
    },
  });

  const { token, expiresAt } = await createSession(user.id);
  const res = NextResponse.json({
    ok: true,
    user: { id: user.id, username: user.username, displayName: user.displayName },
  });
  res.cookies.set(SESSION_COOKIE, token, sessionCookieOptions(expiresAt));
  return res;
}
