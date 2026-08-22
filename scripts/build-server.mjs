/**
 * Bundles the custom server (server.ts + src/server + src/lib + src/game)
 * into a single CJS file for production. npm packages stay external and
 * are required from node_modules at runtime.
 */
import { build } from 'esbuild';

await build({
  entryPoints: ['server.ts'],
  outfile: 'dist/server.cjs',
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node20',
  packages: 'external',
  alias: { '@': './src' },
  logLevel: 'info',
  sourcemap: false,
  minify: false,
});

console.log('✓ dist/server.cjs built');
