/** Short SHA baked into the image at `pnpm --dir apps/web build`. Login/shell show this so QA can name the build. */
export function bookoneBuildId(): string {
  const raw = process.env.NEXT_PUBLIC_BOOKONE_BUILD ?? '';
  if (!raw || raw === '0') return 'dev';
  return raw.slice(0, 7);
}
