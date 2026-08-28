# SPEC-0003: GitHub Release+npx local MCP onboarding

## Status

Implemented and verified with synthetic browser pairing and mocked Promethee upstream responses. `v0.1.0` is the first reviewed public GitHub Release archive; no npm registry artifact is published.

## Outcome

A user or AI assistant can configure Promethee MCP from a reviewed GitHub Release archive, receive a local browser login URL from the running MCP, complete the passwordless flow without sharing the code with the model, and use the bounded tools without restarting that MCP process.

## Functional requirements

### Package launch

- FR-301: The installation reference is a bounded HTTPS GitHub Release `.tgz` package URL.
- FR-302: MCP client configurations launch `npx -y --package=<package-spec> prometheemcp --stdio` as an executable plus argument array, never through a shell command string.
- FR-303: Documentation recommends a reviewed tag or commit SHA for stable installation.
- FR-304: The package contains the compiled CLI and compiled login shell required by the stdio process.

### Dual terminal behavior

- FR-310: Zero arguments with TTY stdin and stdout opens human onboarding.
- FR-311: Zero arguments with piped stdin or stdout starts stdio MCP and writes no human text to stdout.
- FR-312: `--stdio` explicitly starts stdio MCP regardless of terminal detection.
- FR-313: The human flow prints its exact client mutation before asking for explicit confirmation.
- FR-314: Declining or requesting generic JSON makes no client configuration change.

### Browser pairing

- FR-320: The stdio process binds one HTTP listener to `127.0.0.1` only.
- FR-321: The preferred port is `3210`; an implicit collision may use only a bounded sequence of fallback ports, while an explicit port fails rather than moving silently.
- FR-322: `promethee_connection_status` returns `{ connected: false, loginUrl }` before pairing and `{ connected: true }` after pairing.
- FR-323: The login URL serves the compiled unified retention/email/code page from the same exact origin as the connection bridge.
- FR-324: Pairing changes the authorization context used by the same running MCP process.
- FR-325: Account tools remain listed before login but fail as `authentication_required` without an upstream data call.

### Retention

- FR-330: A fresh local install defaults to `seven-days`.
- FR-331: A stored `memory` (`Never`) preference remains selected after restart and stores no token material.
- FR-332: Seven-day session state is stored only as a bounded AES-256-GCM envelope and is deleted on expiry, corruption, disconnect, or irrecoverable refresh failure.
- FR-333: Local key and state paths are derived from a platform user-config directory or an explicit absolute test/operator override.

## Security requirements

- SR-301: Email, OTP code, access token, refresh token, publishable key, and encryption key never appear in MCP tool input, MCP result, installer argv, stdout, or logs.
- SR-302: Server instructions explicitly tell the LLM not to request an email code or token.
- SR-303: Static serving is limited to `/`, `/login`, and bounded single-segment compiled assets; traversal, symlinks, non-files, oversized files, and mutation methods fail closed.
- SR-304: Static responses set a restrictive CSP, `nosniff`, frame denial, same-origin opener policy, and no-referrer policy.
- SR-305: Connection mutation routes require the exact same loopback origin.
- SR-306: No local composition reads Promethee desktop credentials, cookies, SQLite, or private IPC.
- SR-307: The release archive and its checksum are part of the trust boundary; installation must not rebuild a mutable Git checkout.

## Client onboarding contracts

### Codex

```bash
codex mcp add promethee -- npx -y --package=<git-ref> prometheemcp --stdio
```

### Claude Code

```bash
claude mcp add --scope user promethee -- npx -y --package=<git-ref> prometheemcp --stdio
```

### Generic

```json
{
  "mcpServers": {
    "promethee": {
      "command": "npx",
      "args": ["-y", "--package=<git-ref>", "prometheemcp", "--stdio"]
    }
  }
}
```

## Failure behavior

| Condition | Required behavior |
| --- | --- |
| Invalid GitHub Release package URL | Exit with usage/configuration failure before spawning a client command |
| Client CLI unavailable | Report automatic configuration failure and preserve the printed manual command |
| User declines confirmation | Exit successfully without mutation |
| Login port unavailable | Try only the bounded implicit range or fail the explicit port |
| Browser not yet paired | Return the login URL; account tools return `authentication_required` |
| Session file/key invalid | Fail closed; never treat it as an authenticated connection |
| Upstream login/session invalid | Keep the MCP disconnected and return a bounded browser error |

## Non-goals

- Publishing an npm registry package or silently moving a `latest` tag.
- Configuring unsupported clients by guessing their file format.
- Opening the browser automatically from the MCP process.
- Accepting credentials or an email code in terminal prompts, LLM prompts, environment variables, or MCP tools.
- Providing remote multi-user login through this loopback surface.

## Required evidence

- Pure install-plan tests for Codex and Claude Code.
- Black-box stdio handshake and tool-list test through the compiled CLI.
- Same-process browser-pairing and authenticated-tool test with a mocked upstream.
- Static-server traversal, method, cache, and security-header tests.
- Persistence restart, expiry, `Never`, and corruption tests.
- Root TypeScript/test suite and independent browser-package check.
- `npm pack --dry-run --json --ignore-scripts` inventory containing `dist/product/src/cli.js` and `web/dist/index.html`.

## Related decisions

- [ADR-0008](../docs/adr/0008-use-git-npx-stdio-onboarding-with-a-loopback-login.md)
- [ADR-0002](../docs/adr/0002-require-independent-user-scoped-authentication.md)
- [ADR-0004](../docs/adr/0004-separate-headless-cli-from-browser-authorization-ui.md)
- [ADR-0007](../docs/adr/0007-persist-a-single-user-personal-session-behind-a-trusted-edge.md)
