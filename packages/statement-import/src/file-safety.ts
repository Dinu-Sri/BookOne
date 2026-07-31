/**
 * Detect unreadable / password-protected bank files before deep parse.
 * Deterministic — no AI.
 */

/** OLE Compound File header (legacy .xls and password-protected modern Office). */
function isOleCompound(bytes: Uint8Array): boolean {
  return (
    bytes.length >= 8 &&
    bytes[0] === 0xd0 &&
    bytes[1] === 0xcf &&
    bytes[2] === 0x11 &&
    bytes[3] === 0xe0
  );
}

/** Normal ZIP (.xlsx/.xlsm) starts with PK. */
function isZip(bytes: Uint8Array): boolean {
  return bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b;
}

/**
 * Password-protected Office Open XML is often stored as OLE (not a plain ZIP),
 * even when the download name ends in .xlsx.
 */
export function looksPasswordProtectedExcel(bytes: Uint8Array, fileName: string): boolean {
  const lower = fileName.toLowerCase();
  if (lower.endsWith('.xlsx') || lower.endsWith('.xlsm')) {
    if (isOleCompound(bytes)) return true;
    // Encrypted packages sometimes still ZIP with EncryptionInfo path — heuristic later
  }
  return false;
}

const PASSWORD_HINT =
  /password|encrypt|protected|cannot.*read|file is corrupt|unsupported file|CFB|compound file|EncryptedPackage/i;

/**
 * Map raw library errors to a short user-facing message.
 * Returns null when the error is not about protection / unreadable files.
 */
export function friendlyWorkbookError(err: unknown, fileName: string): string | null {
  const msg = err instanceof Error ? err.message : String(err ?? '');
  if (PASSWORD_HINT.test(msg) || looksPasswordProtectedExcel(new Uint8Array(), fileName)) {
    return (
      'This file looks password-protected or encrypted. ' +
      'In your bank app, export again without a password (or remove protection), then upload.'
    );
  }
  if (/empty|no sheets|cannot find|invalid/i.test(msg)) {
    return 'Could not read this file. Use .xlsx, .xls, or .csv from your bank (not a PDF or photo).';
  }
  return null;
}

/**
 * Pre-flight checks before XLSX.read. Throws Error with a clear message.
 */
export function assertWorkbookReadable(bytes: Uint8Array | Buffer, fileName: string): void {
  const buf = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  if (buf.length < 16) {
    throw new Error('File is empty or too small to be a bank statement.');
  }
  const lower = fileName.toLowerCase();
  if (looksPasswordProtectedExcel(buf, fileName)) {
    throw new Error(
      'This Excel file is password-protected. Export without a password from your bank, then try again.',
    );
  }
  // .xlsx should be ZIP; if not OLE and not ZIP, still try library later
  if ((lower.endsWith('.xlsx') || lower.endsWith('.xlsm')) && !isZip(buf) && !isOleCompound(buf)) {
    // rare corrupt rename — allow read attempt
  }
  void isOleCompound; // silence unused when only xlsx path used
}
