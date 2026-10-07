import { context } from 'esbuild';

const watch = process.argv.includes('--watch');

const shared = {
  bundle: true,
  sourcemap: true,
  platform: 'node',
  target: 'node22',
  external: ['electron', 'node:*'],
  logLevel: 'info',
};

const main = await context({
  ...shared,
  entryPoints: ['src/electron/main.ts'],
  outfile: 'dist-electron/main/index.js',
  format: 'esm',
});

const preload = await context({
  ...shared,
  entryPoints: ['src/electron/preload.ts'],
  outfile: 'dist-electron/preload/index.cjs',
  format: 'cjs',
});

if (watch) {
  await Promise.all([main.watch(), preload.watch()]);
  await new Promise(() => undefined);
} else {
  await Promise.all([main.rebuild(), preload.rebuild()]);
  await Promise.all([main.dispose(), preload.dispose()]);
}
