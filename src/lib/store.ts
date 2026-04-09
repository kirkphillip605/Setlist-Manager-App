import { create } from 'zustand';
import { storageAdapter } from '@/lib/storageAdapter';
import { wsClient } from '@/lib/wsClient';
import { apiFetch } from '@/lib/apiFetch';
import { queryClient } from '@/lib/queryClient';
import type { Song, Setlist, Gig, Set as SetType, SetSong, GigSession, GigSessionParticipant } from '@/types';

// ── Constants ─────────────────────────────────────────────────────

const DB_KEY = 'setlistpro-v2';

// ── Per-band data slice ───────────────────────────────────────────

export interface BandDataSlice {
  songs:                    Record<string, Song>;
  gigs:                     Record<string, Gig>;
  setlists:                 Record<string, Setlist>;
  sets:                     Record<string, SetType>;
  set_songs:                Record<string, SetSong>;
  gig_sessions:             Record<string, GigSession>;
  gig_session_participants: Record<string, GigSessionParticipant>;
  lastSyncedVersion:        number;
  lastSyncedAt:             string | null;
}

const emptyBandSlice = (): BandDataSlice => ({
  songs:                    {},
  gigs:                     {},
  setlists:                 {},
  sets:                     {},
  set_songs:                {},
  gig_sessions:             {},
  gig_session_participants: {},
  lastSyncedVersion:        0,
  lastSyncedAt:             null,
});

// ── App state ─────────────────────────────────────────────────────

interface AppState {
  bandData:       Record<string, BandDataSlice>;
  isInitialized:  boolean;
  isLoading:      boolean;
  isSyncing:      boolean;
  isOnline:       boolean;
  loadingMessage: string;
  loadingProgress: number;

  initialize:    () => Promise<void>;
  syncDelta:     (bandId: string) => Promise<void>;
  syncAllDeltas: () => Promise<void>;
  reset:         () => Promise<void>;
  setOnlineStatus: (status: boolean) => void;
  getBandSlice:  (bandId: string) => BandDataSlice;
}

// ── Store ─────────────────────────────────────────────────────────

export const useStore = create<AppState>((set, get) => ({
  bandData:        {},
  isInitialized:   false,
  isLoading:       true,
  isSyncing:       false,
  isOnline:        typeof navigator !== 'undefined' ? navigator.onLine : true,
  loadingMessage:  'Initializing...',
  loadingProgress: 0,

  setOnlineStatus: (status) => set({ isOnline: status }),

  getBandSlice: (bandId) => get().bandData[bandId] ?? emptyBandSlice(),

  initialize: async () => {
    if (get().isInitialized) return;

    try {
      set({ isLoading: true, loadingMessage: 'Loading local data...' });

      // 1. Load cached data from storage
      const cachedStr = await storageAdapter.getItem(DB_KEY);
      let hasData = false;

      if (cachedStr) {
        try {
          const cached = JSON.parse(cachedStr);
          if (cached?.bandData) {
            set({ bandData: cached.bandData });
            hasData = true;
          }
        } catch {
          console.warn('[Store] Failed to parse cached data');
        }
      }

      // 2. Unblock UI immediately if we have cached data
      if (hasData) set({ isInitialized: true, isLoading: false });

      // 3. Connect WebSocket
      wsClient.connect();
      wsClient.onDelta(async (bandId, _table, serverVersion) => {
        const slice = get().bandData[bandId];
        if (!slice || serverVersion > slice.lastSyncedVersion) {
          await get().syncDelta(bandId);
          queryClient.invalidateQueries({ queryKey: ['skipped_songs', bandId] });
        }
      });

      // 4. Fetch fresh data from server (bootstrap)
      if (get().isOnline) {
        set({ loadingMessage: 'Syncing data...' });
        await bootstrapFromServer(set, get);
        if (!get().isInitialized) set({ isInitialized: true, isLoading: false });
      } else {
        set({ isInitialized: true, isLoading: false });
      }
    } catch (err) {
      console.error('[Store] Initialization failed:', err);
      set({ isLoading: false, isInitialized: true, loadingMessage: 'Offline Mode' });
    }
  },

  syncDelta: async (bandId: string) => {
    if (!get().isOnline) return;

    const slice = get().bandData[bandId] ?? emptyBandSlice();
    const since = slice.lastSyncedVersion;

    try {
      const data = await apiFetch<any>(`/api/sync/delta?band_id=${bandId}&since_version=${since}`);
      if (!data) return;

      const merged = mergeSlice(slice, data);
      if (merged.lastSyncedVersion > since) {
        set(state => ({
          bandData: { ...state.bandData, [bandId]: merged },
        }));
        await persistBandData(get().bandData);
      }
    } catch (err) {
      console.warn(`[Store] Delta sync failed for band ${bandId}:`, err);
    }
  },

  syncAllDeltas: async () => {
    if (get().isSyncing || !get().isOnline) return;
    set({ isSyncing: true });
    try {
      await Promise.all(Object.keys(get().bandData).map(id => get().syncDelta(id)));
    } finally {
      set({ isSyncing: false });
    }
  },

  reset: async () => {
    wsClient.disconnect();
    await storageAdapter.removeItem(DB_KEY);
    set({
      bandData:       {},
      isInitialized:  false,
      isLoading:      true,
      isSyncing:      false,
      loadingMessage: 'Initializing...',
    });
  },
}));

