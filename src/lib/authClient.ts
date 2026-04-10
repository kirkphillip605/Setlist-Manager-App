import { createAuthClient } from 'better-auth/react';
import { inferAdditionalFields } from 'better-auth/client/plugins';
import { magicLinkClient } from 'better-auth/client/plugins';
import { emailOTPClient } from 'better-auth/client/plugins';
import { phoneNumberClient } from 'better-auth/client/plugins';
import { twoFactorClient } from 'better-auth/client/plugins';
import type { Profile } from '@/types';

const API_URL = import.meta.env.VITE_API_URL as string;

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
  baseURL: `${API_URL}/api/auth`,
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

interface TwoFactorResult<T = Record<string, unknown>> {
  data?: T | null;
  error?: { message: string; status?: number } | null;
}

interface TwoFactorEnableData {
  totpURI?: string;
  backupCodes?: string[];
}

interface TwoFactorNamespace {
  enable: (opts: { password?: string }) => Promise<TwoFactorResult<TwoFactorEnableData>>;
  verifyTotp: (opts: { code: string }) => Promise<TwoFactorResult>;
  verifyBackupCode: (opts: { code: string }) => Promise<TwoFactorResult>;
  sendOtp: () => Promise<TwoFactorResult>;
  verifyOtp: (opts: { code: string }) => Promise<TwoFactorResult>;
}

export const twoFactor: TwoFactorNamespace =
  (authClient as unknown as { twoFactor: TwoFactorNamespace }).twoFactor;

export const updateUserProfile = (fields: {
  name?: string;
  firstName?: string;
  lastName?: string;
  image?: string;
}) => authClient.updateUser(fields as Parameters<typeof authClient.updateUser>[0]);

export const changeUserPassword = (opts: {
  currentPassword: string;
  newPassword: string;
  revokeOtherSessions?: boolean;
}) => (authClient as unknown as {
  changePassword: (o: typeof opts) => Promise<TwoFactorResult>;
}).changePassword(opts);

export const resetUserPassword = (opts: {
  newPassword: string;
}) => (authClient as unknown as {
  updatePassword: (o: typeof opts) => Promise<TwoFactorResult>;
}).updatePassword(opts);

export const setInitialPassword = (opts: {
  newPassword: string;
}) => (authClient as unknown as {
  setPassword: (o: typeof opts) => Promise<TwoFactorResult>;
}).setPassword(opts);

export const mapAuthUserToProfile = (user: AuthUser): Profile => {
  const u = user as UserWithFields;
  return {
    id:                  u.id,
    email:               u.email,
    first_name:          u.firstName ?? null,
    last_name:           u.lastName ?? null,
    avatar_url:          u.image ?? undefined,
    platform_role:       (u.platformRole ?? 'user') as Profile['platform_role'],
    is_active:           u.isActive ?? true,
    is_profile_complete: u.isProfileComplete ?? false,
    preferences:         typeof u.preferences === 'string'
                           ? JSON.parse(u.preferences)
                           : (u.preferences as Profile['preferences']),
  };
};
