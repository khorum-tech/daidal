# Stage

Code owners' pull requests take turns on **https://skope-stage.khorum-oss.org**: a deploy puts that
branch there and resets its database to the invented stage diagrams in [`stage/diagrams.ts`](../stage/diagrams.ts).
The `stage` job in [`.github/workflows/deploy.yml`](../.github/workflows/deploy.yml) does it, after `test` passes.

- **One shared stage, in turn.** A Worker `skope-stage`, a D1 `skope-stage`, one hostname. The **oldest open PR**
  (lowest number, opened by a code owner, not a draft) has it, and its pushes redeploy it. A newer PR doesn't deploy; its stage comment
  says it's waiting and which PR has stage. **A merge or close deploys nothing**: stage keeps
  showing what it had. The next PR in line takes stage on its own next push (merge `main` into it, say), or a code
  owner puts it there by hand.
  A draft never takes stage: mark it ready for review to put it in line. Nor does a bot's PR (Dependabot's): its
  runs get none of stage's secrets, so it would hold stage without deploying.
- **Only code owners' PRs auto-deploy.** The line holds only PRs opened by someone named in
  [`.github/CODEOWNERS`](../.github/CODEOWNERS), as that file stands **on `main`** (a PR can't add its own
  author). Anyone else's PR says on its stage comment that a code owner can put it there by hand. Name people in
  CODEOWNERS (`@user`); the stage job doesn't read teams. With no CODEOWNERS on `main`, nothing auto-deploys.
- **Or by hand, with a hold.** **Actions → deploy → Run workflow** (leave *Use workflow from* on `main`), name a
  **branch**, and run. Tests run on that branch; then that exact commit goes on stage whatever the line says.
  Only code owners get past the check. The options:
  - *Hold* (on by default): stage stays on that branch. No PR push moves it, and each PR's stage
    comment says stage is held. Stacked PRs can't overwrite what you're testing.
  - *Reset data* (on by default): untick it to deploy the code and keep what's in stage's database (migrations
    still run).
  - *Release*: run it again with *release* ticked (branch ignored) to end the hold. The PR first in line deploys
    straight away. Deploying another branch by hand also replaces the hold, or clears it if *hold* is unticked.

  The hold lives as a GitHub deployment on a `stage-hold` environment (GitHub creates it the first time; it
  needs no settings). Its latest status reads *success* while held and *inactive* once released.
- **Not a security boundary.** A same-repository PR runs its own copy of the workflow, so anyone with write access
  could edit these checks away on their branch. The code-owner gate keeps the line tidy. The real guard on stage's
  token stays the `stage` environment's settings, plus who you give write access to.
- **Only the owner signs in.** Stage has its own Access application, narrower than prod's.
- **Stage data is throwaway.** It holds only the invented data, never a real backup, and every deploy resets it.
- **Fork PRs get no stage.** The job runs only for branches of this repository. Never change it to
  `pull_request_target`: that would run a stranger's code with the Cloudflare token.
- `workers_dev` and `preview_urls` stay off, as in prod, and the `DEV_USER_EMAIL` sign-in stays localhost-only.

Until the two repository variables and the secret below are set, the `stage` job passes with a notice and deploys nothing.

## One-time setup

1. **Create the database.** Run `npx wrangler d1 create skope-stage` and copy the `database_id` it prints.
2. **Create the Access application.** In Cloudflare Zero Trust, go to *Access → Applications → Add an application
   → Self-hosted*. Set the domain to `skope-stage.khorum-oss.org`, and add one **Allow** policy that includes only
   your own sign-in email. Save it, open it again and copy its **Application Audience (AUD) tag**.
