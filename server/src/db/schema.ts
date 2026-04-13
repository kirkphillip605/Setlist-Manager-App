import {
  pgTable, text, boolean, timestamp, uuid, integer, bigint, jsonb, char, unique
} from 'drizzle-orm/pg-core';

// ---------------------------------------------------------------
// BetterAuth tables — camelCase columns per BetterAuth spec
// ---------------------------------------------------------------
export const users = pgTable('user', {
  id:            text('id').primaryKey(),
  name:          text('name').notNull(),
  email:         text('email').notNull().unique(),
  emailVerified: boolean('emailVerified').notNull().default(false),
  image:         text('image'),
  createdAt:     timestamp('createdAt').notNull().defaultNow(),
  updatedAt:     timestamp('updatedAt').notNull().defaultNow(),
  // Extended fields
  firstName:    text('firstName'),
  lastName:     text('lastName'),
  phone:        text('phone'),
  phoneVerified: boolean('phoneVerified').default(false),
  platformRole:      text('platformRole').notNull().default('user'),
  isActive:          boolean('isActive').notNull().default(true),
  isProfileComplete: boolean('isProfileComplete').notNull().default(false),
  preferences:       jsonb('preferences').default({}),
});

export const twoFactors = pgTable('twoFactor', {
  id:          text('id').primaryKey(),
  secret:      text('secret').notNull(),
  backupCodes: text('backupCodes').notNull(),
  userId:      text('userId').notNull().references(() => users.id, { onDelete: 'cascade' }).unique(),
});

export const sessions = pgTable('session', {
  id:        text('id').primaryKey(),
  expiresAt: timestamp('expiresAt').notNull(),
  token:     text('token').notNull().unique(),
  createdAt: timestamp('createdAt').notNull().defaultNow(),
  updatedAt: timestamp('updatedAt').notNull().defaultNow(),
  ipAddress: text('ipAddress'),
  userAgent: text('userAgent'),
  userId:    text('userId').notNull().references(() => users.id, { onDelete: 'cascade' }),
});

export const accounts = pgTable('account', {
  id:                    text('id').primaryKey(),
  accountId:             text('accountId').notNull(),
  providerId:            text('providerId').notNull(),
  userId:                text('userId').notNull().references(() => users.id, { onDelete: 'cascade' }),
  accessToken:           text('accessToken'),
  refreshToken:          text('refreshToken'),
  idToken:               text('idToken'),
  accessTokenExpiresAt:  timestamp('accessTokenExpiresAt'),
  refreshTokenExpiresAt: timestamp('refreshTokenExpiresAt'),
  scope:                 text('scope'),
  password:              text('password'),
  createdAt:             timestamp('createdAt').notNull().defaultNow(),
  updatedAt:             timestamp('updatedAt').notNull().defaultNow(),
});

export const verifications = pgTable('verification', {
  id:         text('id').primaryKey(),
  identifier: text('identifier').notNull(),
  value:      text('value').notNull(),
  expiresAt:  timestamp('expiresAt').notNull(),
  createdAt:  timestamp('createdAt').defaultNow(),
  updatedAt:  timestamp('updatedAt').defaultNow(),
});

// ---------------------------------------------------------------
// Multi-tenant tables
// ---------------------------------------------------------------
export const bands = pgTable('bands', {
  id:          uuid('id').primaryKey().defaultRandom(),
  name:        text('name').notNull(),
  description: text('description'),
  joinCode:    char('join_code', { length: 6 }).notNull().unique(),
  createdBy:   text('created_by').notNull().references(() => users.id),
  createdAt:   timestamp('created_at').notNull().defaultNow(),
  updatedAt:   timestamp('updated_at').notNull().defaultNow(),
  deletedAt:   timestamp('deleted_at'),
  deletedBy:   text('deleted_by').references(() => users.id),
});

