# Security

How Daidal handles sign-in, tokens, headers, limits and personal data is written up in
[`docs/security.md`](docs/security.md). Please read it before reporting; several things that look like findings
(the `DEV_USER_EMAIL` bypass, the placeholder database id in `wrangler.jsonc`) are described there as intended.

## Reporting a vulnerability

Use GitHub's **private vulnerability reporting** on this repository (Security → Report a vulnerability). Please do
not open a public issue for a security problem.

Include what you found, where (file and line, or request and response), and how to reproduce it. You will get an
acknowledgement within 72 hours and a fix or a reasoned response within 14 days for anything confirmed. Credit goes
in the release notes unless you prefer otherwise.

## Scope

- The code in this repository: the Worker (`worker/`), the app (`app/`), the migrations and the CI workflow.
- The hosted instance at `skope.khorum-oss.org`, within reason: no denial-of-service, no testing against other
  people's workspaces, no automated scanning that generates load.

Out of scope: the Cloudflare platform itself, third-party dependencies (report upstream, then tell us), and anything
that needs physical access to a device.
