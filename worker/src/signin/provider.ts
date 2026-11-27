/**
 * The sign-in provider interface. A provider turns a sign-in into a verified identity: who the person is to that
 * provider (a stable subject) and a verified email, which is how Daidal knows them. Two kinds:
 *
 * - **redirect**: Daidal's own sign-in page sends the browser to the provider and back (OAuth 2.0 or OpenID Connect,
 *   always with PKCE and `state`). Daidal then keeps a session of its own (worker/src/signin/sessions.ts).
 * - **header**: something in front of Daidal has already signed the person in and says so on every request
 *   (Cloudflare Access, or a forward-auth proxy such as Authelia, Authentik or oauth2-proxy). No session is kept.
 *
 * The built-in providers live in this folder. Any other provider is a package of its own that exports a
 * `ProviderPlugin` (see docs/sign-in.md and examples/daidal-auth-gitlab), added to a self-hosted build through
 * `DAIDAL_AUTH_PLUGINS`; no change to this repository is needed.
 */

/** Who signed in, as the provider vouches for it. */
export interface VerifiedIdentity {
  /** The configured provider's id, such as `github`. */
  provider: string;
  /** The provider's stable id for the person: never their email, which can change. */
  subject: string;
  /** An email the provider has checked belongs to the person. Lower case. */
  email: string;
  /** Their name, when the provider gives one; used for a new account's display name. */
  name?: string;
}

interface ProviderBase {
  /** The configured id, unique on the instance; it appears in URLs (`/auth/start/<id>`). */
  id: string;
  /** What the sign-in page shows: "Sign in with <name>". */
  name: string;
  /** An optional icon for the sign-in page: one of the app's icon names, such as `githubLogo`. */
  icon?: string;
}

/** What Daidal hands a redirect provider to start a sign-in. */
export interface StartInput {
  /** Where the provider sends the browser back: `<origin>/auth/callback/<id>`. */
  redirectUri: string;
  state: string;
  /** The PKCE challenge (S256) for the verifier Daidal keeps. */
  codeChallenge: string;
  /** For OpenID Connect: the value the ID token must carry. */
  nonce: string;
}

/** What Daidal hands a redirect provider when the browser comes back. */
export interface CallbackInput {
  /** The callback's query, already checked against `state`. */
  params: URLSearchParams;
  redirectUri: string;
  codeVerifier: string;
  nonce: string;
}

export interface RedirectProvider extends ProviderBase {
  kind: "redirect";
  /** The provider's authorization URL for this sign-in. */
  authorizeUrl(input: StartInput): Promise<string>;
  /** The verified identity from the provider's answer, or a thrown SignInError. */
  callback(input: CallbackInput): Promise<VerifiedIdentity>;
}

export interface HeaderProvider extends ProviderBase {
  kind: "header";
  /** The identity something in front of Daidal put on this request, or null when there is none it can trust. */
  identify(request: Request): Promise<VerifiedIdentity | null>;
  /**
   * Where signing out sends the browser, such as the proxy's own logout page. A function gets the address to come
   * back to afterwards (the app's home page), for a logout that can send the browser on.
   */
  signOutUrl?: string | ((returnTo: string) => string);
  /** Cookies on Daidal's own host that signing out clears, such as Access's `CF_Authorization`. */
  signOutCookies?: string[];
}

export type Provider = RedirectProvider | HeaderProvider;

/** What a provider is made from. */
export interface ProviderContext {
  /** The provider's configured id. */
  id: string;
  /** Its settings from `DAIDAL_AUTH_PROVIDERS`, minus `id` and `type`. Never secrets. */
  options: Record<string, unknown>;
  /**
   * A secret from the environment, by name. A provider's own client secret is `DAIDAL_AUTH_SECRET_<ID>`
   * (the id upper-cased, `-` as `_`): `secret()` with no name returns that one.
   */
  secret(name?: string): string | undefined;
  /** fetch, for talking to the provider. */
  fetch: typeof fetch;
}

/** What an outside package exports: the `type` it is configured by, and how to make one. */
export interface ProviderPlugin {
  type: string;
  create(context: ProviderContext): Provider;
}

/** Why a sign-in didn't work, as a short code the sign-in page explains. */
export type SignInFailure = "failed" | "unverified" | "denied" | "expired" | "unknown";

export class SignInError extends Error {
  constructor(
    readonly code: SignInFailure,
    message: string,
  ) {
    super(message);
  }
}

/** For plugin authors: returns [plugin] as it is, typed. */
export const defineProvider = (plugin: ProviderPlugin): ProviderPlugin => plugin;
