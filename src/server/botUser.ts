/**
 * The AI opponent is a real User row so games, moves, stats and histories all
 * work through the exact same code paths as a human opponent. It never logs
 * in: passwordHash is an intentionally unusable placeholder.
 */

import type { User } from '@prisma/client';
import { prisma } from '@/lib/db';

export const BOT_USERNAME = 'sega_bot';
export const BOT_DISPLAY_NAME = 'التوبور 🤖';

let cachedId: string | null = null;

/** Lazily create (once) and return the bot user row. */
export async function ensureBotUser(): Promise<User> {
  const existing = await prisma.user.findUnique({ where: { username: BOT_USERNAME } });
  if (existing) {
    cachedId = existing.id;
    return existing;
  }
  const created = await prisma.user.create({
    data: {
      username: BOT_USERNAME,
      displayName: BOT_DISPLAY_NAME,
      passwordHash: '!', // unusable — there is no login path for the bot
      avatarIcon: null,
    },
  });
  cachedId = created.id;
  return created;
}

/** Return the bot's user id, creating the row if needed (module-level cache). */
export async function botUserId(): Promise<string> {
  if (cachedId) return cachedId;
  return (await ensureBotUser()).id;
}
