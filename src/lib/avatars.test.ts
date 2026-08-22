import { describe, expect, it } from 'vitest';
import { AVATAR_ICON_IDS, AVATAR_ICONS, defaultAvatarIcon, resolveAvatarIcon } from './avatars';

describe('default avatar icons', () => {
  it('every icon has a unique id, label, gradient and at least one path', () => {
    const ids = new Set<string>();
    for (const icon of AVATAR_ICONS) {
      expect(icon.id).toMatch(/^[a-z]+$/);
      expect(ids.has(icon.id)).toBe(false);
      ids.add(icon.id);
      expect(icon.label.length).toBeGreaterThan(1);
      expect(icon.from).toMatch(/^#[0-9a-f]{6}$/i);
      expect(icon.to).toMatch(/^#[0-9a-f]{6}$/i);
      expect(icon.paths.length).toBeGreaterThan(0);
    }
  });

  it('is deterministic for the same username (stable across calls)', () => {
    expect(defaultAvatarIcon('ahmed').id).toBe(defaultAvatarIcon('ahmed').id);
    expect(defaultAvatarIcon('سارة').id).toBe(defaultAvatarIcon('سارة').id);
  });

  it('always returns a registered icon, even for empty seeds', () => {
    for (const seed of ['', '?', 'x', 'player-123', 'محمد']) {
      expect(AVATAR_ICON_IDS).toContain(defaultAvatarIcon(seed).id);
    }
  });

  it('spreads different users across different icons', () => {
    const picks = new Set(
      ['ali', 'mona', 'karim', 'salma', 'omar', 'nour', 'heba', 'tarek'].map((u) => defaultAvatarIcon(u).id),
    );
    expect(picks.size).toBeGreaterThan(1);
  });

  it('resolveAvatarIcon honors a valid choice and rejects bogus ones', () => {
    expect(resolveAvatarIcon('ankh', 'whatever').id).toBe('ankh');
    expect(resolveAvatarIcon('not-an-icon', 'ahmed').id).toBe(defaultAvatarIcon('ahmed').id);
    expect(resolveAvatarIcon(null, 'ahmed').id).toBe(defaultAvatarIcon('ahmed').id);
  });
});
