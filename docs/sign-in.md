# Sign-in

How people sign in to Daidal, how to choose the ways they can, and how to add one Daidal doesn't ship. The hosted
site needs none of this: with nothing configured, Cloudflare Access stays the only way in, exactly as before.

## The two kinds of provider

- **Sign-in page providers** (`redirect`): Daidal's own page at `/app/signin` lists them as **Continue with …**
  buttons. The browser goes to the provider and comes back to `/auth/callback/<id>`; Daidal then keeps a session of
  its own. Built in: generic **OpenID Connect** (`oidc`), **Google** (`google`) and **GitHub** (`github`).
- **Header providers** (`header`): something in front of Daidal has already signed the person in and says so on every
  request. Built in: **Cloudflare Access** (`access`) and **forward-auth** (`forward-auth`) for a proxy such as
  Authelia, Authentik or oauth2-proxy. Daidal keeps no session for these; signing out goes to the proxy's own logout.

Either way a provider hands Daidal the same thing: a stable subject (the provider's id for the person) and an email
the provider has verified. The email is the Daidal account.

## Turning providers on

All of it is environment (Worker vars and secrets), so no code changes for the built-ins.

| Variable | What it holds |
|----------|---------------|
| `DAIDAL_AUTH_PROVIDERS` | A JSON array, one object per provider: `id` (lower case letters, digits and `-`, unique), `type`, and that type's settings. The sign-in page shows them in this order. |
| `DAIDAL_AUTH_SECRET_<ID>` | A provider's client secret, as a Worker secret. `<ID>` is its id upper-cased with `-` as `_` (`corp-sso` → `DAIDAL_AUTH_SECRET_CORP_SSO`). Never put a secret in `DAIDAL_AUTH_PROVIDERS`. |
| `DAIDAL_AUTH_ALLOW` | Who may sign in through the sign-in page: emails and `@domains`, separated by commas or spaces, or `*` for anyone the provider verifies. **Unset, nobody can**, so turning GitHub on never opens the site to all of GitHub by mistake. Header providers aren't limited by it, since the proxy's own policy already decides. |
| `DAIDAL_PUBLIC_URL` | The address people reach Daidal at, such as `https://diagrams.example.com`, when a proxy in front changes the host the Worker sees. Callback URLs are built from it. |
| `DAIDAL_AUTH_PLUGINS` | At build time only: npm packages that add provider types (see *Adding a provider*). |

Unset `DAIDAL_AUTH_PROVIDERS` means Cloudflare Access alone when `ACCESS_AUD` is set, and no way in otherwise. A
configured entry that is broken (a bad or repeated id, an unknown type, missing settings) is left out and logged, so
one mistake doesn't lock everyone out of the others.

An example with a company identity provider, GitHub for a few contractors, and Access still in front for staff:

```
DAIDAL_AUTH_PROVIDERS='[
  { "id": "corp", "type": "oidc", "name": "Example SSO", "issuer": "https://login.example.com", "clientId": "daidal" },
  { "id": "github", "type": "github", "clientId": "Iv1.0123456789" },
  { "id": "access", "type": "access" }
]'
DAIDAL_AUTH_SECRET_CORP=…
DAIDAL_AUTH_SECRET_GITHUB=…
DAIDAL_AUTH_ALLOW='@example.com, sam@contractor.dev'
```

Register each sign-in page provider with the callback `https://<your Daidal>/auth/callback/<id>`.

### Settings by type

- **`oidc`**: `issuer` and `clientId` (required); `name`, `icon`, `scopes` (default `openid email profile`),
  `trustEmail`. The issuer's discovery document must name the same issuer and use https endpoints; ID tokens are
  checked for signature, issuer, audience, expiry and the sign-in's nonce. An email counts only when the token (or
  userinfo) says `email_verified`; set `trustEmail: true` only for a provider whose emails are always the person's
  own, such as a company directory. No secret means a public client (PKCE alone).
