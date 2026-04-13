import React, { createContext, useContext, useCallback, useEffect, useState, useRef } from 'react';
import { authClient, mapAuthUserToProfile } from '@/lib/authClient';
import type { AuthUser } from '@/lib/authClient';
import { useQueryClient } from '@tanstack/react-query';
import { clear as clearIdb } from 'idb-keyval';
import { Capacitor } from '@capacitor/core';
import { Preferences } from '@capacitor/preferences';
import { storageAdapter } from '@/lib/storageAdapter';
import { useStore } from '@/lib/store';
import type { Profile, Setlist } from '@/types';

const AUTH_CACHE_KEY = 'cached_auth_user';

interface AuthContextType {
  user:           AuthUser | null;
  profile:        Profile | null;
  loading:        boolean;
  isAdmin:        boolean;
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
  canEditSetlist: () => false,
  signOut:        async () => {},
  refreshProfile: async () => {},
  checkSession:   async () => {},
});

let inflightSessionPromise: Promise<AuthUser | null> | null = null;

function deduplicatedGetSession(): Promise<AuthUser | null> {
  if (inflightSessionPromise) return inflightSessionPromise;

  inflightSessionPromise = authClient.getSession()
    .then(({ data }) => data?.user ?? null)
    .catch(() => null)
    .finally(() => { inflightSessionPromise = null; });

  return inflightSessionPromise;
}

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isPending, setIsPending] = useState(true);
  const [hasCachedUser, setHasCachedUser] = useState(false);
  const queryClient  = useQueryClient();
  const resetStore   = useStore(state => state.reset);
  const initializedRef = useRef(false);

  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;

    storageAdapter.getItem(AUTH_CACHE_KEY).then(cached => {
      if (cached) {
        try {
          const parsed = JSON.parse(cached);
          setUser(parsed);
          setHasCachedUser(true);
          setIsPending(false);
        } catch {}
      }
    }).catch(() => {});

    deduplicatedGetSession().then(sessionUser => {
      setUser(sessionUser);
      setIsPending(false);
      setHasCachedUser(false);
      if (sessionUser) {
        storageAdapter.setItem(AUTH_CACHE_KEY, JSON.stringify(sessionUser)).catch(() => {});
      } else {
        storageAdapter.removeItem(AUTH_CACHE_KEY).catch(() => {});
      }
    });
  }, []);

  const profile = user ? mapAuthUserToProfile(user) : null;

  const refreshProfile = useCallback(async () => {
    const sessionUser = await deduplicatedGetSession();
    setUser(sessionUser);
    if (sessionUser) {
      storageAdapter.setItem(AUTH_CACHE_KEY, JSON.stringify(sessionUser)).catch(() => {});
    }
  }, []);

  const handleSignOut = useCallback(async () => {
    try {
      await authClient.signOut();
    } catch (e) {
      console.error('[Auth] signOut failed:', e);
    }

    setUser(null);

    try {
      await storageAdapter.removeItem(AUTH_CACHE_KEY);
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
    const sessionUser = await deduplicatedGetSession();
    setUser(sessionUser);
    if (sessionUser) {
      storageAdapter.setItem(AUTH_CACHE_KEY, JSON.stringify(sessionUser)).catch(() => {});
    } else {
      storageAdapter.removeItem(AUTH_CACHE_KEY).catch(() => {});
    }
  }, []);

  const isAdmin      = profile?.platformRole === 'platform_admin';

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
