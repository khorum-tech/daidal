# Daidal Pipeline and Login Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deploy the Daidal bundle on a Cloudflare Worker behind Cloudflare Access, with `/api/me` backed by D1 replacing the mock login and the hard-coded profile.

**Architecture:** One Worker serves `web/` as static assets and handles `/api/*`. Cloudflare Access signs every request with a token; the Worker verifies it and uses the email as the user id. D1 holds users and their personal workspace. GitHub Actions tests, migrates and deploys on push to `main`.

**Tech Stack:** Cloudflare Workers, D1, Cloudflare Access, TypeScript, `jose` (token verification), Wrangler 4, Vitest 4.1 with `@cloudflare/vitest-plugin`, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-10-12-daidal-backend-design.md`. This plan covers build step 1 of 4 ("Pipeline and login"). Steps 2 to 4 get their own plans.

All paths are relative to `~/Projects/skope`.

## Global Constraints

- Hostname: `skope.khorum-oss.org`. The Worker's `workers.dev` URL and preview URLs stay off.
- A user's id is the lowercased `email` claim from the verified Access token. The browser never supplies an identity.
- An `/api/*` request without a valid token gets `401` with `{ "error": "not signed in" }`. All errors are `{ "error": "<message>" }`.
- `DEV_USER_EMAIL` is honoured only on `localhost` / `127.0.0.1` and lives only in `.dev.vars`, which is never committed.
- Migrations are forward-only and additive.
- Pin `vitest` to `^4.1`. Vitest 5 fails to load test files with `@cloudflare/vitest-plugin` 1.4 (checked 2026-10-12). Do not use `@cloudflare/vitest-pool-workers`; it is deprecated.
- Tests in one file share one D1 database. Every test uses its own email address.
- Commit messages have no `Co-Authored-By` trailer.
- No real secrets in the repo. The Access team domain and AUD tag are identifiers and may be committed.

## Review Focus

Conditions the spec implies that are most likely to bite a real user, and the test that pins each:

1. **The same person signs in with different email casing** (`Josh@…` then `josh@…`) and expects one account. Pinned in Task 3 (`returns the lowercased email`) and Task 4 (`treats differently-cased emails as the same user`).
2. **Two requests arrive at once on a user's first visit** and must not fail or create two personal workspaces. Pinned in Task 2 (`survives two first visits at the same time`).
3. **The profile form sends a blank, huge, or wrongly-typed value.** A blank name keeps the old one; the rest get `400`. Pinned in Task 4 (`keeps the existing name when the new one is blank`, and the `rejects %s` table).
4. **A token with no email reaches the API** (an Access service token) and must get `401`, not a crash. Pinned in Task 3 (`returns null for a token with no email`).
5. **`/api/me` fails in the browser** (offline, expired Access session, server error). The user must see a message with a Reload button, never a blank page or the mock login. Checked by hand in Task 5, Step 7.

---

## File Structure

| File | Responsibility |
|---|---|
| `web/` | The exported bundle, served as-is: `index.html`, `support.js`, `Daidal-Network-Module.dc.html`, `_ds/` |
| `worker/src/env.ts` | The `Env` bindings type |
| `worker/src/auth.ts` | Turn a request into a verified email, or `null` |
| `worker/src/db.ts` | User queries: `ensureUser`, `updateUser` |
| `worker/src/profile.ts` | Validate a `PUT /api/me` body |
| `worker/src/app.ts` | Route table: `handleRequest` |
| `worker/src/index.ts` | Worker entry; wires real Access keys into `handleRequest` |
| `worker/test/tokens.ts` | Test helper that signs Access-shaped tokens with a local key |
| `worker/test/*.test.ts` | One suite per source file |
| `migrations/0001_init.sql` | `users`, `workspaces`, `workspace_members` |
| `wrangler.jsonc`, `vitest.config.ts`, `tsconfig.json`, `package.json` | Tooling |
| `.github/workflows/deploy.yml` | Test, migrate, deploy |

`diagrams` and `snapshots` tables are not created here. They arrive with build step 2.

---

### Task 1: Scaffold the Worker and serve the bundle

**Files:**
- Create: `package.json`, `wrangler.jsonc`, `tsconfig.json`, `vitest.config.ts`
- Create: `migrations/0001_init.sql`
- Create: `worker/src/env.ts`, `worker/src/app.ts`, `worker/src/index.ts`
- Create: `worker/test/env.d.ts`, `worker/test/apply-migrations.ts`, `worker/test/app.test.ts`
- Create: `web/` (copied from `proto/tmp/mockup/`)
- Modify: `.gitignore`

**Interfaces:**
- Consumes: nothing.
- Produces: `Env` (`worker/src/env.ts`); `handleRequest(request: Request, env: Env): Promise<Response>` (`worker/src/app.ts`), which Task 4 replaces with a three-argument version; the test `env` from `cloudflare:test` with a migrated `env.DB`.

- [ ] **Step 1: Clean up the repo's staged state**

The repo has no commits. An empty `proto/hestia-systems.daidal.yml` is staged but no longer exists on disk. Unstage it:

```bash
cd ~/Projects/skope
git rm --cached proto/hestia-systems.daidal.yml
git status --short
```

Expected: only `AM .gitignore` remains.

- [ ] **Step 2: Write `.gitignore`**

```gitignore
.DS_Store
.idea
*/tmp
node_modules
.wrangler
.dev.vars
```

- [ ] **Step 3: Copy the bundle into `web/`**

```bash
mkdir -p web
cp proto/tmp/mockup/index.html proto/tmp/mockup/support.js proto/tmp/mockup/Daidal-Network-Module.dc.html web/
cp -R proto/tmp/mockup/_ds web/_ds
ls web
```

Expected: `Daidal-Network-Module.dc.html  _ds  index.html  support.js`. `index.html` loads the network module by name at runtime, so it must sit next to it.

- [ ] **Step 4: Write `package.json`**

```json
{
  "name": "skope",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "wrangler dev",
    "test": "vitest run",
    "typecheck": "tsc --noEmit",
    "deploy": "wrangler deploy"
  },
  "dependencies": {
    "jose": "^6.2.12"
  },
  "devDependencies": {
    "@cloudflare/vitest-plugin": "^1.4.0",
    "@cloudflare/workers-types": "^5.20261012.1",
    "typescript": "^7.0.2",
    "vitest": "^4.1.11",
    "wrangler": "^4.149.0"
  }
}
```

- [ ] **Step 5: Write `wrangler.jsonc`**

The `database_id` is a stand-in that works for local dev and tests. Task 6 replaces it with the real id and adds the route.

```jsonc
{
  "$schema": "node_modules/wrangler/config-schema.json",
  "name": "skope",
  "main": "worker/src/index.ts",
  "compatibility_date": "2026-10-01",
  "workers_dev": false,
  "preview_urls": false,
  "assets": { "directory": "./web", "binding": "ASSETS" },
  "d1_databases": [
    { "binding": "DB", "database_name": "skope", "database_id": "00000000-0000-0000-0000-000000000000", "migrations_dir": "migrations" }
  ],
  "vars": { "ACCESS_TEAM_DOMAIN": "", "ACCESS_AUD": "" }
}
```

- [ ] **Step 6: Write `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022", "module": "ESNext", "moduleResolution": "Bundler", "lib": ["ES2022"],
    "types": ["@cloudflare/workers-types", "@cloudflare/vitest-plugin/types"],
    "strict": true, "noEmit": true, "skipLibCheck": true
  },
  "include": ["worker", "vitest.config.ts"]
}
```

- [ ] **Step 7: Write `vitest.config.ts`**

The `bindings` here override the empty `vars` from `wrangler.jsonc` during tests and hand the migrations to the setup file.

```ts
import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vitest/config";

