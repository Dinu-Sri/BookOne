/** Credentials and base URL for browser tests (from /e2e runner or shell). */
export function requireE2eAuth() {
  const email = process.env.E2E_EMAIL?.trim() || '';
  const password = process.env.E2E_PASSWORD || '';
  if (!email || !password) {
    throw new Error(
      'E2E_EMAIL and E2E_PASSWORD are required. Start a run from /e2e or export them in the shell.',
    );
  }
  return { email, password };
}

export function seed(): string {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}
