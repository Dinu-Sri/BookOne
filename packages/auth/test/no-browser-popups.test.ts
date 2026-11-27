import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC = path.resolve(__dirname, '../../../apps/web/src');

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return files(full);
    return /\.(tsx?|jsx?)$/.test(name) ? [full] : [];
  });
}

describe('UI rule book: no browser pop-ups', () => {
  it('apps/web never calls window.alert, window.confirm or window.prompt', () => {
    const hits: string[] = [];
    for (const f of files(SRC)) {
      const src = readFileSync(f, 'utf8');
      src.split('\n').forEach((line, i) => {
        if (/\bwindow\.(alert|confirm|prompt)\s*\(/.test(line) || /(^|[^\w.])(alert|confirm|prompt)\s*\(\s*['"`]/.test(line)) {
          hits.push(`${path.relative(SRC, f)}:${i + 1}`);
        }
      });
    }
    expect(hits, 'Use ConfirmDialog / askConfirm / askText (components/ui/ask.tsx) instead').toEqual([]);
  });
});