export default defineConfig(async () => {
  const migrations = await readD1Migrations("./migrations");
  return {
    plugins: [
      cloudflareTest({
        wrangler: { configPath: "./wrangler.jsonc" },
        miniflare: {
          bindings: {
            TEST_MIGRATIONS: migrations,
            ACCESS_TEAM_DOMAIN: "https://test-team.cloudflareaccess.com",
            ACCESS_AUD: "test-aud",
          },
        },
      }),
    ],
    test: { setupFiles: ["./worker/test/apply-migrations.ts"] },
  };
});
```

- [ ] **Step 8: Write `migrations/0001_init.sql`**

```sql
CREATE TABLE users (
  email       TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  title       TEXT NOT NULL DEFAULT '',
  settings    TEXT NOT NULL DEFAULT '{}',
  created_at  INTEGER NOT NULL
);

CREATE TABLE workspaces (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  owner_email TEXT NOT NULL REFERENCES users(email),
  created_at  INTEGER NOT NULL
);

CREATE TABLE workspace_members (
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  email        TEXT NOT NULL,
  added_at     INTEGER NOT NULL,
  PRIMARY KEY (workspace_id, email)
);
```

- [ ] **Step 9: Write `worker/src/env.ts`**

```ts
export interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
  ACCESS_TEAM_DOMAIN: string;
  ACCESS_AUD: string;
  DEV_USER_EMAIL?: string;
}
```

- [ ] **Step 10: Write the test setup files**

`worker/test/env.d.ts`:

```ts
import type { D1Migration } from "cloudflare:test";
import type { Env as AppEnv } from "../src/env";

declare global {
  namespace Cloudflare {
    interface Env extends AppEnv {
      TEST_MIGRATIONS: D1Migration[];
    }
  }
}
```

`worker/test/apply-migrations.ts`:

```ts
import { applyD1Migrations, env } from "cloudflare:test";

await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
```

- [ ] **Step 11: Install dependencies**

```bash
npm install
```

Expected: `node_modules/` and `package-lock.json` are created with no errors.

- [ ] **Step 12: Write the failing test**

`worker/test/app.test.ts`:

```ts
import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { handleRequest } from "../src/app";

describe("handleRequest", () => {
  it("returns 404 JSON for an unknown API route", async () => {
    const res = await handleRequest(new Request("https://skope.khorum-oss.org/api/nope"), env);
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "not found" });
  });
});
```

- [ ] **Step 13: Run the test to verify it fails**

Run: `npm test`
Expected: FAIL, because `../src/app` does not exist.

- [ ] **Step 14: Write `worker/src/app.ts` and `worker/src/index.ts`**

`worker/src/app.ts`:

```ts
import type { Env } from "./env";

function json(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: { "cache-control": "no-store" } });
}

export async function handleRequest(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  if (!url.pathname.startsWith("/api/")) return env.ASSETS.fetch(request);

  return json({ error: "not found" }, 404);
}
```

`worker/src/index.ts`:

```ts
import { handleRequest } from "./app";
import type { Env } from "./env";

export default {
  fetch(request: Request, env: Env): Promise<Response> {
    return handleRequest(request, env);
  },
} satisfies ExportedHandler<Env>;
```

- [ ] **Step 15: Run the test and the typecheck**

Run: `npm test && npm run typecheck`
Expected: 1 test passes; `tsc` prints nothing.

- [ ] **Step 16: Check the bundle is served locally**

```bash
npx wrangler dev --port 8787
```

Open `http://localhost:8787/`. Expected: the Daidal mock login screen appears, styled, with no failed requests in the browser's network tab (Google Fonts and `unpkg.com` requests are expected). Stop the server with Ctrl-C.

