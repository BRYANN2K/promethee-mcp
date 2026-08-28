---
id: ADR-0004
status: accepted
date: 2026-08-28
deciders:
  - repository owner
consulted: []
informed: []
---

# ADR-0004: Separate the headless MCP CLI from the browser authorization UI

## Context and problem

The MCP must be operable on a VPS without the Promethee desktop application or a dashboard. OAuth authorization still requires a user-facing browser step: Supabase documents authorization-code-with-PKCE and refresh-token grants, and its authorization server redirects to a custom consent UI. Bundling that UI into every CLI installation would increase the headless runtime's dependency and release surface, while collecting Promethee credentials in the terminal would cross the rejected authentication boundary in ADR-0002.

## Scope and non-goals

This decision covers packaging and runtime ownership for the MCP operator CLI and the external Login/Consent UI. It does not authorize Promethee staging access, choose the dashboard architecture, approve a frontend dependency, or claim that the current CLI enables live Supabase mode.

## Decision drivers

- A minimal headless installation for VPS and automation users.
- No Promethee password, desktop session, token import, or interactive terminal credential flow.
- Independent browser UI build, deployment, and security review.
- One shared MCP/auth contract without requiring a dashboard.
- Deterministic non-interactive CLI behavior for scripts and operators.

## Constraints

- The MCP remains remote Streamable HTTP rather than a local SQLite reader.
- Supabase OAuth user authorization requires a browser authorization-code-with-PKCE flow under the currently documented grants.
- The browser authorization UI is required somewhere for new grants even when the MCP server is operated entirely through the CLI.
- Publisher-approved OAuth configuration, RPCs, RLS, and staging evidence are still absent.

## Considered options

1. Keep the MCP server and operator commands headless; build Login/Consent as a separately deployable web package.
2. Bundle and serve Login/Consent from every CLI installation.
3. Ask for credentials or import a Promethee session in the CLI.
4. Ship only the web-operated server and omit a stable CLI.

## Decision

We will **keep the root MCP runtime dependency-free from browser UI packages, expose it through a headless CLI, and implement Login/Consent as a separate optional web package**.

The CLI may point OAuth metadata to the approved external authorization service, but it will not collect a Promethee password. A CLI-only operator deployment therefore means no bundled dashboard or browser frontend process; it does not mean OAuth can avoid the user's browser authorization step.

## Rationale

The selected option creates the smallest automation surface and preserves the independent user-consent boundary. It also lets the authorization UI adopt its required browser SDK and deployment controls without forcing those dependencies into the MCP runtime. Bundling the UI is simpler operationally but couples unrelated release and vulnerability surfaces. Terminal credential collection is incompatible with ADR-0002. Omitting a CLI makes repeatable VPS operation and diagnostics weaker.

## Option comparison

| Driver | Separate headless CLI + web auth | Bundled UI | Terminal credentials/session | Web-only operation | Evidence |
| --- | --- | --- | --- | --- | --- |
| Minimal CLI install | Strong | Weak | Medium | Not applicable | Current CLI has no browser dependencies |
| Independent consent | Strong | Strong | Weak | Strong | ADR-0002; Supabase OAuth flow |
| Scriptability | Strong | Medium | Weak | Weak | CLI black-box contract |
| Deployment simplicity | Medium | Strong | Medium | Medium | Architectural comparison |
| Security boundary | Strong | Medium | Rejected | Strong | Current threat model and auth ADR |

## Consequences

### Positive

- CLI installations do not need a dashboard, browser framework, or Supabase browser SDK.
- The operator can run `serve` and `doctor` non-interactively.
- Browser authentication code and dependencies receive a separate build and review boundary.
- Dashboard work can remain a separate project that depends on the MCP rather than being embedded in it.

### Negative

- A complete deployment has two artifacts when it owns the authorization UI.
- Version and configuration compatibility between the resource server and authorization UI must be documented and tested.
- A headless server still depends on a reachable browser authorization UI for new OAuth grants.

### Neutral

- The current `serve` command remains synthetic and deny-all until live configuration is separately approved and implemented.
- The root repository may contain both source trees, but their manifests, dependencies, build outputs, and release claims remain separate.

## Implementation and migration

- Keep the root `package.json` as the MCP server/CLI package.
- Expose `promethee-mcp serve` and offline `promethee-mcp doctor` without browser dependencies.
- Create `web/` with its own manifest only after exact frontend dependency authorization.
- Configure the approved Supabase Site URL and authorization path to the separately deployed `/oauth/consent` route.
- Keep dashboard code and analytics outside this authorization package.
- Define artifact compatibility and deployment documentation before enabling live Supabase mode.

## Validation

- Root CLI build and tests pass with no browser SDK dependency.
- Black-box probes verify help, version, JSON diagnostics, usage exit codes, real loopback startup, health, shutdown, and bind failure.
- The future web package has independent build/browser/security evidence.
- Staging proves the browser authorization flow returns a resource-bound token accepted by the CLI-operated MCP server.

## Revisit triggers

- Supabase adds and Promethee approves a device-authorization grant suitable for headless users.
- Operational evidence shows that two artifacts make supported self-hosting unreliable.
- A publisher-owned authorization UI removes the need to ship the web package.
- The MCP transport or authorization specification changes the browser-flow requirement.

## Related decisions and evidence

- Depends on: [ADR-0002](0002-require-independent-user-scoped-authentication.md)
- Related: [ADR-0003](0003-expose-read-only-mcp-over-streamable-http.md)
- Evidence: [Supabase OAuth 2.1 flows](https://supabase.com/docs/guides/auth/oauth-server/oauth-flows)
- Evidence: `package.json`, `src/cli/`, and `tests/cli.test.ts` define and verify the durable CLI boundary.
