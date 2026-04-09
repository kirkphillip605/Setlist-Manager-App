/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL: string
  readonly VITE_SPOTIFY_CLIENT_ID: string
  readonly VITE_SENTRY_DSN: string
  readonly VITE_APPLE_APP_STORE_URL: string
  readonly VITE_GOOGLE_PLAY_STORE_URL: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
