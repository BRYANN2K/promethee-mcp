---
id: ADR-0008
status: amended
date: 2026-08-28
deciders:
  - repository owner
consulted: []
informed: []
amended_by:
  - ADR-0009
---

# ADR-0008: Use Git+npx stdio onboarding with a loopback login

The stdio, same-process login, and explicit client-configuration decisions remain accepted. ADR-0009 replaces only the public distribution reference: `v0.1.0` installs from the immutable GitHub Release archive instead of asking npm `10.9.2` to package a Git checkout.

## Context and problem

The personal MCP can authenticate independently with Promethee and expose five bounded task/project tools, but installing it still requires a user or an AI assistant to understand the package, MCP client configuration, browser login, and process-lifetime relationship. The repository owner wants one Git-installable command that works when a human runs it and when an MCP client launches it.

The authentication code and tokens must remain in the browser/server boundary. An LLM must never ask the user to paste an email code or token into the conversation. The login process must also unlock the already-running MCP process; a separate short-lived login command would lose a `Never` session when it exits.

## Scope and non-goals

This decision covers local single-user installation from a reviewed Git ref, stdio transport, local browser pairing, and terminal-assisted configuration for supported MCP clients. It does not publish an npm package, grant permission to mutate third-party client configuration without confirmation, add a desktop session extractor, provide a public multi-user service, or replace the VPS Streamable HTTP topology.

## Decision drivers

- One copyable command for humans and AI-assisted setup.
- JSON-RPC stdout must never be contaminated by onboarding text.
- Email codes and Promethee tokens must stay out of chat, argv, stdout, and MCP results.
- The same process must observe successful browser pairing without restart.
- Installation must work from a reviewed Git tag or commit before an npm registry release.
- Existing Streamable HTTP and VPS operation must remain available.

## Constraints

- Node.js and npm are prerequisites for the Git+npx path.
- Private Git repositories require the user's existing Git host authorization.
- `npx` may run lifecycle scripts from the selected Git ref, so users must pin and review that ref.
- The browser login may bind only to `127.0.0.1` and must fail closed when no bounded port is available.
- Promethee remains unofficial and version-sensitive; no desktop credential reuse is permitted.

## Considered options

1. Use one executable that selects interactive onboarding on a TTY and stdio MCP service on pipes, while the stdio process hosts the loopback login.
2. Require users to edit each MCP client's JSON configuration manually and start a separate login process.
3. Publish a registry package first and make the registry the only installation path.
4. Ask the LLM or terminal for the email code and exchange it without a browser.

## Decision

We will **install from a reviewed Git ref through `npx`, use stdio for local MCP clients, and host the browser login inside that same MCP process**.

The executable name is `prometheemcp`. With no arguments it shows an interactive client-configuration menu only when both stdin and stdout are TTYs; when either side is piped it emits MCP JSON-RPC only. `--stdio` selects the MCP behavior explicitly.

The human onboarding prints the exact Codex or Claude Code configuration command before execution and requires explicit `y`/`yes` confirmation. It also provides a generic JSON configuration without writing it. Commands use `spawn` with an argument array and no shell.

The stdio server exposes `promethee_connection_status`. Before pairing it returns only `{ connected: false, loginUrl }`; after pairing it returns `{ connected: true }`. Server instructions tell the LLM to share the URL, wait for the browser flow, and never request an email code or token. The account tools resolve authorization at call time, so browser pairing unlocks the same running process.

The local HTTP surface serves only the compiled login shell, bounded same-origin assets, and the existing bounded connection routes on loopback. New installs default to seven-day encrypted retention; a restored `Never` choice remains memory-only. This local composition generates a per-user encryption key with restrictive file permissions; it does not claim protection from compromise of the operating-system account.

ADR-0008 amends ADR-0004 only for local onboarding: browser source and dependencies remain separately built, while the reviewed static login artifact may be packaged and served by the local stdio process. The separate VPS authorization artifact and Streamable HTTP resource server remain supported.

