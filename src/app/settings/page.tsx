'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Avatar } from '@/components/Avatar';
import { useAuth, useToast } from '@/components/providers';
import { Button, Card, Input, PageShell } from '@/components/ui';

export default function SettingsPage() {
  const router = useRouter();
  const { user, loading, refresh } = useAuth();
  const { push } = useToast();
  const [displayName, setDisplayName] = useState('');
  const [busyName, setBusyName] = useState(false);
  const [busyAvatar, setBusyAvatar] = useState(false);
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

  return (
    <PageShell>
      <Link href="/lobby" className="text-sm font-bold text-amber-400 hover:text-amber-300">
        → رجوع للرئيسية
      </Link>

      <h1 className="text-2xl font-extrabold">الإعدادات ⚙️</h1>

      <Card className="flex items-center gap-4">
        <Avatar userId={user.id} displayName={user.displayName} hasAvatar={user.hasAvatar} size="lg" />
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
