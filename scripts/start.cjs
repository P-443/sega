/**
 * Container entrypoint: fill safe defaults (zero-config deploy), apply Prisma
 * migrations (with retry while the database service boots), then start the
 * app server.
 */
const { spawnSync } = require('node:child_process');
const { randomBytes } = require('node:crypto');

const MAX_TRIES = 12;
const RETRY_MS = 3000;

// ── Zero-config defaults (overridable via environment) ──────────────────────
// DATABASE_URL defaults to the bundled Postgres service from docker-compose.yaml
// (host "db"). Point it elsewhere to use an external database instead.
if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = 'postgresql://sega:sega@db:5432/sega';
  console.log('[start] DATABASE_URL not set — defaulting to bundled Postgres (postgresql://…@db:5432/sega)');
}
// SESSION_SECRET: never hardcode one. If unset, generate an ephemeral secret —
// the app works out of the box, but sessions reset on every restart/redeploy.
// Set a fixed SESSION_SECRET in Coolify env vars to keep users logged in.
if (!process.env.SESSION_SECRET) {
  process.env.SESSION_SECRET = randomBytes(32).toString('hex');
  console.warn('[start] ⚠ SESSION_SECRET not set — using an ephemeral secret (sessions reset on restart).');
  console.warn('[start]   لتثبيت الجلسات: أضف SESSION_SECRET ثابتًا في Environment Variables.');
}

let warnedBuildPack = false;

function buildPackHelp() {
  console.error('');
  console.error('════════════════════════════════════════════════════════════════');
  console.error(' [start] لا توجد قاعدة بيانات باسم db على الشبكة.');
  console.error(' السبب شبه المؤكد: التطبيق في Coolify مضبوط على Build Pack = Dockerfile');
  console.error(' (في هذه الحالة Coolify يتجاهل docker-compose.yaml ويشغّل التطبيق وحده).');
  console.error('');
  console.error(' الحل:');
  console.error('   1) احذف هذا التطبيق من Coolify (Delete من Danger Zone)');
  console.error('   2) أنشئ تطبيقًا جديدًا: Public Repository ← https://github.com/P-443/sega');
  console.error('   3) عند السؤال عن Build Pack اختر: Docker Compose  ← وليس Dockerfile');
  console.error('   4) Deploy — ستظهر خدمتان: db ثم app');
  console.error('');
  console.error(' No "db" host on the network: the Coolify app is still on the');
  console.error(' "Dockerfile" build pack, so docker-compose.yaml was ignored.');
  console.error(' Recreate the app with Build Pack = "Docker Compose".');
  console.error('════════════════════════════════════════════════════════════════');
  console.error('');
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
  // With the compose stack, `db` is healthy BEFORE app starts (depends_on).
  // P1001 on the very first try therefore means: no compose stack at all.
  if (!warnedBuildPack && /Can't reach database server at `db:/.test(out)) {
    warnedBuildPack = true;
    buildPackHelp();
  }
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
      console.error('[start] FATAL: a required environment variable is missing (see above) — exiting');
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
