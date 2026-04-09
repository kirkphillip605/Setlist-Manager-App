import { createAuthClient } from 'better-auth/react';
import { inferAdditionalFields } from 'better-auth/client/plugins';
import { magicLinkClient } from 'better-auth/client/plugins';
import { emailOTPClient } from 'better-auth/client/plugins';
import { phoneNumberClient } from 'better-auth/client/plugins';
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

export const authClient = createAuthClient({
  baseURL: `${API_URL}/api/auth`,
  plugins: [
    emailAndPasswordClient(),
    magicLinkClient(),
    emailOTPClient(),
    phoneNumberClient(),
    inferAdditionalFields<{
      user: {
        firstName?: string;
        lastName?: string;
        phone?: string;
        phoneVerified?: boolean;
        platformRole?: string;
        isActive?: boolean;
        preferences?: string;
      };
    }>(),
  ],
});

export type AuthSession = typeof authClient.$Infer.Session;
export type AuthUser    = typeof authClient.$Infer.Session.user;

export const mapAuthUserToProfile = (user: AuthUser): Profile => ({
  id:            user.id,
  email:         user.email,
  first_name:    (user as any).firstName ?? null,
  last_name:     (user as any).lastName  ?? null,
  avatar_url:    user.image ?? undefined,
  platform_role: ((user as any).platformRole ?? 'user') as Profile['platform_role'],
  is_active:     (user as any).isActive ?? true,
  preferences:   typeof (user as any).preferences === 'string'
                   ? JSON.parse((user as any).preferences)
                   : (user as any).preferences,
});
