'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { Button, Card, Input } from '@/components/ui';
import { useAuth, useToast } from '@/components/providers';

export default function RegisterPage() {
  const router = useRouter();
  const { refresh } = useAuth();
  const { push } = useToast();
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: username.trim(),
          displayName: displayName.trim(),
          password,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? 'حصلت مشكلة — جرب تاني');
        return;
      }
      await refresh();
      push('success', 'اتفضل! حسابك جاهز 🎉');
      router.push('/lobby');
    } catch {
      setError('مشكلة في الاتصال — جرب تاني');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-4">
      <div className="w-full max-w-sm animate-fade-in">
        <div className="mb-6 text-center">
          <div className="mb-2 text-5xl" aria-hidden>
            🎲
          </div>
          <h1 className="text-3xl font-extrabold text-amber-400">حساب جديد</h1>
          <p className="mt-1 text-sm text-zinc-400">دقيقة واحدة وتلعب سيجا</p>
        </div>

        <Card>
          <form onSubmit={onSubmit} className="flex flex-col gap-3">
            <label className="flex flex-col gap-1 text-sm font-semibold text-zinc-300">
              اسم المستخدم
              <Input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="username"
                autoFocus
                required
                minLength={3}
                maxLength={20}
                placeholder="حروف وأرقام و _ فقط"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm font-semibold text-zinc-300">
              الاسم المعروض
              <Input
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                autoComplete="nickname"
                required
                maxLength={40}
                placeholder="الاسم اللي هيظهر لأصحابك"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm font-semibold text-zinc-300">
              كلمة السر
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
                required
                minLength={6}
                maxLength={72}
                placeholder="٦ أحرف على الأقل"
              />
            </label>

            {error && (
              <p role="alert" className="rounded-lg bg-red-500/10 px-3 py-2 text-sm font-semibold text-red-400">
                {error}
              </p>
            )}

            <Button type="submit" disabled={busy} className="mt-1 w-full">
              {busy ? 'ثانية…' : 'إنشاء الحساب'}
            </Button>
          </form>
        </Card>

        <p className="mt-4 text-center text-sm text-zinc-400">
          عندك حساب؟{' '}
          <Link href="/login" className="font-bold text-amber-400 hover:text-amber-300">
            سجل دخولك
          </Link>
        </p>
      </div>
    </main>
  );
}