3. **Set the GitHub Actions settings.** In *Settings → Environments → New environment*, make one named `stage`.
   Leave *Deployment branches* open to all branches (every PR branch deploys) and add no required reviewers. Put
   these in it (repository-level settings work too; the `Prod` environment's are never visible to stage):
   - `STAGE_D1_ID` (step 1) and `STAGE_ACCESS_AUD` (step 2). Make them **secrets**: this repository's Actions logs
     are public, and GitHub masks a secret's value in them but prints a variable's. (A variable still works.)
   - Secret `STAGE_OWNER_EMAIL`, the email you sign in to Access with. The stage data is owned by this address.
     It is a secret so GitHub masks it in this public repository's logs, and only the seed step gets it.
   - Secret `STAGE_CLOUDFLARE_API_TOKEN`, stage's own Cloudflare token (see *Tokens* below), and
     `STAGE_CLOUDFLARE_ACCOUNT_ID`, the account it works in (a secret or a variable). Stage never uses prod's token.
4. **Push to a PR.** If it's first in line, the job applies the migrations, resets the data, deploys, and posts one
   comment on the PR with the link; otherwise the comment says it's waiting. Later runs update that same comment.

## Prod's settings

`wrangler.jsonc` holds placeholders for the database id and the Access AUD (it serves `wrangler dev` and the
tests, which need neither), so nothing account-specific is in the repository. The prod deploy fills them in with
`scripts/prod-config.mjs`, which writes `wrangler.prod.jsonc` (never committed). In the `Prod` environment
(*Settings → Environments → Prod*):

| Name | What | Where to find it |
|------|------|------------------|
| `PROD_D1_ID` (a secret, so logs mask it) | prod's database id | Cloudflare → Storage & databases → D1 → **`skope`** → Database ID |
| `PROD_ACCESS_AUD` (a secret, so logs mask it) | prod's Access AUD tag | Zero Trust → Access → Applications → **skope.khorum-oss.org** → AUD tag |
| `CLOUDFLARE_API_TOKEN` (secret) | prod's Cloudflare token | see *Tokens* |
| `CLOUDFLARE_ACCOUNT_ID` (secret or variable) | the account | the dashboard URL, or a zone's Overview → API |

Until `PROD_D1_ID` and `PROD_ACCESS_AUD` are set, the prod deploy stops at "Generate wrangler.prod.jsonc" with a
message naming what's missing, before touching Cloudflare.

## What the deploy logs show

Anyone can read this repository's Actions logs, so the deploys are set up to print nothing account-specific:

- The Access AUD is uploaded as a **Worker secret** (`wrangler deploy --secrets-file …`, from the file the config
  script writes), not as a plain variable. `wrangler deploy` prints every variable's value, shortened, and GitHub's
  masking only matches a secret's whole value, so a variable's first characters would show.
- Database ids, the account id and the owner's email are GitHub secrets, which the logs show as `***`.
- What still shows, and is public anyway: the hostnames, the Worker and database names, the Access team domain.

If you add a setting the Worker needs, give it to the Worker as a secret unless you are happy to see it in a log.

## Tokens

Stage runs pull-request code, so it must not hold prod's keys:

- **Prod's token** (`CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`) lives in the GitHub environment `Prod`,
  which only `main` may use (*Settings → Environments → Prod → Deployment branches: `main`*). The prod
  `deploy` job runs there; no pull request's code can reach it.
- **Stage's token** (`STAGE_CLOUDFLARE_API_TOKEN`, `STAGE_CLOUDFLARE_ACCOUNT_ID`) lives in the GitHub environment
  `stage`, used only by the `stage` job. It needs *Workers Scripts: Edit*, *D1: Edit* and *Zone → Workers Routes: Edit* (for the custom
  domain).
- Cloudflare can't limit a token to one Worker or one database, so a stage token in the **same account** as prod
  could still reach prod. The real separation is a **separate Cloudflare account for stage** (its own D1, Worker and
  Access app; `skope-stage.khorum-oss.org` can stay on the zone through a custom hostname, or move to a domain in
  that account). Until then, `scripts/stage-config.mjs` still refuses to run if the stage database id or AUD
  equals prod's, or if `wrangler.jsonc` gains a key it does not know.
- Deploy jobs install with `--ignore-scripts`, so no dependency runs code while a token is in reach, and checkouts
  don't save the GitHub token.

## Seeding locally

To load the stage data into your local database (this clears every table in it first):

```sh
STAGE_OWNER_EMAIL=you@example.com npm run stage-seed && npx wrangler d1 execute skope --local --file seed.sql
```

Run `npx wrangler d1 migrations apply skope --local` first on a fresh checkout. Then
`npx wrangler dev --var DEV_USER_EMAIL:you@example.com` signs you in as the owner on localhost. It builds first
(the SvelteKit app into `dist/`), so run `npm ci --prefix app` once. The app is at `/app`, and `/` redirects there.

`node scripts/stage-config.mjs` (with `STAGE_D1_ID` and `STAGE_ACCESS_AUD` set) writes `wrangler.stage.jsonc`.
Neither generated file is committed.

## How the seed is made

[`stage/seed.ts`](../stage/seed.ts) runs the real importer (`worker/src/importer.ts`, the code behind
`POST /api/workspaces/import`) against a fake D1 that records each statement and writes it out as SQL. The seed
therefore always matches the tables. The stage owner imports their personal workspace and the *Platform team*;
an invented teammate, `priya@example.com`, imports *Payments*. Only what an import cannot carry is written
directly, through the same renderer: profiles, and the members who share each team.

The stage data is a `daidal-backup` file, the same format `GET /api/workspaces/:id/export` writes, so anything on
stage can be exported and re-imported.

## Keeping the data whole

The stage data is there so every feature has something to show:

| Feature | What stage has |
|---|---|
| Profiles | The owner (Rowan Ellery) and two invented teammates, all with names and titles |
| Workspaces | The owner's personal workspace, a team they run with both teammates, and a workspace Priya shares with them |
| Diagram kinds | C4, infra and freeform |
| Document options | Subtitles, flags, notes, links, sized nodes; labelled, dashed, dotted, two-way, routed, anchored, thin and hidden-label edges; nested and styled boundaries, and an edge that ends on a boundary |
| History | Diagrams with one to three snapshots, and a working copy with an edit not yet snapshotted |
| Follow | A follower in another workspace with upstream changes waiting and one change already skipped; a paused follower that is up to date |
| Read-only | Priya's diagrams, which the owner can open and clone but not change |
| Empty-ish | A two-node scratch diagram with no tags or edges |

`worker/test/stage-seed.test.ts` applies the seed to a real D1 and reads it back through the API, and checks the
table above.

**When a feature adds a table or something to a diagram, extend `stage/diagrams.ts` (and `APP_TABLES` in
`stage/seed.ts`, children first) so stage shows it.** Keep names original and addresses on `example.com`.

## Testing on stage

[`uat.md`](uat.md) is the hand-run checklist for stage: every feature on a desktop and an iPhone, written against
the stage data above, with a section of regressions to keep fixed.