- [ ] **Step 17: Commit**

```bash
git add .gitignore package.json package-lock.json wrangler.jsonc tsconfig.json vitest.config.ts migrations worker web docs
git commit -m "feat: serve the Daidal bundle from a Worker with D1 scaffolding"
```

---

### Task 2: Users in D1

**Files:**
- Create: `worker/src/db.ts`
- Test: `worker/test/db.test.ts`

**Interfaces:**
- Consumes: the migrated `env.DB` from Task 1.
- Produces:
  - `interface User { email: string; name: string; title: string; settings: Record<string, unknown> }`
  - `interface ProfilePatch { name?: string; title?: string; settings?: Record<string, unknown> }`
  - `personalWorkspaceId(email: string): string` returns `` `personal:${email}` ``
  - `ensureUser(db: D1Database, email: string, now?: number): Promise<User>`
  - `updateUser(db: D1Database, email: string, patch: ProfilePatch): Promise<User>`

- [ ] **Step 1: Write the failing tests**

`worker/test/db.test.ts`:

```ts
import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { ensureUser, personalWorkspaceId, updateUser } from "../src/db";

async function count(sql: string, ...args: unknown[]) {
  const row = await env.DB.prepare(sql).bind(...args).first<{ n: number }>();
  return row?.n ?? 0;
}

// Tests in a file share one database, so each test uses its own email.
describe("ensureUser", () => {
  it("creates the user with a default name and a personal workspace", async () => {
    const user = await ensureUser(env.DB, "create@example.com");
    expect(user).toEqual({ email: "create@example.com", name: "create", title: "", settings: {} });

    const id = personalWorkspaceId("create@example.com");
    expect(await count("SELECT COUNT(*) AS n FROM workspaces WHERE id = ? AND name = 'Personal'", id)).toBe(1);
    expect(
      await count("SELECT COUNT(*) AS n FROM workspace_members WHERE workspace_id = ? AND email = ?", id, "create@example.com"),
    ).toBe(1);
  });

  it("does not overwrite an existing user or duplicate the workspace", async () => {
    await ensureUser(env.DB, "again@example.com");
    await updateUser(env.DB, "again@example.com", { name: "Josh" });
    const again = await ensureUser(env.DB, "again@example.com");
    expect(again.name).toBe("Josh");
    expect(await count("SELECT COUNT(*) AS n FROM workspaces WHERE owner_email = ?", "again@example.com")).toBe(1);
  });

  it("survives two first visits at the same time", async () => {
    const [a, b] = await Promise.all([ensureUser(env.DB, "race@example.com"), ensureUser(env.DB, "race@example.com")]);
    expect(a).toEqual(b);
    expect(await count("SELECT COUNT(*) AS n FROM users WHERE email = ?", "race@example.com")).toBe(1);
    expect(await count("SELECT COUNT(*) AS n FROM workspaces WHERE owner_email = ?", "race@example.com")).toBe(1);
  });
});

describe("updateUser", () => {
  it("changes only the fields in the patch", async () => {
    await ensureUser(env.DB, "patch@example.com");
    await updateUser(env.DB, "patch@example.com", { title: "Engineer", settings: { theme: "dark" } });
    const user = await updateUser(env.DB, "patch@example.com", { name: "Josh" });
    expect(user).toEqual({ email: "patch@example.com", name: "Josh", title: "Engineer", settings: { theme: "dark" } });
  });

  it("can clear the title", async () => {
    await ensureUser(env.DB, "clear@example.com");
    await updateUser(env.DB, "clear@example.com", { title: "Engineer" });
    expect((await updateUser(env.DB, "clear@example.com", { title: "" })).title).toBe("");
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run worker/test/db.test.ts`
Expected: FAIL, because `../src/db` does not exist.

- [ ] **Step 3: Write `worker/src/db.ts`**

`INSERT OR IGNORE` with a fixed personal-workspace id is what makes a simultaneous first visit safe: the second insert is a no-op instead of an error or a duplicate.

```ts
export interface User {
  email: string;
  name: string;
  title: string;
  settings: Record<string, unknown>;
}

export interface ProfilePatch {
  name?: string;
  title?: string;
  settings?: Record<string, unknown>;
}

interface UserRow {
  email: string;
  name: string;
  title: string;
  settings: string;
}

export function personalWorkspaceId(email: string): string {
  return `personal:${email}`;
}

async function getUser(db: D1Database, email: string): Promise<User> {
  const row = await db
    .prepare("SELECT email, name, title, settings FROM users WHERE email = ?")
    .bind(email)
    .first<UserRow>();
  if (!row) throw new Error(`user ${email} not found`);
  return { email: row.email, name: row.name, title: row.title, settings: JSON.parse(row.settings) };
}

export async function ensureUser(db: D1Database, email: string, now = Date.now()): Promise<User> {
  const workspaceId = personalWorkspaceId(email);
  await db.batch([
    db
      .prepare("INSERT OR IGNORE INTO users (email, name, created_at) VALUES (?, ?, ?)")
      .bind(email, email.split("@")[0], now),
    db
      .prepare("INSERT OR IGNORE INTO workspaces (id, name, owner_email, created_at) VALUES (?, 'Personal', ?, ?)")
      .bind(workspaceId, email, now),
    db
      .prepare("INSERT OR IGNORE INTO workspace_members (workspace_id, email, added_at) VALUES (?, ?, ?)")
      .bind(workspaceId, email, now),
  ]);
  return getUser(db, email);
}

export async function updateUser(db: D1Database, email: string, patch: ProfilePatch): Promise<User> {
  await db
    .prepare(
      "UPDATE users SET name = COALESCE(?, name), title = COALESCE(?, title), settings = COALESCE(?, settings) WHERE email = ?",
    )
    .bind(
      patch.name ?? null,
      patch.title ?? null,
      patch.settings ? JSON.stringify(patch.settings) : null,
      email,
    )
    .run();
  return getUser(db, email);
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run worker/test/db.test.ts && npm run typecheck`
Expected: 5 tests pass; `tsc` prints nothing.

