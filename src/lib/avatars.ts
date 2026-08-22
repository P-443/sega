/**
 * Default avatar icons — Egyptian-themed emoji on a gradient disc.
 * Pure data (no JSX) so it can be imported from the server, validation
 * schemas and tests.
 *
 * Resolution order for a user's avatar:
 *   uploaded image (avatarData) → chosen icon (avatarIcon) → deterministic
 *   icon derived from the username hash (so every account always has one).
 */

export interface AvatarIconDef {
  id: string;
  /** Arabic label shown in the settings picker */
  label: string;
  /** Gradient stops of the disc */
  from: string;
  to: string;
  /** Emoji glyph drawn on the disc */
  glyph: string;
}

export const AVATAR_ICONS: AvatarIconDef[] = [
  { id: 'pharaoh', label: 'تاج', from: '#f59e0b', to: '#b45309', glyph: '👑' },
  { id: 'pyramid', label: 'صحراء', from: '#f97316', to: '#9a3412', glyph: '🏜️' },
  { id: 'cat', label: 'قطة', from: '#8b5cf6', to: '#5b21b6', glyph: '🐈' },
  { id: 'ankh', label: 'عين', from: '#10b981', to: '#065f46', glyph: '👁️' },
  { id: 'scarab', label: 'عقرب', from: '#06b6d4', to: '#155e75', glyph: '🦂' },
  { id: 'eye', label: 'شمس', from: '#3b82f6', to: '#1e3a8a', glyph: '🌞' },
  { id: 'obelisk', label: 'ثعبان', from: '#ef4444', to: '#7f1d1d', glyph: '🐍' },
  { id: 'lotus', label: 'زهرة', from: '#ec4899', to: '#9d174d', glyph: '🌺' },
];

export const AVATAR_ICON_IDS: readonly string[] = AVATAR_ICONS.map((i) => i.id);

const byId = new Map(AVATAR_ICONS.map((i) => [i.id, i]));

/** djb2 — stable across processes, so a username always maps to the same icon. */
function hashSeed(seed: string): number {
  let h = 5381;
  for (let i = 0; i < seed.length; i++) {
    h = ((h << 5) + h + seed.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

/** Deterministic icon for users who never picked one. */
export function defaultAvatarIcon(seed: string): AvatarIconDef {
  return AVATAR_ICONS[hashSeed(seed || '?') % AVATAR_ICONS.length];
}

/** Chosen icon if valid, else the deterministic default for the seed. */
export function resolveAvatarIcon(iconId: string | null | undefined, seed: string): AvatarIconDef {
  if (iconId) {
    const found = byId.get(iconId);
    if (found) return found;
  }
  return defaultAvatarIcon(seed);
}
