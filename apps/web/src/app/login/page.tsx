'use client';

import type { FormEvent, ReactNode } from 'react';
import { Suspense, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createAuthClient } from 'better-auth/react';
import { Eye, LockKeyhole, Mail, UserRound } from 'lucide-react';
import { BrandLockup, Button } from '@/components/ui/bookone-ui';

const authClient = createAuthClient();

type AuthMode = 'signin' | 'signup';

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginContent />
    </Suspense>
  );
}

function LoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [mode, setMode] = useState<AuthMode>('signin');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const callbackURL = useMemo(() => searchParams.get('from') || '/', [searchParams]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setMessage('');
    setLoading(true);

    try {
      if (mode === 'signin') {
        const result = await authClient.signIn.email({
          email,
          password,
          rememberMe,
          callbackURL,
        });
        if (result.error) {
          setError(result.error.message ?? 'Could not sign in.');
          return;
        }
        router.push(callbackURL);
        router.refresh();
        return;
      }

      if (password !== confirmPassword) {
        setError('Passwords do not match.');
        return;
      }

      const name = `${firstName} ${lastName}`.trim();
      const result = await authClient.signUp.email({
        name,
        email,
        password,
        callbackURL,
      });
      if (result.error) {
        setError(result.error.message ?? 'Could not create account.');
        return;
      }
      setMessage('Account created. Check your email to verify before signing in.');
      setMode('signin');
      setPassword('');
      setConfirmPassword('');
    } catch {
      setError('Something went wrong.');
    } finally {
      setLoading(false);
    }
  }

  async function handleGoogle() {
    setError('');
    setMessage('');
    await authClient.signIn.social({ provider: 'google', callbackURL });
  }

  async function handlePasswordReset() {
    if (!email) {
      setError('Enter your email first, then request a reset link.');
      return;
    }
    setError('');
    setMessage('');
    const result = await authClient.requestPasswordReset({
      email,
      redirectTo: `${window.location.origin}/reset-password`,
    });
    if (result.error) {
      setError(result.error.message ?? 'Could not send reset email.');
      return;
    }
    setMessage('Password reset link sent if the email exists.');
  }

  return (
    <main className="auth-page">
      <section className="auth-panel">
        <div className="auth-brand">
          <BrandLockup />
        </div>

        <div className="auth-tabs" role="tablist" aria-label="Authentication mode">
          <button className={mode === 'signin' ? 'active' : ''} type="button" onClick={() => setMode('signin')}>
            Sign In
          </button>
          <button className={mode === 'signup' ? 'active' : ''} type="button" onClick={() => setMode('signup')}>
            Sign Up
          </button>
        </div>

        <form className="auth-card" onSubmit={handleSubmit}>
          <h1>{mode === 'signin' ? 'Sign In' : 'Sign Up'}</h1>
          <p>{mode === 'signin' ? 'Enter your email below to login to your account' : 'Enter your email below to create an account'}</p>

          {mode === 'signup' ? (
            <div className="auth-grid two">
              <AuthField icon={<UserRound size={15} />} label="First name" value={firstName} onChange={setFirstName} required />
              <AuthField icon={<UserRound size={15} />} label="Last name" value={lastName} onChange={setLastName} required />
            </div>
          ) : null}

          <AuthField icon={<Mail size={15} />} label="Email" type="email" value={email} onChange={setEmail} placeholder="m@example.com" required />

          <div className="auth-row">
            <label>Password</label>
            {mode === 'signin' ? (
              <button type="button" onClick={handlePasswordReset}>
                Forgot your password?
              </button>
            ) : null}
          </div>
          <div className="auth-input">
            <LockKeyhole size={15} />
            <input
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Password"
              minLength={8}
              required
            />
            <button type="button" aria-label="Show password" onClick={() => setShowPassword((value) => !value)}>
              <Eye size={15} />
            </button>
          </div>

          {mode === 'signup' ? (
            <AuthField
              icon={<LockKeyhole size={15} />}
              label="Confirm Password"
              type="password"
              value={confirmPassword}
              onChange={setConfirmPassword}
              placeholder="Confirm Password"
              required
            />
          ) : (
            <label className="auth-check">
              <input type="checkbox" checked={rememberMe} onChange={(event) => setRememberMe(event.target.checked)} />
              <span>Remember me</span>
            </label>
          )}

          {error ? <p className="auth-error">{error}</p> : null}
          {message ? <p className="auth-message">{message}</p> : null}

          <Button variant="primary" type="submit" disabled={loading} style={{ width: '100%', justifyContent: 'center' }}>
            {loading ? 'Please wait...' : mode === 'signin' ? 'Login' : 'Create an account'}
          </Button>

          {mode === 'signin' ? (
            <Button variant="secondary" type="button" onClick={handleGoogle} style={{ width: '100%', justifyContent: 'center' }}>
              Sign in with Google
            </Button>
          ) : null}

          <div className="auth-terms">
            By signing {mode === 'signin' ? 'in' : 'up'}, you agree to the <a href="#">Terms of Use</a>, <a href="#">Privacy Policy</a>, and <a href="#">Cookies Policy</a>.
          </div>
        </form>
      </section>
    </main>
  );
}

function AuthField({
  label,
  value,
  onChange,
  icon,
  type = 'text',
  placeholder,
  required = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  icon: ReactNode;
  type?: string;
  placeholder?: string;
  required?: boolean;
}) {
  return (
    <div className="auth-field">
      <label>{label}</label>
      <div className="auth-input">
        {icon}
        <input type={type} value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder ?? label} required={required} />
      </div>
    </div>
  );
}
