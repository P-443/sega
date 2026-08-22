import { NextResponse } from 'next/server';

export function jsonError(message: string, status = 400): NextResponse {
  return NextResponse.json({ error: message }, { status });
}

/**
 * CSRF defense-in-depth for cookie-authenticated mutations.
 * SameSite=Lax already blocks cross-site sends; this rejects any
 * remaining cross-origin request that carries an Origin header.
 */
export function assertSameOrigin(req: Request): boolean {
  const origin = req.headers.get('origin');
  if (!origin) return true;
  try {
    return new URL(origin).host === req.headers.get('host');
  } catch {
    return false;
  }
}

/** Zod safeParse → first Arabic issue message */
export function firstIssue(error: { issues: { message: string }[] }): string {
  return error.issues[0]?.message ?? 'بيانات غير صالحة';
}
