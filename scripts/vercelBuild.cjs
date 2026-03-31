const { spawn } = require('node:child_process');
const { rmSync } = require('node:fs');
const path = require('node:path');

const root = process.cwd();
const node = process.execPath;

const SPA_HEAP_MB = process.env.LOBE_VERCEL_SPA_HEAP_MB || '6144';
const NEXT_HEAP_MB = process.env.LOBE_VERCEL_NEXT_HEAP_MB || '6144';

const withHeapLimit = (env, heapMb) => {
  const current = (env.NODE_OPTIONS || '')
    .replace(/--max-old-space-size=\S+/g, '')
    .trim();

  const next = [current, `--max-old-space-size=${heapMb}`].filter(Boolean).join(' ');

  return {
    ...env,
    NODE_OPTIONS: next,
  };
};

const run = (label, args, env = process.env) =>
  new Promise((resolve, reject) => {
    console.log(`\n==> ${label}`);
    console.log(`${node} ${args.join(' ')}`);
    console.log(`NODE_OPTIONS=${env.NODE_OPTIONS || ''}`);

    const child = spawn(node, args, {
      cwd: root,
      env,
      stdio: 'inherit',
    });

    child.on('error', reject);
    child.on('exit', (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }

      if (signal) {
        reject(new Error(`${label} exited with signal ${signal}`));
        return;
      }

      reject(new Error(`${label} exited with code ${code}`));
    });
  });

const tsxCli = path.join(root, 'node_modules', 'tsx', 'dist', 'cli.mjs');
const viteCli = path.join(root, 'node_modules', 'vite', 'bin', 'vite.js');
const nextCli = path.join(root, 'node_modules', 'next', 'dist', 'bin', 'next');

const main = async () => {
  rmSync(path.join(root, 'public', '_spa'), { force: true, recursive: true });

  await run('Build SPA', [viteCli, 'build'], withHeapLimit(process.env, SPA_HEAP_MB));
  await run('Copy SPA build', [tsxCli, 'scripts/copySpaBuild.mts']);
  await run('Generate SPA templates', [tsxCli, 'scripts/generateSpaTemplates.mts']);
  await run('Build Next app', [nextCli, 'build'], withHeapLimit(process.env, NEXT_HEAP_MB));
  await run(
    'Run DB migrations',
    [tsxCli, './scripts/migrateServerDB/index.ts'],
    { ...process.env, MIGRATION_DB: '1' },
  );
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
