import { createAuthClient } from 'better-auth/react';
import { inferAdditionalFields } from 'better-auth/client/plugins';
import type { Profile } from '@/types';

const API_URL = import.meta.env.VITE_API_URL as string;

export const authClient = createAuthClient({
  baseURL: `${API_URL}/api/auth`,
  plugins: [
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
