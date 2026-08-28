---
id: ADR-0005
status: accepted
date: 2026-08-28
deciders:
  - repository owner
consulted: []
informed: []
---

# ADR-0005: Add bounded create tools through publisher-owned RPCs

## Context and problem

At the time of this decision, the MCP implemented a read-only synthetic slice. The repository owner required agents to create Promethee projects and tasks as well as read them. A generic database proxy or direct table writer would widen the private Supabase surface, make retry behavior ambiguous, and couple the MCP to undocumented schema and RLS details.

Promethee has not approved production mutation RPCs, RLS policy, quotas, or staging access. This decision therefore governs the repository contract and synthetic implementation; it does not activate live writes.

## Scope and non-goals

This decision covers creation of one project or one task through closed MCP tools. It does not authorize update, completion, deletion, reordering, timer control, arbitrary SQL/PostgREST, or production access.

## Decision drivers

- Let an agent perform the two requested creation workflows.
- Preserve user-scoped RLS and explicit OAuth consent.
- Make retries safe when a client loses a response.
- Keep the backend surface small and reviewable.
- Avoid exposing private tables, columns, or service credentials.
- Fail closed until Promethee approves exact production semantics.

## Constraints

- No service-role or RLS-bypassing credential may exist in the MCP or browser UI.
- Subject identity is derived from the verified access token, never a tool argument.
- Each write needs its own scope and explicit consent disclosure.
- Ordinary tests use synthetic stores and mocked upstream responses only.
- Production enablement requires publisher-owned RPCs, RLS, quotas, audit semantics, and staging evidence.

## Considered options

1. Remain read-only.
2. Add two create-only tools backed by fixed publisher-owned RPCs.
3. Write directly to Supabase tables through PostgREST.
4. Expose complete task/project CRUD immediately.

## Decision

We will **add `promethee_create_project` and `promethee_create_task` as bounded, create-only MCP tools backed exclusively by two fixed, publisher-owned, user-scoped RPC contracts**.

The tools require distinct `projects:write` and `tasks:write` scopes. Every call carries a bounded client request identifier. The publisher RPC must bind idempotency to the authenticated subject, OAuth client, operation, request identifier, and canonical input. A replay with identical input returns the original result; reuse with different input fails as `idempotency_conflict`.

The Supabase adapter may call only the configured RPC name for the selected tool. Direct table writes, generic RPC names, caller-supplied user identifiers, and credential fallback remain prohibited. Live composition remains disabled until the publisher contract is approved and independently verified.

## Rationale

Create-only tools meet the requested workflow with a smaller irreversible surface than full CRUD. Fixed RPCs let Promethee own validation, defaults, RLS, schema mapping, and idempotency at the authoritative boundary. Remaining read-only does not meet the product requirement. Direct table writes and full CRUD expose more undocumented behavior and make safe retries and compatibility harder to prove.

## Option comparison

| Driver | Read-only | Fixed create RPCs | Direct table writes | Full CRUD | Evidence |
| --- | --- | --- | --- | --- | --- |
| Requested workflow | Weak | Strong | Strong | Strong | Repository-owner requirement |
| Least privilege | Strong | Strong | Weak | Weak | Closed-surface analysis |
| Retry safety | Not applicable | Strong if RPC contract is implemented | Weak | Medium | Idempotency contract |
| Schema isolation | Strong | Strong | Weak | Medium | Current facade architecture |
| Current production evidence | None needed | Absent | Absent | Absent | Repository and staging status |

## Consequences

### Positive

- Agents can create the two requested resource types through explicit, typed tools.
- Consent can distinguish reads from writes.
- Idempotent retries avoid duplicate tasks and projects when responses are lost.
- Promethee keeps ownership of validation, defaults, RLS, and compatibility mapping.

### Negative

- The publisher must implement, review, operate, and version two mutation RPCs plus idempotency storage or equivalent durable semantics.
- Write-capable grants have higher prompt-injection and compromised-client impact than read-only grants.
- Self-hosters need additional rate limits, audit metadata, and revocation exercises.

### Neutral

- Existing read tools remain unchanged.
- Update, completion, deletion, timer control, and generic database access remain excluded.
- The web consent design must be reapproved before showing write permissions.

## Implementation and migration

1. Implemented: closed tool inputs, outputs, scopes, metadata, application use cases, facade ports, and synthetic mutation storage.
2. Implemented: duplicate/conflicting replay, cross-tenant, timeout, output-bound, and malformed-upstream tests; publisher-side cancellation reconciliation remains staging evidence.
3. Implemented: the Supabase facade calls exactly `mcp_create_project_v1` and `mcp_create_task_v1` for writes.
4. Implemented: the consent surface separates identity, read, create-project, and create-task categories.
5. Still required: publisher staging proof for RLS, durable idempotency, quotas, token permissions, audit semantics, and response compatibility.

## Validation

- Missing write scope prevents any adapter call.
- The same principal, client, tool, request identifier, and canonical input produces one resource and one stable response.
- Reusing an identifier with different input returns `idempotency_conflict` and creates nothing.
- User A cannot create into or infer User B's project.
- Timeout/cancellation does not trigger a blind retry; a caller may replay only with the same request identifier.
- Unknown source fields and invalid source shapes fail closed.
- Consent names both write categories before either scope is granted.
- Publisher staging independently verifies RLS and durable readback before live enablement.

## Revisit triggers

- Promethee rejects the proposed RPC or idempotency boundary.
- An update, completion, deletion, bulk, or timer-control workflow is requested.
- MCP tool metadata or authorization scope conventions change.
- Staging shows that creation defaults or project membership cannot be represented by the minimal contract.
- Abuse, quota, or duplicate-creation evidence exceeds the accepted operating envelope.

## Related decisions and evidence

- Amends: [ADR-0003](0003-expose-read-only-mcp-over-streamable-http.md)
- Depends on: [ADR-0001](0001-use-promethee-supabase-as-system-of-record.md)
- Depends on: [ADR-0002](0002-require-independent-user-scoped-authentication.md)
- Related: [ADR-0004](0004-separate-headless-cli-from-browser-authorization-ui.md)
- Implemented contract: [SPEC-0002](../../specs/0002-bounded-task-project-creation.md)