- [ ] **Step 5: Commit**

```bash
git add worker/src/db.ts worker/test/db.test.ts
git commit -m "feat: create users and their personal workspace on first sight"
```

---

### Task 3: Verify the Access token

**Files:**
- Create: `worker/src/auth.ts`
- Create: `worker/test/tokens.ts`
- Test: `worker/test/auth.test.ts`

**Interfaces:**
- Consumes: `Env` from Task 1.
- Produces:
  - `type KeySource` (jose's `JWTVerifyGetKey`)
  - `remoteKeys(env: Env): KeySource` fetches and caches the team's public keys
  - `currentEmail(request: Request, env: Env, getKeys: () => KeySource): Promise<string | null>`
  - Test helper `makeSigner(): Promise<{ getKeys: () => KeySource; sign(claims, opts?): Promise<string> }>`, plus `ISSUER` and `AUD` constants matching `vitest.config.ts`

`getKeys` is a function so that the real key set, which needs a valid team domain to build its URL, is only created once a token is actually being verified.

- [ ] **Step 1: Write the token helper**

`worker/test/tokens.ts`:

```ts
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT, type JWTPayload } from "jose";
import type { KeySource } from "../src/auth";

export const ISSUER = "https://test-team.cloudflareaccess.com";
export const AUD = "test-aud";

export async function makeSigner() {
  const { publicKey, privateKey } = await generateKeyPair("RS256");
  const jwk = { ...(await exportJWK(publicKey)), kid: "test-key", alg: "RS256" };
  const keys: KeySource = createLocalJWKSet({ keys: [jwk] });

  async function sign(
    claims: JWTPayload,
    opts: { issuer?: string; audience?: string; expiresIn?: string } = {},
  ): Promise<string> {
    return new SignJWT(claims)
      .setProtectedHeader({ alg: "RS256", kid: "test-key" })
      .setIssuer(opts.issuer ?? ISSUER)
      .setAudience(opts.audience ?? AUD)
      .setIssuedAt()
      .setExpirationTime(opts.expiresIn ?? "5m")
      .sign(privateKey);
  }

  return { getKeys: () => keys, sign };
}
```

- [ ] **Step 2: Write the failing tests**

`worker/test/auth.test.ts`:

```ts
import { env } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import { currentEmail } from "../src/auth";
import { makeSigner } from "./tokens";

let signer: Awaited<ReturnType<typeof makeSigner>>;
let other: Awaited<ReturnType<typeof makeSigner>>;

beforeAll(async () => {
  signer = await makeSigner();
  other = await makeSigner();
});

function req(token?: string, url = "https://skope.khorum-oss.org/api/me") {
  return new Request(url, { headers: token ? { "Cf-Access-Jwt-Assertion": token } : {} });
}

describe("currentEmail", () => {
  it("returns the lowercased email for a valid token", async () => {
    const token = await signer.sign({ email: "Josh@Example.com" });
    expect(await currentEmail(req(token), env, signer.getKeys)).toBe("josh@example.com");
  });

  it("returns null when the header is missing", async () => {
    expect(await currentEmail(req(), env, signer.getKeys)).toBeNull();
  });

  it("returns null for a token signed by a different key", async () => {
    const token = await other.sign({ email: "josh@example.com" });
    expect(await currentEmail(req(token), env, signer.getKeys)).toBeNull();
  });

  it("returns null for the wrong audience", async () => {
    const token = await signer.sign({ email: "josh@example.com" }, { audience: "another-app" });
    expect(await currentEmail(req(token), env, signer.getKeys)).toBeNull();
  });

  it("returns null for the wrong issuer", async () => {
    const token = await signer.sign({ email: "josh@example.com" }, { issuer: "https://evil.example" });
    expect(await currentEmail(req(token), env, signer.getKeys)).toBeNull();
  });

  it("returns null for an expired token", async () => {
    const token = await signer.sign({ email: "josh@example.com" }, { expiresIn: "-1m" });
    expect(await currentEmail(req(token), env, signer.getKeys)).toBeNull();
  });

  it("returns null for a token with no email (a service token)", async () => {
    const token = await signer.sign({ common_name: "ci-bot" });
    expect(await currentEmail(req(token), env, signer.getKeys)).toBeNull();
  });

  it("returns null when the Access settings are empty, without fetching keys", async () => {
    const token = await signer.sign({ email: "josh@example.com" });
    const unconfigured = { ...env, ACCESS_TEAM_DOMAIN: "", ACCESS_AUD: "" };
    const getKeys = () => {
      throw new Error("must not be called");
    };
    expect(await currentEmail(req(token), unconfigured, getKeys)).toBeNull();
  });

  it("uses DEV_USER_EMAIL on localhost", async () => {
    const dev = { ...env, DEV_USER_EMAIL: "Dev@Example.com" };
    expect(await currentEmail(req(undefined, "http://localhost:8787/api/me"), dev, signer.getKeys)).toBe(
      "dev@example.com",
    );
  });

  it("ignores DEV_USER_EMAIL on any other host", async () => {
    const dev = { ...env, DEV_USER_EMAIL: "dev@example.com" };
    expect(await currentEmail(req(), dev, signer.getKeys)).toBeNull();
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npx vitest run worker/test/auth.test.ts`
Expected: FAIL, because `../src/auth` does not exist.

- [ ] **Step 4: Write `worker/src/auth.ts`**

```ts
import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from "jose";
import type { Env } from "./env";

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

export async function currentEmail(
  request: Request,
  env: Env,
  getKeys: () => KeySource,
): Promise<string | null> {
  const host = new URL(request.url).hostname;
  if (env.DEV_USER_EMAIL && LOCAL_HOSTS.has(host)) {
    return env.DEV_USER_EMAIL.trim().toLowerCase();
  }

  const token = request.headers.get("Cf-Access-Jwt-Assertion");
  if (!token || !env.ACCESS_TEAM_DOMAIN || !env.ACCESS_AUD) return null;

  try {
    const { payload } = await jwtVerify(token, getKeys(), {
      issuer: env.ACCESS_TEAM_DOMAIN,
      audience: env.ACCESS_AUD,
      algorithms: ["RS256"],
    });
    const email = typeof payload.email === "string" ? payload.email.trim().toLowerCase() : "";
    return email.includes("@") ? email : null;
  } catch (e) {
    console.warn("Access token rejected:", e instanceof Error ? e.name : e);
    return null;
  }
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run worker/test/auth.test.ts && npm run typecheck`
Expected: 10 tests pass; `tsc` prints nothing. The run logs `Access token rejected: …` lines for the rejection cases; that is the intended warning.

- [ ] **Step 6: Commit**

```bash
git add worker/src/auth.ts worker/test/tokens.ts worker/test/auth.test.ts
git commit -m "feat: identify the user from the Cloudflare Access token"
```

---

### Task 4: `GET` and `PUT /api/me`

**Files:**
- Create: `worker/src/profile.ts`
- Modify: `worker/src/app.ts` (replace whole file)
- Modify: `worker/src/index.ts` (replace whole file)
- Delete: `worker/test/app.test.ts` (its case moves into `me.test.ts`, now behind sign-in)
- Test: `worker/test/me.test.ts`

**Interfaces:**
- Consumes: `currentEmail`, `remoteKeys`, `KeySource` (Task 3); `ensureUser`, `updateUser`, `ProfilePatch` (Task 2); `makeSigner` (Task 3).
- Produces:
  - `parseProfilePatch(body: unknown): { ok: true; patch: ProfilePatch } | { ok: false; error: string }`
  - `handleRequest(request: Request, env: Env, getKeys: () => KeySource): Promise<Response>`
  - `GET /api/me` → `200` with `User`
  - `PUT /api/me` with `{ name?, title?, settings? }` → `200` with `User`, or `400`

- [ ] **Step 1: Write the failing tests**

`worker/test/me.test.ts`:

```ts
import { env } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import { handleRequest } from "../src/app";
import { makeSigner } from "./tokens";

let signer: Awaited<ReturnType<typeof makeSigner>>;

beforeAll(async () => {
  signer = await makeSigner();
});

// Tests in a file share one database, so each test signs in as its own user.
async function call(email: string | null, path: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  if (email) headers.set("Cf-Access-Jwt-Assertion", await signer.sign({ email }));
  return handleRequest(new Request(`https://skope.khorum-oss.org${path}`, { ...init, headers }), env, signer.getKeys);
}

