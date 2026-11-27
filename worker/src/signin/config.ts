import type { JWTVerifyGetKey } from "jose";
import type { Env } from "../env";
import { githubProvider } from "./github";
import { accessProvider, forwardAuthProvider } from "./header";
import { googleProvider, oidcProvider } from "./oidc";
import { PLUGINS } from "./plugins";
import type { Provider, ProviderContext, ProviderPlugin } from "./provider";

/**
 * Which sign-in providers are on, from `DAIDAL_AUTH_PROVIDERS`: a JSON array of `{ "id", "type", ...settings }`.
 * `type` is `access`, `forward-auth`, `oidc`, `github`, `google`, or a plugin's own type. Secrets never go here:
 * a provider's client secret is `DAIDAL_AUTH_SECRET_<ID>`.
 *
 * Unset, it is Cloudflare Access alone when `ACCESS_AUD` is set (the hosted site, unchanged), and nothing otherwise
 * (locally, `DEV_USER_EMAIL` signs you in). See docs/sign-in.md.
 */

const BUILT_IN: Record<string, (ctx: ProviderContext) => Provider> = {
  oidc: ctx => oidcProvider(ctx),
  google: googleProvider,
  github: githubProvider,
  "forward-auth": forwardAuthProvider,
};

const ID = /^[a-z0-9][a-z0-9-]{0,39}$/;

export const secretName = (id: string) => `DAIDAL_AUTH_SECRET_${id.toUpperCase().replaceAll("-", "_")}`;

function entriesOf(env: Env): Record<string, unknown>[] {
  const raw = env.DAIDAL_AUTH_PROVIDERS?.trim();
  if (!raw) return env.ACCESS_AUD ? [{ id: "access", type: "access" }] : [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    console.error("DAIDAL_AUTH_PROVIDERS is not JSON; no sign-in provider is on");
    return [];
  }
  if (!Array.isArray(parsed)) {
    console.error("DAIDAL_AUTH_PROVIDERS must be a JSON array; no sign-in provider is on");
    return [];
  }
  return parsed.filter((e): e is Record<string, unknown> => typeof e === "object" && e !== null && !Array.isArray(e));
}

/**
 * The providers that are on, in their configured order. One that is misconfigured is left out, with a line in the
 * log, so the others still work.
 */
export function providersOf(
  env: Env,
  getKeys: () => JWTVerifyGetKey,
  plugins: ProviderPlugin[] = PLUGINS,
  fetchFn: typeof fetch = (...args) => fetch(...args),
): Provider[] {
  const byType = new Map<string, ProviderPlugin["create"]>(Object.entries(BUILT_IN));
  for (const p of plugins) if (!byType.has(p.type)) byType.set(p.type, p.create);
  const out: Provider[] = [];
  const seen = new Set<string>();
  for (const entry of entriesOf(env)) {
    const { id: rawId, type, ...options } = entry;
    const id = idOf(rawId, type);
    if (!ID.test(id) || seen.has(id)) {
      console.error(`sign-in provider "${String(rawId)}": the id must be unique, lower case letters, digits and -`);
      continue;
    }
    try {
      out.push(makeProvider(env, id, type, options, { byType, getKeys, fetchFn }));
      seen.add(id);
    } catch (e) {
      console.error(`sign-in provider "${id}" is off:`, e instanceof Error ? e.message : e);
    }
  }
  return out;
}

/** An entry's id: its own, or its type's when it gives none (`{ "type": "github" }` is `github`). */
function idOf(rawId: unknown, type: unknown): string {
  if (typeof rawId === "string") return rawId;
  return typeof type === "string" ? type : "";
}

interface Makers {
  byType: Map<string, ProviderPlugin["create"]>;
  getKeys: () => JWTVerifyGetKey;
  fetchFn: typeof fetch;
}

/** One configured provider; throws when it can't be made. */
function makeProvider(env: Env, id: string, type: unknown, options: Record<string, unknown>, { byType, getKeys, fetchFn }: Makers): Provider {
  if (type === "access") return accessProvider({ id, options }, { teamDomain: env.ACCESS_TEAM_DOMAIN, audience: env.ACCESS_AUD }, getKeys);
  const create = typeof type === "string" ? byType.get(type) : undefined;
  if (!create) throw new Error(`no provider type "${String(type)}"`);
  const vars = env as unknown as Record<string, unknown>;
  const secret = (name?: string) => {
    const v = vars[name ?? secretName(id)];
    return typeof v === "string" && v ? v : undefined;
  };
  const provider = create({ id, options, secret, fetch: fetchFn });
  if (provider.id !== id) throw new Error("a provider must keep its configured id");
  return provider;
}

/**
 * Who may sign in through a sign-in page provider, from `DAIDAL_AUTH_ALLOW`: emails and `@domain`s, separated by
 * commas or spaces, or `*` for anyone the provider vouches for. Unset, nobody may sign in that way: a new instance
 * is closed until its owner says who it is for. Header providers (Access, forward-auth) have their own policy in
 * front, so the list applies to them only when it is set.
 */
export function isAllowed(env: Env, email: string, kind: Provider["kind"]): boolean {
  const raw = env.DAIDAL_AUTH_ALLOW?.trim();
  if (!raw) return kind === "header";
  const rules = raw.toLowerCase().split(/[\s,]+/).filter(Boolean);
  if (rules.includes("*")) return true;
  const domain = email.slice(email.lastIndexOf("@"));
  return rules.some(r => (r.startsWith("@") ? r === domain : r === email));
}
