import { createLocalJWKSet, jwtVerify, type JSONWebKeySet, type JWTPayload } from "jose";
import { SignInError, type ProviderContext, type RedirectProvider, type VerifiedIdentity } from "./provider";

/**
 * Generic OpenID Connect: any provider with a discovery document (Microsoft Entra, Okta, Keycloak, Authentik, Auth0,
 * Google and more). Authorization code flow with PKCE (S256), `state` and `nonce`; the ID token is checked against
 * the provider's own keys, issuer, audience, expiry and nonce. The email must come with `email_verified: true`,
 * unless the provider's settings say `trustEmail: true` (only for a provider whose emails are always the
 * organisation's own, such as Entra for one tenant).
 *
 * Settings: `issuer` and `clientId` (required), `name`, `icon`, `scopes` (default `openid email profile`),
 * `trustEmail`. Secret: `DAIDAL_AUTH_SECRET_<ID>` (left out for a public client).
 */

interface Discovery {
  issuer: string;
  authorization_endpoint: string;
  token_endpoint: string;
  jwks_uri: string;
  userinfo_endpoint?: string;
}

interface Cached {
  meta: Discovery;
  keys: JSONWebKeySet;
  at: number;
}

const CACHE_FOR = 60 * 60 * 1000;
const discovered = new Map<string, Cached>();
const ALGORITHMS = ["RS256", "RS384", "RS512", "PS256", "PS384", "PS512", "ES256", "ES384", "ES512", "EdDSA"];

/** Forgets every provider's discovery document and keys; for tests. */
export function forgetDiscovery(): void {
  discovered.clear();
}

export function requireString(options: Record<string, unknown>, key: string, id: string): string {
  const v = options[key];
  if (typeof v !== "string" || !v.trim()) throw new Error(`sign-in provider "${id}" needs a ${key}`);
  return v.trim();
}

export function optionalString(options: Record<string, unknown>, key: string): string | undefined {
  const v = options[key];
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
}

async function getJson<T>(fetchFn: typeof fetch, url: string, init?: RequestInit): Promise<T> {
  const res = await fetchFn(url, { ...init, headers: { accept: "application/json", ...init?.headers } });
  if (!res.ok) throw new SignInError("failed", `${new URL(url).host} answered ${res.status}`);
  return (await res.json()) as T;
}

async function discover(ctx: ProviderContext, issuer: string, now: number): Promise<Cached> {
  const hit = discovered.get(issuer);
  if (hit && now - hit.at < CACHE_FOR) return hit;
  const meta = await getJson<Discovery>(ctx.fetch, `${issuer.replace(/\/$/, "")}/.well-known/openid-configuration`);
  // The document must be the issuer's own: a mismatch is a misconfiguration or worse.
  if (meta.issuer !== issuer) throw new SignInError("failed", `the discovery document is for ${meta.issuer}, not ${issuer}`);
  for (const key of ["authorization_endpoint", "token_endpoint", "jwks_uri"] as const) {
    if (typeof meta[key] !== "string" || !meta[key].startsWith("https://")) {
      throw new SignInError("failed", `the discovery document has no https ${key}`);
    }
  }
  const keys = await getJson<JSONWebKeySet>(ctx.fetch, meta.jwks_uri);
  const cached = { meta, keys, at: now };
  discovered.set(issuer, cached);
  return cached;
}

/** The `code` on a callback, or the provider's own error as a SignInError. */
export function codeOf(params: URLSearchParams): string {
  const error = params.get("error");
  if (error) throw new SignInError(error === "access_denied" ? "denied" : "failed", `the provider said ${error}`);
  const code = params.get("code");
  if (!code) throw new SignInError("failed", "the provider sent no code");
  return code;
}

/** Trades [code] at [tokenUrl], with the client secret when there is one. */
export async function exchangeCode(
  ctx: ProviderContext,
  tokenUrl: string,
  clientId: string,
  input: { code: string; redirectUri: string; codeVerifier: string },
): Promise<Record<string, unknown>> {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code: input.code,
    redirect_uri: input.redirectUri,
    client_id: clientId,
    code_verifier: input.codeVerifier,
  });
  const secret = ctx.secret();
  if (secret) body.set("client_secret", secret);
  const tokens = await getJson<Record<string, unknown>>(ctx.fetch, tokenUrl, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  });
  if (typeof tokens.error === "string") throw new SignInError("failed", `the token request failed: ${tokens.error}`);
  return tokens;
}