- **`google`**: `clientId` (required), `name`, `icon`. OpenID Connect against `https://accounts.google.com`.
- **`github`**: `clientId` (required), `name`, `icon`. A GitHub OAuth app; Daidal asks for `read:user user:email`
  and uses your primary verified email (or another verified one). The subject is your GitHub user id, so renaming
  your login changes nothing.
- **`access`**: `name`, `icon`. Uses `ACCESS_TEAM_DOMAIN` and `ACCESS_AUD`, as before. Sign out clears the
  application's `CF_Authorization` cookie and goes to the team domain's logout, which ends the Access session and comes
  back to the app, where Access asks you to sign in again. If your identity provider (Google, say) still remembers
  you, Access may sign you straight back in; that session is the identity provider's, not Daidal's.
- **`forward-auth`**: `trustedProxies` (required: the proxy addresses, matched against `CF-Connecting-IP`; headers
  from anywhere else are ignored); `emailHeader` (default `Remote-Email`), `userHeader` (`Remote-User`), `nameHeader`
  (`Remote-Name`), `signOutUrl`, `name`, `icon`. Only use it where the proxy is the only way to reach Daidal.

## Sessions

A sign-in page sign-in sets one cookie, `__Host-daidal-session` (HttpOnly, Secure, SameSite=Lax, whole site, 30
days). It holds a random 256-bit token; Daidal stores only its SHA-256 hash, with the account and when it ends, so:

- **Sign out** (your initial → **Sign out**) ends this browser's session on the server at once.
- **Sign out everywhere** (`DELETE /api/me/sessions`) ends all of your sessions. Personal access tokens can't call it.
- **Delete my account** ends every session and forgets your linked sign-ins.

A sign-in in progress keeps its `state`, PKCE verifier, nonce and return address for ten minutes (`sign_in_states`,
by the hash of `state`, with `state` itself in a `__Host-daidal-signin` cookie), and is used once: a callback link
opened in another browser, or opened twice, signs nobody in. After signing in you return only to a page of the app.

The first time a provider's subject signs in, it is linked to the account with its verified email (`identities`,
migration 0008), and that subject keeps that account after, even if the provider later reports another email.

Changes made with the session cookie must come from Daidal's own pages (a matching `Origin`, or
`Sec-Fetch-Site: same-origin`); anything else gets a 403.

## AI clients and tokens

Nothing changes for MCP: online clients sign in through Cloudflare Access (Managed OAuth), and personal access tokens
work as before (`docs/mcp.md`). A self-hosted Daidal without Access uses personal access tokens for AI clients.

## Adding a provider

A provider Daidal doesn't ship is a package of its own; Daidal doesn't change for it. Workers can't load code at run
time, so the package is bundled when you build:

1. `npm install` the package next to Daidal.
2. Build with `DAIDAL_AUTH_PLUGINS=<package>[,<package>…] npm run build`. `scripts/auth-plugins.mjs` writes
   `worker/src/signin/plugins.generated.ts`, importing each one; the default build has none.
3. Name its `type` in `DAIDAL_AUTH_PROVIDERS`.

A plugin's default export is `{ type, create(context) }` (`ProviderPlugin` in `worker/src/signin/provider.ts`).
`context` has the provider's `id`, its `options` from `DAIDAL_AUTH_PROVIDERS`, `secret()` for
`DAIDAL_AUTH_SECRET_<ID>`, and `fetch`. `create` returns either kind of provider:

- a **redirect** provider: `authorizeUrl({ redirectUri, state, codeChallenge, nonce })` returns where to send the
  browser, and must pass `state` and the S256 `codeChallenge` on; `callback({ params, redirectUri, codeVerifier,
  nonce })` swaps the code (with the verifier) for the person and returns `{ provider: id, subject, email, name? }`.
- a **header** provider: `identify(request)` returns the same, or null. It may give a `signOutUrl` (an address, or a
  function of the address to come back to) and `signOutCookies` to clear on Daidal's host when signing out.

Return an email only once the provider has verified it belongs to the person, and a subject that never changes
(never the email). Throw `SignInError("unverified" | "failed", …)` otherwise; the sign-in page explains each code.
`examples/daidal-auth-gitlab` is a complete one for GitLab, with its own README and type declarations.
