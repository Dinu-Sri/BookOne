import 'server-only';

import { randomBytes } from 'node:crypto';
import { betterAuth } from 'better-auth';
import { organization } from 'better-auth/plugins';
import { Pool } from 'pg';
import { sendAuthEmail } from './email';

const databaseUrl = process.env.DATABASE_URL;

const googleClientId = process.env.GOOGLE_CLIENT_ID;
const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET;
const authSecret = process.env.BETTER_AUTH_SECRET ?? process.env.AUTH_SECRET ?? randomBytes(32).toString('base64');

/** When Resend is not configured, skip verification emails and allow login without verify. */
const emailDeliveryEnabled = Boolean(process.env.RESEND_API_KEY?.trim());

export const auth = betterAuth({
  database: new Pool(databaseUrl ? { connectionString: databaseUrl } : undefined),
  secret: authSecret,
  baseURL: process.env.BETTER_AUTH_URL ?? process.env.AUTH_URL ?? process.env.APP_URL,
  user: {
    modelName: 'auth_users',
  },
  session: {
    modelName: 'auth_sessions',
  },
  account: {
    modelName: 'auth_accounts',
  },
  verification: {
    modelName: 'auth_verifications',
  },
  emailAndPassword: {
    enabled: true,
    // Staging/dev without RESEND_API_KEY: no verification gate (E2E-friendly).
    requireEmailVerification: emailDeliveryEnabled,
    revokeSessionsOnPasswordReset: true,
    sendResetPassword: async ({ user, url }) => {
      void sendAuthEmail({
        to: user.email,
        subject: 'Reset your BookOne password',
        text: `Reset your BookOne password: ${url}`,
        html: `<p>Reset your BookOne password:</p><p><a href="${url}">Reset password</a></p>`,
      });
    },
  },
  emailVerification: {
    sendOnSignUp: emailDeliveryEnabled,
    sendOnSignIn: emailDeliveryEnabled,
    autoSignInAfterVerification: true,
    sendVerificationEmail: async ({ user, url }) => {
      if (!emailDeliveryEnabled) {
        console.warn(
          `[auth] RESEND_API_KEY unset — skipped verification email for ${user.email} (requireEmailVerification=false)`,
        );
        return;
      }
      void sendAuthEmail({
        to: user.email,
        subject: 'Verify your BookOne email',
        text: `Verify your BookOne email address: ${url}`,
        html: `<p>Verify your BookOne email address:</p><p><a href="${url}">Verify email</a></p>`,
      });
    },
  },
  socialProviders: {
    ...(googleClientId && googleClientSecret
      ? {
          google: {
            clientId: googleClientId,
            clientSecret: googleClientSecret,
            prompt: 'select_account',
          },
        }
      : {}),
  },
  plugins: [
    organization({
      schema: {
        organization: {
          modelName: 'auth_organizations',
        },
        member: {
          modelName: 'auth_members',
        },
        invitation: {
          modelName: 'auth_invitations',
        },
      },
    }),
  ],
});
