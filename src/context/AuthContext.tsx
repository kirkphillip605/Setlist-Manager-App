import React, { createContext, useContext, useCallback, useEffect, useState } from 'react';
import { authClient, mapAuthUserToProfile } from '@/lib/authClient';
import type { AuthUser } from '@/lib/authClient';
import { useQueryClient } from '@tanstack/react-query';
import { clear as clearIdb } from 'idb-keyval';
import { Capacitor } from '@capacitor/core';
import { Preferences } from '@capacitor/preferences';
import { storageAdapter } from '@/lib/storageAdapter';
import { useStore } from '@/lib/store';
import type { Profile, Setlist } from '@/types';

interface AuthContextType {
  user:           AuthUser | null;
  profile:        Profile | null;
  loading:        boolean;
  isAdmin:        boolean;
  isManager:      boolean;
  canManageGigs:  boolean;
  canEditSetlist: (setlist: Setlist, bandRole?: string) => boolean;
  signOut:        () => Promise<void>;
  refreshProfile: () => Promise<void>;
  checkSession:   () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user:           null,
  profile:        null,
  loading:        true,
  isAdmin:        false,
  isManager:      false,
  canManageGigs:  false,
  canEditSetlist: () => false,
  signOut:        async () => {},
  refreshProfile: async () => {},
  checkSession:   async () => {},
});

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isPending, setIsPending] = useState(true);
  const queryClient  = useQueryClient();
  const resetStore   = useStore(state => state.reset);

  useEffect(() => {
    let mounted = true;
    const hasKnownSession = sessionStorage.getItem('auth_active') === '1';
    if (!hasKnownSession && window.location.pathname === '/login') {
      setIsPending(false);
      return;
    }
    authClient.getSession().then(({ data }) => {
      if (mounted) {
        if (data?.user) {
          sessionStorage.setItem('auth_active', '1');
        } else {
          sessionStorage.removeItem('auth_active');
        }
        setUser(data?.user ?? null);
        setIsPending(false);
      }
    }).catch(() => {
      if (mounted) {
        sessionStorage.removeItem('auth_active');
        setIsPending(false);
      }
    });
    return () => { mounted = false; };
  }, []);

  const profile = user ? mapAuthUserToProfile(user) : null;

  const refreshProfile = useCallback(async () => {
    const { data } = await authClient.getSession();
    setUser(data?.user ?? null);
  }, []);

  const handleSignOut = useCallback(async () => {
    try {
      await authClient.signOut();
    } catch (e) {
      console.error('[Auth] signOut failed:', e);
    }

    setUser(null);
    sessionStorage.removeItem('auth_active');

    try {
      queryClient.removeQueries();
      queryClient.clear();
      await storageAdapter.removeItem('REACT_QUERY_OFFLINE_CACHE');
      await clearIdb();
      if (Capacitor.isNativePlatform()) {
        await Preferences.clear();
      } else {
        localStorage.clear();
      }
      await resetStore();
    } catch (e) {
      console.warn('[Auth] Failed to clear local cache during signout', e);
    }
  }, [queryClient, resetStore]);

  const checkSession = useCallback(async () => {
    const { data } = await authClient.getSession();
    if (data?.user) {
      sessionStorage.setItem('auth_active', '1');
    }
    setUser(data?.user ?? null);
  }, []);

  const isAdmin      = profile?.platform_role === 'platform_admin';
  const isManager    = isAdmin;

  const canManageGigs = isAdmin;

  const canEditSetlist = useCallback((setlist: Setlist, bandRole?: string) => {
    if (isAdmin) return true;
    if (setlist.created_by === user?.id) return true;
    if ((bandRole === 'owner' || bandRole === 'manager') && !setlist.is_personal) return true;
    return false;
  }, [isAdmin, user?.id]);

  const value: AuthContextType = {
    user,
    profile,
    loading:        isPending,
    isAdmin,
    isManager,
    canManageGigs,
    canEditSetlist,
    signOut:        handleSignOut,
    refreshProfile,
    checkSession,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (ctx === undefined) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
};
