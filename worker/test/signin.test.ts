import { env } from "cloudflare:test";
import { exportJWK, generateKeyPair, SignJWT, type CryptoKey } from "jose";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import gitlab from "../../examples/daidal-auth-gitlab/index.js";
import { handleRequest } from "../src/app";
import type { Env } from "../src/env";
import { isAllowed, providersOf, secretName } from "../src/signin/config";
import { forgetDiscovery } from "../src/signin/oidc";
import { defineProvider } from "../src/signin/provider";
import { safeReturn } from "../src/signin/routes";
import { challengeOf, SESSION_COOKIE, STATE_COOKIE } from "../src/signin/sessions";
import type { Signer } from "./helpers";
import { makeSigner } from "./tokens";

const SITE = "https://daidal.example";
const ISSUER = "https://idp.example";

/** A pretend OpenID Connect provider and GitHub, answering the Worker's fetches. */
class FakeProviders {
  private key!: CryptoKey;
  private jwk!: Record<string, unknown>;
  /** What the next code trades for. */
  next: { sub: string; email?: string; email_verified?: boolean | string; name?: string } = { sub: "s1", email: "a@corp.example", email_verified: true };
  github = { id: 42, login: "octo", name: "Octo Cat", emails: [{ email: "octo@corp.example", primary: true, verified: true }] };
  codes = new Map<string, { challenge: string; nonce: string; clientId: string }>();
  tokenBodies: URLSearchParams[] = [];

  async init() {
    const { publicKey, privateKey } = await generateKeyPair("RS256");
    this.key = privateKey;
    this.jwk = { ...(await exportJWK(publicKey)), kid: "idp-key", alg: "RS256" };
  }

  /** Plays the provider's authorize page: notes what the browser brought and hands back a code. */
  authorize(location: string): { code: string; state: string } {
    const url = new URL(location);
    const code = `code-${this.codes.size + 1}`;
    this.codes.set(code, { challenge: url.searchParams.get("code_challenge")!, nonce: url.searchParams.get("nonce") ?? "", clientId: url.searchParams.get("client_id")! });
    return { code, state: url.searchParams.get("state")! };
  }

  fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
    const ok = (body: unknown) => Response.json(body);
    if (url.href === `${ISSUER}/.well-known/openid-configuration`) {
      return ok({ issuer: ISSUER, authorization_endpoint: `${ISSUER}/authorize`, token_endpoint: `${ISSUER}/token`, jwks_uri: `${ISSUER}/jwks`, userinfo_endpoint: `${ISSUER}/userinfo` });
    }
    if (url.href === `${ISSUER}/jwks`) return ok({ keys: [this.jwk] });
    if (url.href === `${ISSUER}/token` || url.href === "https://github.com/login/oauth/access_token") {
      const body = new URLSearchParams(String(init?.body));
      this.tokenBodies.push(body);
      const issued = this.codes.get(body.get("code") ?? "");
      if (!issued || (await challengeOf(body.get("code_verifier") ?? "")) !== issued.challenge) return ok({ error: "invalid_grant" });
      this.codes.delete(body.get("code")!);
      if (url.host === "github.com") return ok({ access_token: "gh-token" });
      const id_token = await new SignJWT({ ...this.next, nonce: issued.nonce })
        .setProtectedHeader({ alg: "RS256", kid: "idp-key" })
        .setIssuer(ISSUER)
        .setAudience(issued.clientId)
        .setIssuedAt()
        .setExpirationTime("5m")
        .sign(this.key);
      return ok({ id_token, access_token: "idp-token" });
    }
    if (url.href === "https://gitlab.example/oauth/token") {
      const body = new URLSearchParams(String(init?.body));
      const issued = this.codes.get(body.get("code") ?? "");
      if (!issued || (await challengeOf(body.get("code_verifier") ?? "")) !== issued.challenge) return ok({ error: "invalid_grant" });
      return ok({ access_token: "gl-token" });
    }
    if (url.href === "https://gitlab.example/api/v4/user") return ok({ id: 99, username: "tanuki", name: "Tanuki", email: "Tanuki@Corp.example", confirmed_at: "2026-01-01" });
    if (url.href === "https://api.github.com/user") return ok({ id: this.github.id, login: this.github.login, name: this.github.name });
    if (url.href === "https://api.github.com/user/emails") return ok(this.github.emails);
    return new Response("not found", { status: 404 });
  };
}

