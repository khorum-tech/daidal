import { createRemoteJWKSet, type JWTVerifyGetKey } from "jose";
import type { Env } from "./env";
import { HttpError } from "./http";
import { providersOf } from "./signin/config";
import { sameOrigin } from "./signin/routes";
import { sessionOf } from "./signin/sessions";

export type KeySource = JWTVerifyGetKey;

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1"]);
const remoteKeySets = new Map<string, KeySource>();

export function remoteKeys(env: Env): KeySource {
  let keys = remoteKeySets.get(env.ACCESS_TEAM_DOMAIN);
  if (!keys) {
    keys = createRemoteJWKSet(new URL("/cdn-cgi/access/certs", env.ACCESS_TEAM_DOMAIN));
    remoteKeySets.set(env.ACCESS_TEAM_DOMAIN, keys);
  }
  return keys;
}

/**
 * Who the browser's request is from, or null when nobody is signed in. In order: `DEV_USER_EMAIL` on localhost;
 * a session from Daidal's own sign-in page (worker/src/signin); then each header provider that is on, such as
 * Cloudflare Access. (A personal access token is checked before this, in app.ts.)
 *
 * A session rides on a cookie the browser sends by itself, so a request that changes something with one must come
 * from this site's own pages: one from another site is refused (403), whatever SameSite already stops.
 */
export async function currentEmail(request: Request, env: Env, getKeys: () => KeySource): Promise<string | null> {
  const url = new URL(request.url);
  if (env.DEV_USER_EMAIL && LOCAL_HOSTS.has(url.hostname)) {
    return env.DEV_USER_EMAIL.trim().toLowerCase();
  }

  const session = await sessionOf(env.DB, request, Date.now());
  if (session) {
    if (request.method !== "GET" && request.method !== "HEAD" && !sameOrigin(request, env, url)) {
      throw new HttpError(403, "cross-site request refused");
    }
    return session.email;
  }

  for (const provider of providersOf(env, getKeys)) {
    if (provider.kind !== "header") continue;
    const identity = await provider.identify(request);
    if (identity) return identity.email;
  }
  return null;
}
