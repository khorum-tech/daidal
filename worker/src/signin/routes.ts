import type { JWTVerifyGetKey } from "jose";
import type { Env } from "../env";
import { json } from "../http";
import { isAllowed, providersOf } from "./config";
import { SignInError, type HeaderProvider, type Provider, type RedirectProvider, type SignInFailure } from "./provider";
import {
  accountFor,
  challengeOf,
  cookieOf,
  endSession,
  hashOf,
  randomToken,
  SESSION_COOKIE,
  SESSION_DAYS,
  sessionOf,
  setCookie,
  startSession,
  STATE_COOKIE,
  STATE_MS,
} from "./sessions";

/**
 * The sign-in routes, all under `/auth/`:
 *
 * - `GET /auth/providers`: the providers that are on, for the sign-in page (public).
 * - `GET /auth/start/<id>?return=/app/…`: leaves for a sign-in page provider.
 * - `GET /auth/callback/<id>`: where the provider sends the browser back; starts a session.
 * - `POST /auth/signout`: ends this browser's session and answers where to go next (Access's logout, for one).
 */

export const SIGN_IN_PAGE = "/app/signin";
const HOME = "/app/";

/** Where a sign-in may return to: a page of the app, never another site. */
export function safeReturn(raw: string | null): string {
  if (!raw || raw.length > 512 || raw.includes("\\") || raw.startsWith("//")) return HOME;
  if (!(raw === "/app" || raw.startsWith("/app/") || raw.startsWith("/app?"))) return HOME;
  try {
    // Parsed against a placeholder origin, it must stay on it: no scheme or host can slip in.
    return new URL(raw, "https://daidal.invalid").origin === "https://daidal.invalid" ? raw : HOME;
  } catch {
    return HOME;
  }
}

/** The address this instance is reached at: `DAIDAL_PUBLIC_URL` behind a proxy that rewrites it, else the request's own. */
const originOf = (env: Env, url: URL) => env.DAIDAL_PUBLIC_URL?.trim().replace(/\/$/, "") || url.origin;

function redirect(location: string, cookies: string[] = []): Response {
  const headers = new Headers({ location, "cache-control": "no-store" });
  for (const c of cookies) headers.append("set-cookie", c);
  return new Response(null, { status: 302, headers });
}

const failed = (code: SignInFailure, cookies: string[] = []) => redirect(`${SIGN_IN_PAGE}?error=${code}`, cookies);

/** True when [request] was sent by a page of this site itself (not another site's form or script). */
export function sameOrigin(request: Request, env: Env, url: URL): boolean {
  const origin = request.headers.get("origin");
  if (origin) return origin === originOf(env, url) || origin === url.origin;
  return request.headers.get("sec-fetch-site") === "same-origin";
}

async function start(request: Request, env: Env, url: URL, provider: RedirectProvider, now: number): Promise<Response> {
  const state = randomToken();
  const verifier = randomToken();
  const nonce = randomToken();
  const returnTo = safeReturn(url.searchParams.get("return"));
  const redirectUri = `${originOf(env, url)}/auth/callback/${provider.id}`;
  let to: string;
  try {
    to = await provider.authorizeUrl({ redirectUri, state, codeChallenge: await challengeOf(verifier), nonce });
  } catch (e) {
    console.error(`sign-in with ${provider.id} couldn't start:`, e instanceof Error ? e.message : e);
    return failed("failed");
  }
  await env.DB.prepare("INSERT INTO sign_in_states (hash, provider, verifier, nonce, return_to, expires_at) VALUES (?, ?, ?, ?, ?, ?)")
    .bind(await hashOf(state), provider.id, verifier, nonce, returnTo, now + STATE_MS)
    .run();
  return redirect(to, [setCookie(STATE_COOKIE, state, STATE_MS / 1000)]);
}

interface StateRow {
  provider: string;
  verifier: string;
  nonce: string;
  return_to: string;
  expires_at: number;
}

