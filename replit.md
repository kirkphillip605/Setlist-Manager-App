# SetlistPRO v3.0

A React + Vite PWA / Capacitor app for band setlist and gig management with full multi-tenant (per-band) support.

## Architecture

### Frontend
- **Framework**: React 18 + Vite 5 + TypeScript
- **Routing**: React Router v6
- **Auth**: BetterAuth client (`better-auth/react`) — email/password, Google OAuth, magic link, email OTP, phone/SMS
- **Auth Plugins**: `emailAndPasswordClient`, `magicLinkClient`, `emailOTPClient`, `phoneNumberClient`, `inferAdditionalFields`
- **State**: Zustand (per-band store with bootstrap/delta sync), TanStack Query (offline-persist)
- **Styling**: Tailwind CSS + shadcn/ui
- **Real-time**: WebSocket client (`src/lib/wsClient.ts`)
- **Offline**: IndexedDB cache + idb-keyval + offline-first fetch fallbacks
- **Mobile**: Capacitor 8 (iOS + Android) with deep linking
- **Monitoring**: Sentry

### Backend (Hono + BetterAuth)
- **Server**: Hono (Node.js) at `api.setlist.kirknet.io`
- **Auth**: BetterAuth with plugins: `bearer`, `magicLink`, `emailOTP`, `phoneNumber`, `openAPI`
- **Email**: Mailjet transactional email (`server/src/lib/email.ts`)
- **SMS**: Twilio (`server/src/lib/sms.ts`)
- **Database**: PostgreSQL via Drizzle ORM (`server/src/db/`)
- **Real-time**: WebSocket server + PostgreSQL LISTEN/NOTIFY loop
- **Routes**: `/api/bands`, `/api/bands/:bandId/songs`, `/api/bands/:bandId/setlists`, `/api/bands/:bandId/gigs`, `/api/bands/:bandId/gig-sessions`, `/api/users`, `/api/sync`, `/api/spotify`, `/api/venues`, `/api/status`
- **Auth Handler**: `app.on(['GET','POST','PUT','PATCH','DELETE','OPTIONS'], '/api/auth/**', ...)` — all HTTP methods

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
- `src/lib/authClient.ts` — BetterAuth React client with all auth plugins
- `src/lib/api.ts` — all API functions (bandId-first), including band management functions
- `src/lib/apiFetch.ts` — authenticated fetch wrapper
- `src/lib/store.ts` — Zustand per-band store with bootstrap/delta sync
- `src/lib/wsClient.ts` — WebSocket connection manager
- `src/App.tsx` — router, ProtectedRoute (checks auth + profile + bands), provider tree
- `src/pages/Login.tsx` — sign in, sign up, Google OAuth, password reset
- `src/pages/BandSetup.tsx` — create or join a band (shown when user has no bands)
- `src/pages/BandManage.tsx` — member management, join code, role changes
- `src/components/AppLayout.tsx` — sidebar + mobile header (shows active band name)

### Backend
- `server/src/index.ts` — Hono app, CORS, auth handler (all methods), WebSocket, /api/status
- `server/src/auth.ts` — BetterAuth config with all plugins, env-driven settings
- `server/src/lib/email.ts` — Mailjet email transport (password reset, verification, magic link, OTP)
- `server/src/lib/sms.ts` — Twilio SMS transport (phone OTP)
- `server/src/db/schema.ts` — Drizzle schema (all tables)
- `server/src/routes/bands.ts` — band + member management (create, join, approve, deny, role, kick)
- `server/src/routes/songs.ts`, `setlists.ts`, `gigs.ts`, etc. — per-band data routes
- `server/src/routes/sync.ts` — bootstrap + delta sync endpoints
- `server/src/ws/server.ts` — WebSocket connection manager
- `server/src/ws/listen.ts` — PostgreSQL LISTEN loop → WS broadcast

## Auth Flow

1. Sign in via email/password, Google OAuth, magic link, or email OTP
2. BetterAuth sets an httpOnly session cookie (365-day expiry by default)
3. `AuthContext` uses `authClient.useSession()` for reactive session state
4. `ProtectedRoute` checks: logged in → account active → profile complete → has ≥1 band
5. If no bands → `/bands/setup` (create or join)
6. Bearer token plugin enables API auth for mobile apps without cookies

## Session Persistence

Sessions are configured for long-duration persistence:
- Default expiry: 365 days (`SESSION_MAX_AGE_DAYS` env var)
- Auto-refresh: every 24 hours (`SESSION_UPDATE_AGE_HOURS` env var)
- Cookie cache: 5-minute client-side cache to reduce session lookups
- Users remain logged in unless they explicitly sign out or their account is deactivated

## Environment Variables

### Frontend (Replit Secrets / .env)
- `VITE_API_URL` — API base URL (e.g. `https://api.setlist.kirknet.io`)
- `VITE_SENTRY_DSN` — Sentry DSN
- `VITE_SPOTIFY_CLIENT_ID` — Spotify integration

### Server (EC2 .env)
- `DATABASE_URL` — PostgreSQL connection string
- `BETTER_AUTH_SECRET` — signing secret
- `BETTER_AUTH_URL` — public API URL
- `FRONTEND_URL` — CORS origin
- `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` — Google OAuth
- `MAILJET_API_KEY` / `MAILJET_SECRET_KEY` / `MAILJET_FROM_EMAIL` / `MAILJET_FROM_NAME` — email
- `TWILIO_ACCOUNT_SID` / `TWILIO_AUTH_TOKEN` / `TWILIO_PHONE_NUMBER` — SMS
- `SESSION_MAX_AGE_DAYS` / `SESSION_UPDATE_AGE_HOURS` — session duration
- `REQUIRE_EMAIL_VERIFICATION` — require email verification (true/false)
- `OTP_LENGTH` / `OTP_EXPIRY_SECONDS` / `MAGIC_LINK_EXPIRY_SECONDS` — OTP/magic link
- `COOKIE_DOMAIN` — cross-subdomain cookie domain
- `ADDITIONAL_TRUSTED_ORIGINS` — comma-separated extra trusted origins

See `server/.env.example` for the complete list with descriptions.

## Deep Linking

### iOS
- Custom URL scheme: `com.kirknetllc.setlistpro://` (configured in `Info.plist`)
- Universal Links: `setlist.kirknet.io` (configured in `App.entitlements`)
- AASA served by API at `/.well-known/apple-app-site-association`

### Android
- Custom URL scheme: `com.kirknetllc.setlistpro://` (configured in `AndroidManifest.xml`)
- App Links: `https://setlist.kirknet.io` with `autoVerify` (configured in `AndroidManifest.xml`)
- Asset Links served by API at `/.well-known/assetlinks.json`

## Development Notes

- The Vite dev server runs on port 5000 (`npm run dev`)
- The Hono server runs on port 3001 (`cd server && npm run dev`)
- TypeScript must be clean: `npx tsc --noEmit` (frontend) and `cd server && npx tsc --noEmit` (server)
- No Supabase dependencies remain in the codebase
- If Mailjet/Twilio credentials are not configured, emails/SMS are logged to console (dev mode)
