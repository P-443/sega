import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 px-4 text-center">
      <p className="text-5xl">🐪</p>
      <h1 className="text-2xl font-extrabold text-zinc-100">الصفحة دي مش موجودة</h1>
      <Link href="/lobby" className="font-bold text-amber-400 hover:text-amber-300">
        العودة للرئيسية
      </Link>
    </main>
  );
}
