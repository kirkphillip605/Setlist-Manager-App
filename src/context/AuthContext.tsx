import React, { createContext, useContext, useCallback } from 'react';
import { authClient, mapAuthUserToProfile } from '@/lib/authClient';
import { useQueryClient } from '@tanstack/react-query';
import { clear as clearIdb } from 'idb-keyval';
import { Capacitor } from '@capacitor/core';
import { Preferences } from '@capacitor/preferences';
import { storageAdapter } from '@/lib/storageAdapter';
import { useStore } from '@/lib/store';
import type { Profile, Setlist } from '@/types';

interface AuthContextType {
  user:           ReturnType<typeof authClient.useSession>['data']['user'] | null;
  profile:        Profile | null;
  loading:        boolean;
  isAdmin:        boolean;
  isManager:      boolean;
  canManageGigs:  boolean;
  canEditSetlist: (setlist: Setlist, bandRole?: string) => boolean;
  signOut:        () => Promise<void>;
  refreshProfile: () => void;
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
  refreshProfile: () => {},
  checkSession:   async () => {},
});

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const { data: sessionData, isPending } = authClient.useSession();
  const queryClient  = useQueryClient();
  const resetStore   = useStore(state => state.reset);

  const user    = sessionData?.user ?? null;
  const profile = user ? mapAuthUserToProfile(user) : null;

  const handleSignOut = useCallback(async () => {
    try {
      await authClient.signOut();
    } catch (e) {
      console.error('[Auth] signOut failed:', e);
    }

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
    await authClient.getSession();
  }, []);

  const isAdmin      = profile?.platform_role === 'platform_admin';
  const isManager    = isAdmin; // Band-level manager comes from BandContext

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
    refreshProfile: () => authClient.getSession(),
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