let signer: Signer;
const idp = new FakeProviders();

beforeAll(async () => {
  signer = await makeSigner();
  await idp.init();
});
beforeEach(() => {
  forgetDiscovery();
  vi.stubGlobal("fetch", idp.fetch);
});
afterEach(() => vi.unstubAllGlobals());

const PROVIDERS = [
  { id: "corp", type: "oidc", issuer: ISSUER, clientId: "daidal-client", name: "Corp SSO" },
  { id: "github", type: "github", clientId: "gh-client" },
  { id: "access", type: "access" },
];

function configured(extra: Partial<Env> & Record<string, unknown> = {}): Env {
  return { ...env, DAIDAL_AUTH_PROVIDERS: JSON.stringify(PROVIDERS), DAIDAL_AUTH_ALLOW: "*", DAIDAL_AUTH_SECRET_CORP: "corp-secret", ...extra } as Env;
}

/** A browser: keeps cookies and sends the site's own Origin on writes. */
function browser(e: Env) {
  const jar = new Map<string, string>();
  async function go(path: string, init: RequestInit & { origin?: string } = {}) {
    const headers = new Headers(init.headers);
    if (jar.size) headers.set("cookie", [...jar].map(([k, v]) => `${k}=${v}`).join("; "));
    if (init.method && init.method !== "GET") headers.set("origin", init.origin ?? SITE);
    const res = await handleRequest(new Request(new URL(path, SITE), { ...init, headers }), e, signer.getKeys);
    for (const c of res.headers.getSetCookie()) {
      const [pair, ...attrs] = c.split(";");
      const [name, value] = [pair.slice(0, pair.indexOf("=")), pair.slice(pair.indexOf("=") + 1)];
      if (attrs.some(a => a.trim() === "Max-Age=0")) jar.delete(name);
      else jar.set(name, value);
    }
    return res;
  }
  return { go, jar };
}

/** Signs in through [provider] in [b] and returns the callback's response. */
async function signIn(b: ReturnType<typeof browser>, provider: string, returnTo = "/app/d/x") {
  const start = await b.go(`/auth/start/${provider}?return=${encodeURIComponent(returnTo)}`);
  expect(start.status).toBe(302);
  const { code, state } = idp.authorize(start.headers.get("location")!);
  return b.go(`/auth/callback/${provider}?code=${code}&state=${state}`);
}

describe("sign-in providers from config", () => {
  it("is Cloudflare Access alone when nothing is configured and an AUD is set, and nothing without one", () => {
    expect(providersOf(env, signer.getKeys).map(p => [p.id, p.kind])).toEqual([["access", "header"]]);
    expect(providersOf({ ...env, ACCESS_AUD: "" }, signer.getKeys)).toEqual([]);
  });

  it("builds the configured providers in order, leaving out any that are misconfigured", () => {
    const e = {
      ...env,
      DAIDAL_AUTH_PROVIDERS: JSON.stringify([
        ...PROVIDERS,
        { id: "corp", type: "github", clientId: "again" },
        { id: "Bad Id", type: "github", clientId: "x" },
        { id: "nope", type: "saml" },
        { id: "proxy", type: "forward-auth" },
        { id: "google", type: "google" },
      ]),
    };
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(providersOf(e, signer.getKeys).map(p => p.id)).toEqual(["corp", "github", "access"]);
    expect(err).toHaveBeenCalledTimes(5);
  });

  it("takes provider types from plugins, and hands each its own secret", () => {
    let seen: string | undefined;
    const plugin = defineProvider({
      type: "acme",
      create: ctx => {
        seen = ctx.secret();
        return { kind: "header", id: ctx.id, name: String(ctx.options.name), identify: async () => null };
      },
    });
    const e = { ...env, DAIDAL_AUTH_PROVIDERS: JSON.stringify([{ id: "acme-sso", type: "acme", name: "Acme" }]), [secretName("acme-sso")]: "shh" } as Env;
    expect(providersOf(e, signer.getKeys, [plugin]).map(p => p.name)).toEqual(["Acme"]);
    expect(secretName("acme-sso")).toBe("DAIDAL_AUTH_SECRET_ACME_SSO");
    expect(seen).toBe("shh");
  });

  it("is closed to the sign-in page until DAIDAL_AUTH_ALLOW says who may sign in", () => {
    expect(isAllowed(env, "a@corp.example", "redirect")).toBe(false);
    expect(isAllowed(env, "a@corp.example", "header")).toBe(true);
    const listed = { ...env, DAIDAL_AUTH_ALLOW: "@corp.example, Boss@Else.example" };
    expect(isAllowed(listed, "a@corp.example", "redirect")).toBe(true);
    expect(isAllowed(listed, "boss@else.example", "redirect")).toBe(true);
    expect(isAllowed(listed, "a@corp.example.evil", "redirect")).toBe(false);
    expect(isAllowed(listed, "x@else.example", "header")).toBe(false);
    expect(isAllowed({ ...env, DAIDAL_AUTH_ALLOW: "*" }, "anyone@any.example", "redirect")).toBe(true);
  });

  it("lists the providers that are on for the sign-in page", async () => {
    const res = await browser(configured()).go("/auth/providers");
    expect(await res.json()).toEqual({
      providers: [
        { id: "corp", name: "Corp SSO", icon: "key", kind: "redirect" },
        { id: "github", name: "GitHub", icon: "key", kind: "redirect" },
        { id: "access", name: "Cloudflare Access", icon: "shieldCheck", kind: "header" },
      ],
    });
  });
});

