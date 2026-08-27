---
id: ADR-0001
status: proposed
date: 2026-08-27
deciders: []
consulted: []
informed: []
---

# ADR-0001: Use Promethee Supabase as the proposed system of record

## Context and problem

A remote MCP server cannot read a desktop SQLite database without a local connector. A read-only analysis of Promethee 1.3.26 observed a Supabase backend and remote task, project, and session operations. The project needs to decide whether to integrate with that backend, introduce a separate synchronized database, or require local software.

## Scope and non-goals

This decision covers read-only data retrieval for the proposed MCP. It does not authorize production access, mutation, local SQLite reads, or timer control.

## Decision drivers

- No local companion installation.
- Data remains associated with the user's real Promethee account.
- One source of truth and one authorization boundary.
- Minimal duplicated personal data.
- Publisher control over fields, policies, quotas, and compatibility.

## Constraints

- Promethee's permission is required.
- Observed private interfaces are not a supported public contract.
- RLS and server schema have not been independently validated.
- No RLS-bypassing credential may be distributed.

## Considered options

1. Use publisher-approved Promethee Supabase views/RPCs.
2. Synchronize Promethee data into an operator-owned Supabase project.
3. Read local SQLite through an installed connector.
4. Do nothing until Promethee publishes an integration API.

## Decision

We propose to **use publisher-approved read-only views or RPC functions on Promethee Supabase as the system of record**.

## Rationale

This removes the local connector, avoids a second copy of the user's work history, and lets Promethee retain policy and schema ownership. Dedicated views/RPCs provide a narrower and more stable boundary than proxying arbitrary PostgREST queries.

## Option comparison

| Driver | Promethee facade | Separate database | Local connector | Wait |
| --- | --- | --- | --- | --- |
| No local install | Strong | Strong | Weak | Strong |
| Minimal duplication | Strong | Weak | Strong | Strong |
| Publisher control | Strong | Medium | Weak | Strong |
| Delivery independence | Weak | Medium | Medium | Weak |
| Current evidence | Partial | None | SQLite observed | No implementation |

## Consequences

### Positive

- No Electron or local agent is required.
- RLS remains the final user-data boundary.
- The integration can use remote, account-linked data.
- Promethee can evolve internal tables behind a stable facade.

### Negative

- Delivery depends on Promethee approval and backend work.
- Outages and rate limits in Promethee affect MCP availability.
- Self-hosted operators depend on a centralized system of record.

### Neutral

- The MCP service remains separately deployable even though its data source is not.

## Implementation and migration

Promethee should approve a minimal field projection, create dedicated read-only views/RPCs, apply RLS, provide staging fixtures, and publish compatibility/version metadata. The MCP must fail closed when the facade version is unsupported.

## Validation

- Publisher review of each field and operation.
- Synthetic two-user RLS isolation tests.
- Staging contract tests for ordering, pagination, deletion, and malformed data.
- Proof that the MCP deployment contains no service-role credential.

## Revisit triggers

- Promethee publishes an official API or MCP.
- Required data is not synchronized remotely.
- RLS cannot express the required isolation.
- Availability or quota limits make the integration unreliable.

## Related decisions and evidence

- Related: [ADR-0002](0002-require-independent-user-scoped-authentication.md)
- Related: [ADR-0003](0003-expose-read-only-mcp-over-streamable-http.md)
- Evidence: read-only Promethee 1.3.26 analysis dated 2026-08-24; publisher validation pending.
