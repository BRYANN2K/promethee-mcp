# Promethee integration request

## Proposal

Build an open-source, self-hostable, read-only MCP service that authenticates Promethee users independently and queries a narrow publisher-owned Supabase facade for tasks, projects, sessions, and time reports.

The service would not require the Promethee desktop application, read local SQLite, reuse desktop sessions, or receive privileged database credentials.

## Requested Promethee decisions

### Ownership and product

- Who is the accountable product and technical decider?
- Should the project be owned by Promethee, transferred later, or remain an approved third-party integration?
- Is `promethee-mcp` an approved name?
- Which logo, trademarks, screenshots, and product descriptions may be used?
- Which license and contribution policy apply?
- May the repository become public, and what information must remain private?

### Authentication

- May the integration authenticate against Promethee Supabase Auth?
- Can the deployed Auth version act as an OAuth 2.1/OIDC authorization server for MCP?
- Who owns the login, consent, redirect, client-registration, and revocation configuration?
- Should the integration use a central authorization service or support preregistered self-hosted deployments?
- Which public/publishable client configuration may be distributed?
- What session lifetime, refresh rotation, MFA, and revocation rules apply?

### Data and scopes

Approve or reject the proposed scopes:

- `tasks:read`
- `sessions:read`
- `reports:read`
- optional `status:read`

For each scope, approve exact fields, bounds, retention, and use cases. Confirm whether raw identifiers may leave Promethee or must be replaced by opaque references.

Explicitly confirm that the first release excludes writes, timer control, notes, screenshots, app activity, AI memories, chat, feed, contacts, profile, social, and Storage data.

### Backend facade

- Will Promethee provide dedicated read-only views or RPC functions?
- Will identity always be derived from `auth.uid()` or equivalent server context?
- What contract version and compatibility signal will the facade expose?
- What pagination, ordering, deletion, timezone, duration, and freshness semantics apply?
- Is a current-session observation available remotely and authoritative?
- What quotas and rate limits must the MCP enforce?

### Environments and evidence

- Provide a non-production Supabase project or isolated staging namespace.
- Provide synthetic multi-user fixtures for tasks, projects, sessions, pauses, deletion, and reports.
- Provide an RLS/policy review owner.
- Define permitted production validation and who authorizes it.
- Define incident, schema-change, deprecation, and support communication channels.

### Privacy and operations

- Identify controller/processor roles and approved infrastructure regions.
- Define retention for grants, audit events, logs, and any future cache.
- Define account deletion and grant revocation behavior.
- Define allowed self-hosting operators and subprocessors.
- Define incident notification and credential-rotation ownership.

## Proposed Promethee deliverables

1. Written integration approval.
2. Named product, backend, security/privacy, and support owners.
3. Approved OAuth/resource/client registration model.
4. Staging issuer and synthetic accounts.
5. Dedicated versioned read-only facade.
6. RLS and field-projection review.
7. Quota, rate-limit, retention, and deprecation contract.
8. Branding, license, repository, and publication decision.

## Proposed repository-owner deliverables

1. MCP protocol/resource server implementation.
2. Closed tool schemas and field minimization.
3. Exact token validation and scope enforcement.
4. Synthetic test suite and staging contract tests.
5. Threat model, secure self-hosting artifacts, SBOM, and operational documentation.
6. No production access until Promethee approves the exact validation.

## Acceptance gate

Implementation may begin with synthetic auth/data after the architecture is reviewed. Promethee-connected staging implementation begins only after the required issuer, client, scope, facade, and fixture contracts exist. Production access and public release require a separate final approval.
