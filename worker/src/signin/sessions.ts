import { ensureUserStatements } from "../db";
import type { VerifiedIdentity } from "./provider";

/**
 * Daidal's own sessions, for people who sign in on its sign-in page. The browser holds a random 256-bit token in a
 * `__Host-` cookie (`HttpOnly`, `Secure`, `SameSite=Lax`, whole site); the server keeps only its SHA-256 hash, with
 * who it is for and when it ends, so a session can be ended from the server at once (signing out, signing out
 * everywhere, deleting the account).
 */

export const SESSION_COOKIE = "__Host-daidal-session";
/** Holds a sign-in's `state` between leaving for the provider and coming back, so a callback only works in the browser that started it. */
export const STATE_COOKIE = "__Host-daidal-signin";
export const SESSION_DAYS = 30;
const SESSION_MS = SESSION_DAYS * 24 * 60 * 60 * 1000;
export const STATE_MS = 10 * 60 * 1000;
const LAST_SEEN_EVERY = 60_000;

const hex = (bytes: ArrayBuffer) => Array.from(new Uint8Array(bytes), b => b.toString(16).padStart(2, "0")).join("");
export const hashOf = async (value: string) => hex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)));

/** 256 random bits, base64url. */
export function randomToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCodePoint(...bytes)).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

/** The PKCE S256 challenge for [verifier]. */
export async function challengeOf(verifier: string): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier)));
  return btoa(String.fromCodePoint(...digest)).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

export function cookieOf(request: Request, name: string): string | null {
  const header = request.headers.get("cookie");
  if (!header) return null;
  for (const part of header.split(";")) {
    const at = part.indexOf("=");
    if (at > 0 && part.slice(0, at).trim() === name) return part.slice(at + 1).trim() || null;
  }
  return null;
}

/** A `Set-Cookie` value for a `__Host-` cookie; [maxAge] 0 clears it. */
export const setCookie = (name: string, value: string, maxAge: number) =>
  `${name}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${Math.floor(maxAge)}`;

export interface Session {
  email: string;
  provider: string;
}

/** The session the request's cookie belongs to, or null when there is none or it has ended. */
export async function sessionOf(db: D1Database, request: Request, now: number): Promise<Session | null> {
  const token = cookieOf(request, SESSION_COOKIE);
  if (!token || token.length > 64) return null;
  const hash = await hashOf(token);
  const row = await db.prepare("SELECT email, provider, expires_at, last_seen_at FROM sessions WHERE hash = ?").bind(hash).first<{
    email: string;
    provider: string;
    expires_at: number;
    last_seen_at: number;
  }>();
  if (!row) return null;
  if (row.expires_at <= now) {
    await db.prepare("DELETE FROM sessions WHERE hash = ?").bind(hash).run();
    return null;
  }
  if (row.last_seen_at < now - LAST_SEEN_EVERY) await db.prepare("UPDATE sessions SET last_seen_at = ? WHERE hash = ?").bind(now, hash).run();
  return { email: row.email, provider: row.provider };
}

/**
 * The account [identity] signs in to: the one this provider's subject was first linked to: an identity keeps its account even if the provider later reports another email. A subject seen for the
 * first time is linked to the account with its verified email (made if it is new).
 */
export async function accountFor(db: D1Database, identity: VerifiedIdentity): Promise<string> {
  const linked = await db
    .prepare("SELECT email FROM identities WHERE provider = ? AND subject = ?")
    .bind(identity.provider, identity.subject)
    .first<{ email: string }>();
  return linked?.email ?? identity.email;
}

/** Signs [identity] in to the account [email] (from accountFor) and returns the new session's token. */
export async function startSession(db: D1Database, identity: VerifiedIdentity, email: string, now: number): Promise<string> {
  const token = randomToken();
  const name = identity.name?.trim().slice(0, 120) || email.split("@")[0];
  await db.batch([
    db.prepare("INSERT OR IGNORE INTO users (email, name, created_at) VALUES (?, ?, ?)").bind(email, name, now),
    ...ensureUserStatements(db, email, now),
    db
      .prepare(
        `INSERT INTO identities (provider, subject, email, created_at, last_seen_at) VALUES (?, ?, ?, ?, ?)
         ON CONFLICT (provider, subject) DO UPDATE SET last_seen_at = excluded.last_seen_at`,
      )
      .bind(identity.provider, identity.subject, email, now, now),
    db
      .prepare("INSERT INTO sessions (hash, email, provider, created_at, expires_at, last_seen_at) VALUES (?, ?, ?, ?, ?, ?)")
      .bind(await hashOf(token), email, identity.provider, now, now + SESSION_MS, now),
    // Housekeeping: ended sessions and abandoned sign-ins go whenever someone signs in.
    db.prepare("DELETE FROM sessions WHERE expires_at <= ?").bind(now),
    db.prepare("DELETE FROM sign_in_states WHERE expires_at <= ?").bind(now),
  ]);
  return token;
}

/** Ends the request's own session, if it has one. */
export async function endSession(db: D1Database, request: Request): Promise<void> {
  const token = cookieOf(request, SESSION_COOKIE);
  if (token && token.length <= 64) await db.prepare("DELETE FROM sessions WHERE hash = ?").bind(await hashOf(token)).run();
}

/** Ends every session [email] has, in every browser. Returns how many. */
export async function endAllSessions(db: D1Database, email: string): Promise<number> {
  const result = await db.prepare("DELETE FROM sessions WHERE email = ?").bind(email).run();
  return result.meta.changes ?? 0;
}
