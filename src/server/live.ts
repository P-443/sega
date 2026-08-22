/**
 * Bridge between HTTP profile-mutation routes and the live Socket.IO server.
 *
 * The custom server (dist/server.cjs, bundled by esbuild) and the Next.js API
 * routes (bundled separately by `next build`) hold DIFFERENT module instances,
 * so importing a singleton here would not share state between them. Instead
 * the socket server registers its update callback on `globalThis` at startup,
 * and API routes call `pushProfileMeta`, which dispatches across that boundary.
 */

export interface ProfileMeta {
  username: string;
  displayName: string;
  hasAvatar: boolean;
  avatarIcon: string | null;
}

type PushProfileMeta = (userId: string, meta: ProfileMeta) => void;

const g = globalThis as unknown as { __segaPushProfileMeta?: PushProfileMeta };

/** Called once by the socket server at startup. */
export function registerLiveBridge(push: PushProfileMeta): void {
  g.__segaPushProfileMeta = push;
}

/** Called by profile/avatar API routes after a successful DB update. */
export function pushProfileMeta(userId: string, meta: ProfileMeta): void {
  g.__segaPushProfileMeta?.(userId, meta);
}
