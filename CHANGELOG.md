# Changelog

All notable changes to Daidal. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added
- Public source release under the Functional Source License (FSL-1.1-ALv2).
- Root README, SECURITY, CONTRIBUTING, CODE_OF_CONDUCT and TRADEMARKS.
- A Contributor License Agreement (`CLA.md`), signed with a comment on your first pull request.
- The Daidal mark: the header logo and a favicon, both following light or dark.
- A product tour and a C4 walk-through on the README, recorded from scripts (`docs/demo.md`).
- Versioned releases: `npm run release` moves the version on and files these notes; merging that tags the release
  on GitHub (`docs/releasing.md`).

### Changed
- The product is now called **Daidal** (formerly Skope), everywhere a person reads it: the app, its docs, error
  messages and what the MCP server tells an AI.
- The rest of the rename: diagrams download as `.daidal.yaml` / `.daidal.json`, workspace backups as `daidal-backup`
  and your data as `daidal-account`, and the MCP server introduces itself as `daidal`. Backups saved as
  `skope-backup` still import. The hosted site's address and the Cloudflare Worker and D1 database names keep
  `skope` for now.
