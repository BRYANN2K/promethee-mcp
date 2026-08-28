# Documentation

This documentation separates executable local/mock evidence from live Promethee compatibility. Pages use these evidence labels:

- **Implemented**: present in the current TypeScript source.
- **Verified**: exercised by a named local test or validation command.
- **Observed**: present in the read-only Promethee 1.3.26 analysis.
- **Sourced**: required or described by an authoritative public standard or vendor document.
- **Proposed**: a design choice awaiting review.
- **Unknown**: requires evidence or a Promethee decision.

Implemented or verified synthetic behavior is not evidence that Promethee permits the integration, that its backend matches the draft contract, or that production OAuth and Supabase access work.

## Current implementation

The repository contains a Node.js/TypeScript resource server using MCP SDK v2. It exposes:

- `promethee_list_tasks`;
- `promethee_get_task`;
- `promethee_list_projects`;
- `promethee_create_project`;
- `promethee_create_task`.

`promethee-mcp serve` always binds to loopback. Its default synthetic mode denies every bearer token; `personal` accepts one browser-connected user session in memory; `supabase` requires the complete publisher-RPC configuration. `promethee-mcp doctor` validates the selected startup contract without network access. Signed synthetic tokens, in-memory fixtures, and mocked HTTP exercise both the fixed-RPC and personal PostgREST boundaries without contacting Promethee. The separate web package implements passwordless email-code login, personal pairing, and the publisher OAuth consent surface.

See the [project README](../README.md) for the command reference and the [implementation plan](development/implementation-plan.md) for completed and blocked phases.

## Understand the system

- [System overview](architecture/system-overview.md)
- [Authentication and authorization](architecture/authentication-and-authorization.md)
- [Data flow and trust boundaries](architecture/data-flow-and-trust-boundaries.md)
- [Threat model](architecture/threat-model.md)

These pages contain both implemented synthetic boundaries and proposed production architecture. Check each page's status language before treating a claim as executable.

## Review decisions

- [ADR index](adr/README.md)
- [ADR-0001: Use Promethee Supabase as the proposed system of record](adr/0001-use-promethee-supabase-as-system-of-record.md)
- [ADR-0002: Require independent user-scoped authentication](adr/0002-require-independent-user-scoped-authentication.md)
- [ADR-0003: Expose a read-only MCP over Streamable HTTP](adr/0003-expose-read-only-mcp-over-streamable-http.md)
- [ADR-0004: Separate the headless CLI from the browser authorization UI](adr/0004-separate-headless-cli-from-browser-authorization-ui.md)
- [ADR-0005: Add bounded create tools through publisher-owned RPCs](adr/0005-add-bounded-create-tools-through-publisher-rpcs.md)
- [ADR-0006: Add a loopback personal-session mode](adr/0006-add-a-loopback-personal-session-mode.md)
- [ADR-0007: Persist a single-user personal session behind a trusted edge](adr/0007-persist-a-single-user-personal-session-behind-a-trusted-edge.md)
- [ADR-0008: Use stdio onboarding with a loopback login](adr/0008-use-git-npx-stdio-onboarding-with-a-loopback-login.md)
- [ADR-0009: Distribute the CLI as a GitHub Release tarball](adr/0009-distribute-the-cli-as-a-github-release-tarball.md)

ADRs 0001–0003 remain **Proposed** because they require Promethee decisions. ADRs 0004–0008 are **Accepted** by the repository owner for this repository's implementation boundaries; they do not accept any Promethee-owned integration decision.

## Look up contracts

- [Draft MCP tools and resources](api/mcp-contract.md)
- [Draft data contract](api/data-contract.md)

The five Tasks/Projects tools have executable schemas and local/mock evidence. Sessions, reports, current status, resources, production limits, deployed RPCs, and live compatibility remain draft or blocked.

## Build and operate

- [Implementation plan](development/implementation-plan.md)
- [Self-hosting blueprint and local deny-all runtime](operations/self-hosting.md)
- [Security checklist](operations/security-checklist.md)

The public `v0.1.2` GitHub source release contains the validated CLI, browser authorization UI, and a single-user VPS deployment candidate. No container image, hosted deployment, clean-host VPS acceptance, or publisher staging acceptance exists yet.

## Handover

- [Promethee integration request](handover/promethee-integration-request.md)
- [Project contract](../PROJECT.md)
- [Product specification](../specs/0001-read-only-mcp.md)
- [Local GitHub Release+npx onboarding specification](../specs/0003-git-npx-local-onboarding.md)

## Maintenance

Review these documents whenever the executable tool schemas, dependency versions, scripts, or test evidence change; when Promethee changes its authentication, schema, RLS policies, public integration position, or supported client version; when MCP changes its authorization or transport requirements; or before enabling any non-synthetic adapter.
