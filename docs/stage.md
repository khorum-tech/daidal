# Stage

Every push to a pull request from this repository deploys that branch to **https://skope-stage.khorum-oss.org**
and resets its database to the invented stage diagrams in [`stage/diagrams.ts`](../stage/diagrams.ts). The
`stage` job in [`.github/workflows/deploy.yml`](../.github/workflows/deploy.yml) does it, after `test` passes.

- **One shared stage.** A Worker `skope-stage`, a D1 `skope-stage`, one hostname. Two PRs pushed close together
  overwrite each other; the last push wins.
- **Only the owner signs in.** Stage has its own Access application, narrower than prod's.
- **Stage data is throwaway.** It holds only the invented data, never a real backup, and every push resets it.
- **Fork PRs get no stage.** The job runs only for branches of this repository. Never change it to
  `pull_request_target`: that would run a stranger's code with the Cloudflare token.
- `workers_dev` and `preview_urls` stay off, as in prod, and the `DEV_USER_EMAIL` sign-in stays localhost-only.

Until the two repository variables and the secret below are set, the `stage` job passes with a notice and deploys nothing.

## One-time setup

1. **Create the database.** Run `npx wrangler d1 create skope-stage` and copy the `database_id` it prints.
2. **Create the Access application.** In Cloudflare Zero Trust, go to *Access → Applications → Add an application
   → Self-hosted*. Set the domain to `skope-stage.khorum-oss.org`, and add one **Allow** policy that includes only
   your own sign-in email. Save it, open it again and copy its **Application Audience (AUD) tag**.
3. **Set the GitHub Actions variables and secret.** In *Settings → Secrets and variables → Actions*:
   - Variables: `STAGE_D1_ID` (step 1) and `STAGE_ACCESS_AUD` (step 2).
   - Secret: `STAGE_OWNER_EMAIL`, the email you sign in to Access with. The stage data is owned by this address.
     It is a secret so GitHub masks it in this public repository's logs, and only the seed step gets it.
4. **Push to any PR.** The job applies the migrations, resets the data, deploys, and posts one comment on the PR
   with the link. Later pushes update that same comment.

The existing `CLOUDFLARE_API_TOKEN` already has what stage needs, since prod deploys apply remote migrations and
deploy to a custom domain. A separate token would not protect prod (D1 and Workers permissions are account-wide);
what does is `scripts/stage-config.mjs`, which refuses to run if the stage database id or AUD equals prod's, or if
`wrangler.jsonc` gains a key it does not know.

## Seeding locally

To load the stage data into your local database (this clears every table in it first):

```sh
STAGE_OWNER_EMAIL=you@example.com npm run stage-seed && npx wrangler d1 execute skope --local --file seed.sql
```

Run `npx wrangler d1 migrations apply skope --local` first on a fresh checkout. Then
`npx wrangler dev --var DEV_USER_EMAIL:you@example.com` signs you in as the owner on localhost.

`node scripts/stage-config.mjs` (with `STAGE_D1_ID` and `STAGE_ACCESS_AUD` set) writes `wrangler.stage.jsonc`.
Neither generated file is committed.

## How the seed is made

[`stage/seed.ts`](../stage/seed.ts) runs the real importer (`worker/src/importer.ts`, the code behind
`POST /api/workspaces/import`) against a fake D1 that records each statement and writes it out as SQL. The seed
therefore always matches the tables. The stage owner imports their personal workspace and the *Platform team*;
an invented teammate, `priya@example.com`, imports *Payments*. Only what an import cannot carry is written
directly, through the same renderer: profiles, and the members who share each team.

The stage data is a `skope-backup` file, the same format `GET /api/workspaces/:id/export` writes, so anything on
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
