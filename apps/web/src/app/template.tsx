import { assertScreenAccessFromHeaders } from '@/lib/access';

/** Runs on every App Router navigation. Denies typed URLs the job cannot read. */
export default async function AppTemplate({ children }: { children: React.ReactNode }) {
  await assertScreenAccessFromHeaders();
  return children;
}
