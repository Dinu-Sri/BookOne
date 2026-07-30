/**
 * Smart Bank Import Studio kill-switch / rollout flag.
 * Set BANK_IMPORT_STUDIO=1 on the server (and optionally NEXT_PUBLIC_ for client shells).
 */
export function isBankImportStudioEnabled(): boolean {
  const v =
    process.env.BANK_IMPORT_STUDIO ??
    process.env.NEXT_PUBLIC_BANK_IMPORT_STUDIO ??
    '';
  return v === '1' || v.toLowerCase() === 'true' || v.toLowerCase() === 'yes';
}