## Rationale

Option 1 is the only option that meets the no-secret-in-chat boundary while keeping a memory-only session alive in the process that owns the tools. Manual configuration is safer than hidden mutation but creates unnecessary client-specific friction; the selected flow preserves explicit confirmation and a copy-only fallback. A registry release is not required for Git installation. Collecting the code through the LLM or terminal violates the authentication boundary.

## Option comparison

| Driver | TTY/stdio executable + loopback login | Manual config + separate login | Registry-only | Code through LLM/terminal | Evidence |
| --- | --- | --- | --- | --- | --- |
| One-command setup | Strong | Weak | Strong after publish | Strong | CLI contract tests |
| Secret separation | Strong | Strong | Depends on login design | Rejected | ADR-0002 |
| `Never` session continuity | Strong | Weak | Depends on login design | Medium | Same-process pairing test |
| Safe stdout | Strong | Medium | Medium | Weak | stdio black-box test |
| Works before registry release | Strong | Strong | Weak | Strong | `npx --package=github:…` contract |

## Consequences

### Positive

- Humans and AI assistants can use the same reviewed Git package reference.
- The user completes OTP verification in the browser without exposing it to the model.
- Pairing becomes effective immediately without reconnecting or restarting the MCP server.
- Port collisions use a bounded loopback fallback while an explicit port remains strict.

### Negative

- Git+npx installs require Node/npm and trust the lifecycle scripts of the selected ref.
- The packaged static web artifact must be rebuilt and reviewed whenever browser source changes.
- The local encryption key and ciphertext live under the same operating-system account; this protects accidental disclosure, not an account compromise.
- Client-specific automatic configuration is limited to explicitly supported CLI contracts.

### Neutral

- No npm package, Git tag, commit, or release is created by this decision.
- VPS Streamable HTTP and publisher OAuth modes remain separate deployment paths.
- The five task/project tools and their data bounds are unchanged.

## Implementation and migration

- Add the `prometheemcp` bin alias and include the compiled browser artifact in the Git package.
- Add TTY onboarding for Codex, Claude Code, and generic JSON.
- Add stdio composition, loopback static serving, local encrypted persistence, and connection-status tooling.
- Preserve explicit `serve` and `doctor` commands for existing operator workflows.
- Document tag/SHA pinning and private-repository Git authorization.

## Validation

- Contract tests assert exact `npx` argument arrays and absence of credential-like arguments.
- A black-box stdio client lists the onboarding plus account tools, receives a loopback login URL, and gets `authentication_required` before pairing.
- A controlled browser-pairing test proves the same MCP process changes from disconnected to connected and executes a bounded read through a mocked upstream.
- Static-route tests cover allowed files, traversal rejection, methods, cache policy, and security headers.
- The root and web validation suites pass without contacting Promethee.
- Package dry-run must contain the CLI and compiled login artifact before any reviewed Git ref is released.

## Revisit triggers

- MCP clients standardize a secure installation/authorization handshake.
- Promethee publishes a supported OAuth or device-authorization integration.
- Node/npm is no longer an acceptable local prerequisite.
- The project adds multi-user or remote hosted onboarding.
- A client CLI changes its add-server syntax or confirmation semantics.

## Related decisions and evidence

- Amends: [ADR-0004](0004-separate-headless-cli-from-browser-authorization-ui.md)
- Depends on: [ADR-0002](0002-require-independent-user-scoped-authentication.md)
- Extends: [ADR-0006](0006-add-a-loopback-personal-session-mode.md)
- Reuses retention contract: [ADR-0007](0007-persist-a-single-user-personal-session-behind-a-trusted-edge.md)
- Implemented by: [SPEC-0003](../../specs/0003-git-npx-local-onboarding.md)
- Evidence: `src/cli/onboarding.ts`, `src/runtime/personal-stdio.ts`, and `tests/local-onboarding.test.ts`
