# SetlistPRO v3.0

A React + Vite PWA / Capacitor app for band setlist and gig management with full multi-tenant (per-band) support.

## Architecture

### Frontend
- **Framework**: React 18 + Vite 5 + TypeScript
- **Routing**: React Router v6
- **Auth**: BetterAuth client (`better-auth/react`) — email/password + Google OAuth
- **State**: Zustand (per-band store with bootstrap/delta sync), TanStack Query (offline-persist)
- **Styling**: Tailwind CSS + shadcn/ui
- **Real-time**: WebSocket client (`src/lib/wsClient.ts`)
- **Offline**: IndexedDB cache + idb-keyval + offline-first fetch fallbacks
- **Mobile**: Capacitor (iOS + Android)
- **Monitoring**: Sentry

### Backend (Hono + BetterAuth)
- **Server**: Hono (Node.js) at `api.setlist.kirknet.io`
- **Auth**: BetterAuth with PostgreSQL session store, Google + email/password providers
- **Database**: PostgreSQL via Drizzle ORM (`server/src/db/`)
- **Real-time**: WebSocket server + PostgreSQL LISTEN/NOTIFY loop
- **Routes**: `/api/bands`, `/api/bands/:bandId/songs`, `/api/bands/:bandId/setlists`, `/api/bands/:bandId/gigs`, `/api/bands/:bandId/gig-sessions`, `/api/users`, `/api/sync`, `/api/spotify`, `/api/venues`, `/api/status`

### Domains
- Frontend: `https://setlist.kirknet.io`
- API: `https://api.setlist.kirknet.io`

## Multi-Tenant Model

- Each **band** is a tenant (table: `bands`)
- Users join bands via a 6-character `join_code` (requires manager approval)
- Per-band roles: `owner` | `manager` | `member`
- Platform roles: `platform_admin` | `user` (on the `users` table)
- All data tables (`songs`, `setlists`, `gigs`, etc.) have a `band_id` foreign key

## Key Files

### Frontend
- `src/context/AuthContext.tsx` — session state, signOut, profile mapping
- `src/context/BandContext.tsx` — active band, band list, `noBands` flag
- `src/lib/authClient.ts` — BetterAuth React client (imports from `better-auth/react`)
- `src/lib/api.ts` — all API functions (bandId-first), including band management functions
- `src/lib/apiFetch.ts` — authenticated fetch wrapper
- `src/lib/store.ts` — Zustand per-band store with bootstrap/delta sync
- `src/lib/wsClient.ts` — WebSocket connection manager
- `src/App.tsx` — router, ProtectedRoute (checks auth + profile + bands), provider tree
- `src/pages/BandSetup.tsx` — create or join a band (shown when user has no bands)
- `src/pages/BandManage.tsx` — member management, join code, role changes
- `src/components/AppLayout.tsx` — sidebar + mobile header (shows active band name)
- `src/components/MainMenu.tsx` — settings drawer with band switcher

### Backend
- `server/src/index.ts` — Hono app, CORS, auth, WebSocket, /api/status
- `server/src/auth.ts` — BetterAuth config (Google + email)
- `server/src/db/schema.ts` — Drizzle schema (all tables)
- `server/src/routes/bands.ts` — band + member management (create, join, approve, deny, role, kick)
- `server/src/routes/songs.ts`, `setlists.ts`, `gigs.ts`, etc. — per-band data routes
- `server/src/routes/sync.ts` — bootstrap + delta sync endpoints
- `server/src/ws/server.ts` — WebSocket connection manager
- `server/src/ws/listen.ts` — PostgreSQL LISTEN loop → WS broadcast

## Auth Flow

1. Sign in via email/password or Google OAuth
2. BetterAuth sets an httpOnly session cookie
3. `AuthContext` uses `authClient.useSession()` (from `better-auth/react`) for reactive state
4. `ProtectedRoute` checks: logged in → account active → profile complete (first+last name) → has ≥1 band
5. If no bands → `/bands/setup` (create or join)
6. If pending approval → `/pending`

## Environment Variables

Set in Replit Secrets:
- `BETTER_AUTH_SECRET` — signing secret for BetterAuth
- `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` — Google OAuth
- `VITE_SENTRY_DSN` — Sentry DSN (optional)
- `VITE_SPOTIFY_CLIENT_ID` — Spotify integration
- `VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY` / `VITE_SUPABASE_URL` — legacy (no longer used in app code, kept for env parity)
- `VITE_API_URL` — API base URL (defaults to `https://api.setlist.kirknet.io`)

Server-side env vars (set on EC2):
- `DATABASE_URL` — PostgreSQL connection string
- `BETTER_AUTH_SECRET`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`
- `FRONTEND_URL` — allowed CORS origin (default: `https://setlist.kirknet.io`)
- `PORT` — server port (default: 3001)

## Development Notes

- The Vite dev server runs on port 5000 (`npm run dev`)
- In development, API calls to `api.setlist.kirknet.io` will fail with CORS (expected; the server runs separately on EC2)
- TypeScript must be clean: `npx tsc --noEmit` (frontend) and `cd server && npx tsc --noEmit` (server)
- No Supabase dependencies remain in the frontend codebase
