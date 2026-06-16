'use client';

import { useState } from 'react';
import { signIn } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { Button, Card } from '@/components/ui/bookone-ui';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const result = await signIn('credentials', {
        email,
        password,
        redirect: false,
      });

      if (result?.error) {
        setError('Invalid email or password.');
      } else {
        router.push('/');
        router.refresh();
      }
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main style={{
      minHeight: '100vh',
      display: 'grid',
      placeItems: 'center',
      background: 'var(--bg)',
    }}>
      <div style={{ width: 'min(400px, 90vw)' }}>
        <Card padded>
          <h1 style={{ fontSize: 24, fontWeight: 850, marginBottom: 8 }}>BookOne</h1>
          <p style={{ color: 'var(--ink-muted)', fontSize: 14, marginBottom: 24 }}>
            Sign in to your accounting workspace.
          </p>

        <form onSubmit={handleSubmit} style={{ display: 'grid', gap: 16 }}>
          <div className="field">
            <label>Email</label>
            <input
              className="input large"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoFocus
            />
          </div>
          <div className="field">
            <label>Password</label>
            <input
              className="input large"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>

          {error ? (
            <p style={{ color: 'var(--danger)', fontSize: 13 }}>{error}</p>
          ) : null}

          <Button variant="primary" type="submit" disabled={loading} style={{ width: '100%', justifyContent: 'center' }}>
            {loading ? 'Signing in\u2026' : 'Sign in'}
          </Button>
        </form>
      </Card>
      </div>
    </main>
  );
}
