import { resolveAvatarIcon } from '@/lib/avatars';
import { cn } from '@/lib/utils';

interface AvatarProps {
  userId: string;
  displayName: string;
  hasAvatar: boolean;
  /** Chosen default icon; falls back to a deterministic one from the username */
  avatarIcon?: string | null;
  /** Seed for the deterministic default icon (best: the username) */
  username?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
}

const sizes = {
  sm: 'h-8 w-8 text-sm',
  md: 'h-10 w-10 text-base',
  lg: 'h-14 w-14 text-xl',
  xl: 'h-24 w-24 text-3xl',
};

/**
 * Avatar: uploaded photo → chosen Egyptian icon → deterministic icon from the
 * username hash. Every account always shows a real picture — never a letter.
 */
export function Avatar({
  userId,
  displayName,
  hasAvatar,
  avatarIcon,
  username,
  size = 'md',
  className,
}: AvatarProps) {
  const cls = cn(
    'relative inline-flex shrink-0 select-none items-center justify-center overflow-hidden rounded-full font-bold text-zinc-950 ring-2 ring-zinc-700',
    sizes[size],
    className,
  );
  if (hasAvatar) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={`/api/avatar/${userId}`}
        alt={displayName}
        className={cn(cls, 'object-cover')}
        loading="lazy"
        draggable={false}
      />
    );
  }
  const icon = resolveAvatarIcon(avatarIcon, username || displayName);
  return (
    <span
      className={cls}
      role="img"
      aria-label={`${displayName} — ${icon.label}`}
      title={icon.label}
      style={{ backgroundImage: `linear-gradient(135deg, ${icon.from}, ${icon.to})` }}
    >
      <svg viewBox="0 0 24 24" className="h-[62%] w-[62%] text-white drop-shadow-sm" aria-hidden>
        {icon.paths.map((p, i) => (
          <path key={i} d={p.d} fill="currentColor" fillOpacity={p.opacity ?? 1} fillRule="evenodd" />
        ))}
      </svg>
    </span>
  );
}
