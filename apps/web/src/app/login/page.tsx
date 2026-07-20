'use client';

import type { FormEvent, ReactNode } from 'react';
import { Suspense, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createAuthClient } from 'better-auth/react';
import { Eye, LockKeyhole, Mail, UserRound } from 'lucide-react';
import { BrandLockup, Button } from '@/components/ui/bookone-ui';
import { migrateLegacyLogin } from '@/app/actions/legacy-auth';

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
          const migrated = await migrateLegacyLogin(email, password);
          if (!migrated.ok) {
            setError(migrated.error ?? result.error.message ?? 'Could not sign in.');
            return;
          }
          const retry = await authClient.signIn.email({
            email,
            password,
            rememberMe,
            callbackURL,
          });
          if (retry.error) {
            setError(retry.error.message ?? 'Could not sign in.');
            return;
          }
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

        <form className="auth-card" onSubmit={handleSubmit} data-testid="login-form">
          <h1>{mode === 'signin' ? 'Sign In' : 'Sign Up'}</h1>
          <p>{mode === 'signin' ? 'Enter your email below to login to your account' : 'Enter your email below to create an account'}</p>

          {mode === 'signup' ? (
            <div className="auth-grid two">
              <AuthField icon={<UserRound size={15} />} label="First name" value={firstName} onChange={setFirstName} required />
              <AuthField icon={<UserRound size={15} />} label="Last name" value={lastName} onChange={setLastName} required />
            </div>
          ) : null}

          <AuthField
            icon={<Mail size={15} />}
            label="Email"
            type="email"
            value={email}
            onChange={setEmail}
            placeholder="m@example.com"
            required
            testId="login-email"
          />

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
              data-testid="login-password"
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

          <Button
            variant="primary"
            type="submit"
            disabled={loading}
            style={{ width: '100%', justifyContent: 'center' }}
            data-testid="login-submit"
          >
            {loading ? 'Please wait...' : mode === 'signin' ? 'Login' : 'Create an account'}
          </Button>

          {mode === 'signin' ? (
            <Button variant="secondary" type="button" onClick={handleGoogle} style={{ width: '100%', justifyContent: 'center' }}>
              <GoogleMark />
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

function GoogleMark() {
  return (
    <svg aria-hidden="true" width="16" height="16" viewBox="0 0 18 18">
      <path fill="#4285f4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62Z" />
      <path fill="#34a853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.33-1.58-5.04-3.72H.94v2.33A9 9 0 0 0 9 18Z" />
      <path fill="#fbbc05" d="M3.96 10.7A5.4 5.4 0 0 1 3.68 9c0-.59.1-1.16.28-1.7V4.97H.94A9 9 0 0 0 0 9c0 1.45.34 2.82.94 4.03l3.02-2.33Z" />
      <path fill="#ea4335" d="M9 3.58c1.32 0 2.5.45 3.44 1.34l2.58-2.58C13.46.9 11.43 0 9 0A9 9 0 0 0 .94 4.97L3.96 7.3C4.67 5.16 6.66 3.58 9 3.58Z" />
    </svg>
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
  testId,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  icon: ReactNode;
  type?: string;
  placeholder?: string;
  required?: boolean;
  testId?: string;
}) {
  return (
    <div className="auth-field">
      <label>{label}</label>
      <div className="auth-input">
        {icon}
        <input
          type={type}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder ?? label}
          required={required}
          data-testid={testId}
        />
      </div>
    </div>
  );
}
