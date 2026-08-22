/**
 * Container entrypoint: apply Prisma migrations (with retry while the
 * database service boots), then start the app server.
 */
const { execSync } = require('node:child_process');

const MAX_TRIES = 12;
const RETRY_MS = 3000;

function migrate(attempt) {
  try {
    console.log(`[start] applying database migrations… (attempt ${attempt}/${MAX_TRIES})`);
    execSync('npx prisma migrate deploy', { stdio: 'inherit' });
    return true;
  } catch {
    return false;
  }
}

(async () => {
  for (let i = 1; i <= MAX_TRIES; i++) {
    if (migrate(i)) {
      console.log('[start] migrations applied — starting server…');
      require('../dist/server.cjs');
      return;
    }
    if (i < MAX_TRIES) await new Promise((r) => setTimeout(r, RETRY_MS));
  }
  console.error('[start] could not apply migrations — exiting');
  process.exit(1);
})();