function put(email: string, body: string) {
  return call(email, "/api/me", { method: "PUT", body, headers: { "content-type": "application/json" } });
}

describe("/api/*", () => {
  it("rejects a request with no token", async () => {
    const res = await call(null, "/api/me");
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "not signed in" });
  });

  it("returns 404 JSON for an unknown route", async () => {
    const res = await call("unknown-route@example.com", "/api/nope");
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "not found" });
  });
});

describe("GET /api/me", () => {
  it("creates the user on first visit and returns it", async () => {
    const res = await call("first-visit@example.com", "/api/me");
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(await res.json()).toEqual({ email: "first-visit@example.com", name: "first-visit", title: "", settings: {} });
  });

  it("treats differently-cased emails as the same user", async () => {
    await put("Mixed.Case@Example.com", JSON.stringify({ name: "Mixed" }));
    const res = await call("mixed.case@example.com", "/api/me");
    expect(await res.json()).toMatchObject({ email: "mixed.case@example.com", name: "Mixed" });
  });

  it("rejects other methods", async () => {
    expect((await call("methods@example.com", "/api/me", { method: "DELETE" })).status).toBe(405);
  });
});

describe("PUT /api/me", () => {
  it("updates name, title and settings", async () => {
    const res = await put(
      "update@example.com",
      JSON.stringify({ name: "  Josh  ", title: "Engineer", settings: { theme: "light" } }),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      email: "update@example.com",
      name: "Josh",
      title: "Engineer",
      settings: { theme: "light" },
    });
  });

  it("works as the very first request from a new user", async () => {
    const res = await put("put-first@example.com", JSON.stringify({ title: "Engineer" }));
    expect(await res.json()).toMatchObject({ name: "put-first", title: "Engineer" });
  });

  it("keeps the existing name when the new one is blank", async () => {
    await put("blank-name@example.com", JSON.stringify({ name: "Josh" }));
    const res = await put("blank-name@example.com", JSON.stringify({ name: "   " }));
    expect(await res.json()).toMatchObject({ name: "Josh" });
  });

  it("ignores an email in the body", async () => {
    const res = await put("own-email@example.com", JSON.stringify({ email: "someone-else@example.com", name: "Josh" }));
    expect(await res.json()).toMatchObject({ email: "own-email@example.com" });
  });

  it.each([
    ["not json", "body must be JSON"],
    ["[]", "body must be a JSON object"],
    [JSON.stringify({ name: 5 }), "name must be a string"],
    [JSON.stringify({ name: "x".repeat(101) }), "name must be 100 characters or fewer"],
    [JSON.stringify({ title: "x".repeat(101) }), "title must be 100 characters or fewer"],
    [JSON.stringify({ settings: [] }), "settings must be a JSON object"],
    [JSON.stringify({ settings: { blob: "x".repeat(17000) } }), "settings is too large"],
  ])("rejects %s", async (body, error) => {
    const res = await put("invalid@example.com", body);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error });
  });
});
```

- [ ] **Step 2: Delete the superseded test and run to verify failure**

```bash
git rm worker/test/app.test.ts
npx vitest run worker/test/me.test.ts
```

Expected: FAIL. `handleRequest` ignores the token, so the first test gets `404` instead of `401`.

- [ ] **Step 3: Write `worker/src/profile.ts`**

```ts
import type { ProfilePatch } from "./db";

