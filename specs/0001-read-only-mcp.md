# SPEC-0001: Read-only Promethee MCP

## Status

Proposed, 2026-08-27. No implementation or Promethee approval exists.

## Problem

Promethee users cannot currently grant an MCP client a narrow, standards-based way to query their tasks and time history without depending on a desktop-local connector or exposing private application credentials.

## Outcome

An authenticated user can grant a compatible MCP client read-only access to approved task, project, session, and time-report data through a self-hostable remote service backed by a publisher-owned Promethee Supabase facade.

## Stakeholders

- Promethee product owner and founder.
- Promethee backend/security/privacy owners.
- Promethee users.
- Repository and MCP service operator.
- MCP client implementers.

Accountable deciders remain unknown.

## Functional requirements

### Authorization

- FR-001: The MCP server challenges unauthenticated requests through standards-compliant protected resource discovery.
- FR-002: The user authenticates through a fresh browser flow; no desktop session is imported.
- FR-003: The consent surface identifies the MCP client, redirect, resource, and requested scopes.
- FR-004: Every tool requires an explicit scope.
- FR-005: Users can revoke a grant independently of their Promethee desktop session.

### Data access

- FR-010: The server calls only publisher-approved read-only views or RPCs.
- FR-011: Backend identity is derived from the authenticated token, never a caller-provided user ID.
- FR-012: Task/project tools return only the approved normalized fields.
- FR-013: Session/report tools use publisher-defined duration, pause, deletion, timezone, and freshness semantics.
- FR-014: Every response carries observation/freshness metadata.
- FR-015: Lists and reports use bounded pagination, ranges, and output sizes.

### MCP surface

- FR-020: The first slice exposes task and project reads.
- FR-021: A later approved slice exposes historical sessions and aggregated reports.
- FR-022: Current status remains disabled until Promethee defines an authoritative remote contract.
- FR-023: No generic SQL, PostgREST, RPC, URL-fetch, Storage, Edge Function, or debug tool is exposed.

### Operations

- FR-030: Operators can deploy an immutable service behind HTTPS using reviewed artifacts.
- FR-031: Production startup fails when issuer/resource/origin/security configuration is unsafe.
- FR-032: Logs and metrics contain no credentials or Promethee content.
- FR-033: Rate limits protect the user, deployment, and Promethee backend.
- FR-034: Revocation, dependency failure, token rotation, and schema drift fail closed.

## Security and privacy requirements

- SR-001: No service-role or other RLS-bypassing Promethee credential exists in distributed artifacts or runtime configuration.
- SR-002: Tokens are validated for issuer, signature, expiry, resource/audience, client, and scope.
- SR-003: Cross-user access is denied even when a valid identifier is supplied.
- SR-004: User-controlled task/project text is returned as inert structured data.
- SR-005: Ordinary tests cannot reach production Promethee origins.
- SR-006: Operator-held refresh tokens, if required, are encrypted at rest and deleted on revocation.
- SR-007: The first release stores no Promethee content cache.
- SR-008: Consent discloses that data already returned to an MCP client cannot be recalled by server-side revocation.

## Non-goals

- Promethee desktop installation, discovery, or control.
- Local SQLite access or synchronization.
- Reading or decrypting Promethee desktop tokens/session files.
- Task/session mutation or timer control.
- Full Promethee API coverage.
- Feed, chat, notes, screenshots, window activity, signals, AI memories, social data, or profiles.
- Production access before publisher approval.

## Proposed tools

| Tool | Scope | Slice |
| --- | --- | --- |
| `promethee_list_tasks` | `tasks:read` | First |
| `promethee_get_task` | `tasks:read` | First |
| `promethee_list_projects` | `tasks:read` | First |
| `promethee_list_sessions` | `sessions:read` | Second |
| `promethee_get_time_report` | `reports:read` | Second |
| `promethee_get_current_status` | `status:read` | Blocked |

Detailed draft schemas are in [MCP contract](../docs/api/mcp-contract.md) and [data contract](../docs/api/data-contract.md).

## Failure requirements

- Invalid input is rejected before a backend call.
- Missing/invalid auth is rejected without fallback.
- Missing scope never degrades to a broader generic query.
- RLS denial is not retried with another credential.
- Unexpected backend schemas fail closed.
- Dependency errors expose no internal SQL, policy, token, or cross-user existence.
- Timeouts and cancellation stop bounded work without blind mutation/retry.

## Implementation slices and evidence

### Slice A: synthetic protocol and auth

Evidence:

- protocol/transport conformance;
- OAuth metadata and PKCE flow against a synthetic issuer;
- wrong issuer/resource/client/scope tests;
- log-redaction tests.

### Slice B: synthetic adapter

Evidence:

- fixed operation allowlist;
- exact input/output schemas;
- two-user isolation fixtures;
- production-network denial;
- bounds, timeout, cancellation, and malformed-response tests.

### Slice C: Promethee staging tasks/projects

Evidence:

- publisher-approved facade and fields;
- staging RLS isolation;
- pagination/deletion/order compatibility;
- publisher acceptance of MCP results.

### Slice D: staging sessions/reports

Evidence:

- reference duration/timezone fixtures;
- report totals match publisher results;
- incomplete/deleted/paused-session semantics;
- freshness classification.

### Slice E: self-hosting release candidate

Evidence:

- clean install and upgrade/rollback exercise;
- image, SBOM, provenance, secret, and vulnerability review;
- HTTPS/origin/rate-limit checks;
- revocation and dependency-failure exercise;
- final documentation review.

## Acceptance criteria

The specification is accepted only when:

- Promethee names accountable deciders and accepts the governing ADRs;
- the exact scopes, fields, facade, quotas, retention, and compatibility contract are approved;
- all applicable slice evidence passes on the exact release candidate;
- production validation is separately authorized;
- no known path bypasses RLS or exposes a privileged credential;
- branding, ownership, license, support, and release decisions are complete.

## Open questions

- Can the deployed Promethee Supabase Auth act as the MCP authorization server?
- How are arbitrary self-hosted MCP deployments registered?
- Which remote source, if any, is authoritative for current session status?
- Are raw Promethee identifiers allowed in MCP responses?
- What are the maximum ranges, page sizes, quotas, and retention periods?
- Who owns incidents, deprecations, user support, and security disclosure?

## Related decisions

- [ADR-0001](../docs/adr/0001-use-promethee-supabase-as-system-of-record.md)
- [ADR-0002](../docs/adr/0002-require-independent-user-scoped-authentication.md)
- [ADR-0003](../docs/adr/0003-expose-read-only-mcp-over-streamable-http.md)
