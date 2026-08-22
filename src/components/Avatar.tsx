import { cn } from '@/lib/utils';

interface AvatarProps {
  userId: string;
  displayName: string;
  hasAvatar: boolean;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
}

const sizes = {
  sm: 'h-8 w-8 text-sm',
  md: 'h-10 w-10 text-base',
  lg: 'h-14 w-14 text-xl',
  xl: 'h-24 w-24 text-3xl',
};

/** Avatar with graceful fallback to the first letter of the display name. */
export function Avatar({ userId, displayName, hasAvatar, size = 'md', className }: AvatarProps) {
  const cls = cn(
    'relative inline-flex shrink-0 select-none items-center justify-center overflow-hidden rounded-full bg-gradient-to-br from-amber-500 to-orange-700 font-bold text-zinc-950 ring-2 ring-zinc-700',
    sizes[size],
    className,
  );
  if (!hasAvatar) {
    return (
      <span className={cls} aria-hidden>
        {displayName.trim().charAt(0) || '؟'}
      </span>
    );
  }
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
