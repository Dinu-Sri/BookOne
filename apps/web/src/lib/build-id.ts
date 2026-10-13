/** Semver from repo-root `VERSION`, inlined at Next build as NEXT_PUBLIC_APP_VERSION. */
export function bookoneAppVersion(): string {
  const v = process.env.NEXT_PUBLIC_APP_VERSION ?? '';
  return v || '0.0.0';
}

/** Short SHA from Docker ARG BUILD_DATE / NEXT_PUBLIC_BOOKONE_BUILD. Local `pnpm dev` is `dev`. */
export function bookoneBuildId(): string {
  const raw = process.env.NEXT_PUBLIC_BOOKONE_BUILD ?? '';
  if (!raw || raw === '0') return 'dev';
  return raw.slice(0, 7);
}

/** On-screen stamp: `v2.1.0 · 137f6b5`. */
export function bookoneVersionLabel(): string {
  return `v${bookoneAppVersion()} · ${bookoneBuildId()}`;
}
