import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { destroySession, SESSION_COOKIE } from '@/lib/auth';
import { assertSameOrigin, jsonError } from '@/lib/http';

export async function POST(req: Request) {
  if (!assertSameOrigin(req)) return jsonError('طلب مرفوض', 403);
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token) await destroySession(token);
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, '', { httpOnly: true, path: '/', maxAge: 0 });
  return res;
}
