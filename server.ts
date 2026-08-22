/**
 * Custom production server: Next.js + Socket.IO on ONE port.
 * Listens on 0.0.0.0 so it works inside Docker / behind Coolify's proxy.
 */

import './src/server/alsPolyfill'; // MUST stay first — installs AsyncLocalStorage before next loads
import { createServer } from 'node:http';
import next from 'next';
import { attachSocketServer } from './src/server/socket';

const dev = process.env.NODE_ENV !== 'production';
const port = parseInt(process.env.PORT ?? '3000', 10);
const hostname = process.env.HOSTNAME ?? '0.0.0.0';

// Fail fast on missing required configuration — never run with defaults.
for (const key of ['DATABASE_URL', 'SESSION_SECRET'] as const) {
  if (!process.env[key]) {
    console.error(`[startup] Missing required environment variable: ${key}`);
    process.exit(1);
  }
}

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

app
  .prepare()
  .then(() => {
    const server = createServer((req, res) => {
      handle(req, res);
    });

    attachSocketServer(server);

    server.listen(port, hostname, () => {
      console.log(`▲ Egyptian Sega 3x3 ready on http://${hostname}:${port} (${dev ? 'dev' : 'production'})`);
    });
  })
  .catch((err) => {
    console.error('[startup] Failed to start', err);
    process.exit(1);
  });