// ── Helpers ───────────────────────────────────────────────────────

async function bootstrapFromServer(
  set: (partial: Partial<AppState> | ((s: AppState) => Partial<AppState>)) => void,
  get: () => AppState
) {
  try {
    const res = await apiFetch<{ bands: Record<string, any> }>('/api/sync/bootstrap');
    if (!res?.bands) return;

    const newBandData: Record<string, BandDataSlice> = { ...get().bandData };

    for (const [bandId, payload] of Object.entries(res.bands)) {
      newBandData[bandId] = buildSlice(payload);
    }

    set({ bandData: newBandData, isSyncing: false });
    await persistBandData(newBandData);
    console.log(`[Store] Bootstrap complete — ${Object.keys(newBandData).length} band(s)`);
  } catch (err) {
    console.warn('[Store] Bootstrap failed — using cache if available');
  }
}

function buildSlice(payload: any): BandDataSlice {
  const toMap = (arr: any[]) => Object.fromEntries((arr ?? []).map((r: any) => [r.id, r]));
  return {
    songs:                    toMap(payload.songs),
    gigs:                     toMap(payload.gigs),
    setlists:                 toMap(payload.setlists),
    sets:                     toMap(payload.sets),
    set_songs:                toMap(payload.set_songs),
    gig_sessions:             toMap(payload.gig_sessions),
    gig_session_participants: toMap(payload.gig_session_participants),
    lastSyncedVersion:        payload.version ?? 0,
    lastSyncedAt:             new Date().toISOString(),
  };
}

function mergeSlice(existing: BandDataSlice, delta: any): BandDataSlice {
  const merge = (current: Record<string, any>, rows: any[]) => {
    const out = { ...current };
    for (const row of rows ?? []) out[row.id] = { ...(out[row.id] ?? {}), ...row };
    return out;
  };

  const maxVer = (rows: any[]) =>
    rows?.reduce((max: number, r: any) => Math.max(max, r.version ?? 0), 0) ?? 0;

  const allRows = [
    ...(delta.songs ?? []),
    ...(delta.gigs ?? []),
    ...(delta.setlists ?? []),
    ...(delta.sets ?? []),
    ...(delta.set_songs ?? []),
    ...(delta.gig_sessions ?? []),
    ...(delta.gig_session_participants ?? []),
  ];

  const newVersion = Math.max(
    existing.lastSyncedVersion,
    delta.current_version ?? 0,
    maxVer(allRows)
  );

  return {
    songs:                    merge(existing.songs,                    delta.songs),
    gigs:                     merge(existing.gigs,                     delta.gigs),
    setlists:                 merge(existing.setlists,                 delta.setlists),
    sets:                     merge(existing.sets,                     delta.sets),
    set_songs:                merge(existing.set_songs,                delta.set_songs),
    gig_sessions:             merge(existing.gig_sessions,             delta.gig_sessions),
    gig_session_participants: merge(existing.gig_session_participants, delta.gig_session_participants),
    lastSyncedVersion:        newVersion,
    lastSyncedAt:             new Date().toISOString(),
  };
}

async function persistBandData(bandData: Record<string, BandDataSlice>) {
  try {
    await storageAdapter.setItem(DB_KEY, JSON.stringify({ bandData }));
  } catch {
    console.warn('[Store] Failed to persist band data');
  }
}

// ── Legacy shape (for compat during migration) ────────────────────
// Components that still read store.songs / store.gigs etc. will get
// data from the ACTIVE band if activeBandId is provided via BandContext.
// New components should use useBandSlice(bandId) directly.
