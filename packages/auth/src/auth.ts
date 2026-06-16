import 'server-only';

import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import { compare } from 'bcryptjs';
import { db, users } from '@bookone/db';
import { eq, and, isNull } from 'drizzle-orm';

declare module 'next-auth' {
  interface User {
    tenantId?: string;
    role?: string;
  }
  interface Session {
    user: {
      id: string;
      email: string;
      name: string;
      tenantId: string;
      role: string;
    };
  }
}

interface AppToken {
  sub?: string;
  tenantId?: string;
  role?: string;
  [key: string]: unknown;
}

export const { auth, handlers, signIn, signOut } = NextAuth({
  providers: [
    Credentials({
      name: 'credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          return null;
        }

        const email = (credentials.email as string).toLowerCase().trim();
        const password = credentials.password as string;

        const [user] = await db()
          .select()
          .from(users)
          .where(and(eq(users.email, email), isNull(users.voidedAt)))
          .limit(1);

        if (!user) {
          return null;
        }

        const isValid = await compare(password, user.passwordHash);
        if (!isValid) {
          return null;
        }

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          tenantId: user.tenantId,
          role: user.role,
        };
      },
    }),
  ],
  session: { strategy: 'jwt' },
  pages: {
    signIn: '/login',
  },
  callbacks: {
    async jwt({ token, user }) {
      const t = token as AppToken;
      if (user) {
        t.tenantId = user.tenantId;
        t.role = user.role;
      }
      return token;
    },
    async session({ session, token }) {
      const t = token as AppToken;
      if (session.user) {
        session.user.id = t.sub ?? '';
        session.user.tenantId = (t.tenantId as string) ?? '';
        session.user.role = (t.role as string) ?? 'member';
      }
      return session;
    },
  },
});
