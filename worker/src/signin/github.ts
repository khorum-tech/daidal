import { codeOf, exchangeCode, optionalString, requireString } from "./oidc";
import { SignInError, type ProviderContext, type RedirectProvider } from "./provider";

/**
 * GitHub, through a GitHub OAuth app (authorization code with PKCE and `state`). GitHub has no ID token, so the
 * identity comes from its API: the subject is the account's numeric id (it survives a rename), and the email is the
 * account's primary email if GitHub has verified it, else its first verified one. Scope `read:user user:email`.
 *
 * Settings: `clientId` (required), and optionally `name` and `icon`. Secret: `DAIDAL_AUTH_SECRET_<ID>`.
 */
const AUTHORIZE = "https://github.com/login/oauth/authorize";
const TOKEN = "https://github.com/login/oauth/access_token";
const API = "https://api.github.com";

interface GitHubEmail {
  email: string;
  primary: boolean;
  verified: boolean;
}

export function githubProvider(ctx: ProviderContext): RedirectProvider {
  const clientId = requireString(ctx.options, "clientId", ctx.id);

  async function api<T>(path: string, token: string): Promise<T> {
    const res = await ctx.fetch(`${API}${path}`, {
      headers: { accept: "application/vnd.github+json", authorization: `Bearer ${token}`, "user-agent": "daidal", "x-github-api-version": "2022-11-28" },
    });
    if (!res.ok) throw new SignInError("failed", `GitHub's ${path} answered ${res.status}`);
    return (await res.json()) as T;
  }

  return {
    kind: "redirect",
    id: ctx.id,
    name: optionalString(ctx.options, "name") ?? "GitHub",
    icon: optionalString(ctx.options, "icon") ?? "key",

    async authorizeUrl(input) {
      const url = new URL(AUTHORIZE);
      url.search = new URLSearchParams({
        client_id: clientId,
        redirect_uri: input.redirectUri,
        scope: "read:user user:email",
        state: input.state,
        code_challenge: input.codeChallenge,
        code_challenge_method: "S256",
        allow_signup: "false",
      }).toString();
      return url.href;
    },

    async callback(input) {
      const code = codeOf(input.params);
      const tokens = await exchangeCode(ctx, TOKEN, clientId, { code, redirectUri: input.redirectUri, codeVerifier: input.codeVerifier });
      if (typeof tokens.access_token !== "string") throw new SignInError("failed", "GitHub sent no access token");
      const [user, emails] = await Promise.all([
        api<{ id: number; name?: string | null; login: string }>("/user", tokens.access_token),
        api<GitHubEmail[]>("/user/emails", tokens.access_token),
      ]);
      const verified = emails.filter(e => e.verified && e.email.includes("@"));
      const chosen = verified.find(e => e.primary) ?? verified[0];
      if (!chosen) throw new SignInError("unverified", "the GitHub account has no verified email");
      if (typeof user.id !== "number") throw new SignInError("failed", "GitHub gave no account id");
      return { provider: ctx.id, subject: String(user.id), email: chosen.email.trim().toLowerCase(), name: user.name || user.login };
    },
  };
}
