import { assertScreenAccessFromHeaders } from '@/lib/access';

function isNextRedirect(error: unknown): boolean {
  return Boolean(
    error &&
      typeof error === 'object' &&
      'digest' in error &&
      String((error as { digest: unknown }).digest).startsWith('NEXT_REDIRECT'),
  );
}

/** Runs on every App Router navigation. Denies typed URLs the job cannot read. */
export default async function AppTemplate({ children }: { children: React.ReactNode }) {
  try {
    await assertScreenAccessFromHeaders();
  } catch (error) {
    if (isNextRedirect(error)) throw error;
  }
  return children;
}