const isVerified = (v: unknown) => v === true || v === "true";
const nameOf = (v: unknown) => (typeof v === "string" ? v : undefined);

/**
 * The email (and whether it is verified) and name from the ID token's [claims]. Some providers keep the email out of
 * the ID token; their userinfo endpoint has it, and counts only when it answers for the same subject.
 */
async function emailFor(ctx: ProviderContext, claims: JWTPayload, userinfoUrl: string | undefined, accessToken: unknown) {
  const fromToken = { email: emailOf(claims.email), verified: isVerified(claims.email_verified), name: nameOf(claims.name) };
  if (fromToken.email || !userinfoUrl || typeof accessToken !== "string") return fromToken;
  const info = await getJson<Record<string, unknown>>(ctx.fetch, userinfoUrl, { headers: { authorization: `Bearer ${accessToken}` } });
  if (info.sub !== claims.sub) return fromToken;
  return { email: emailOf(info.email), verified: isVerified(info.email_verified), name: fromToken.name ?? nameOf(info.name) };
}
const emailOf = (v: unknown) => (typeof v === "string" && v.includes("@") ? v.trim().toLowerCase() : "");

export function oidcProvider(ctx: ProviderContext, defaults: { name?: string; icon?: string; issuer?: string } = {}): RedirectProvider {
  const issuer = defaults.issuer ?? requireString(ctx.options, "issuer", ctx.id);
  const clientId = requireString(ctx.options, "clientId", ctx.id);
  const scopes = optionalString(ctx.options, "scopes") ?? "openid email profile";
  const trustEmail = ctx.options.trustEmail === true;

  return {
    kind: "redirect",
    id: ctx.id,
    name: optionalString(ctx.options, "name") ?? defaults.name ?? ctx.id,
    icon: optionalString(ctx.options, "icon") ?? defaults.icon ?? "key",

    async authorizeUrl(input) {
      const { meta } = await discover(ctx, issuer, Date.now());
      const url = new URL(meta.authorization_endpoint);
      url.search = new URLSearchParams({
        response_type: "code",
        client_id: clientId,
        redirect_uri: input.redirectUri,
        scope: scopes,
        state: input.state,
        nonce: input.nonce,
        code_challenge: input.codeChallenge,
        code_challenge_method: "S256",
      }).toString();
      return url.href;
    },

    async callback(input): Promise<VerifiedIdentity> {
      const code = codeOf(input.params);
      const { meta, keys } = await discover(ctx, issuer, Date.now());
      const tokens = await exchangeCode(ctx, meta.token_endpoint, clientId, { code, redirectUri: input.redirectUri, codeVerifier: input.codeVerifier });
      if (typeof tokens.id_token !== "string") throw new SignInError("failed", "the provider sent no ID token");

      let claims: JWTPayload;
      try {
        ({ payload: claims } = await jwtVerify(tokens.id_token, createLocalJWKSet(keys), { issuer, audience: clientId, algorithms: ALGORITHMS }));
      } catch (e) {
        throw new SignInError("failed", `the ID token was refused (${e instanceof Error ? e.name : "error"})`);
      }
      if (claims.nonce !== input.nonce) throw new SignInError("failed", "the ID token's nonce doesn't match");
      if (typeof claims.sub !== "string" || !claims.sub) throw new SignInError("failed", "the ID token has no subject");

      const { email, verified, name } = await emailFor(ctx, claims, meta.userinfo_endpoint, tokens.access_token);
      if (!email) throw new SignInError("unverified", "the provider gave no email");
      if (!verified && !trustEmail) throw new SignInError("unverified", "the provider hasn't verified this email");
      return { provider: ctx.id, subject: claims.sub, email, name };
    },
  };
}

/** Google: OpenID Connect with Google's issuer filled in. Settings: `clientId`, and optionally `name` and `icon`. */
export const googleProvider = (ctx: ProviderContext) => oidcProvider(ctx, { name: "Google", issuer: "https://accounts.google.com" });