describe("returning after sign-in", () => {
  it("only ever returns to a page of the app", () => {
    expect(safeReturn("/app/d/abc?view=1")).toBe("/app/d/abc?view=1");
    expect(safeReturn("/app")).toBe("/app");
    for (const bad of [null, "", "https://evil.example/app/", "//evil.example/app", "/app\\..\\evil", "/apple", "/api/me", "/app/../../x".repeat(60)]) {
      expect(safeReturn(bad)).toBe("/app/");
    }
  });
});

describe("signing in with OpenID Connect", () => {
  it("leaves with PKCE, state and nonce, comes back to a session, and the API knows who it is", async () => {
    const b = browser(configured());
    const start = await b.go("/auth/start/corp?return=%2Fapp%2Fd%2Fx");
    const to = new URL(start.headers.get("location")!);
    expect(to.origin + to.pathname).toBe(`${ISSUER}/authorize`);
    expect(Object.fromEntries(to.searchParams)).toMatchObject({
      response_type: "code",
      client_id: "daidal-client",
      redirect_uri: `${SITE}/auth/callback/corp`,
      code_challenge_method: "S256",
    });
    expect(to.searchParams.get("nonce")).toBeTruthy();
    expect(start.headers.getSetCookie()[0]).toMatch(new RegExp(`^${STATE_COOKIE}=[^;]+; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=600$`));

    idp.next = { sub: "oidc-1", email: "Ada@Corp.example", email_verified: true, name: "Ada L" };
    const { code, state } = idp.authorize(to.href);
    const back = await b.go(`/auth/callback/corp?code=${code}&state=${state}`);
    expect(back.status).toBe(302);
    expect(back.headers.get("location")).toBe("/app/d/x");
    expect(back.headers.getSetCookie().find(c => c.startsWith(SESSION_COOKIE))).toMatch(/HttpOnly; Secure; SameSite=Lax; Max-Age=2592000$/);
    expect(b.jar.has(STATE_COOKIE)).toBe(false);
    expect(idp.tokenBodies.at(-1)?.get("client_secret")).toBe("corp-secret");

    const me = await b.go("/api/me");
    expect(await me.json()).toMatchObject({ email: "ada@corp.example", name: "Ada L" });
  });

  it("signs nobody in from a callback the browser didn't start, or one used twice", async () => {
    const b = browser(configured());
    const start = await b.go("/auth/start/corp");
    const { code, state } = idp.authorize(start.headers.get("location")!);

    const stranger = browser(configured());
    const stolen = await stranger.go(`/auth/callback/corp?code=${code}&state=${state}`);
    expect(stolen.headers.get("location")).toBe("/app/signin?error=expired");
    expect(stranger.jar.has(SESSION_COOKIE)).toBe(false);

    const own = await b.go(`/auth/callback/corp?code=${code}&state=${state}`);
    expect(own.headers.get("location")).toBe("/app/");
    b.jar.set(STATE_COOKIE, state);
    const again = await b.go(`/auth/callback/corp?code=${code}&state=${state}`);
    expect(again.headers.get("location")).toBe("/app/signin?error=expired");
  });

  it("refuses an email the provider hasn't verified, or one not on the allow-list", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    idp.next = { sub: "oidc-2", email: "eve@corp.example", email_verified: false };
    expect((await signIn(browser(configured()), "corp")).headers.get("location")).toBe("/app/signin?error=unverified");

    idp.next = { sub: "oidc-3", email: "eve@elsewhere.example", email_verified: "true" };
    const listed = configured({ DAIDAL_AUTH_ALLOW: "@corp.example" });
    expect((await signIn(browser(listed), "corp")).headers.get("location")).toBe("/app/signin?error=denied");
    expect((await signIn(browser(configured({ DAIDAL_AUTH_ALLOW: "" })), "corp")).headers.get("location")).toBe("/app/signin?error=denied");
  });

  it("keeps a provider's person on the account they first linked, even if the provider's email changes", async () => {
    idp.next = { sub: "oidc-4", email: "first@corp.example", email_verified: true };
    await signIn(browser(configured()), "corp");
    idp.next = { sub: "oidc-4", email: "renamed@corp.example", email_verified: true };
    const b = browser(configured());
    await signIn(b, "corp");
    expect(await (await b.go("/api/me")).json()).toMatchObject({ email: "first@corp.example" });
  });

  it("refuses a provider that isn't on, and an ID token whose nonce doesn't match", async () => {
    expect((await browser(configured()).go("/auth/start/okta")).headers.get("location")).toBe("/app/signin?error=unknown");
    expect((await browser(configured()).go("/auth/start/access")).headers.get("location")).toBe("/app/signin?error=unknown");

    vi.spyOn(console, "warn").mockImplementation(() => {});
    const b = browser(configured());
    const start = await b.go("/auth/start/corp");
    const { code, state } = idp.authorize(start.headers.get("location")!);
    idp.codes.get(code)!.nonce = "someone-elses";
    expect((await b.go(`/auth/callback/corp?code=${code}&state=${state}`)).headers.get("location")).toBe("/app/signin?error=failed");
  });
});

