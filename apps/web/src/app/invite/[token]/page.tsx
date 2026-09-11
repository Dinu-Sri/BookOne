import Link from 'next/link';
import { peekInvite } from '@/app/actions/invite-accept';
import { BrandLockup, Button } from '@/components/ui/bookone-ui';

export default async function InviteTokenPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const peek = await peekInvite(token);

  return (
    <main className="auth-shell">
      <div className="auth-card">
        <BrandLockup />
        <h1>Join a BookOne workspace</h1>
        {peek.ok ? (
          <>
            <p>
              You were invited to <strong>{peek.company}</strong> as {peek.email}.
            </p>
            <p>Sign in or create an account with that email to join. You will not get a separate company.</p>
            <Link href={`/login?invite=1&from=${encodeURIComponent('/invite/complete')}`}>
              <Button variant="primary" type="button">
                Continue
              </Button>
            </Link>
          </>
        ) : (
          <>
            <p>This invite is not valid.</p>
            <Link href="/login">
              <Button variant="secondary" type="button">
                Go to sign in
              </Button>
            </Link>
          </>
        )}
      </div>
    </main>
  );
}
