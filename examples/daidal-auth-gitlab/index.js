// An example Daidal sign-in provider plugin: GitLab (gitlab.com or your own GitLab), through a GitLab OAuth
// application with PKCE. Copy this package to start your own: a plugin is a default export of `{ type, create }`,
// where `create(context)` returns a provider (see docs/sign-in.md in the Daidal repository for the interface).
//
// Configure it in DAIDAL_AUTH_PROVIDERS:
//   { "id": "gitlab", "type": "gitlab", "clientId": "…", "baseUrl": "https://gitlab.example.com" }
// with the application's secret in DAIDAL_AUTH_SECRET_GITLAB, and build with DAIDAL_AUTH_PLUGINS=daidal-auth-gitlab.

/** @param {Record<string, unknown>} options @param {string} key */
const option = (options, key) => (typeof options[key] === "string" && options[key].trim() ? options[key].trim() : undefined);

/** A sign-in failure the sign-in page explains: code is "failed", "unverified" or "denied". */
class SignInError extends Error {
  /** @param {"failed" | "unverified" | "denied"} code @param {string} message */
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

export default {
  type: "gitlab",
  /** @param {import("./index.js").ProviderContext} ctx */
  create(ctx) {
    const clientId = option(ctx.options, "clientId");
    if (!clientId) throw new Error(`sign-in provider "${ctx.id}" needs a clientId`);
    const base = (option(ctx.options, "baseUrl") ?? "https://gitlab.com").replace(/\/$/, "");
    if (!base.startsWith("https://")) throw new Error(`sign-in provider "${ctx.id}": baseUrl must be https`);

    return {
      kind: "redirect",
      id: ctx.id,
      name: option(ctx.options, "name") ?? "GitLab",
      icon: option(ctx.options, "icon") ?? "gitBranch",

      async authorizeUrl({ redirectUri, state, codeChallenge }) {
        const url = new URL(`${base}/oauth/authorize`);
        url.search = new URLSearchParams({
          client_id: clientId,
          redirect_uri: redirectUri,
          response_type: "code",
          scope: "read_user",
          state,
          code_challenge: codeChallenge,
          code_challenge_method: "S256",
        }).toString();
        return url.href;
      },

      async callback({ params, redirectUri, codeVerifier }) {
        if (params.get("error")) throw new SignInError(params.get("error") === "access_denied" ? "denied" : "failed", "GitLab refused the sign-in");
        const code = params.get("code");
        if (!code) throw new SignInError("failed", "GitLab sent no code");
        const body = new URLSearchParams({ grant_type: "authorization_code", code, redirect_uri: redirectUri, client_id: clientId, code_verifier: codeVerifier });
        const secret = ctx.secret();
        if (secret) body.set("client_secret", secret);
        const tokenRes = await ctx.fetch(`${base}/oauth/token`, { method: "POST", headers: { accept: "application/json", "content-type": "application/x-www-form-urlencoded" }, body });
        const tokens = tokenRes.ok ? await tokenRes.json() : {};
        if (typeof tokens.access_token !== "string") throw new SignInError("failed", "GitLab sent no access token");

        const userRes = await ctx.fetch(`${base}/api/v4/user`, { headers: { authorization: `Bearer ${tokens.access_token}` } });
        if (!userRes.ok) throw new SignInError("failed", `GitLab's user API answered ${userRes.status}`);
        const user = await userRes.json();
        // GitLab sets confirmed_at once the account's primary email is confirmed.
        if (typeof user.email !== "string" || !user.email.includes("@") || !user.confirmed_at) {
          throw new SignInError("unverified", "the GitLab account's email isn't confirmed");
        }
        return { provider: ctx.id, subject: String(user.id), email: user.email.trim().toLowerCase(), name: user.name || user.username };
      },
    };
  },
};
