import { createAuthClient } from 'better-auth/react';
import { inferAdditionalFields } from 'better-auth/client/plugins';
import { magicLinkClient } from 'better-auth/client/plugins';
import { emailOTPClient } from 'better-auth/client/plugins';
import { phoneNumberClient } from 'better-auth/client/plugins';
import { twoFactorClient } from 'better-auth/client/plugins';
import type { Profile } from '@/types';

const API_URL = import.meta.env.VITE_API_URL as string;
const AUTH_BASE = `${API_URL}/api/auth`;

type ForgetPasswordData = { email: string; redirectTo?: string };
type AuthFetchResult = Promise<{ data: unknown; error: { message: string; status: number } | null }>;

const emailAndPasswordClient = () => ({
  id: 'email-and-password' as const,
  getActions: ($fetch: (path: string, opts: { method: string; body: ForgetPasswordData }) => AuthFetchResult) => ({
    forgetPassword: (data: ForgetPasswordData) =>
      $fetch('/request-password-reset', { method: 'POST', body: data }),
  }),
});

interface AdditionalUserFields {
  firstName?: string | null;
  lastName?: string | null;
  phone?: string | null;
  phoneVerified?: boolean;
  platformRole?: string;
  isActive?: boolean;
  isProfileComplete?: boolean;
  preferences?: string | Record<string, unknown>;
  twoFactorEnabled?: boolean;
}

export const authClient = createAuthClient({
  baseURL: AUTH_BASE,
  plugins: [
    emailAndPasswordClient(),
    magicLinkClient(),
    emailOTPClient(),
    phoneNumberClient(),
    twoFactorClient(),
    inferAdditionalFields<{ user: AdditionalUserFields }>(),
  ],
});

export type AuthSession = typeof authClient.$Infer.Session;
export type AuthUser    = typeof authClient.$Infer.Session.user;

type UserWithFields = AuthUser & AdditionalUserFields;

interface AuthApiResult<T = Record<string, unknown>> {
  data?: T | null;
  error?: { message: string; status?: number } | null;
}

function getBackoffDelay(attempt: number): number {
  const base = Math.min(1000 * Math.pow(2, attempt), 30000);
  const jitter = base * 0.5 * Math.random();
  return base + jitter;
}

async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

const MAX_RETRIES_429 = 3;

async function authFetch<T = Record<string, unknown>>(
  path: string,
  body?: Record<string, unknown>
): Promise<AuthApiResult<T>> {
  for (let attempt = 0; attempt <= MAX_RETRIES_429; attempt++) {
    const res = await fetch(`${AUTH_BASE}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: body ? JSON.stringify(body) : undefined,
    });

    if (res.status === 429) {
      if (attempt < MAX_RETRIES_429) {
        const retryAfter = res.headers.get('Retry-After');
        let delayMs = getBackoffDelay(attempt);
        if (retryAfter) {
          const parsed = Number(retryAfter);
          if (!isNaN(parsed) && parsed > 0) {
            delayMs = parsed * 1000;
          } else {
            const date = Date.parse(retryAfter);
            if (!isNaN(date)) {
              delayMs = Math.max(date - Date.now(), 1000);
            }
          }
        }
        await sleep(delayMs);
        continue;
      }
      return { error: { message: 'Too many requests. Please wait a moment and try again.', status: 429 } };
    }

    const json = await res.json();
    if (!res.ok) {
      return { error: { message: json?.message ?? json?.error ?? 'Request failed', status: res.status } };
    }
    return { data: json as T };
  }

  return { error: { message: 'Too many requests. Please wait a moment and try again.', status: 429 } };
}

interface TwoFactorEnableData {
  totpURI?: string;
  backupCodes?: string[];
}

export const twoFactor = {
  enable: (opts: { password: string }) =>
    authFetch<TwoFactorEnableData>('/two-factor/enable', opts),
  disable: (opts: { password: string }) =>
    authFetch('/two-factor/disable', opts),
  verifyTotp: (opts: { code: string }) =>
    authFetch('/two-factor/verify-totp', opts),
  verifyBackupCode: (opts: { code: string }) =>
    authFetch('/two-factor/verify-backup-code', opts),
  sendOtp: () =>
    authFetch('/two-factor/send-otp'),
  verifyOtp: (opts: { code: string }) =>
    authFetch('/two-factor/verify-otp', opts),
  getBackupCodes: (opts: { password: string }) =>
    authFetch<{ backupCodes: string[] }>('/two-factor/get-backup-codes', opts),
  regenerateBackupCodes: (opts: { password: string }) =>
    authFetch<{ backupCodes: string[] }>('/two-factor/generate-backup-codes', opts),
};

export const updateUserProfile = (fields: {
  name?: string;
  firstName?: string;
  lastName?: string;
  image?: string;
}) => authFetch('/update-user', fields);

export const changeUserPassword = (opts: {
  currentPassword: string;
  newPassword: string;
  revokeOtherSessions?: boolean;
}) => authFetch('/change-password', opts);

export const resetUserPassword = (opts: {
  newPassword: string;
  token: string;
}) => authFetch('/reset-password', { newPassword: opts.newPassword, token: opts.token });

export const setInitialPassword = (opts: {
  newPassword: string;
}) => authFetch('/set-password', opts);

export const listUserAccounts = () =>
  authFetch<{ accounts: Array<{ id: string; providerId: string; accountId: string }> }>('/list-accounts');

export const unlinkAccount = (opts: { providerId: string }) =>
  authFetch('/unlink-account', opts);

export const mapAuthUserToProfile = (user: AuthUser): Profile => {
  const u = user as UserWithFields;
  return {
    id:                u.id,
    email:             u.email,
    firstName:         u.firstName ?? null,
    lastName:          u.lastName ?? null,
    avatarUrl:         u.image ?? undefined,
    platformRole:      (u.platformRole ?? 'user') as Profile['platformRole'],
    isActive:          u.isActive ?? true,
    isProfileComplete: u.isProfileComplete ?? false,
    preferences:       typeof u.preferences === 'string'
                         ? JSON.parse(u.preferences)
                         : (u.preferences as Profile['preferences']),
  };
};
