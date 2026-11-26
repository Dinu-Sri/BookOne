/** QA-1126-15: the sign-up notice must match whether verification is enforced. */
export function signUpMessage(signedUpWithSession: boolean): string {
  return signedUpWithSession
    ? 'Account created. You can sign in now.'
    : 'Account created. Check your email to verify before signing in.';
}
