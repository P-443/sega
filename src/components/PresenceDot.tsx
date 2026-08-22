import { cn } from '@/lib/utils';
import type { PresenceStatus } from '@/shared/events';

const COLORS: Record<PresenceStatus, string> = {
  online: 'bg-emerald-400',
  'in-game': 'bg-amber-400',
  offline: 'bg-zinc-500',
};

export const PRESENCE_AR: Record<PresenceStatus, string> = {
  online: 'متصل',
  'in-game': 'في مباراة',
  offline: 'غير متصل',
};

export function PresenceDot({ status, className }: { status: PresenceStatus; className?: string }) {
  return (
    <span
      className={cn('inline-block h-2.5 w-2.5 rounded-full', COLORS[status], className)}
      title={PRESENCE_AR[status]}
      aria-label={PRESENCE_AR[status]}
    />
  );
}
