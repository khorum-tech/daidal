export interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
  ACCESS_TEAM_DOMAIN: string;
  ACCESS_AUD: string;
  DEV_USER_EMAIL?: string;
  /** Limit overrides for the end-to-end tests only (worker/src/limits.ts); unset on stage and prod. */
  DAIDAL_LIMITS?: string;
}