export const bandMemberships = pgTable('band_memberships', {
  id:         uuid('id').primaryKey().defaultRandom(),
  bandId:     uuid('band_id').notNull().references(() => bands.id, { onDelete: 'cascade' }),
  userId:     text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  role:       text('role').notNull().default('member'),
  position:   text('position'),
  isApproved: boolean('is_approved').notNull().default(false),
  invitedBy:  text('invited_by').references(() => users.id),
  joinedAt:   timestamp('joined_at'),
  createdAt:  timestamp('created_at').notNull().defaultNow(),
  updatedAt:  timestamp('updated_at').notNull().defaultNow(),
  deletedAt:  timestamp('deleted_at'),
}, (t) => [unique().on(t.bandId, t.userId)]);

export const bandBans = pgTable('band_bans', {
  id:       uuid('id').primaryKey().defaultRandom(),
  bandId:   uuid('band_id').notNull().references(() => bands.id, { onDelete: 'cascade' }),
  userId:   text('user_id').notNull().references(() => users.id),
  bannedBy: text('banned_by').notNull().references(() => users.id),
  reason:   text('reason'),
  bannedAt: timestamp('banned_at').notNull().defaultNow(),
});

// ---------------------------------------------------------------
// Data tables
// ---------------------------------------------------------------
export const songs = pgTable('songs', {
  id:            uuid('id').primaryKey().defaultRandom(),
  bandId:        uuid('band_id').notNull().references(() => bands.id, { onDelete: 'cascade' }),
  title:         text('title').notNull(),
  artist:        text('artist').notNull(),
  lyrics:        text('lyrics').notNull().default(''),
  key:           text('key').notNull().default(''),
  tempo:         text('tempo').notNull().default(''),
  duration:      text('duration').notNull().default(''),
  note:          text('note').notNull().default(''),
  coverUrl:      text('cover_url'),
  spotifyUrl:    text('spotify_url'),
  isRetired:     boolean('is_retired').notNull().default(false),
  createdBy:     text('created_by').references(() => users.id),
  lastUpdatedBy: text('last_updated_by').references(() => users.id),
  createdAt:     timestamp('created_at').notNull().defaultNow(),
  updatedAt:     timestamp('updated_at').notNull().defaultNow(),
  deletedAt:     timestamp('deleted_at'),
  deletedBy:     text('deleted_by').references(() => users.id),
  version:       bigint('version', { mode: 'number' }).notNull().default(0),
});

export const setlists = pgTable('setlists', {
  id:            uuid('id').primaryKey().defaultRandom(),
  bandId:        uuid('band_id').notNull().references(() => bands.id, { onDelete: 'cascade' }),
  name:          text('name').notNull(),
  isPersonal:    boolean('is_personal').notNull().default(false),
  isDefault:     boolean('is_default').notNull().default(false),
  createdBy:     text('created_by').references(() => users.id),
  lastUpdatedBy: text('last_updated_by').references(() => users.id),
  createdAt:     timestamp('created_at').notNull().defaultNow(),
  updatedAt:     timestamp('updated_at').notNull().defaultNow(),
  deletedAt:     timestamp('deleted_at'),
  deletedBy:     text('deleted_by').references(() => users.id),
  version:       bigint('version', { mode: 'number' }).notNull().default(0),
});

export const sets = pgTable('sets', {
  id:        uuid('id').primaryKey().defaultRandom(),
  bandId:    uuid('band_id').notNull().references(() => bands.id, { onDelete: 'cascade' }),
  setlistId: uuid('setlist_id').notNull().references(() => setlists.id, { onDelete: 'cascade' }),
  name:      text('name').notNull(),
  position:  integer('position').notNull(),
  createdBy: text('created_by').references(() => users.id),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
  deletedAt: timestamp('deleted_at'),
  deletedBy: text('deleted_by').references(() => users.id),
  version:   bigint('version', { mode: 'number' }).notNull().default(0),
});

export const setSongs = pgTable('set_songs', {
  id:        uuid('id').primaryKey().defaultRandom(),
  bandId:    uuid('band_id').notNull().references(() => bands.id, { onDelete: 'cascade' }),
  setId:     uuid('set_id').notNull().references(() => sets.id, { onDelete: 'cascade' }),
  songId:    uuid('song_id').notNull().references(() => songs.id),
  position:  integer('position').notNull(),
  createdBy: text('created_by').references(() => users.id),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
  deletedAt: timestamp('deleted_at'),
  deletedBy: text('deleted_by').references(() => users.id),
  version:   bigint('version', { mode: 'number' }).notNull().default(0),
});