export const MAX_TEXT = 100;
export const MAX_SETTINGS_BYTES = 16 * 1024;

export type ParsedPatch = { ok: true; patch: ProfilePatch } | { ok: false; error: string };

export function parseProfilePatch(body: unknown): ParsedPatch {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return { ok: false, error: "body must be a JSON object" };
  }
  const { name, title, settings } = body as Record<string, unknown>;
  const patch: ProfilePatch = {};

  if (name !== undefined) {
    if (typeof name !== "string") return { ok: false, error: "name must be a string" };
    const trimmed = name.trim();
    if (trimmed.length > MAX_TEXT) return { ok: false, error: `name must be ${MAX_TEXT} characters or fewer` };
    if (trimmed) patch.name = trimmed;
  }

  if (title !== undefined) {
    if (typeof title !== "string") return { ok: false, error: "title must be a string" };
    const trimmed = title.trim();
    if (trimmed.length > MAX_TEXT) return { ok: false, error: `title must be ${MAX_TEXT} characters or fewer` };
    patch.title = trimmed;
  }

  if (settings !== undefined) {
    if (typeof settings !== "object" || settings === null || Array.isArray(settings)) {
      return { ok: false, error: "settings must be a JSON object" };
    }
    if (JSON.stringify(settings).length > MAX_SETTINGS_BYTES) {
      return { ok: false, error: "settings is too large" };
    }
    patch.settings = settings as Record<string, unknown>;
  }

  return { ok: true, patch };
}
```

- [ ] **Step 4: Replace `worker/src/app.ts`**

```ts
import { currentEmail, type KeySource } from "./auth";
import { ensureUser, updateUser } from "./db";
import type { Env } from "./env";
import { parseProfilePatch } from "./profile";

function json(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: { "cache-control": "no-store" } });
}

export async function handleRequest(
  request: Request,
  env: Env,
  getKeys: () => KeySource,
): Promise<Response> {
  const url = new URL(request.url);
  if (!url.pathname.startsWith("/api/")) return env.ASSETS.fetch(request);

  const email = await currentEmail(request, env, getKeys);
  if (!email) return json({ error: "not signed in" }, 401);

  if (url.pathname === "/api/me") {
    if (request.method === "GET") return json(await ensureUser(env.DB, email));
    if (request.method === "PUT") {
      let body: unknown;
      try {
        body = await request.json();
      } catch {
        return json({ error: "body must be JSON" }, 400);
      }
      const parsed = parseProfilePatch(body);
      if (!parsed.ok) return json({ error: parsed.error }, 400);
      await ensureUser(env.DB, email);
      return json(await updateUser(env.DB, email, parsed.patch));
    }
    return json({ error: "method not allowed" }, 405);
  }

  return json({ error: "not found" }, 404);
}
```

- [ ] **Step 5: Replace `worker/src/index.ts`**

```ts
import { handleRequest } from "./app";
import { remoteKeys } from "./auth";
import type { Env } from "./env";

export default {
  fetch(request: Request, env: Env): Promise<Response> {
    return handleRequest(request, env, () => remoteKeys(env));
  },
} satisfies ExportedHandler<Env>;
```

- [ ] **Step 6: Run the full suite and the typecheck**

Run: `npm test && npm run typecheck`
Expected: 3 files, 31 tests pass; `tsc` prints nothing.

- [ ] **Step 7: Check the local sign-in bypass**

```bash
echo 'DEV_USER_EMAIL=dev@example.com' > .dev.vars
npx wrangler d1 migrations apply skope --local
npx wrangler dev --port 8787
```

In a second terminal:

```bash
curl -s http://localhost:8787/api/me
curl -s -o /dev/null -w '%{http_code}\n' -H 'Host: skope.khorum-oss.org' http://localhost:8787/api/me
```

Expected: the first prints `{"email":"dev@example.com","name":"dev","title":"","settings":{}}`; the second prints `401`, because the bypass only applies to a local hostname. Stop the server.

- [ ] **Step 8: Commit**

```bash
git add worker/src/profile.ts worker/src/app.ts worker/src/index.ts worker/test/me.test.ts
git commit -m "feat: add GET and PUT /api/me"
```

---

### Task 5: Use the real signed-in user in the app

**Files:**
- Modify: `web/index.html` (six edits, each located by its exact current text)

**Interfaces:**
- Consumes: `GET /api/me` and `PUT /api/me` from Task 4.
- Produces: nothing for later tasks.

There is no automated test harness for the bundle. Each edit is checked by hand in Step 7.

How the page boots, for context: `support.js` replaces the `<x-dc>` element with `<div id="dc-root">` and renders the `Component` class into it. Anything in `<head>` and the class on `<html>` are left alone. The component's initial `screen` is `'auth'` (the mock login).

- [ ] **Step 1: Hide the app until the user is known**

Find:

```html
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
```

Replace with:

```html
<html class="skope-boot">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
  .skope-boot x-dc,.skope-boot #dc-root{visibility:hidden}
  #skope-boot-error{position:fixed;inset:0;z-index:9999;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;background:#111;color:#eee;font:15px/1.5 system-ui,sans-serif;text-align:center;padding:24px}
  #skope-boot-error button{font:inherit;padding:8px 18px;border-radius:6px;border:1px solid #666;background:#222;color:#eee;cursor:pointer}
