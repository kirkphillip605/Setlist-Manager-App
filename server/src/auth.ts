import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { db } from './db/index.js';
import * as schema from './db/schema.js';

const FRONTEND_URL = process.env.FRONTEND_URL ?? 'https://setlist.kirknet.io';
const BETTER_AUTH_URL = process.env.BETTER_AUTH_URL ?? 'https://api.setlist.kirknet.io';

export const auth = betterAuth({
  baseURL: BETTER_AUTH_URL,
  basePath: '/api/auth',
  secret: process.env.BETTER_AUTH_SECRET,

  database: drizzleAdapter(db, {
    provider: 'pg',
    schema: {
      user:         schema.users,
      session:      schema.sessions,
      account:      schema.accounts,
      verification: schema.verifications,
    },
  }),

  trustedOrigins: [
    FRONTEND_URL,
    'https://setlist.kirknet.io',
    'http://localhost:5000',
    'http://localhost:3001',
    // Capacitor deep link origins
    'com.kirknetllc.setlistpro://',
  ],

  emailAndPassword: {
    enabled: true,
    minPasswordLength: 8,
    sendResetPassword: async ({ url, user }) => {
      // TODO: integrate email provider
      console.log(`[Auth] Password reset link for ${user.email}: ${url}`);
    },
    sendEmailVerification: async ({ url, user }: { url: string; user: { email: string; name?: string } }) => {
      console.log(`[Auth] Verification link for ${user.email}: ${url}`);
    },
  },

  socialProviders: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    },
  },

  user: {
    additionalFields: {
      firstName:    { type: 'string', required: false, input: true },
      lastName:     { type: 'string', required: false, input: true },
      phone:        { type: 'string', required: false, input: true },
      phoneVerified: { type: 'boolean', required: false, input: false },
      platformRole: { type: 'string', required: false, input: false, defaultValue: 'user' },
      isActive:     { type: 'boolean', required: false, input: false, defaultValue: true },
      preferences:  { type: 'string', required: false, input: true },
    },
  },

  session: {
    expiresIn: 60 * 60 * 24 * 30,       // 30 days
    updateAge:  60 * 60 * 24,            // Refresh if older than 1 day
    cookieCache: {
      enabled: true,
      maxAge: 60 * 5,
    },
  },
});

export type Auth = typeof auth;
