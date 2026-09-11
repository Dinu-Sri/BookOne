import { redirect } from 'next/navigation';
import { acceptInvite } from '@/app/actions/invite-accept';

export default async function InviteCompletePage() {
  const result = await acceptInvite();
  if (result.ok && result.homePath) redirect(result.homePath);
  redirect(`/login?invite=1&error=${encodeURIComponent(result.error ?? 'This invite is not valid.')}`);
}
