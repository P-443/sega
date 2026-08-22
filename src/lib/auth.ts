import crypto from 'crypto';
import { cookies } from 'next/headers';
import type { User } from '@prisma/client';
import { prisma } from './db';

export const SESSION_COOKIE = 'sega_session';
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const ROLLING_THRESHOLD_MS = 15 * 24 * 60 * 60 * 1000; // extend when <15d left

function hashToken(token: string): string {
  const secret = process.env.SESSION_SECRET ?? '';
  return crypto.createHmac('sha256', secret).update(token).digest('hex');
}

export async function createSession(userId: string): Promise<{ token: string; expiresAt: Date }> {
  const token = crypto.randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await prisma.session.create({
    data: { tokenHash: hashToken(token), userId, expiresAt },
  });
  return { token, expiresAt };
}

export async function validateSessionToken(token: string): Promise<User | null> {
  if (!token || token.length > 128) return null;
  const session = await prisma.session.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { user: true },
  });
  if (!session) return null;
  if (session.expiresAt.getTime() < Date.now()) {
    await prisma.session.delete({ where: { id: session.id } }).catch(() => {});
    return null;
  }
  // Rolling renewal
  const remaining = session.expiresAt.getTime() - Date.now();
  const updates: { lastUsedAt: Date; expiresAt?: Date } = { lastUsedAt: new Date() };
  if (remaining < ROLLING_THRESHOLD_MS) updates.expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  prisma.session.update({ where: { id: session.id }, data: updates }).catch(() => {});
  return session.user;
}

export async function destroySession(token: string): Promise<void> {
  await prisma.session.deleteMany({ where: { tokenHash: hashToken(token) } });
}

/** Read the session cookie value from a raw Cookie header (WebSocket handshake). */
export function tokenFromCookieHeader(cookieHeader: string | undefined): string | null {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(';')) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    if (part.slice(0, eq).trim() === SESSION_COOKIE) {
      return decodeURIComponent(part.slice(eq + 1).trim());
    }
  }
  return null;
}

/** Current user inside Next.js route handlers / server components. */
export async function getCurrentUser(): Promise<User | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return validateSessionToken(token);
}

export function sessionCookieOptions(expiresAt: Date) {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    expires: expiresAt,
  };
}
