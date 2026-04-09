import { apiGet, apiPost, apiPut, apiPatch, apiDel, apiFetch } from '@/lib/apiFetch';
import type { Song, Setlist, Gig, GigSession, Set as SetType, SetSong } from '@/types';

// ── Version helper ────────────────────────────────────────────────

export const getCurrentGlobalVersion = async (bandId: string): Promise<number> => {
  try {
    const res = await apiGet<{ version: number }>(`/api/sync/version?band_id=${bandId}`);
    return res.version;
  } catch {
    return Number.MAX_SAFE_INTEGER;
  }
};

// ── Songs ─────────────────────────────────────────────────────────

export const getSongs = (bandId: string) =>
  apiGet<Song[]>(`/api/bands/${bandId}/songs`);

export const getSong = (bandId: string, id: string) =>
  apiGet<Song | null>(`/api/bands/${bandId}/songs/${id}`);

export const saveSong = async (bandId: string, song: Partial<Song>): Promise<Song> => {
  if (song.id) {
    return apiPut<Song>(`/api/bands/${bandId}/songs/${song.id}`, song);
  }
  return apiPost<Song>(`/api/bands/${bandId}/songs`, song);
};

export const deleteSong = (bandId: string, id: string) =>
  apiDel(`/api/bands/${bandId}/songs/${id}`);

export const getSongUsage = (bandId: string, songId: string) =>
  apiGet<{ setlistName: string }[]>(`/api/bands/${bandId}/songs/${songId}/usage`);

// ── Gigs ──────────────────────────────────────────────────────────

export const getGigs = (bandId: string) =>
  apiGet<Gig[]>(`/api/bands/${bandId}/gigs`);

export const getGig = (bandId: string, id: string) =>
  apiGet<Gig | null>(`/api/bands/${bandId}/gigs/${id}`);

export const saveGig = async (bandId: string, gig: Partial<Gig>): Promise<Gig> => {
  if (gig.id) {
    return apiPut<Gig>(`/api/bands/${bandId}/gigs/${gig.id}`, gig);
  }
  return apiPost<Gig>(`/api/bands/${bandId}/gigs`, gig);
};

export const cancelGig = (bandId: string, id: string, reason?: string) =>
  apiPost(`/api/bands/${bandId}/gigs/${id}/cancel`, { reason });

export const deleteGig = (bandId: string, id: string) =>
  apiDel(`/api/bands/${bandId}/gigs/${id}`);

export const searchVenues = (query: string) =>
  apiGet<any[]>(`/api/venues/search?q=${encodeURIComponent(query)}`);

// ── Skipped Songs ─────────────────────────────────────────────────

export const addSkippedSong = (bandId: string, gigId: string, songId: string) =>
  apiPost(`/api/bands/${bandId}/gigs/${gigId}/skipped-songs`, { song_id: songId });

export const getSkippedSongs = (bandId: string, gigId: string) =>
  apiGet<Song[]>(`/api/bands/${bandId}/gigs/${gigId}/skipped-songs`);

export const getAllSkippedSongs = (bandId: string) =>
  apiGet<any[]>(`/api/bands/${bandId}/gigs/skipped-songs`);

export const removeSkippedSong = (bandId: string, gigId: string, songId: string) =>
  apiDel(`/api/bands/${bandId}/gigs/${gigId}/skipped-songs/${songId}`);

// ── Setlists ──────────────────────────────────────────────────────

export const getSetlists = (bandId: string) =>
  apiGet<Setlist[]>(`/api/bands/${bandId}/setlists`);

export const getSetlist = (bandId: string, id: string) =>
  apiGet<Setlist | null>(`/api/bands/${bandId}/setlists/${id}`);

export const getSetlistUsage = (bandId: string, setlistId: string) =>
  apiGet<Gig[]>(`/api/bands/${bandId}/setlists/${setlistId}/usage`);

export const createSetlist = (bandId: string, name: string, isPersonal = false, isDefault = false) =>
  apiPost<Setlist>(`/api/bands/${bandId}/setlists`, { name, is_personal: isPersonal, is_default: isDefault });

export const updateSetlist = (bandId: string, id: string, updates: Partial<Setlist>) =>
  apiPut<Setlist>(`/api/bands/${bandId}/setlists/${id}`, updates);

export const deleteSetlist = (bandId: string, id: string) =>
  apiDel(`/api/bands/${bandId}/setlists/${id}`);

export const cloneSetlist = (bandId: string, sourceId: string, newName: string, isPersonal: boolean) =>
  apiPost<{ id: string }>(`/api/bands/${bandId}/setlists/${sourceId}/clone`, { name: newName, is_personal: isPersonal });

export const convertSetlistToBand = (bandId: string, id: string) =>
  apiPatch(`/api/bands/${bandId}/setlists/${id}`, { is_personal: false });

