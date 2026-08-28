---
id: ADR-0007
status: accepted
date: 2026-08-28
deciders:
  - repository owner
consulted: []
informed: []
---

# ADR-0007: Persist a single-user personal session behind a trusted edge

## Context and problem

ADR-0006 deliberately kept the personal Supabase session in memory and limited the composition to loopback. That makes every process or VPS restart require a new email code. The repository owner requires a single-user self-hosted deployment that remains connected across ordinary restarts while still offering an explicit opt-out.

This does not create an official Promethee OAuth integration. The personal adapter remains an unofficial, version-sensitive compatibility path over the user's own Supabase session and fixed `tasks`/`task_projects` operations.

## Scope and non-goals

This decision covers one operator, one connected Promethee identity, one MCP deployment, and two retention choices: `seven-days` and `memory`. It does not add multi-user accounts, token inspection, arbitrary retention periods, desktop-session extraction, service-role access, generic PostgREST access, refresh-token sharing with MCP clients, or publisher approval.

## Decision drivers

- Survive normal server restarts without copying credentials manually.
- Keep access and refresh tokens confidential at rest and out of browser output, logs, MCP inputs, and MCP results.
- Make persistence a deliberate user-visible choice.
- Fail closed on corrupted, expired, or undecryptable state.
- Keep browser pairing routes separate from the public MCP bearer boundary.
- Preserve a path from personal hosting to publisher-owned OAuth later.

## Considered options

1. Keep memory-only sessions and require a new email code after every restart.
2. Persist plaintext tokens in an environment file or JSON document.
3. Persist one encrypted session locally and expose an explicit seven-day/no-renewal setting.
4. Build a multi-user authorization broker and grant database now.

## Decision

The production personal composition may run behind one trusted HTTPS edge. The edge protects browser and `/connect/*` routes with operator authentication and adds a deployment-secret header that browsers cannot choose. `/mcp` uses a separate static bearer token intended only for the configured MCP client. The backend validates exact Host and Origin values and requires the complete production configuration or refuses startup.

The server stores a versioned state envelope encrypted with AES-256-GCM under a deployment-provided 32-byte key. The file is bounded, atomically replaced, mode `0600`, and rejected when it is a symlink, non-regular file, oversized, malformed, non-canonical, expired, or unauthentic. The key is never written by the application.

`seven-days` stores the current access token, refresh token, verified subject, pinned Supabase origin, publishable key, token expiry, and a fixed retention deadline. Successful Supabase token refresh rotates the encrypted stored tokens without extending the original seven-day deadline. At the deadline or after an irrecoverable refresh failure, the session is removed.

`memory` keeps the current connection only until process exit. It removes all encrypted token material immediately while persisting only the non-secret `memory` preference so a later login does not silently re-enable persistence. Switching back to `seven-days` creates a new seven-day deadline when a live session exists. A failed settings write leaves the prior server choice active.

The unified browser connection page reads the server-owned retention enum before enabling email entry. After a successful OTP verification it writes the selected enum first, then pairs the session only if that write succeeds. The settings response never contains tokens, keys, subjects, session identifiers, or storage paths.

The production browser sends the verified session only to its own exact HTTPS origin. Cross-port loopback HTTP is accepted only by a Vite development build served from loopback. Every bridge request has a bounded timeout. Session refreshes are bound to the exact session generation that started them, so a delayed refresh cannot restore a disconnected session or overwrite a newly paired identity.

ADR-0007 amends ADR-0006 only for the explicitly configured single-user production composition. Loopback development remains memory-only unless encrypted persistence is deliberately supplied.

## Consequences

### Positive

- A valid session can survive application and VPS restarts for up to seven days.
- The operator can explicitly choose no renewal without losing the current in-memory connection.
- Corrupt or expired state fails closed rather than falling back to a stale token.
- Browser pairing, edge trust, MCP client authentication, and upstream Promethee authorization remain separate boundaries.

### Negative

- The deployment now owns a highly sensitive encryption key, an MCP bearer, an edge secret, and an encrypted refresh token file.
- Losing or rotating the session key invalidates the stored session and requires a new email code.
- A static single-client bearer requires an operator-owned rotation process.
- The design is single-user; it is not a substitute for a multi-user grant service.

### Neutral

- Promethee RLS remains authoritative for every task/project operation.
- The fixed publisher-RPC/OAuth composition remains the preferred official integration.
- The encrypted state contains no Promethee task or project content.

## Validation

- Synthetic restart tests prove that a seven-day session is restored and that access/refresh token strings are absent from the encrypted file.
- Synthetic tests prove that `memory` survives as a preference while no token survives a restart.
- Expiry and persistence-failure tests prove fail-closed cleanup and transactional settings behavior.
- Deferred-refresh tests prove that disconnect and re-pair win over an older in-flight refresh.
- Production-boundary tests require the trusted edge header for connection routes and a separate bearer for all MCP tools.
- All five MCP tools are exercised through the authenticated production HTTP boundary against controlled RLS/PostgREST doubles.
- A real VPS deployment, container build, Caddy validation, key rotation exercise, and live Promethee compatibility test remain separate release evidence.

## Revisit triggers

- More than one user or MCP client must share a deployment.
- Promethee publishes a supported OAuth/RPC integration.
- Revocation must propagate faster than upstream refresh failure or the seven-day deadline.
- The retention interval, key custody, backup policy, or deployment edge changes.
- The personal PostgREST contract changes or RLS no longer enforces the verified subject.

## Related decisions

- Amends: [ADR-0006](0006-add-a-loopback-personal-session-mode.md)
- Depends on: [ADR-0002](0002-require-independent-user-scoped-authentication.md)
- Preserves: [ADR-0004](0004-separate-headless-cli-from-browser-authorization-ui.md)
- Alternative official path: [ADR-0005](0005-add-bounded-create-tools-through-publisher-rpcs.md)
