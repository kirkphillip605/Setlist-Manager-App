import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { bearer } from 'better-auth/plugins/bearer';
import { magicLink } from 'better-auth/plugins/magic-link';
import { emailOTP } from 'better-auth/plugins/email-otp';
import { phoneNumber } from 'better-auth/plugins/phone-number';
import { openAPI } from 'better-auth/plugins/open-api';
import { db } from './db/index.js';
import * as schema from './db/schema.js';
import {
  sendPasswordResetEmail,
  sendVerificationEmail,
  sendMagicLinkEmail,
  sendOTPEmail,
} from './lib/email.js';
import { sendPhoneOTP } from './lib/sms.js';

const FRONTEND_URL    = process.env.FRONTEND_URL    ?? 'https://setlist.kirknet.io';
const BETTER_AUTH_URL = process.env.BETTER_AUTH_URL  ?? 'https://api.setlist.kirknet.io';

const SESSION_MAX_AGE_DAYS = parseInt(process.env.SESSION_MAX_AGE_DAYS ?? '365', 10);
const SESSION_UPDATE_AGE_HOURS = parseInt(process.env.SESSION_UPDATE_AGE_HOURS ?? '24', 10);
const MIN_PASSWORD_LENGTH = parseInt(process.env.MIN_PASSWORD_LENGTH ?? '8', 10);
const REQUIRE_EMAIL_VERIFICATION = process.env.REQUIRE_EMAIL_VERIFICATION === 'true';

const OTP_LENGTH = parseInt(process.env.OTP_LENGTH ?? '6', 10);
const OTP_EXPIRY_SECONDS = parseInt(process.env.OTP_EXPIRY_SECONDS ?? '600', 10);
const MAGIC_LINK_EXPIRY_SECONDS = parseInt(process.env.MAGIC_LINK_EXPIRY_SECONDS ?? '600', 10);

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
    'capacitor://localhost',
    'https://localhost',
    'com.kirknetllc.setlistpro://',
    ...(process.env.ADDITIONAL_TRUSTED_ORIGINS?.split(',').filter(Boolean) ?? []),
  ],

  emailAndPassword: {
    enabled: true,
    minPasswordLength: MIN_PASSWORD_LENGTH,
    requireEmailVerification: REQUIRE_EMAIL_VERIFICATION,
    autoSignIn: !REQUIRE_EMAIL_VERIFICATION,
    sendResetPassword: async ({ url, user }) => {
      await sendPasswordResetEmail(user.email, url, user.name);
    },
    sendEmailVerification: async ({ url, user }: { url: string; user: { email: string; name?: string } }) => {
      await sendVerificationEmail(user.email, url, user.name);
    },
  },

  socialProviders: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      pkce: true,
    },
  },

  user: {
    additionalFields: {
      firstName:     { type: 'string',  required: false, input: true },
      lastName:      { type: 'string',  required: false, input: true },
      phone:         { type: 'string',  required: false, input: true },
      phoneVerified: { type: 'boolean', required: false, input: false },
      platformRole:  { type: 'string',  required: false, input: false, defaultValue: 'user' },
      isActive:      { type: 'boolean', required: false, input: false, defaultValue: true },
      preferences:   { type: 'string',  required: false, input: true },
    },
  },

  session: {
    expiresIn: 60 * 60 * 24 * SESSION_MAX_AGE_DAYS,
    updateAge: 60 * 60 * SESSION_UPDATE_AGE_HOURS,
    cookieCache: {
      enabled: true,
      maxAge: 60 * 5,
    },
  },

  advanced: {
    crossSubDomainCookies: {
      enabled: process.env.COOKIE_DOMAIN ? true : false,
      domain: process.env.COOKIE_DOMAIN ?? undefined,
    },
    defaultCookieAttributes: {
      sameSite: 'none',
      secure: true,
    },
  },

  plugins: [
    bearer(),

    magicLink({
      sendMagicLink: async ({ email, url }) => {
        await sendMagicLinkEmail(email, url);
      },
      expiresIn: MAGIC_LINK_EXPIRY_SECONDS,
    }),

    emailOTP({
      sendVerificationOTP: async ({ email, otp }) => {
        await sendOTPEmail(email, otp);
      },
      otpLength: OTP_LENGTH,
      expiresIn: OTP_EXPIRY_SECONDS,
    }),

    phoneNumber({
      sendOTP: async ({ phoneNumber: phone, code }) => {
        await sendPhoneOTP(phone, code);
      },
      otpLength: OTP_LENGTH,
      expiresIn: OTP_EXPIRY_SECONDS,
    }),

    openAPI(),
  ],
});

export type Auth = typeof auth;
