import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

function readRepo(...parts: string[]) {
  return readFileSync(path.resolve(__dirname, '../../..', ...parts), 'utf8');
}

function repoPath(...parts: string[]) {
  return path.resolve(__dirname, '../../..', ...parts);
}

describe('self-hosted Noto Serif Sinhala for production builds', () => {
  it('root layout uses next/font/local and the committed Sinhala woff2', () => {
    const layout = readRepo('apps/web/src/app/layout.tsx');
    expect(layout).toContain("from 'next/font/local'");
    expect(layout).not.toContain("from 'next/font/google'");
    expect(layout).toContain("../fonts/NotoSerifSinhala-sinhala-wght.woff2");
    expect(layout).toContain("variable: '--font-si'");

    const fontPath = repoPath('apps/web/src/fonts/NotoSerifSinhala-sinhala-wght.woff2');
    expect(existsSync(fontPath)).toBe(true);
    const bytes = readFileSync(fontPath);
    expect(bytes.length).toBeGreaterThan(10_000);
    expect(bytes.subarray(0, 4).toString('ascii')).toBe('wOF2');

    const license = readRepo('apps/web/src/fonts/OFL.txt');
    expect(license).toMatch(/SIL Open Font License/i);
  });

  it('well-known JWKS declares runtime locally instead of re-exporting it', () => {
    const route = readRepo('apps/web/src/app/.well-known/jwks.json/route.ts');
    expect(route).toMatch(/export const runtime = 'nodejs'/);
    expect(route).not.toMatch(/export \{ GET, runtime \}/);
    expect(route).toMatch(/export \{ GET \} from '@\/app\/api\/agent-bridge\/oauth\/jwks\/route'/);
  });
});
