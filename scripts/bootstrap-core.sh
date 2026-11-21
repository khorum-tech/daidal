#!/usr/bin/env bash
# One-time bootstrap for the core package's trusted publishing (packages/core/README.md, Publishing).
#
# npm attaches a trusted publisher only to a package the registry already knows, so this publishes a placeholder 0.0.1
# under the `bootstrap` tag from a laptop, then names .github/workflows/publish-core.yml in this repository as the
# package's trusted publisher. Every later version comes from that workflow, with provenance and no npm token.
#
# Run from the repository root, after `npm login`, with npm 11.15 or later and two-factor authentication on:
#
#     bash scripts/bootstrap-core.sh [otp-code]
#
# The otp-code is for an authenticator app; with a passkey or security key npm opens a browser instead. If a run stops
# partway, run it again: a placeholder that already reached npm is skipped.
set -euo pipefail

OTP="${1:-}"
REPO="khorum-tech/daidal"
WORKFLOW="publish-core.yml"

[[ -f scripts/build-core.mjs ]] || { echo "Run this from the repository root." >&2; exit 1; }

echo "==> npm account"
npm whoami || { echo "Not signed in. Run 'npm login' first." >&2; exit 1; }

echo "==> building packages/core/dist"
npm run build:core
NAME=$(node -p "require('./packages/core/dist/package.json').name")

if npm view "$NAME@0.0.1" version > /dev/null 2>&1; then
  echo "==> $NAME@0.0.1 is already on npm: skipping the placeholder"
else
  echo "==> publishing $NAME@0.0.1 under the 'bootstrap' tag"
  (cd packages/core/dist && npm version 0.0.1 --no-git-tag-version --allow-same-version > /dev/null \
    && npm publish --access public --tag bootstrap ${OTP:+--otp "$OTP"})
fi

echo "==> naming $REPO's $WORKFLOW as the trusted publisher"
npm trust github "$NAME" --repo "$REPO" --file "$WORKFLOW" --allow-publish --yes
npm trust list "$NAME"

echo "==> done. Rebuild before anything else: packages/core/dist still says 0.0.1."
