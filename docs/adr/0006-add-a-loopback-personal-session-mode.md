---
id: ADR-0006
status: accepted
date: 2026-08-28
deciders:
  - repository owner
consulted: []
informed: []
---

# ADR-0006: Add a loopback personal-session mode

## Context and problem

The fixed-RPC/OAuth composition in ADR-0005 cannot run against Promethee today because its proposed OAuth client, MCP scopes, and five publisher RPCs are not deployed. The repository owner requires a usable personal MCP now and has already verified that Promethee passwordless authentication works.

The public, unaffiliated Android client demonstrates a narrower available contract: an authenticated Supabase user session can access `tasks` and `task_projects` through PostgREST while RLS remains active. This is compatibility evidence, not an official Promethee API guarantee.

## Scope and non-goals

This decision adds an explicit `personal` mode for a single operator on loopback. It covers the existing five bounded Tasks/Projects MCP tools. It does not authorize arbitrary tables, generic RPCs, service-role access, session extraction from Promethee Desktop, public unauthenticated hosting, updates, completion, deletion, or timer control.

## Decision drivers and constraints

- Deliver a functioning MCP without a publisher-side migration.
- Authenticate through Promethee's email-code flow with the user's own Supabase session.
- Preserve RLS and derive the subject from `/auth/v1/user`.
- Keep credentials out of files, logs, tool inputs, and MCP results.
- Keep the direct schema surface fixed to `tasks` and `task_projects`.
- Make create retries deterministic without adding a server database.

## Considered options

1. Keep waiting for publisher-owned OAuth and RPC deployment.
2. Reuse a Promethee Desktop session or local credential store.
3. Add a loopback personal bridge using the independently authenticated Supabase session and fixed PostgREST operations.
4. Expose a generic Supabase/PostgREST proxy.

## Decision

We will add a `personal` CLI mode that binds only to `127.0.0.1`, accepts one verified browser session from exact loopback UI origins, validates it through `/auth/v1/user`, and retains access and refresh tokens only in process memory. MCP calls in that process receive a caller-bound direct adapter limited to fixed column sets and fixed operations on `tasks` and `task_projects`.

Create operations use a deterministic UUID derived from the authenticated subject, resource type, and bounded client request identifier. An identical replay reads back the same row; different content for the same identifier returns `idempotency_conflict`. The upstream user's RLS remains authoritative.

The existing `supabase` mode remains the preferred publisher-integrated composition and continues to use fixed RPCs. ADR-0006 amends ADR-0005 only for the explicitly selected loopback `personal` mode.

## Consequences

### Positive

- The browser login can connect a real user session to a usable MCP without copying a token.
- No service-role key, desktop credential, or local database is used.
- A restart drops the upstream session and forces a fresh browser connection.
- The agent surface remains five closed MCP tools rather than a database proxy.

### Negative

- The adapter depends on an unofficial, version-sensitive table and column contract.
- Loopback process ownership replaces a public OAuth grant; this mode must not be exposed directly on a VPS or shared host.
- The in-memory connection is single-user and unavailable after restart.
- Direct inserts depend on current Promethee defaults and RLS behavior.

### Neutral

- The fixed-RPC composition and its approval path remain available.
- Browser OTP still goes directly to Promethee Auth.
- A production multi-user VPS still requires a real authorization broker or publisher-owned OAuth.

## Validation

- Browser pairing rejects non-loopback origins, malformed sessions, and a failed `/auth/v1/user` check.
- Tokens never appear in status responses, logs, tool inputs, or tool results.
- Tests exercise pairing through MCP create with mocked RLS/PostgREST responses.
- A live acceptance exercise creates one explicitly authorized task and reads it back before claiming compatibility.
- Restarting the process returns the server to `not_connected`.

## Revisit triggers

- Promethee changes the `tasks` or `task_projects` contract.
- RLS no longer protects the direct operations.
- The MCP is exposed beyond a single-user loopback or SSH-tunnel boundary.
- Promethee enables the OAuth and fixed-RPC composition.
- Durable multi-user session storage is requested.

## Related decisions and evidence

- Amends for `personal` mode: [ADR-0005](0005-add-bounded-create-tools-through-publisher-rpcs.md)
- Depends on: [ADR-0002](0002-require-independent-user-scoped-authentication.md)
- Related: [ADR-0004](0004-separate-headless-cli-from-browser-authorization-ui.md)
- Compatibility evidence: [unaffiliated Android client](https://github.com/AurelJC33/promethee-android-no-affiliation-with-Prom-th-e-)
