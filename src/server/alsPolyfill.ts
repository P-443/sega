/**
 * MUST be the first import of the custom server entry (server.ts).
 *
 * Next.js 15.5 custom-server crash: app-render/async-local-storage.js captures
 * `globalThis.AsyncLocalStorage` into a module-level const at load time. In the
 * custom-server path that module can load before next-server's
 * node-environment-baseline installs the global, so the process permanently gets
 * a FakeAsyncLocalStorage and the FIRST App Router request dies with:
 *   "Invariant: AsyncLocalStorage accessed in runtime where it is not available" (E504)
 * Installing the global here — before `next` is even required — fixes it.
 * (Same guard as next/dist/server/node-environment-baseline.js.)
 */
import { AsyncLocalStorage } from 'node:async_hooks';

const g = globalThis as { AsyncLocalStorage?: unknown };
if (typeof g.AsyncLocalStorage !== 'function') {
  g.AsyncLocalStorage = AsyncLocalStorage;
}
