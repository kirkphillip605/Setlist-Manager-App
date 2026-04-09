import { useStore } from '@/lib/store';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useCallback } from 'react';
import { useBand } from '@/context/BandContext';
import { getAllSkippedSongs } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { authClient } from '@/lib/authClient';

// ── Sync Manager ──────────────────────────────────────────────────

export const useSyncManager = () => {
  const { isPending } = authClient.useSession();
  const initialize     = useStore(state => state.initialize);
  const syncAllDeltas  = useStore(state => state.syncAllDeltas);
  const setOnlineStatus = useStore(state => state.setOnlineStatus);
  const isInitialized  = useStore(state => state.isInitialized);

  // Boot on first authenticated mount
  useEffect(() => {
    if (!isPending && !isInitialized) {
      void initialize();
    }
  }, [isPending, isInitialized, initialize]);

  // Online/offline + visibility listeners
  useEffect(() => {
    const handleOnline = () => {
      setOnlineStatus(true);
      void syncAllDeltas();
    };
    const handleOffline = () => setOnlineStatus(false);
    const handleVisibility = () => {
      if (document.visibilityState === 'visible' && navigator.onLine) {
        void syncAllDeltas();
      }
    };
    const interval = setInterval(() => {
      if (navigator.onLine && document.visibilityState === 'visible') {
        void syncAllDeltas();
      }
    }, 5 * 60 * 1000);

    window.addEventListener('online',  handleOnline);
    window.addEventListener('offline', handleOffline);
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      window.removeEventListener('online',  handleOnline);
      window.removeEventListener('offline', handleOffline);
      document.removeEventListener('visibilitychange', handleVisibility);
      clearInterval(interval);
    };
  }, [syncAllDeltas, setOnlineStatus]);

  return { runDeltaSync: syncAllDeltas, initialize };
};

// ── Band Slice accessor ───────────────────────────────────────────

export const useBandSlice = (bandId: string | null) => {
  const getBandSlice = useStore(state => state.getBandSlice);
  return bandId ? getBandSlice(bandId) : null;
};

// ── Active-band aware selectors ───────────────────────────────────

const activeFilter = (item: any) => !item.deleted_at;

export const useSyncedSongs = () => {
  const { activeBandId } = useBand();
  const bandData  = useStore(state => state.bandData);
  const songsMap  = bandData[activeBandId ?? '']?.songs ?? {};

  const data = useMemo(
    () => Object.values(songsMap).filter(activeFilter).sort((a, b) => a.title.localeCompare(b.title)),
    [songsMap]
  );
  return { data, isLoading: false };
};

export const useSyncedGigs = () => {
  const { activeBandId } = useBand();
  const bandData   = useStore(state => state.bandData);
  const slice      = bandData[activeBandId ?? ''];
  const gigsMap    = slice?.gigs ?? {};
  const setlistsMap = slice?.setlists ?? {};

  const data = useMemo(() =>
    Object.values(gigsMap)
      .filter(activeFilter)
      .map(gig => ({
        ...gig,
        setlist: gig.setlist_id ? (setlistsMap[gig.setlist_id] as any) : undefined,
      }))
      .sort((a, b) => a.start_time.localeCompare(b.start_time)),
    [gigsMap, setlistsMap]
  );
  return { data, isLoading: false };
};

export const useSyncedSetlists = () => {
  const { activeBandId } = useBand();
  const bandData    = useStore(state => state.bandData);
  const slice       = bandData[activeBandId ?? ''];
  const setlistsMap = slice?.setlists ?? {};
  const setsMap     = slice?.sets     ?? {};
  const setSongsMap = slice?.set_songs ?? {};
  const songsMap    = slice?.songs    ?? {};

  const data = useMemo(() => {
    return Object.values(setlistsMap)
      .filter(activeFilter)
      .map(list => {
        const listSets = Object.values(setsMap)
          .filter((s: any) => s.setlist_id === list.id && !s.deleted_at)
          .sort((a: any, b: any) => a.position - b.position);

        const hydratedSets = listSets.map((set: any) => {
          const listSetSongs = Object.values(setSongsMap)
            .filter((ss: any) => ss.set_id === set.id && !ss.deleted_at)
            .sort((a: any, b: any) => a.position - b.position);

          const songs = listSetSongs.map((ss: any) => ({
            id:       ss.id,
            position: ss.position,
            songId:   ss.song_id ?? ss.songId,
            set_id:   ss.set_id,
            song_id:  ss.song_id,
            song:     songsMap[ss.song_id ?? ss.songId] ?? undefined,
            version:  ss.version ?? 0,
          }));

          return { ...set, songs, version: set.version ?? 0 };
        });

        return { ...list, sets: hydratedSets };
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [setlistsMap, setsMap, setSongsMap, songsMap]);

  return { data, isLoading: false };
};

export const useSyncedSkippedSongs = () => {
  const { activeBandId } = useBand();
  const { user } = useAuth();

  return useQuery({
    queryKey: ['skipped_songs', activeBandId],
    queryFn:  () => getAllSkippedSongs(activeBandId!),
    enabled:  !!user && !!activeBandId,
    staleTime: Infinity,
    gcTime:    Infinity,
  });
};

// ── Legacy aliases ────────────────────────────────────────────────
export const useAllSongs     = useSyncedSongs;
export const useAllSetlists  = useSyncedSetlists;

// ── Hydration helpers ─────────────────────────────────────────────

export const useSetlistWithSongs = (setlistId?: string) => {
  const { data: setlists } = useSyncedSetlists();
  return useMemo(() => {
    if (!setlistId) return null;
    return setlists.find(s => s.id === setlistId) ?? null;
  }, [setlistId, setlists]);
};

export const useSongFromCache = (songId?: string) => {
  const { activeBandId } = useBand();
  const bandData = useStore(state => state.bandData);
  const songsMap = bandData[activeBandId ?? '']?.songs ?? {};
  return useMemo(() => (songId ? (songsMap[songId] ?? null) : null), [songId, songsMap]);
};

// ── Sync status ───────────────────────────────────────────────────

export const useSyncStatus = () => {
  const { runDeltaSync } = useSyncManager();
  const isSyncing        = useStore(state => state.isSyncing);
  const { activeBandId } = useBand();
  const bandData         = useStore(state => state.bandData);
  const lastSyncedAt     = bandData[activeBandId ?? '']?.lastSyncedAt ?? null;
  const queryClient      = useQueryClient();

  const refreshAll = useCallback(async () => {
    await runDeltaSync();
    queryClient.invalidateQueries({ queryKey: ['skipped_songs', activeBandId] });
  }, [runDeltaSync, queryClient, activeBandId]);

  return {
    isSyncing,
    lastSyncedAt: lastSyncedAt ? new Date(lastSyncedAt).getTime() : 0,
    refreshAll,
  };
};
