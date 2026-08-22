import { forwardRef, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
}

const variants: Record<ButtonVariant, string> = {
  primary:
    'bg-amber-500 text-zinc-950 hover:bg-amber-400 active:bg-amber-600 shadow-lg shadow-amber-500/20',
  secondary: 'bg-zinc-800 text-zinc-100 hover:bg-zinc-700 active:bg-zinc-600 border border-zinc-700',
  ghost: 'bg-transparent text-zinc-300 hover:bg-zinc-800/70 active:bg-zinc-800',
  danger: 'bg-red-500/90 text-white hover:bg-red-400 active:bg-red-600',
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', className, ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      className={cn(
        'inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm font-bold transition-colors duration-150',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-300',
        'disabled:pointer-events-none disabled:opacity-50',
        variants[variant],
        className,
      )}
      {...props}
    />
  );
});

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className, ...props }, ref) {
    return (
      <input
        ref={ref}
        className={cn(
          'min-h-11 w-full rounded-xl border border-zinc-700 bg-zinc-900/80 px-3 py-2 text-sm text-zinc-100',
          'placeholder:text-zinc-500 transition-colors duration-150',
          'focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500',
          className,
        )}
        {...props}
      />
    );
  },
);

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        'rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4 shadow-xl backdrop-blur-sm',
        className,
      )}
    >
      {children}
    </div>
  );
}

export function PageShell({ children }: { children: ReactNode }) {
  return <main className="mx-auto flex min-h-dvh w-full max-w-3xl flex-col gap-4 px-4 py-5">{children}</main>;
}
