'use client';

import { FormEvent, Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createAuthClient } from 'better-auth/react';
import { LockKeyhole } from 'lucide-react';
import { BrandLockup, Button } from '@/components/ui/bookone-ui';

const authClient = createAuthClient();

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={null}>
      <ResetPasswordContent />
    </Suspense>
  );
}

function ResetPasswordContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get('token') ?? '';
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setMessage('');

    if (!token) {
      setError('Reset token is missing or expired.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setLoading(true);
    try {
      const result = await authClient.resetPassword({ token, newPassword: password });
      if (result.error) {
        setError(result.error.message ?? 'Could not reset password.');
        return;
      }
      setMessage('Password updated. Redirecting to sign in...');
      window.setTimeout(() => router.push('/login'), 800);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-panel">
        <div className="auth-brand">
          <BrandLockup />
        </div>
        <form className="auth-card" onSubmit={handleSubmit}>
          <h1>Reset Password</h1>
          <p>Enter a new password for your BookOne account.</p>

          <div className="auth-field">
            <label>New password</label>
            <div className="auth-input">
              <LockKeyhole size={15} />
              <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} minLength={8} required />
            </div>
          </div>
          <div className="auth-field">
            <label>Confirm password</label>
            <div className="auth-input">
              <LockKeyhole size={15} />
              <input type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} minLength={8} required />
            </div>
          </div>

          {error ? <p className="auth-error">{error}</p> : null}
          {message ? <p className="auth-message">{message}</p> : null}

          <Button variant="primary" type="submit" disabled={loading} style={{ width: '100%', justifyContent: 'center' }}>
            {loading ? 'Please wait...' : 'Reset password'}
          </Button>
        </form>
      </section>
    </main>
  );
}
