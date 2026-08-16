import { build } from 'esbuild';
import { mkdirSync } from 'node:fs';

mkdirSync('.tmp', { recursive: true });

await build({
  entryPoints: ['scripts/smoke-test.ts'],
  bundle: true,
  platform: 'node',
  format: 'esm',
  outfile: '.tmp/smoke-test.mjs',
});

await import('../.tmp/smoke-test.mjs');
