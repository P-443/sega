/**
 * Container entrypoint: validate env, apply Prisma migrations (with retry
 * while the database service boots), then start the app server.
 */
const { spawnSync } = require('node:child_process');

const MAX_TRIES = 12;
const RETRY_MS = 3000;

function envHelp(missing) {
  console.error('');
  console.error('════════════════════════════════════════════════════════════════');
  console.error(` [start] FATAL: missing required environment variable(s): ${missing.join(', ')}`);
  console.error('');
  console.error(' متغيرات البيئة المطلوبة غير موجودة داخل الحاوية.');
  console.error(' الحل في Coolify:');
  console.error('   1) افتح التطبيق ← Environment Variables');
  console.error(`   2) أضف: ${missing.join(', ')}`);
  console.error('   3) تأكد أن خيار "Build Variable" غير مفعّل (متغير وقت التشغيل)');
  console.error('   4) اضغط Redeploy');
  console.error('');
  console.error(' Add them in Coolify → app → Environment Variables (runtime,');
  console.error(' NOT "Build Variable"), then Redeploy.');
  console.error('════════════════════════════════════════════════════════════════');
  console.error('');
}

// ── Pre-flight: fail fast with clear guidance instead of 12 pointless retries ──
const missing = ['DATABASE_URL', 'SESSION_SECRET'].filter((k) => !process.env[k]);
if (missing.length) {
  envHelp(missing);
  process.exit(1);
}

function migrate(attempt) {
  console.log(`[start] applying database migrations… (attempt ${attempt}/${MAX_TRIES})`);
  // --no-install: use the prisma CLI bundled in node_modules (never download at runtime)
  const r = spawnSync('npx', ['--no-install', 'prisma', 'migrate', 'deploy'], {
    stdio: ['ignore', 'pipe', 'pipe'],
    encoding: 'utf8',
    shell: process.platform === 'win32',
  });
  const out = `${r.stdout || ''}${r.stderr || ''}`;
  process.stdout.write(out);
  if (r.status === 0) return 'ok';
  // A missing env var can never be fixed by retrying — abort immediately.
  if (/Environment variable not found/.test(out)) return 'fatal-env';
  return 'retry';
}

(async () => {
  for (let i = 1; i <= MAX_TRIES; i++) {
    const res = migrate(i);
    if (res === 'ok') {
      console.log('[start] migrations applied — starting server…');
      require('../dist/server.cjs');
      return;
    }
    if (res === 'fatal-env') {
      envHelp(['DATABASE_URL']);
      process.exit(1);
    }
    if (i < MAX_TRIES) {
      console.log(`[start] database not ready yet — retrying in ${RETRY_MS / 1000}s…`);
      await new Promise((r) => setTimeout(r, RETRY_MS));
    }
  }
  console.error('[start] could not apply migrations after all retries — exiting');
  process.exit(1);
})();
