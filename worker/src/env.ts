export interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
  ACCESS_TEAM_DOMAIN: string;
  ACCESS_AUD: string;
  DEV_USER_EMAIL?: string;
  /** The sign-in providers that are on, as JSON (worker/src/signin/config.ts, docs/sign-in.md). Unset: Access alone. */
  DAIDAL_AUTH_PROVIDERS?: string;
  /** Who may sign in on the sign-in page: emails and @domains, or `*` (worker/src/signin/config.ts). */
  DAIDAL_AUTH_ALLOW?: string;
  /** The address the instance is reached at, when a proxy in front rewrites it (sign-in callbacks are built from it). */
  DAIDAL_PUBLIC_URL?: string;
  /** Limit overrides for the end-to-end tests only (worker/src/limits.ts); unset on stage and prod. */
  DAIDAL_LIMITS?: string;
}
