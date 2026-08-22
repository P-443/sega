/**
 * Simple fixed-window in-memory rate limiter.
 * Single-process app (one container) — no external store needed.
 */

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();

// Periodic cleanup so the map never grows unbounded
let cleanupTimer: NodeJS.Timeout | null = null;
function ensureCleanup() {
  if (cleanupTimer) return;
  cleanupTimer = setInterval(() => {
    const now = Date.now();
    for (const [key, b] of buckets) {
      if (b.resetAt < now) buckets.delete(key);
    }
  }, 60_000);
  cleanupTimer.unref?.();
}

export function rateLimit(key: string, limit: number, windowMs: number): boolean {
  ensureCleanup();
  const now = Date.now();
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt < now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (bucket.count >= limit) return false;
  bucket.count += 1;
  return true;
}

export function clientIp(req: Request): string {
  const fwd = req.headers.get('x-forwarded-for');
  if (fwd) return fwd.split(',')[0].trim();
  return req.headers.get('x-real-ip') ?? 'unknown';
}
