---
id: ADR-0003
status: proposed
date: 2026-08-27
deciders: []
consulted: []
informed: []
---

# ADR-0003: Expose a read-only MCP over Streamable HTTP

## Context and problem

The integration needs a remote protocol usable by MCP clients while limiting access to a small, reviewable data surface. It must not expose Promethee's full private backend.

## Scope and non-goals

This decision covers transport and first-release capability. It does not select a TypeScript framework or authorize write/control tools.

## Decision drivers

- Compatibility with remote MCP clients.
- Stateless horizontal scaling where practical.
- A small auditable tool surface.
- No local process requirement.
- Safe failure and gradual capability expansion.

## Constraints

- Authorization must follow the active MCP specification.
- Promethee data access remains user scoped and read-only.
- Backend quotas and authoritative current-session semantics are unknown.

## Considered options

1. Remote Streamable HTTP MCP with read-only tools/resources.
2. Local stdio MCP reading SQLite.
3. General REST/PostgREST proxy.
4. Remote MCP with immediate write/control tools.

## Decision

We propose to **expose a protected, read-only MCP over Streamable HTTP with a closed set of typed tools and resources**.

## Rationale

Streamable HTTP matches the remote deployment goal. A read-only closed contract reduces damage from compromised clients, prompt injection, schema drift, and incomplete Promethee mutation semantics.

## Option comparison

| Driver | Remote read-only MCP | Local stdio | REST proxy | Remote read/write MCP |
| --- | --- | --- | --- | --- |
| No local install | Strong | Weak | Strong | Strong |
| MCP compatibility | Strong | Strong/local | Weak | Strong |
| Least privilege | Strong | Medium | Weak | Weak initially |
| Operational risk | Medium | Low/host-local | High | High |
| Current evidence | Partial | SQLite observed | Private API observed | Insufficient |

## Consequences

### Positive

- One remote endpoint can support multiple approved MCP clients.
- Tools can carry explicit scopes, bounds, schemas, and freshness.
- The backend facade remains hidden behind stable product concepts.

### Negative

- The service must implement OAuth metadata, validation, rate limiting, and secure operations.
- It cannot control the Promethee desktop timer in the first release.
- Remote data may lag local state.

### Neutral

- A future write capability requires a new ADR and threat-model expansion.

## Implementation and migration

Implement the smallest read-only tools first, then add reporting and optional status only after each backend contract is approved. Keep the protocol layer independent from the Promethee adapter.

## Validation

- MCP protocol and transport conformance tests.
- Authentication before tool execution.
- Scope-to-tool matrix tests.
- Request bounds, cancellation, timeout, Origin, and malformed-response tests.
- Synthetic data proves tenant isolation and output minimization.

## Revisit triggers

- A supported client requires another transport.
- A stateful MCP feature becomes necessary.
- Promethee approves write/control operations.
- The MCP transport specification changes.

## Related decisions and evidence

- Depends on: [ADR-0001](0001-use-promethee-supabase-as-system-of-record.md)
- Depends on: [ADR-0002](0002-require-independent-user-scoped-authentication.md)
- Evidence: [MCP transport specification](https://modelcontextprotocol.io/specification/2025-11-25/basic/transports)