export const gigs = pgTable('gigs', {
  id:                 uuid('id').primaryKey().defaultRandom(),
  bandId:             uuid('band_id').notNull().references(() => bands.id, { onDelete: 'cascade' }),
  name:               text('name').notNull(),
  startTime:          timestamp('start_time').notNull(),
  endTime:            timestamp('end_time'),
  notes:              text('notes').notNull().default(''),
  setlistId:          uuid('setlist_id').references(() => setlists.id),
  venueName:          text('venue_name'),
  address:            text('address'),
  city:               text('city'),
  state:              text('state'),
  zip:                text('zip'),
  createdBy:          text('created_by').references(() => users.id),
  lastUpdatedBy:      text('last_updated_by').references(() => users.id),
  createdAt:          timestamp('created_at').notNull().defaultNow(),
  updatedAt:          timestamp('updated_at').notNull().defaultNow(),
  deletedAt:          timestamp('deleted_at'),
  deletedBy:          text('deleted_by').references(() => users.id),
  cancelledAt:        timestamp('cancelled_at'),
  cancellationReason: text('cancellation_reason'),
  version:            bigint('version', { mode: 'number' }).notNull().default(0),
});

export const gigSessions = pgTable('gig_sessions', {
  id:               uuid('id').primaryKey().defaultRandom(),
  bandId:           uuid('band_id').notNull().references(() => bands.id, { onDelete: 'cascade' }),
  gigId:            uuid('gig_id').notNull().references(() => gigs.id, { onDelete: 'cascade' }),
  leaderId:         text('leader_id').notNull().references(() => users.id),
  currentSetIndex:  integer('current_set_index').notNull().default(0),
  currentSongIndex: integer('current_song_index').notNull().default(0),
  adhocSongId:      uuid('adhoc_song_id').references(() => songs.id),
  isActive:         boolean('is_active').notNull().default(true),
  isOnBreak:        boolean('is_on_break').notNull().default(false),
  startedAt:        timestamp('started_at').notNull().defaultNow(),
  lastHeartbeat:    timestamp('last_heartbeat').notNull().defaultNow(),
  endedAt:          timestamp('ended_at'),
  version:          bigint('version', { mode: 'number' }).notNull().default(0),
});

export const gigSessionParticipants = pgTable('gig_session_participants', {
  id:        uuid('id').primaryKey().defaultRandom(),
  bandId:    uuid('band_id').notNull().references(() => bands.id, { onDelete: 'cascade' }),
  sessionId: uuid('session_id').notNull().references(() => gigSessions.id, { onDelete: 'cascade' }),
  userId:    text('user_id').notNull().references(() => users.id),
  lastSeen:  timestamp('last_seen').notNull().defaultNow(),
  version:   bigint('version', { mode: 'number' }).notNull().default(0),
}, (t) => [unique().on(t.sessionId, t.userId)]);

export const gigSkippedSongs = pgTable('gig_skipped_songs', {
  id:        uuid('id').primaryKey().defaultRandom(),
  bandId:    uuid('band_id').notNull().references(() => bands.id, { onDelete: 'cascade' }),
  gigId:     uuid('gig_id').notNull().references(() => gigs.id, { onDelete: 'cascade' }),
  songId:    uuid('song_id').notNull().references(() => songs.id),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
  version:   bigint('version', { mode: 'number' }).notNull().default(0),
}, (t) => [unique().on(t.gigId, t.songId)]);

export const leadershipRequests = pgTable('leadership_requests', {
  id:          uuid('id').primaryKey().defaultRandom(),
  bandId:      uuid('band_id').notNull().references(() => bands.id, { onDelete: 'cascade' }),
  sessionId:   uuid('session_id').notNull().references(() => gigSessions.id, { onDelete: 'cascade' }),
  requesterId: text('requester_id').notNull().references(() => users.id),
  status:      text('status').notNull().default('pending'),
  createdAt:   timestamp('created_at').notNull().defaultNow(),
  updatedAt:   timestamp('updated_at').notNull().defaultNow(),
  version:     bigint('version', { mode: 'number' }).notNull().default(0),
});