export const syncSetlist = (bandId: string, setlist: Setlist) =>
  apiPost(`/api/bands/${bandId}/setlists/${setlist.id}/sync`, setlist);

// ── Gig Sessions ──────────────────────────────────────────────────

export const getGigSession = (bandId: string, gigId: string) =>
  apiGet<GigSession | null>(`/api/bands/${bandId}/gig-sessions?gig_id=${gigId}`);

export const getAllGigSessions = (bandId: string) =>
  apiGet<any[]>(`/api/bands/${bandId}/gig-sessions`);

export const createGigSession = (bandId: string, gigId: string, leaderId: string) =>
  apiPost<GigSession>(`/api/bands/${bandId}/gig-sessions`, { gig_id: gigId, leader_id: leaderId });

export const endGigSession = (bandId: string, sessionId: string) =>
  apiDel(`/api/bands/${bandId}/gig-sessions/${sessionId}`);

export const endAllSessions = (bandId: string) =>
  apiPost(`/api/bands/${bandId}/gig-sessions/end-all`);

export const cleanupStaleSessions = (bandId: string) =>
  apiPost(`/api/bands/${bandId}/gig-sessions/cleanup`);

export const joinGigSession = (bandId: string, sessionId: string) =>
  apiPost(`/api/bands/${bandId}/gig-sessions/${sessionId}/join`);

export const leaveGigSession = (bandId: string, sessionId: string) =>
  apiPost(`/api/bands/${bandId}/gig-sessions/${sessionId}/leave`);

export const sendHeartbeat = (bandId: string, sessionId: string, isLeader: boolean) =>
  apiPost(`/api/bands/${bandId}/gig-sessions/${sessionId}/heartbeat`, { is_leader: isLeader });

export const updateSessionState = (
  bandId: string,
  sessionId: string,
  state: {
    current_set_index?:  number;
    current_song_index?: number;
    adhoc_song_id?:      string | null;
    is_on_break?:        boolean;
  }
) => apiPatch(`/api/bands/${bandId}/gig-sessions/${sessionId}`, state);

export const requestLeadership = (bandId: string, sessionId: string) =>
  apiPost(`/api/bands/${bandId}/gig-sessions/${sessionId}/request-leadership`);

export const resolveLeadershipRequest = (bandId: string, requestId: string, status: 'approved' | 'denied') =>
  apiPost(`/api/bands/${bandId}/gig-sessions/leadership-requests/${requestId}/resolve`, { status });

export const forceLeadership = (bandId: string, sessionId: string, userId: string) =>
  apiPost(`/api/bands/${bandId}/gig-sessions/${sessionId}/force-leadership`, { user_id: userId });

// ── Delta fetch helper (used by legacy code paths) ────────────────

export const fetchDeltas = async (bandId: string, table: string, lastVersion: number) => {
  const res = await apiGet<any>(`/api/sync/delta?band_id=${bandId}&since_version=${lastVersion}`);
  return (res as any)?.[table] ?? [];
};

// ── Band management ───────────────────────────────────────────────

export const createBand = (name: string, description?: string) =>
  apiPost<{ id: string; name: string; join_code: string }>('/api/bands', { name, description });

export const joinBand = (joinCode: string) =>
  apiPost<{ bandId: string }>('/api/bands/join', { joinCode });

export const getBand = (bandId: string) =>
  apiGet<{ id: string; name: string; description: string | null; join_code: string }>(`/api/bands/${bandId}`);

export const updateBand = (bandId: string, updates: { name?: string; description?: string }) =>
  apiPatch<void>(`/api/bands/${bandId}`, updates);

export const getBandMembers = (bandId: string) =>
  apiGet<import('@/types').BandMembership[]>(`/api/bands/${bandId}/members`);

export const getPendingMembers = (bandId: string) =>
  apiGet<import('@/types').BandMembership[]>(`/api/bands/${bandId}/members/pending`);

export const approveMember = (bandId: string, membershipId: string) =>
  apiPost<void>(`/api/bands/${bandId}/members/${membershipId}/approve`);

export const denyMember = (bandId: string, membershipId: string) =>
  apiPost<void>(`/api/bands/${bandId}/members/${membershipId}/deny`);

export const updateMemberRole = (bandId: string, userId: string, role: import('@/types').BandRole, position?: string) =>
  apiPatch<void>(`/api/bands/${bandId}/members/${userId}`, { role, position });

export const removeMember = (bandId: string, userId: string) =>
  apiDel(`/api/bands/${bandId}/members/${userId}`);

export const regenerateJoinCode = (bandId: string) =>
  apiPost<{ joinCode: string }>(`/api/bands/${bandId}/regenerate-code`);

export const leaveBand = (bandId: string, userId: string) =>
  apiDel(`/api/bands/${bandId}/members/${userId}`);
