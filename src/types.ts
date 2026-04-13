// ---------------------------------------------------------------
// Platform-level roles (on the user account, not per-band)
// ---------------------------------------------------------------
export type PlatformRole = 'user' | 'platform_admin' | 'platform_support';

// ---------------------------------------------------------------
// Band-level roles (per band_membership row)
// ---------------------------------------------------------------
export type BandRole = 'owner' | 'manager' | 'member';

// ---------------------------------------------------------------
// Band (the multi-tenant unit)
// ---------------------------------------------------------------
export interface Band {
  id: string;
  name: string;
  description?: string | null;
  join_code: string;
  created_by: string;
  created_at: string;
  updated_at: string;
  deleted_at?: string | null;
}

// ---------------------------------------------------------------
// Band membership (user ↔ band join with per-band role)
// ---------------------------------------------------------------
export interface BandMembership {
  id: string;
  band_id: string;
  user_id: string;
  role: BandRole;
  position: string | null;
  is_approved: boolean;
  invited_by: string | null;
  joined_at: string | null;
  created_at: string;
  updated_at: string;
  deleted_at?: string | null;
  // Hydrated fields
  user?: Pick<Profile, 'id' | 'first_name' | 'last_name' | 'email' | 'avatar_url'>;
}

// ---------------------------------------------------------------
// Band ban
// ---------------------------------------------------------------
export interface BandBan {
  id: string;
  band_id: string;
  user_id: string;
  banned_by: string;
  reason: string | null;
  banned_at: string;
}

// ---------------------------------------------------------------
// Song
// ---------------------------------------------------------------
export interface Song {
  id: string;
  band_id: string;
  artist: string;
  title: string;
  lyrics: string;
  key: string;
  tempo: string;
  duration: string;
  note: string;
  cover_url?: string;
  spotify_url?: string;
  is_retired?: boolean;
  created_by?: string;
  last_updated_by?: string;
  created_at?: string;
  updated_at?: string;
  deleted_at?: string | null;
  deleted_by?: string | null;
  version: number;
}

// ---------------------------------------------------------------
// SetSong
// ---------------------------------------------------------------
export interface SetSong {
  id: string;
  band_id: string;
  position: number;
  songId: string;
  song_id?: string;
  set_id: string;
  song?: Song;
  created_by?: string;
  deleted_at?: string | null;
  deleted_by?: string | null;
  version: number;
}

// ---------------------------------------------------------------
// Set
// ---------------------------------------------------------------
export interface Set {
  id: string;
  band_id: string;
  name: string;
  position: number;
  setlist_id: string;
  songs: SetSong[];
  created_by?: string;
  deleted_at?: string | null;
  deleted_by?: string | null;
  version: number;
}

// ---------------------------------------------------------------
// Setlist
// ---------------------------------------------------------------
export interface Setlist {
  id: string;
  band_id: string;
  name: string;
  is_personal: boolean;
  is_default: boolean;
  created_at?: string;
  updated_at?: string;
  created_by?: string;
  last_updated_by?: string;
  sets: Set[];
  deleted_at?: string | null;
  deleted_by?: string | null;
  version: number;
}

// ---------------------------------------------------------------
// Gig
// ---------------------------------------------------------------
export interface Gig {
  id: string;
  band_id: string;
  name: string;
  start_time: string;
  end_time: string | null;
  notes: string;
  setlist_id: string | null;
  setlist?: Pick<Setlist, 'id' | 'name'>;
  venue_name?: string;
  address?: string;
  city?: string;
  state?: string;
  zip?: string;
  created_by?: string;
  last_updated_by?: string;
  deleted_at?: string | null;
  deleted_by?: string | null;
  cancelled_at?: string | null;
  cancellation_reason?: string | null;
  version: number;
}

// ---------------------------------------------------------------
// Gig Session
// ---------------------------------------------------------------
export interface GigSession {
  id: string;
  band_id: string;
  gig_id: string;
  leader_id: string;
  current_set_index: number;
  current_song_index: number;
  adhoc_song_id: string | null;
  is_active: boolean;
  is_on_break: boolean;
  started_at: string;
  last_heartbeat: string;
  ended_at?: string | null;
  version: number;
  participant_ids?: string[];
  leader_name?: string;
}

// ---------------------------------------------------------------
// Gig Session Participant
// ---------------------------------------------------------------
export interface GigSessionParticipant {
  id: string;
  band_id: string;
  session_id: string;
  user_id: string;
  last_seen: string;
  profile?: {
    first_name: string | null;
    last_name: string | null;
    position: string | null;
    email?: string | null;
  };
  version: number;
}

// ---------------------------------------------------------------
// User preferences
// ---------------------------------------------------------------
export interface UserPreferences {
  tempo_blinker_enabled?: boolean;
  tempo_blinker_color?: string;
  performance_view?: 'full' | 'simple';
  metronome_click_sound?: 'click1' | 'click2' | 'click3' | 'click4' | 'click5';
}

// ---------------------------------------------------------------
// Profile — represents the authenticated user
// In the new design, profile fields come from the BetterAuth `user` table
// Band-specific role/position comes from the active BandMembership
// ---------------------------------------------------------------
export interface Profile {
  id: string;
  email?: string | null;
  first_name: string | null;
  last_name: string | null;
  avatar_url?: string;
  platform_role: PlatformRole;
  is_active: boolean;
  is_profile_complete?: boolean;
  preferences?: UserPreferences;
  deleted_at?: string | null;
}

// ---------------------------------------------------------------
// Legacy alias — keeps old code working during migration
// ---------------------------------------------------------------
export type UserRole = BandRole;
