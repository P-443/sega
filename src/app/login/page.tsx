'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { Button, Card, Input } from '@/components/ui';
import { useAuth, useToast } from '@/components/providers';

export default function LoginPage() {
  const router = useRouter();
  const { refresh } = useAuth();
  const { push } = useToast();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username.trim(), password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? 'حصلت مشكلة — جرب تاني');
        return;
      }
      await refresh();
      push('success', 'أهلاً بيك تاني! 👋');
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
          <h1 className="text-3xl font-extrabold text-amber-400">السيجا المصرية</h1>
          <p className="mt-1 text-sm text-zinc-400">٣×٣ — العبها صح مع أصحابك</p>
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
                maxLength={20}
                placeholder="مثال: taha_1990"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm font-semibold text-zinc-300">
              كلمة السر
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                required
                maxLength={72}
                placeholder="••••••••"
              />
            </label>

            {error && (
              <p role="alert" className="rounded-lg bg-red-500/10 px-3 py-2 text-sm font-semibold text-red-400">
                {error}
              </p>
            )}

            <Button type="submit" disabled={busy} className="mt-1 w-full">
              {busy ? 'ثانية…' : 'دخول'}
            </Button>
          </form>
        </Card>

        <p className="mt-4 text-center text-sm text-zinc-400">
          لسه معندكش حساب؟{' '}
          <Link href="/register" className="font-bold text-amber-400 hover:text-amber-300">
            اعمل حساب جديد
          </Link>
        </p>
      </div>
    </main>
  );
}
