---
id: ADR-0002
status: proposed
date: 2026-08-27
deciders: []
consulted: []
informed: []
---

# ADR-0002: Require independent user-scoped authentication

## Context and problem

The MCP needs an authenticated Promethee identity. Reusing tokens from the desktop application would cross a private storage boundary, prevent clear consent, and make revocation ambiguous.

## Scope and non-goals

This decision covers user authentication and authorization for the remote MCP. It does not select the final UI framework, token store, or Promethee Auth configuration.

## Decision drivers

- Explicit user consent.
- Standards-compatible remote MCP authorization.
- RLS evaluated as the real user.
- Independent revocation from the desktop app.
- No extracted credentials or impersonation.

## Constraints

- MCP protected resources require standards-compatible authorization discovery.
- The deployed Promethee Auth feature set is unverified.
- Arbitrary self-hosted callback origins need a registration model.

## Considered options

1. Promethee-owned Supabase OAuth 2.1/OIDC server mode.
2. Separately operated broker with approved Promethee login.
3. Copy desktop tokens/session files.
4. Use a shared service credential and caller-supplied user ID.

## Decision

We propose to **require a fresh, browser-based, user-scoped authorization flow and prefer Promethee-owned Supabase OAuth server mode**.

## Rationale

This creates an auditable grant for a specific client, resource, and scope set while preserving RLS. Token extraction and shared credentials are rejected because they cannot provide safe consent or tenant isolation.

## Option comparison

| Driver | Promethee OAuth | Separate broker | Desktop token reuse | Shared credential |
| --- | --- | --- | --- | --- |
| Explicit consent | Strong | Strong | Weak | Weak |
| RLS identity | Strong | Possible | Fragile | Bypassed/unsafe |
| Revocation clarity | Strong | Medium | Weak | Weak |
| Operational complexity | Medium | High | Medium | Medium |
| Acceptable security boundary | Proposed | Possible | Rejected | Rejected |

## Consequences

### Positive

- Users authenticate without exposing desktop storage.
- Scopes can match individual MCP capabilities.
- Promethee can revoke or constrain access centrally.

### Negative

- Requires Promethee Auth configuration and consent UX work.
- Self-hosting needs a client registration and redirect strategy.
- Tokens and refresh behavior add operational security responsibilities.

### Neutral

- A publishable Supabase gateway key may still be required, but it is not user authentication.

## Implementation and migration

Confirm issuer capabilities, select the client registration model, define scopes, build consent and revocation UI, validate resource-bound tokens, and test wrong-issuer/resource/client cases before any backend call is enabled.

## Validation

- Authorization-code + PKCE flow passes against staging.
- Wrong issuer, audience/resource, client, redirect, expiry, and scope fail closed.
- Revocation prevents access and refresh.
- Logs contain no codes, OTPs, tokens, or authorization headers.

## Revisit triggers

- Promethee cannot enable the required OAuth server behavior.
- MCP changes its authorization requirements.
- A publisher-owned official MCP removes the need for this service.

## Related decisions and evidence

- Depends on: [ADR-0001](0001-use-promethee-supabase-as-system-of-record.md)
- Related: [ADR-0003](0003-expose-read-only-mcp-over-streamable-http.md)
- Evidence: [MCP authorization specification](https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization)
- Evidence: [Supabase OAuth server](https://supabase.com/docs/guides/auth/oauth-server)