async function callback(request: Request, env: Env, url: URL, provider: RedirectProvider, now: number): Promise<Response> {
  const clearState = setCookie(STATE_COOKIE, "", 0);
  const state = url.searchParams.get("state");
  // The state must be the one this browser left with: a callback link sent from elsewhere signs nobody in.
  if (!state || state.length > 64 || state !== cookieOf(request, STATE_COOKIE)) return failed("expired", [clearState]);
  const hash = await hashOf(state);
  const [found] = await env.DB.batch<StateRow>([
    env.DB.prepare("SELECT provider, verifier, nonce, return_to, expires_at FROM sign_in_states WHERE hash = ?").bind(hash),
    env.DB.prepare("DELETE FROM sign_in_states WHERE hash = ?").bind(hash),
  ]);
  const row = found.results[0];
  if (row?.provider !== provider.id || row.expires_at <= now) return failed("expired", [clearState]);

  try {
    const identity = await provider.callback({
      params: url.searchParams,
      redirectUri: `${originOf(env, url)}/auth/callback/${provider.id}`,
      codeVerifier: row.verifier,
      nonce: row.nonce,
    });
    if (identity.provider !== provider.id || !identity.subject || !identity.email.includes("@")) throw new SignInError("failed", "the provider's answer was incomplete");
    const email = await accountFor(env.DB, { ...identity, email: identity.email.trim().toLowerCase() });
    if (!isAllowed(env, email, "redirect")) return failed("denied", [clearState]);
    const token = await startSession(env.DB, identity, email, now);
    return redirect(row.return_to, [clearState, setCookie(SESSION_COOKIE, token, SESSION_DAYS * 24 * 60 * 60)]);
  } catch (e) {
    const code = e instanceof SignInError ? e.code : "failed";
    console.warn(`sign-in with ${provider.id} failed:`, e instanceof Error ? e.message : e);
    return failed(code, [clearState]);
  }
}

/** Ends this browser's session and says where to go: the sign-in page, or the header provider's own logout. */
async function signOut(request: Request, env: Env, url: URL, providers: Provider[], now: number): Promise<Response> {
  const session = await sessionOf(env.DB, request, now);
  if (session) {
    await endSession(env.DB, request);
    return Response.json({ redirect: `${SIGN_IN_PAGE}?signed-out=1` }, { headers: { "cache-control": "no-store", "set-cookie": setCookie(SESSION_COOKIE, "", 0) } });
  }
  for (const p of providers) {
    if (p.kind === "header" && (await p.identify(request))) return headerSignOut(p, `${originOf(env, url)}${HOME}`);
  }
  return json({ redirect: `${SIGN_IN_PAGE}?signed-out=1` });
}

/** Signing out of a header provider: clear its cookies on this host and go to its logout, which comes back to [home]. */
function headerSignOut(p: HeaderProvider, home: string): Response {
  const to = typeof p.signOutUrl === "function" ? p.signOutUrl(home) : (p.signOutUrl ?? `${SIGN_IN_PAGE}?signed-out=1`);
  const headers = new Headers({ "cache-control": "no-store" });
  for (const name of p.signOutCookies ?? []) headers.append("set-cookie", `${name}=; Path=/; Secure; SameSite=Lax; Max-Age=0`);
  return Response.json({ redirect: to }, { headers });
}

const AUTH_PATH = /^\/auth\/(providers|signout|start|callback)(?:\/([a-z0-9-]{1,40}))?$/;

/** Answers a `/auth/` request; null for any other path. */
export async function authRoute(request: Request, env: Env, url: URL, getKeys: () => JWTVerifyGetKey): Promise<Response | null> {
  if (!url.pathname.startsWith("/auth/")) return null;
  const match = AUTH_PATH.exec(url.pathname);
  if (!match) return json({ error: "not found" }, 404);
  const [, action, id] = match;
  const providers = providersOf(env, getKeys);
  if (action === "providers" || action === "signout") return id ? json({ error: "not found" }, 404) : listOrSignOut(action, request, env, url, providers);
  if (!id) return json({ error: "not found" }, 404);
  if (request.method !== "GET") return json({ error: "method not allowed" }, 405);
  const provider = providers.find((p): p is RedirectProvider => p.kind === "redirect" && p.id === id);
  if (!provider) return failed("unknown");
  return action === "start" ? start(request, env, url, provider, Date.now()) : callback(request, env, url, provider, Date.now());
}

/** `GET /auth/providers` and `POST /auth/signout`. */
async function listOrSignOut(action: "providers" | "signout", request: Request, env: Env, url: URL, providers: Provider[]): Promise<Response> {
  if (action === "providers") {
    if (request.method !== "GET") return json({ error: "method not allowed" }, 405);
    return json({ providers: providers.map(p => ({ id: p.id, name: p.name, icon: p.icon ?? null, kind: p.kind })) });
  }
  if (request.method !== "POST") return json({ error: "method not allowed" }, 405);
  if (!sameOrigin(request, env, url)) return json({ error: "cross-site request refused" }, 403);
  return signOut(request, env, url, providers, Date.now());
}

