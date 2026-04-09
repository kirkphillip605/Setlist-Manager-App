# SetlistPRO

A full-featured setlist and gig management application for bands. Built with React, TypeScript, Vite, and Capacitor for web (PWA) and native (iOS/Android) deployment.

## Features

- **Song Management** — Store lyrics, keys, tempo, notes, and Spotify metadata
- **Setlists** — Create and arrange drag-and-drop setlists with multiple sets
- **Gig Management** — Track upcoming and past gigs with venue details
- **Performance Mode** — Distraction-free live view with quick song switching and dark mode
- **Real-Time Collaboration** — WebSocket-powered live session sync for band members
- **Multi-Tenant** — Each band is a separate tenant; users can belong to multiple bands
- **Role-Based Access** — Platform roles (admin/user) and per-band roles (owner/manager/member)
- **Offline Support** — IndexedDB caching with background sync
- **Spotify Integration** — Auto-fill song details (key, BPM, cover art) from Spotify

## Architecture

### Frontend
- **Framework**: React 18 + Vite 5 + TypeScript
- **Routing**: React Router v6
- **Auth**: BetterAuth client (`better-auth/react`)
- **State**: Zustand (per-band store) + TanStack Query (offline-persist)
- **Styling**: Tailwind CSS + shadcn/ui
- **Real-time**: WebSocket client
- **Mobile**: Capacitor 8 (iOS + Android)

### Backend
- **Server**: Hono (Node.js) — `server/`
- **Auth**: BetterAuth with email/password, Google OAuth, magic link, email OTP, phone/SMS (Twilio)
- **Email**: Mailjet transactional email
- **Database**: PostgreSQL via Drizzle ORM
- **Real-time**: WebSocket server + PostgreSQL LISTEN/NOTIFY

### Domains
| Environment | URL |
|---|---|
| Frontend | `https://setlist.kirknet.io` |
| API | `https://api.setlist.kirknet.io` |

## Prerequisites

- Node.js 18+
- PostgreSQL 15+
- Google OAuth credentials
- Mailjet account (for transactional email)
- Twilio account (optional, for SMS/phone verification)
- Spotify Developer account (optional, for song metadata)

## Getting Started

### 1. Clone and install

```bash
git clone <repo-url>
cd Setlist-Manager-App

# Frontend dependencies
npm install

# Server dependencies
cd server && npm install && cd ..
```

### 2. Configure environment

```bash
# Frontend
cp .env.example .env
# Edit .env with your values

# Server
cp server/.env.example server/.env
# Edit server/.env with your values
```

See `.env.example` and `server/.env.example` for all available configuration options.

### 3. Run database migrations

```bash
cd server
npx tsx src/db/migrate.ts   # or apply server/migrations/*.sql manually
```

### 4. Start development

```bash
# Terminal 1 — API server
cd server && npm run dev

# Terminal 2 — Frontend
npm run dev
```

The frontend runs on `http://localhost:5000` and the API on `http://localhost:3001`.

## Authentication

SetlistPRO uses [BetterAuth](https://www.better-auth.com/) with the following methods:

| Method | Description |
|---|---|
| Email + Password | Standard sign-up/sign-in with optional email verification |
| Google OAuth | Social login with PKCE support for mobile |
| Magic Link | Passwordless email sign-in |
| Email OTP | One-time passcode sent via email |
| Phone/SMS | Phone number verification via Twilio |

Sessions are configured for long-duration persistence (default: 365 days) so users remain logged in unless they explicitly sign out or their account is deactivated.

All auth configuration is environment-driven — see `server/.env.example` for available settings (`SESSION_MAX_AGE_DAYS`, `REQUIRE_EMAIL_VERIFICATION`, `OTP_LENGTH`, etc.).

## Mobile (Capacitor)

### iOS
```bash
npx cap sync ios
npx cap open ios
```

### Android
```bash
npx cap sync android
npx cap open android
```

Deep linking is configured for both platforms:
- **iOS**: Custom URL scheme (`com.kirknetllc.setlistpro://`) + Universal Links (`setlist.kirknet.io`)
- **Android**: Custom URL scheme + App Links with `autoVerify`

## Deployment (EC2)

The API runs on EC2 via docker-compose. See `server/deploy.sh` for the deployment script.

```bash
# From local machine
cd server
./deploy.sh
```

## Project Structure

```
.
├── src/                    # Frontend (React + Vite)
│   ├── components/         # Shared UI components (shadcn/ui)
│   ├── context/            # React context providers (Auth, Band)
│   ├── hooks/              # Custom hooks
│   ├── lib/                # API client, auth client, store, utilities
│   └── pages/              # Route pages
├── server/                 # Backend (Hono + BetterAuth)
│   ├── src/
│   │   ├── db/             # Drizzle ORM schema + migrations
│   │   ├── lib/            # Email (Mailjet) + SMS (Twilio) transports
│   │   ├── middleware/     # Auth middleware
│   │   ├── routes/         # API route handlers
│   │   └── ws/             # WebSocket server + pg LISTEN
│   └── migrations/         # SQL migration files
├── ios/                    # Capacitor iOS project
├── android/                # Capacitor Android project
├── public/                 # Static assets
└── capacitor.config.ts     # Capacitor configuration
```

## License

Proprietary — KirkNet LLC