</style>
```

- [ ] **Step 2: Load the user on mount**

Find:

```js
  componentDidMount(){
    this.applyTheme();
```

Replace with:

```js
  // The signed-in user comes from the server (Cloudflare Access). There is no in-app login.
  async loadMe(){
    try{
      const r=await fetch('/api/me',{headers:{accept:'application/json'}});
      if(!r.ok) throw new Error('HTTP '+r.status);
      const u=await r.json();
      this.setState(s=>({profile:{name:u.name,email:u.email,title:u.title||''},screen:s.screen==='auth'?'projects':s.screen}),
        ()=>document.documentElement.classList.remove('skope-boot'));
    }catch(e){
      console.warn('Daidal: could not load the signed-in user —',e&&e.message);
      if(document.getElementById('skope-boot-error')) return;
      const el=document.createElement('div'); el.id='skope-boot-error';
      const msg=document.createElement('div'); msg.textContent='Daidal couldn’t load your account. Your sign-in may have expired.';
      const btn=document.createElement('button'); btn.textContent='Reload'; btn.onclick=()=>location.reload();
      el.append(msg,btn); document.body.appendChild(el);
    }
  }

  componentDidMount(){
    this.applyTheme();
    this.loadMe();
```

An expired Access session makes the `fetch` fail (Access answers with a cross-origin redirect), which lands in the `catch`. Reloading the page sends the browser through Access again.

- [ ] **Step 3: Make "Sign out" real**

Find:

```js
    vals.signOut=()=>{ setS({userMenu:false,screen:'auth',authMode:'login',authPass:'',authEmail:'',modal:null,sel:null}); this.toast('Signed out — prototype only'); };
```

Replace with:

```js
    vals.signOut=()=>{ setS({userMenu:false});
      if(location.hostname==='localhost'||location.hostname==='127.0.0.1'){ this.toast('Sign-out goes through Cloudflare Access on the deployed site'); return; }
      location.href='/cdn-cgi/access/logout'; };
```

- [ ] **Step 4: Save the profile to the server**

Find:

```js
    vals.saveProfile=()=>{ const d=st.profDraft||me;
      setS({profile:{name:(d.name||'').trim()||me.name,email:(d.email||'').trim()||me.email,title:d.title||''},modal:null,profDraft:null});
      this.toast('Profile updated'); };
```

Replace with:

```js
    vals.saveProfile=async()=>{ const d=st.profDraft||me;
      const name=(d.name||'').trim()||me.name, title=d.title||'';
      try{
        const r=await fetch('/api/me',{method:'PUT',headers:{'content-type':'application/json'},body:JSON.stringify({name,title})});
        if(!r.ok){ const b=await r.json().catch(()=>({})); throw new Error(b.error||('HTTP '+r.status)); }
        const u=await r.json();
        setS({profile:{name:u.name,email:u.email,title:u.title||''},modal:null,profDraft:null});
        this.toast('Profile updated');
      }catch(e){ this.toast('Couldn’t save your profile — '+(e&&e.message||'try again')); } };
```

On failure the dialog stays open with the user's edits intact.

- [ ] **Step 5: Stop the email field from being edited**

The email is the sign-in identity, so the server ignores it. Find:

```js
    vals.setPEmail=e=>setPD({email:e.target.value});
```

Replace with:

```js
    vals.setPEmail=()=>this.toast('Your email comes from your sign-in and can’t be changed here');
```

- [ ] **Step 6: Keep "reset prototype data" from restoring the mock login**

`resetLocal` puts every persisted key back to its initial value. That includes `screen` (initially `'auth'`) and `profile` (initially "Maya Kaur"). Find, inside `resetLocal`:

```js
      authMode:'login',authName:'',authEmail:'',authPass:''});
    this._centered=null;
```

Replace with:

```js
      authMode:'login',authName:'',authEmail:'',authPass:'',
      screen:'projects',profile:this.state.profile});
    this._centered=null;
