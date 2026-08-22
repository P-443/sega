/**
 * Default avatar icons — Egyptian-themed set rendered as white SVG glyphs on
 * a gradient disc. Pure data (no JSX) so it can be imported from the server,
 * validation schemas and tests.
 *
 * Resolution order for a user's avatar:
 *   uploaded image (avatarData) → chosen icon (avatarIcon) → deterministic
 *   icon derived from the username hash (so every account always has one).
 */

export interface AvatarIconPath {
  d: string;
  opacity?: number;
}

export interface AvatarIconDef {
  id: string;
  /** Arabic label shown in the settings picker */
  label: string;
  /** Gradient stops of the disc */
  from: string;
  to: string;
  paths: AvatarIconPath[];
}

export const AVATAR_ICONS: AvatarIconDef[] = [
  {
    id: 'pharaoh',
    label: 'فرعون',
    from: '#f59e0b',
    to: '#b45309',
    paths: [
      // nemes headdress silhouette
      { d: 'M12 2c-4 0-6.5 2.6-6.5 6L4 20h3l.8-5.6C8.3 17.3 9.9 19 12 19s3.7-1.7 4.2-4.6L17 20h3l-1.5-12c0-3.4-2.5-6-6.5-6Z' },
      // face
      { d: 'M12 6c-1.8 0-3 1.3-3 3.2 0 2.4 1.3 4.3 3 4.3s3-1.9 3-4.3C15 7.3 13.8 6 12 6Z', opacity: 0.35 },
    ],
  },
  {
    id: 'pyramid',
    label: 'هرم',
    from: '#f97316',
    to: '#9a3412',
    paths: [
      { d: 'M12 4 21 19H3L12 4Z' },
      { d: 'M12 4 21 19H12V4Z', opacity: 0.35 },
    ],
  },
  {
    id: 'cat',
    label: 'باستت',
    from: '#8b5cf6',
    to: '#5b21b6',
    paths: [
      // ears
      { d: 'M6.5 2 9 5.2C8 5.7 7.2 6.5 6.7 7.5L4 6.5C4.5 4.5 5.3 3 6.5 2Z' },
      { d: 'M17.5 2 15 5.2c1 .5 1.8 1.3 2.3 2.5L20 6.5C19.5 4.5 18.7 3 17.5 2Z' },
      // head
      { d: 'M12 5c-3 0-5.5 2.2-5.5 5.5 0 2 .9 3.7 2.3 4.7L7 21l3.4-1.4c.5.1 1 .2 1.6.2s1.1-.1 1.6-.2L17 21l-1.8-5.8c1.4-1 2.3-2.7 2.3-4.7C17.5 7.2 15 5 12 5Z' },
    ],
  },
  {
    id: 'ankh',
    label: 'مفتاح الحياة',
    from: '#10b981',
    to: '#065f46',
    paths: [
      {
        d: 'M12 2a3.5 3.5 0 0 0-3.5 3.5c0 1.6.9 2.8 2 3.6L9 12H6v2.5h3V22h2.5v-7.5H15V12h-3l-1.5-2.9c1.1-.8 2-2 2-3.6A3.5 3.5 0 0 0 12 2Zm0 2.5a1 1 0 0 1 1 1c0 .9-.6 1.7-1 2.1-.4-.4-1-1.2-1-2.1a1 1 0 0 1 1-1Z',
      },
    ],
  },
  {
    id: 'scarab',
    label: 'جعران',
    from: '#06b6d4',
    to: '#155e75',
    paths: [
      // wings
      { d: 'M4 9c2-1.5 4-2 5.5-1.5-.8 1.5-1.2 3.2-1 5C6.5 12.6 4.8 11.3 4 9Z' },
      { d: 'M20 9c-2-1.5-4-2-5.5-1.5.8 1.5 1.2 3.2 1 5 2-.1 3.7-1.2 4.5-3.5Z' },
      // body
      { d: 'M12 6c2.8 0 4.5 2.2 4.5 5.5S14.8 17 12 17s-4.5-2.2-4.5-5.5S9.2 6 12 6Z' },
      // head
      { d: 'M12 3a2 2 0 0 1 2 2c0 .8-.4 1.4-1 1.8V6h-2v.8c-.6-.4-1-1-1-1.8a2 2 0 0 1 2-2Z' },
      // legs
      { d: 'M8.6 15.8 7 19.5l1.6.8 1.4-3.2c-.7-.3-1.1-.8-1.4-1.3Z' },
      { d: 'm15.4 15.8 1.6 3.7-1.6.8-1.4-3.2c.7-.3 1.1-.8 1.4-1.3Z' },
    ],
  },
  {
    id: 'eye',
    label: 'عين حورس',
    from: '#3b82f6',
    to: '#1e3a8a',
    paths: [
      // almond eye
      { d: 'M2 12c2.5-4 6-6 10-6s7.5 2 10 6c-2.5 4-6 6-10 6s-7.5-2-10-6Z' },
      // pupil
      { d: 'M12 9a3 3 0 1 0 .001 0Z', opacity: 0.4 },
      // tear + brow curl
      { d: 'M17.2 14.2c1.6-.6 3-1.6 4.1-2.8l.9 1.1c-1.3 1.4-3 2.6-4.8 3.2l-.2-1.5Z', opacity: 0.85 },
    ],
  },
  {
    id: 'obelisk',
    label: 'مسلة',
    from: '#ef4444',
    to: '#7f1d1d',
    paths: [
      { d: 'M11 2h2l1.2 3L13 20h-2l-1.2-15L11 2Z' },
      { d: 'M9 20h6v2H9v-2Z' },
      { d: 'm12 2 .6 1.5h-1.2L12 2Z', opacity: 0.5 },
    ],
  },
  {
    id: 'lotus',
    label: 'لوتس',
    from: '#ec4899',
    to: '#9d174d',
    paths: [
      // center petal
      { d: 'M12 4c1.5 2 2 4 1.5 6.5-.5 1.5-1.5 2.5-1.5 2.5s-1-1-1.5-2.5C10 8 10.5 6 12 4Z' },
      // side petals
      { d: 'M6 6c2.5.5 4 2 4.8 4.3.3 1.5 0 2.7 0 2.7s-1.5-.3-2.6-1.3C6.7 10.5 6.1 8.4 6 6Z' },
      { d: 'M18 6c-2.5.5-4 2-4.8 4.3-.3 1.5 0 2.7 0 2.7s1.5-.3 2.6-1.3c1.5-1.2 2.1-3.3 2.2-5.7Z' },
      // stem
      { d: 'M11 13h2l-.4 7h-1.2L11 13Z' },
    ],
  },
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
