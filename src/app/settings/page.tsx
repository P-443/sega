'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Avatar } from '@/components/Avatar';
import { useAuth, useToast } from '@/components/providers';
import { Button, Card, Input, PageShell } from '@/components/ui';
import { AVATAR_ICONS, resolveAvatarIcon } from '@/lib/avatars';
import { cn } from '@/lib/utils';

export default function SettingsPage() {
  const router = useRouter();
  const { user, loading, refresh } = useAuth();
  const { push } = useToast();
  const [displayName, setDisplayName] = useState('');
  const [busyName, setBusyName] = useState(false);
  const [busyAvatar, setBusyAvatar] = useState(false);
  const [busyIcon, setBusyIcon] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!loading && !user) router.replace('/login');
  }, [loading, user, router]);

  useEffect(() => {
    if (user) setDisplayName(user.displayName);
  }, [user]);

  if (loading || !user) {
    return (
      <PageShell>
        <div className="flex flex-1 items-center justify-center text-zinc-500">…</div>
      </PageShell>
    );
  }

  async function saveName(e: FormEvent) {
    e.preventDefault();
    if (busyName) return;
    setBusyName(true);
    const res = await fetch('/api/profile', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ displayName: displayName.trim() }),
    });
    const data = await res.json().catch(() => ({}));
    setBusyName(false);
    if (!res.ok) {
      push('error', data.error ?? 'حصلت مشكلة');
      return;
    }
    await refresh();
    push('success', 'الاسم اتحدث ✅');
  }

  async function uploadAvatar(file: File) {
    if (busyAvatar) return;
    setBusyAvatar(true);
    const form = new FormData();
    form.append('avatar', file);
    const res = await fetch('/api/profile/avatar', { method: 'POST', body: form });
    const data = await res.json().catch(() => ({}));
    setBusyAvatar(false);
    if (!res.ok) {
      push('error', data.error ?? 'حصلت مشكلة');
      return;
    }
    await refresh();
    push('success', 'الصورة اتحدثت ✅');
  }

  async function removeAvatar() {
    if (busyAvatar) return;
    setBusyAvatar(true);
    await fetch('/api/profile/avatar', { method: 'DELETE' }).catch(() => {});
    setBusyAvatar(false);
    await refresh();
    push('success', 'الصورة اتشالت');
  }

  async function pickIcon(iconId: string | null) {
    if (busyIcon) return;
    setBusyIcon(true);
    const res = await fetch('/api/profile', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ avatarIcon: iconId }),
    });
    setBusyIcon(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      push('error', data.error ?? 'حصلت مشكلة');
      return;
    }
    await refresh();
    push('success', 'الأيقونة اتحدثت ✅');
  }

  return (
    <PageShell>
      <Link href="/lobby" className="text-sm font-bold text-amber-400 hover:text-amber-300">
        → رجوع للرئيسية
      </Link>

      <h1 className="text-2xl font-extrabold">الإعدادات ⚙️</h1>

      <Card className="flex items-center gap-4">
        <Avatar
          userId={user.id}
          displayName={user.displayName}
          hasAvatar={user.hasAvatar}
          avatarIcon={user.avatarIcon}
          username={user.username}
          size="lg"
        />
        <div className="flex flex-1 flex-col gap-2">
          <input
            ref={fileRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void uploadAvatar(f);
              e.target.value = '';
            }}
          />
          <Button variant="secondary" disabled={busyAvatar} onClick={() => fileRef.current?.click()}>
            {busyAvatar ? '…' : 'تغيير الصورة (PNG/JPG/WebP حتى 512KB)'}
          </Button>
          {user.hasAvatar && (
            <Button variant="ghost" disabled={busyAvatar} onClick={() => void removeAvatar()}>
              إزالة الصورة
            </Button>
          )}
        </div>
      </Card>

      {/* default icon picker — shows whenever no photo is uploaded */}
      <Card>
        <h2 className="mb-1 text-sm font-bold text-zinc-200">أيقونتك الافتراضية</h2>
        <p className="mb-3 text-xs text-zinc-500">
          {user.hasAvatar
            ? 'بتظهر لو شلت صورتك المرفوعة'
            : 'دي اللي بتظهر للاعبين — اختار اللي تعجبك'}
        </p>
        <div className="grid grid-cols-4 gap-2 sm:grid-cols-8">
          {AVATAR_ICONS.map((icon) => {
            const active = resolveAvatarIcon(user.avatarIcon, user.username).id === icon.id;
            return (
              <button
                key={icon.id}
                type="button"
                disabled={busyIcon}
                onClick={() => void pickIcon(icon.id)}
                title={icon.label}
                aria-label={icon.label}
                aria-pressed={active}
                className={cn(
                  'flex flex-col items-center gap-1 rounded-2xl border p-2 transition',
                  'hover:scale-105 active:scale-95 disabled:opacity-50',
                  active
                    ? 'border-amber-400 bg-amber-400/10 ring-2 ring-amber-400/50'
                    : 'border-zinc-700 bg-zinc-800/50 hover:border-zinc-500',
                )}
              >
                <span
                  className="flex h-10 w-10 items-center justify-center rounded-full"
                  style={{ backgroundImage: `linear-gradient(135deg, ${icon.from}, ${icon.to})` }}
                >
                  <svg viewBox="0 0 24 24" className="h-6 w-6 text-white" aria-hidden>
                    {icon.paths.map((p, i) => (
                      <path key={i} d={p.d} fill="currentColor" fillOpacity={p.opacity ?? 1} fillRule="evenodd" />
                    ))}
                  </svg>
                </span>
                <span className="text-[10px] font-semibold text-zinc-400">{icon.label}</span>
              </button>
            );
          })}
        </div>
        {user.avatarIcon && (
          <Button variant="ghost" className="mt-3" disabled={busyIcon} onClick={() => void pickIcon(null)}>
            رجوع للأيقونة التلقائية
          </Button>
        )}
      </Card>

      <Card>
        <form onSubmit={saveName} className="flex flex-col gap-3">
          <label className="flex flex-col gap-1 text-sm font-semibold text-zinc-300">
            الاسم المعروض
            <Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} maxLength={40} required />
          </label>
          <Button type="submit" disabled={busyName} className="self-start">
            {busyName ? '…' : 'حفظ'}
          </Button>
        </form>
      </Card>

      <p className="text-center text-xs text-zinc-500">اسم المستخدم: @{user.username} (مش بيتغير)</p>
    </PageShell>
  );
}