describe("signing in with GitHub", () => {
  it("uses the account's id as the subject and its primary verified email", async () => {
    idp.github = { id: 7, login: "octo", name: "", emails: [{ email: "old@x.example", primary: false, verified: true }, { email: "Octo@Corp.example", primary: true, verified: true }] };
    const b = browser(configured({ DAIDAL_AUTH_SECRET_GITHUB: "gh-secret" }));
    const back = await signIn(b, "github");
    expect(back.headers.get("location")).toBe("/app/d/x");
    expect(await (await b.go("/api/me")).json()).toMatchObject({ email: "octo@corp.example", name: "octo" });
  });

  it("refuses an account with no verified email", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    idp.github = { id: 8, login: "nomail", name: "", emails: [{ email: "x@corp.example", primary: true, verified: false }] };
    expect((await signIn(browser(configured()), "github")).headers.get("location")).toBe("/app/signin?error=unverified");
  });
});

describe("a plugin provider from its own package", () => {
  it("signs in with the example GitLab plugin, bundled the way DAIDAL_AUTH_PLUGINS bundles it", async () => {
    const e = configured({ DAIDAL_AUTH_PROVIDERS: JSON.stringify([{ id: "gitlab", type: "gitlab", clientId: "gl-client", baseUrl: "https://gitlab.example" }]) });
    expect(providersOf(e, signer.getKeys, [gitlab]).map(p => [p.id, p.name, p.kind])).toEqual([["gitlab", "GitLab", "redirect"]]);

    const { PLUGINS } = await import("../src/signin/plugins");
    PLUGINS.push(gitlab);
    try {
      const b = browser(e);
      const back = await signIn(b, "gitlab");
      expect(back.headers.get("location")).toBe("/app/d/x");
      expect(await (await b.go("/api/me")).json()).toMatchObject({ email: "tanuki@corp.example", name: "Tanuki" });
    } finally {
      PLUGINS.pop();
    }
  });
});

