/**
 * Container entrypoint (zero-config):
 *
 *  1) Database
 *     - DATABASE_URL set   → use it (docker-compose `db` service or external DB).
 *     - DATABASE_URL unset → boot the PostgreSQL embedded in this image
 *                            (cluster in PGDATA, loopback only), then use it.
 *  2) SESSION_SECRET unset → ephemeral random secret (sessions reset on restart).
 *  3) Apply migrations (retry while the DB boots), then run the app server.
 */
const { spawnSync } = require('node:child_process');
const { randomBytes } = require('node:crypto');
const { existsSync, mkdirSync } = require('node:fs');
const { join } = require('node:path');

const MAX_TRIES = 12;
const RETRY_MS = 3000;

const PG_BIN = '/usr/lib/postgresql/15/bin';
const PGDATA = process.env.PGDATA || '/app/pgdata';

function sh(cmd, args, inherit = false) {
  // inherit: pipe mode would hang forever for `pg_ctl start` — the postmaster
  // daemon inherits our stdout/stderr pipes and keeps them open, and spawnSync
  // waits for pipe EOF, not just process exit. Inherit sends pg output
  // straight to the container logs instead.
  const r = spawnSync(cmd, args, inherit
    ? { stdio: ['ignore', 'inherit', 'inherit'] }
    : { stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8' });
  if (!inherit) {
    if (r.stdout) process.stdout.write(r.stdout);
    if (r.stderr) process.stderr.write(r.stderr);
  }
  return r;
}

// ── Embedded PostgreSQL (single-container / Dockerfile build pack mode) ─────
function startEmbeddedPostgres() {
  console.log('[start] DATABASE_URL not set — starting the embedded PostgreSQL…');
  if (!existsSync(join(PGDATA, 'PG_VERSION'))) {
    mkdirSync(PGDATA, { recursive: true });
    console.log(`[start] initializing database cluster in ${PGDATA}…`);
    const init = sh(join(PG_BIN, 'initdb'), [
      '-D', PGDATA, '-U', 'sega', '--auth=trust', '--locale=C', '--encoding=UTF8',
    ]);
    if (init.status !== 0) {
      console.error('[start] FATAL: initdb failed (see above)');
      process.exit(1);
    }
    console.warn('[start] ⚠ قاعدة البيانات مدمجة داخل الحاوية: لتثبيت البيانات بين عمليات النشر');
    console.warn(`[start]   أضف في Coolify ← Storages ← Volume على المسار ${PGDATA}`);
    console.warn('[start]   (بدون Volume تُعاد البيانات من الصفر بعد كل redeploy)');
  }
  const start = sh(join(PG_BIN, 'pg_ctl'), [
    '-D', PGDATA,
    // conservative memory settings — the embedded DB shares the VPS with other apps
    '-o', '-c listen_addresses=127.0.0.1 -p 5432 -k /tmp -c shared_buffers=32MB -c max_connections=20',
    '-w', '-t', '60',
    'start',
  ], true);
  if (start.status !== 0) {
    console.error('[start] FATAL: embedded PostgreSQL failed to start (see above)');
    process.exit(1);
  }
  sh(join(PG_BIN, 'createdb'), ['-h', '127.0.0.1', '-U', 'sega', 'sega']); // ok if it already exists
  process.env.DATABASE_URL = 'postgresql://sega@127.0.0.1:5432/sega';
  console.log('[start] embedded PostgreSQL is up on 127.0.0.1:5432');

  // Graceful shutdown: flush and stop Postgres when the container is stopped.
  const shutdown = () => {
    try { sh(join(PG_BIN, 'pg_ctl'), ['-D', PGDATA, '-m', 'fast', '-w', 'stop'], true); } catch {}
    process.exit(0);
  };
  process.once('SIGTERM', shutdown);
  process.once('SIGINT', shutdown);
}

if (!process.env.DATABASE_URL) {
  startEmbeddedPostgres();
}

// SESSION_SECRET: never hardcode one. If unset, generate an ephemeral secret —
// the app works out of the box, but sessions reset on every restart/redeploy.
// Set a fixed SESSION_SECRET in Coolify env vars to keep users logged in.
if (!process.env.SESSION_SECRET) {
  process.env.SESSION_SECRET = randomBytes(32).toString('hex');
  console.warn('[start] ⚠ SESSION_SECRET not set — using an ephemeral secret (sessions reset on restart).');
  console.warn('[start]   لتثبيت الجلسات: أضف SESSION_SECRET ثابتًا في Environment Variables.');
}

let warnedUnreachable = false;

function dbUnreachableHelp() {
  console.error('');
  console.error('════════════════════════════════════════════════════════════════');
  console.error(' [start] قاعدة البيانات المحددة في DATABASE_URL غير قابلة للوصول.');
  console.error(' إن كان المضيف هو db: فهذا يعني أن خدمة db غير موجودة —');
  console.error(' تأكد أن Build Pack = Docker Compose، أو احذف DATABASE_URL');
  console.error(' ليتم استخدام قاعدة البيانات المدمجة تلقائيًا.');
  console.error('');
  console.error(' The database in DATABASE_URL is unreachable. If the host is "db",');
  console.error(' the compose db service does not exist — either switch the build');
  console.error(' pack to "Docker Compose", or unset DATABASE_URL to use the');
  console.error(' embedded PostgreSQL instead.');
  console.error('════════════════════════════════════════════════════════════════');
  console.error('');
}

function migrate(attempt) {
  console.log(`[start] applying database migrations… (attempt ${attempt}/${MAX_TRIES})`);
  // --no-install: use the prisma CLI bundled in node_modules (never download at runtime)
  const r = sh('npx', ['--no-install', 'prisma', 'migrate', 'deploy']);
  const out = `${r.stdout || ''}${r.stderr || ''}`;
  if (r.status === 0) return 'ok';
  // A missing env var can never be fixed by retrying — abort immediately.
  if (/Environment variable not found/.test(out)) return 'fatal-env';
  if (!warnedUnreachable && /Can't reach database server/.test(out)) {
    warnedUnreachable = true;
    dbUnreachableHelp();
  }
  return 'retry';
}

(async () => {
  for (let i = 1; i <= MAX_TRIES; i++) {
    const res = migrate(i);
    if (res === 'ok') {
      console.log('[start] migrations applied — starting server…');
      // Next 15.5 custom-server: AsyncLocalStorage global must exist before any
      // next module loads (see src/server/alsPolyfill.ts) — entrypoint guard too.
      if (typeof globalThis.AsyncLocalStorage !== 'function') {
        globalThis.AsyncLocalStorage = require('node:async_hooks').AsyncLocalStorage;
      }
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
