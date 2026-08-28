# Changelog

## 0.1.2 — Unreleased

- Add a clean screenshot of the local passwordless login to the repository README.
- Emit portable SHA-256 files that verify correctly after downloading release assets.
- Use a cross-platform `file://` package URL when smoke-testing the packed archive through `npx`.

## 0.1.1 — 2026-08-28

- Accept valid legacy twelve-character GoTrue refresh tokens during local browser pairing.
- Prevent stale sibling processes from clearing or replacing newer encrypted sessions.
- Keep memory-only refreshes process-local while seven-day sessions remain recoverable across restarts.
- Correct the documented `prometheemcp` executable and separate npm options with `--`.
- Derive CLI and MCP server versions from `package.json`.
- Smoke-test the installable release tarball through `npx` in CI and publish versioned archives with SHA-256 files.

## 0.1.0 — 2026-08-28

First public source release of the unofficial Promethee MCP.

- GitHub Release+npx onboarding for Codex, Claude Code, and generic stdio MCP clients.
- Unified browser sign-in with passwordless email verification and `7 days` or `Never` retention.
- Bounded task and project reads plus create-only task and project tools.
- Encrypted single-user session restoration with a fixed seven-day maximum.
- Streamable HTTP composition and hardened Docker Compose/Caddy VPS candidate.
- Synthetic and mocked integration coverage that does not contact Promethee during ordinary validation.

The release is not affiliated with or endorsed by Promethee. Live compatibility remains version-sensitive. No npm package or container image is published with this release.