```

Then confirm nothing else can show the mock login:

```bash
grep -c "screen:'auth'" web/index.html
```

Expected: `1`, the initial `state = { screen:'auth', …`. `loadMe` moves the app off it before the page becomes visible.

- [ ] **Step 7: Check by hand**

```bash
npx wrangler dev --port 8787
```

With `.dev.vars` from Task 4 in place, open `http://localhost:8787/` and confirm each of these:

1. The page opens on the project browser. The mock login never flashes, including on a hard reload with the network throttled to "Slow 4G".
2. The user menu shows `dev` and `dev@example.com`, not "Maya Kaur".
3. Open the profile dialog, change the name to `Dev User` and the title to `Tester`, save. The toast says "Profile updated". Reload: the new name and title are still shown.
4. In the profile dialog, type in the email field. A toast explains it can't be changed and the value does not change.
5. Click "Sign out". A toast explains sign-out happens on the deployed site, and the app stays where it is.
6. Stop the server, then reload the page. The "Daidal couldn't load your account" message appears with a Reload button. Start the server and click Reload: the app loads.
7. Run the app's "reset prototype data" action. The app lands on the project browser, and the user menu still shows your name and email.

- [ ] **Step 8: Commit**

```bash
git add web/index.html
git commit -m "feat: show the signed-in user and save the profile through /api/me"
```

---

### Task 6: Deploy from GitHub Actions behind Access

**Files:**
- Create: `.github/workflows/deploy.yml`
- Modify: `wrangler.jsonc`

**Interfaces:**
- Consumes: `npm test`, `npm run typecheck`, the migration from Task 1.
- Produces: the live site at `https://skope.khorum-oss.org`.

Steps 1 to 4 are done by the repo owner in the Cloudflare dashboard and GitHub. They cannot be scripted from this repo.

- [ ] **Step 1: Create the D1 database**

```bash
npx wrangler login
npx wrangler d1 create skope
```

Copy the `database_id` from the output.

- [ ] **Step 2: Create the Access application before anything is deployed**

Doing this first means the site is never reachable without sign-in.

1. In the Cloudflare dashboard, open Zero Trust → Access → Applications → Add an application → Self-hosted.
2. Application domain: `skope.khorum-oss.org`.
3. Add a policy: action Allow, include Emails, and list each allowed email address.
4. Save, then copy the application's **AUD tag** from its overview.
5. Note the **team domain** from Zero Trust → Settings (it looks like `<team>.cloudflareaccess.com`).

- [ ] **Step 3: Check for an existing `skope` DNS record**

In the dashboard, open the `khorum-oss.org` zone → DNS → Records. If a record named `skope` exists, delete it. A Worker custom domain cannot be attached while another record holds the name.

- [ ] **Step 4: Add the GitHub secrets**

Create an API token at Cloudflare → My Profile → API Tokens, starting from the "Edit Cloudflare Workers" template, scoped to this account and the `khorum-oss.org` zone, and add the permission Account → D1 → Edit.

In `khorum-oss/skope` → Settings → Secrets and variables → Actions, add:

- `CLOUDFLARE_API_TOKEN`: the token
- `CLOUDFLARE_ACCOUNT_ID`: the account id shown on the Workers overview page

- [ ] **Step 5: Fill in `wrangler.jsonc`**

Replace the whole file, substituting the three values from Steps 1 and 2 where marked:

```jsonc
{
  "$schema": "node_modules/wrangler/config-schema.json",
  "name": "skope",
  "main": "worker/src/index.ts",
  "compatibility_date": "2026-10-01",
  "workers_dev": false,
  "preview_urls": false,
  "routes": [{ "pattern": "skope.khorum-oss.org", "custom_domain": true }],
  "assets": { "directory": "./web", "binding": "ASSETS" },
  "d1_databases": [
    // database_id: the id printed by `wrangler d1 create skope`
    { "binding": "DB", "database_name": "skope", "database_id": "00000000-0000-0000-0000-000000000000", "migrations_dir": "migrations" }
  ],
  "vars": {
    // ACCESS_TEAM_DOMAIN: "https://" + the team domain, with no trailing slash
    "ACCESS_TEAM_DOMAIN": "",
    // ACCESS_AUD: the Access application's AUD tag
    "ACCESS_AUD": ""
  }
}
```

If either `vars` value is left empty the Worker rejects every API request with `401`, so a missed value fails closed.

Run: `npm test && npm run typecheck`
Expected: 31 tests pass. The tests override both `vars`, so real values do not affect them.

- [ ] **Step 6: Write `.github/workflows/deploy.yml`**

```yaml
name: deploy

on:
  push:
    branches: [main]
  pull_request:

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - run: npm run typecheck
      - run: npm test

  deploy:
    needs: test
    if: github.event_name == 'push' && github.ref == 'refs/heads/main'
    runs-on: ubuntu-latest
    concurrency: deploy
    env:
      CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}
      CLOUDFLARE_ACCOUNT_ID: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - run: npx wrangler d1 migrations apply skope --remote
      - run: npx wrangler deploy
```

Pull requests run tests only. The deploy job runs only for pushes to `main`, so secrets are never exposed to a fork's pull request.

- [ ] **Step 7: Commit and push**

```bash
git add wrangler.jsonc .github/workflows/deploy.yml
git commit -m "ci: test, migrate and deploy to Cloudflare on push to main"
git push -u origin main
```

Watch the run: `gh run watch`
Expected: both jobs succeed.

- [ ] **Step 8: Verify the live site**

Access must be in front of everything:

```bash
curl -sI https://skope.khorum-oss.org/api/me | grep -iE '^(HTTP|location)'
curl -sI https://skope.khorum-oss.org/ | grep -iE '^(HTTP|location)'
```

Expected: both print a `302` and a `location:` on `cloudflareaccess.com`.

Then, in a browser:

1. Open `https://skope.khorum-oss.org`, sign in with an allowed email. The project browser appears and the user menu shows that email.
2. Change the profile name, reload, confirm it persisted.
3. Click "Sign out". The Access logged-out page appears; reopening the site asks for sign-in again.
4. In a private window, try an email that is not on the allowlist. Access refuses it.

Confirm the row exists:

```bash
npx wrangler d1 execute skope --remote --command "SELECT email, name FROM users"
```

Expected: one row with the signed-in email.
