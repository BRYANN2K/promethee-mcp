# Documentation

This documentation describes a proposed integration, not a shipped service. Pages use these evidence labels:

- **Observed**: present in the read-only Promethee 1.3.26 analysis.
- **Sourced**: required or described by an authoritative public standard or vendor document.
- **Proposed**: a design choice awaiting review.
- **Unknown**: requires evidence or a Promethee decision.

## Understand the system

- [System overview](architecture/system-overview.md)
- [Authentication and authorization](architecture/authentication-and-authorization.md)
- [Data flow and trust boundaries](architecture/data-flow-and-trust-boundaries.md)
- [Threat model](architecture/threat-model.md)

## Review decisions

- [ADR index](adr/README.md)
- [ADR-0001: Use Promethee Supabase as the proposed system of record](adr/0001-use-promethee-supabase-as-system-of-record.md)
- [ADR-0002: Require independent user-scoped authentication](adr/0002-require-independent-user-scoped-authentication.md)
- [ADR-0003: Expose a read-only MCP over Streamable HTTP](adr/0003-expose-read-only-mcp-over-streamable-http.md)

All ADRs are **Proposed**. They are not binding until the named Promethee decider accepts them.

## Look up contracts

- [Draft MCP tools and resources](api/mcp-contract.md)
- [Draft data contract](api/data-contract.md)

## Build and operate

- [Implementation plan](development/implementation-plan.md)
- [Self-hosting blueprint](operations/self-hosting.md)
- [Security checklist](operations/security-checklist.md)

The implementation and deployment instructions are intentionally incomplete because no executable service or deployment definition exists yet.

## Handover

- [Promethee integration request](handover/promethee-integration-request.md)
- [Project contract](../PROJECT.md)
- [Product specification](../specs/0001-read-only-mcp.md)

## Maintenance

Review these documents when Promethee changes its authentication, schema, RLS policies, public integration position, or supported client version; when MCP changes its authorization or transport requirements; or before any implementation begins.
