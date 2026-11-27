# daidal-auth-gitlab

An example sign-in provider plugin for a self-hosted Daidal: sign in with GitLab (gitlab.com or your own GitLab).
It lives in the Daidal repository only as a template. A real plugin is a package of its own, published or kept in
your own registry, and Daidal never needs to change for it.

## Use it

1. Make a GitLab OAuth application with the scope `read_user` and the redirect URI
   `https://<your Daidal>/auth/callback/gitlab`.
2. Install the package next to Daidal (`npm install daidal-auth-gitlab`) and build with
   `DAIDAL_AUTH_PLUGINS=daidal-auth-gitlab npm run build`.
3. Turn it on:
   ```
   DAIDAL_AUTH_PROVIDERS='[{ "id": "gitlab", "type": "gitlab", "clientId": "…", "baseUrl": "https://gitlab.example.com" }]'
   DAIDAL_AUTH_SECRET_GITLAB=<the application's secret>
   DAIDAL_AUTH_ALLOW=@example.com
   ```

## Write your own

Copy this folder. A plugin's default export is `{ type, create }`: `type` is what `DAIDAL_AUTH_PROVIDERS` names,
and `create(context)` returns a provider. `index.d.ts` has the interface, and Daidal's `docs/sign-in.md` explains
each part, including what a provider must check before it vouches for an email.
