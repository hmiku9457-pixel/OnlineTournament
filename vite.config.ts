import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string };
function commitHash(): string {
  if (/^[0-9a-f]{40}$/i.test(process.env.GITHUB_SHA ?? '')) return process.env.GITHUB_SHA!;
  try { return execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); }
  catch { return 'unbekannt'; }
}
function buildVersion(command: 'build' | 'serve') {
  const sha = commitHash();
  const run = process.env.GITHUB_RUN_NUMBER;
  const label = command === 'serve' ? 'Dev' : run ? 'Build ' + run : 'Lokaler Build';
  return { text: 'v' + version + ' · ' + label + ' · ' + sha.slice(0, 8), title: 'Git-Commit: ' + sha };
}

export default defineConfig(({ command }) => ({
  plugins: [react(), {
    name: 'online-tournament-build-version',
    transformIndexHtml() {
      const info = buildVersion(command);
      return [{
        tag: 'small',
        attrs: { id: 'app-build-version', class: 'app-build-version no-print', title: info.title, 'aria-label': 'Programmversion: ' + info.text },
        children: info.text,
        injectTo: 'body' as const,
      }];
    },
  }],
  base: './',
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  build: {
    sourcemap: true,
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'],
  },
}));