describe("sessions", () => {
  it("refuses a write from another site, and signing out ends the session at once", async () => {
    idp.next = { sub: "oidc-5", email: "grace@corp.example", email_verified: true };
    const b = browser(configured());
    await signIn(b, "corp");
    const evil = await b.go("/api/me", { method: "PUT", origin: "https://evil.example", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: "x", title: "" }) });
    expect(evil.status).toBe(403);
    const own = await b.go("/api/me", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: "Grace", title: "" }) });
    expect(own.status).toBe(200);

    const stale = new Map(b.jar);
    expect((await b.go("/auth/signout", { method: "POST", origin: "https://evil.example" })).status).toBe(403);
    const out = await b.go("/auth/signout", { method: "POST" });
    expect(await out.json()).toEqual({ redirect: "/app/signin?signed-out=1" });
    expect(b.jar.has(SESSION_COOKIE)).toBe(false);
    for (const [k, v] of stale) b.jar.set(k, v);
    expect((await b.go("/api/me")).status).toBe(401);
  });

  it("signs out everywhere, and a personal access token can't", async () => {
    idp.next = { sub: "oidc-6", email: "linus@corp.example", email_verified: true };
    const one = browser(configured());
    const two = browser(configured());
    await signIn(one, "corp");
    await signIn(two, "corp");
    const ended = await one.go("/api/me/sessions", { method: "DELETE" });
    expect(await ended.json()).toEqual({ ended: 2 });
    expect((await two.go("/api/me")).status).toBe(401);
  });

  it("signs someone out of Access: clears its cookie here and ends the Access session, coming back to the app", async () => {
    const token = await signer.sign({ email: "acc@corp.example" });
    const res = await browser(configured()).go("/auth/signout", { method: "POST", headers: { "Cf-Access-Jwt-Assertion": token } });
    expect(await res.json()).toEqual({
      redirect: `https://test-team.cloudflareaccess.com/cdn-cgi/access/logout?returnTo=${encodeURIComponent(`${SITE}/app/`)}`,
    });
    expect(res.headers.get("set-cookie")).toMatch(/^CF_Authorization=; Path=\/; Secure; SameSite=Lax; Max-Age=0$/);
  });

  it("goes with the account, and the account's backup lists its sign-ins", async () => {
    idp.next = { sub: "oidc-7", email: "del@corp.example", email_verified: true };
    const b = browser(configured());
    await signIn(b, "corp");
    const backup = (await (await b.go("/api/me/export")).json()) as { signIns: { provider: string }[]; sessions: { provider: string }[] };
    expect(backup.signIns.map(s => s.provider)).toEqual(["corp"]);
    expect(backup.sessions.map(s => s.provider)).toEqual(["corp"]);
    const gone = await b.go("/api/me", { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ confirm: "del@corp.example" }) });
    expect(gone.status).toBe(204);
    expect((await b.go("/api/me")).status).toBe(401);
    const rows = await env.DB.prepare("SELECT (SELECT COUNT(*) FROM identities WHERE email = ?1) + (SELECT COUNT(*) FROM sessions WHERE email = ?1) AS n").bind("del@corp.example").first<{ n: number }>();
    expect(rows?.n).toBe(0);
  });
});

describe("forward-auth", () => {
  const proxy = configured({
    DAIDAL_AUTH_PROVIDERS: JSON.stringify([{ id: "authelia", type: "forward-auth", trustedProxies: ["10.0.0.2"], signOutUrl: "https://auth.example/logout" }]),
    DAIDAL_AUTH_ALLOW: "",
  });
  const from = (ip: string, extra: Record<string, string> = {}) => ({ headers: { "CF-Connecting-IP": ip, "Remote-Email": "Fwd@Corp.example", "Remote-User": "fwd", ...extra } });

  it("believes the identity headers only from the proxy's own address", async () => {
    expect(await (await browser(proxy).go("/api/me", from("10.0.0.2"))).json()).toMatchObject({ email: "fwd@corp.example" });
    expect((await browser(proxy).go("/api/me", from("203.0.113.9"))).status).toBe(401);
    expect((await browser(proxy).go("/api/me", { headers: { "Remote-Email": "fwd@corp.example" } })).status).toBe(401);
  });

  it("signs out through the proxy's own logout page", async () => {
    const res = await browser(proxy).go("/auth/signout", { method: "POST", ...from("10.0.0.2") });
    expect(await res.json()).toEqual({ redirect: "https://auth.example/logout" });
  });
});
