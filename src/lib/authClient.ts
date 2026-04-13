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

async function authFetch<T = Record<string, unknown>>(
  path: string,
  body?: Record<string, unknown>
): Promise<AuthApiResult<T>> {
  const res = await fetch(`${AUTH_BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json();
  if (!res.ok) {
    return { error: { message: json?.message ?? json?.error ?? 'Request failed', status: res.status } };
  }
  return { data: json as T };
}

interface TwoFactorEnableData {
  totpURI?: string;
  backupCodes?: string[];
}

export const twoFactor = {
  enable: (opts: { password?: string }) =>
    authFetch<TwoFactorEnableData>('/two-factor/enable', opts),
  verifyTotp: (opts: { code: string }) =>
    authFetch('/two-factor/verify-totp', opts),
  verifyBackupCode: (opts: { code: string }) =>
    authFetch('/two-factor/verify-backup-code', opts),
  sendOtp: () =>
    authFetch('/two-factor/send-otp'),
  verifyOtp: (opts: { code: string }) =>
    authFetch('/two-factor/verify-otp', opts),
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
}) => authFetch('/update-password', opts);

export const setInitialPassword = (opts: {
  newPassword: string;
}) => authFetch('/set-password', opts);

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
