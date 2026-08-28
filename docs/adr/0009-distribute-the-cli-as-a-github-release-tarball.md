---
id: ADR-0009
status: accepted
date: 2026-08-28
deciders:
  - repository owner
consulted: []
informed: []
---

# ADR-0009: Distribute the CLI as a GitHub Release tarball

## Context

ADR-0008 selected a reviewed Git ref as the `npx --package` input. The complete `v0.1.0` candidate passed its source, package, stdio, browser, and container checks, but a clean public Git+npx probe failed inside npm `10.9.2` before the package executable started. The same immutable npm tarball installed from a local file and completed the full MCP handshake.

The public installation path must use the exact tested bytes, avoid a mutable branch, and not depend on npm repackaging a Git checkout.

## Decision

The supported `v0.1.0` local installation input is the HTTPS GitHub Release asset:

```text
https://github.com/BRYANN2K/promethee-mcp/releases/download/v0.1.0/promethee-mcp-0.1.0.tgz
```

Codex, Claude Code, and generic MCP configurations pass that exact URL to `npx --package`. The onboarding validator accepts only bounded HTTPS GitHub Release `.tgz` URLs. The release attaches the already-tested archive and publishes its SHA-256 checksum.

The Git tag remains the source identity and the Docker Compose checkout point. Installing the CLI directly from a Git ref is not a supported `v0.1.0` path.

## Consequences

- Users and agents execute the same archive that passed the black-box MCP test.
- Installation avoids npm's Git packaging step and does not rebuild a mutable checkout.
- A release asset and checksum must exist before the documented command works.
- Updating the package requires a new version, tag, asset URL, checksum, and onboarding default.
- GitHub availability becomes part of the local installation dependency chain.

## Validation

- Package inspection requires the CLI, compiled login, executable POSIX mode, and no private configuration files.
- A real `npx` subprocess must report the expected version and complete MCP initialize, tool discovery, status-tool, and login-page probes.
- The public release URL must be exercised after publication and match the locally verified SHA-256 digest.

## Related decisions

- Amends: [ADR-0008](0008-use-git-npx-stdio-onboarding-with-a-loopback-login.md)
- Retains browser separation: [ADR-0004](0004-separate-headless-cli-from-browser-authorization-ui.md)
- Retains session persistence: [ADR-0007](0007-persist-a-single-user-personal-session-behind-a-trusted-edge.md)
