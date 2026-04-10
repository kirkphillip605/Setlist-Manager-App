import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useMemo,
} from 'react';
import { useAuth } from './AuthContext';
import { apiGet } from '@/lib/apiFetch';
import { storageAdapter } from '@/lib/storageAdapter';
import type { Band, BandMembership, BandRole } from '@/types';

export interface BandWithMembership extends Band {
  membership: BandMembership;
}

interface BandContextType {
  bands:          BandWithMembership[];
  activeBandId:   string | null;
  activeBand:     BandWithMembership | null;
  activeBandRole: BandRole | null;
  isOwner:        boolean;
  isManager:      boolean;
  isMember:       boolean;
  bandsLoading:   boolean;
  noBands:        boolean;
  setActiveBand:  (bandId: string) => void;
  refreshBands:   () => Promise<void>;
}

const ACTIVE_BAND_KEY = 'setlistpro-active-band';

const BandContext = createContext<BandContextType>({
  bands:          [],
  activeBandId:   null,
  activeBand:     null,
  activeBandRole: null,
  isOwner:        false,
  isManager:      false,
  isMember:       false,
  bandsLoading:   true,
  noBands:        false,
  setActiveBand:  () => {},
  refreshBands:   async () => {},
});

export const BandProvider = ({ children }: { children: React.ReactNode }) => {
  const { user, loading: authLoading } = useAuth();
  const [bands, setBands]               = useState<BandWithMembership[]>([]);
  const [activeBandId, setActiveBandId] = useState<string | null>(null);
  const [bandsLoading, setBandsLoading] = useState(true);

  const userId = user?.id ?? null;

  const refreshBands = useCallback(async () => {
    if (!userId) {
      setBands([]);
      setBandsLoading(false);
      return;
    }

    try {
      const data = await apiGet<BandWithMembership[]>('/api/bands');
      setBands(data ?? []);

      const savedId = await storageAdapter.getItem(ACTIVE_BAND_KEY);
      const validId = data?.find(b => b.id === savedId)?.id ?? data?.[0]?.id ?? null;
      setActiveBandId(validId);
    } catch (err) {
      console.error('[BandContext] Failed to fetch bands:', err);
    } finally {
      setBandsLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    if (!authLoading) {
      void refreshBands();
    }
  }, [authLoading, refreshBands]);

  const setActiveBand = useCallback((bandId: string) => {
    setActiveBandId(bandId);
    void storageAdapter.setItem(ACTIVE_BAND_KEY, bandId);
  }, []);

  const activeBand = useMemo(
    () => bands.find(b => b.id === activeBandId) ?? null,
    [bands, activeBandId]
  );

  const activeBandRole: BandRole | null = activeBand?.membership?.role ?? null;
  const isOwner   = activeBandRole === 'owner';
  const isManager = activeBandRole === 'owner' || activeBandRole === 'manager';
  const isMember  = !!activeBandRole;
  const noBands   = !bandsLoading && !authLoading && !!userId && bands.length === 0;

  const value: BandContextType = {
    bands,
    activeBandId,
    activeBand,
    activeBandRole,
    isOwner,
    isManager,
    isMember,
    bandsLoading,
    noBands,
    setActiveBand,
    refreshBands,
  };

  return <BandContext.Provider value={value}>{children}</BandContext.Provider>;
};

export const useBand = () => {
  const ctx = useContext(BandContext);
  if (ctx === undefined) throw new Error('useBand must be used within a BandProvider');
  return ctx;
};
