import { redirect } from 'next/navigation';

/** Groups now live on the People tab as "Shared extra jobs". */
export default function TeamGroupsPage() {
  redirect('/company/team#groups');
}
