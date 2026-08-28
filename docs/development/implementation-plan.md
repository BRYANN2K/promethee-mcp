# Implementation plan

## Status

The executable foundation, five-tool Tasks/Projects slice, Git+npx local stdio onboarding, synthetic HTTP default, configured Supabase CLI mode, fixed five-RPC adapter, passwordless login, and OAuth consent surface are implemented. Backend evidence uses signed synthetic tokens and mocked HTTP; the packaged login has fresh browser rendering/keyboard evidence, and the same-process pairing path uses a mocked upstream. Publisher agreement, RPC/RLS deployment, custom permission enforcement, staging validation, clean Git installation, and deployed self-hosting evidence remain blocked.

The safe implementation may progress against synthetic identities and fixtures. It must not progress to Promethee staging or production without the approvals and contracts below.

## Current toolchain and commands

- Node.js `>=22.14.0 <23`;
- npm `10.9.2` with a lockfile;
- TypeScript `7.0.2`;
- MCP SDK server/node/client `2.0.0`;
- Zod `4.4.3` and JOSE `6.2.10`;
- Node's built-in test runner.

Declared validation:

```bash
npm run typecheck
npm test
npm run build
npm run check
```

The exact dependency installation reported zero npm audit findings. Current validation evidence must come from a complete local run; a clean `npm ci` exercise has not yet been performed.

## Phase 0: publisher agreement — blocked

Owner: Promethee decision-maker and repository owner.

Required outcomes:

- written authorization for the integration and repository;
- approved product name, ownership, license, and disclosure boundary;
- approved user-data categories and use cases;
- approved authentication option and client-registration model;
- approved staging environment and synthetic accounts;
- approved views/RPCs, scopes, quotas, and support owner;
- privacy, incident, retention, and revocation ownership.

Exit evidence: completed [integration request](../handover/promethee-integration-request.md) with named deciders. None of this is satisfied by the synthetic implementation.

## Phase 1: executable foundation — implemented synthetically

Implemented:

- locked Node.js/TypeScript/npm project;
- MCP SDK v2 Streamable HTTP handler and Node server;
- `/healthz` separate from MCP data;
- strict Host and Origin validation;
- 16 KiB Node request-body bound;
- content-free security logging primitives;
- process lifecycle and idempotent shutdown;
- TypeScript build, typecheck, test, and aggregate check commands;
- synthetic tests and loopback runtime.
- dependency-free operator CLI with TTY client onboarding, local stdio personal mode, `serve`, offline `doctor`, human/JSON output, deterministic port precedence, stable usage diagnostics, and signal-driven shutdown;
- Git+npx installation plans for Codex, Claude Code, and generic MCP JSON with explicit confirmation before client mutation;
- same-process loopback login hosting plus `promethee_connection_status` for LLM-safe URL handoff.

Remaining before a release candidate:

- clean `npm ci` validation;
- continuous-integration workflow;
- dependency update policy and automated security evidence;
- deployment artifact and reverse-proxy exercise.

## Phase 2: authorization skeleton — implemented, deployment blocked

Implemented and verified synthetically:

- OAuth protected-resource metadata;
- bearer challenge handling;
- strict local RS256 JWT verification using an injected in-memory public JWKS;
- issuer, exact resource, client, expiry, header, signature, and scope checks;
- rejection of attacker-selected keys;
- normalized token-free `AuthContext` passed to the application;
- scope denial before use-case execution;
- a default local verifier that rejects every bearer token.
- fixed-issuer Supabase JWT verification using asymmetric remote JWKS discovery;
- MCP-specific audience, authenticated role, user/client identity, and approved-client permission mapping;
- a caller-bound application factory that keeps the token out of use-case inputs;
- a public-URL-aware composition that advertises identity and implemented tool scopes and intersects token grants with server-owned client policy.

Implemented:

- a native TypeScript/Vite `/login` surface using `@supabase/supabase-js` passwordless email OTP send/verify;
- a `/oauth/consent` surface using `getAuthorizationDetails`, `approveAuthorization`, and `denyAuthorization` with bounded redirect validation;
- fail-closed browser configuration that accepts only HTTPS Supabase origins and browser-safe publishable/legacy anon keys;
- bounded authorization-identifier and provider-redirect validation helpers with focused tests.
- same-origin production loopback pairing for the packaged stdio login;
- a release-build guard that prevents unconfigured source checks from replacing the configured packaged login.

Not implemented:

- production authorization-server/client registration and end-to-end code exchange evidence;
- refresh and revocation exercises;
- live remote JWKS retrieval or rotation evidence;
- Promethee Auth or Supabase OAuth configuration;
- operator grant storage.

The synthetic OAuth metadata advertises local placeholder endpoints; those endpoints do not implement an authorization server.

## Phase 3: Promethee adapter contract — implementation present, external work blocked

Implemented:

- a fixed five-method `PrometheeFacade` port;
- no caller-selected URL, table, RPC, SQL, or `userId`;
- no bearer token in the application use-case interface or authorization context;
- bounded calls with timeout and cancellation;
- strict response schemas and field minimization;
- a local synthetic adapter with A/B isolation fixtures.
- a request-scoped Supabase adapter restricted to three read RPCs plus `mcp_create_project_v1` and `mcp_create_task_v1`;
- publishable-key plus user-token requests with no caller-supplied user ID, redirects, retries, or arbitrary endpoint selection;
- strict response size, schema, ordering, identity-binding, RLS-denial, and malformed-source tests.

Not implemented:

- an approved OAuth client and deployed public resource;
- an approved audience hook and upstream authorization policy;
- publisher-owned views/RPCs and version metadata;
- real RLS, schema, quota, ordering, deletion, or freshness validation.

Promethee must approve the Supabase OAuth token, MCP-specific audience hook, client allowlist, fixed RPCs, and RLS policies before the composition is configured or exercised against staging.

## Phase 4: smallest MCP slice — implemented synthetically

Implemented tools:

- `promethee_list_tasks`;
- `promethee_get_task`;
- `promethee_list_projects`.
- `promethee_create_project`;
- `promethee_create_task`.

Implemented boundaries:

- closed input and output schemas;
- exact `tasks:read` scope mapping;
- stable synthetic `id` ordering;
- default page size `2` and synthetic maximum `3`;
- AES-256-GCM cursors bound to subject, scope, tool, filters, page size, and ordering version;
- strict canonical Base64URL cursor encoding and expiry;
- 128-byte synthetic text bound and 16 KiB structured result bound;
- generic text blocks that do not interpolate task/project content;
- strict malformed-source, tenant-isolation, timeout, prompt-content, and cursor tests.

These numeric limits and data mappings are synthetic test policy, not a proposed Promethee production contract.

Remaining exit evidence:

- publisher-approved staging facade and fields;
- staging RLS isolation;
- production pagination, deletion, ordering, freshness, and limit semantics;
- publisher acceptance of normalized MCP results.

## Phase 5: sessions and reporting — deferred

Not implemented:

- `promethee_list_sessions`;
- `promethee_get_time_report`;
- timezone and daylight-saving behavior;
- publisher-owned duration aggregation.

This phase begins only after the Tasks/Projects staging contract is approved and verified.

## Phase 4b: bounded task/project creation — implemented locally

Implemented contract:

- `promethee_create_project` with `projects:write`;
- `promethee_create_task` with `tasks:write`;
- fixed publisher-owned RPCs only;
- subject/client/tool/input-bound durable idempotency;
- no update, completion, deletion, bulk, or timer control.
- closed Unicode/byte-bounded input and normalized output schemas;
- in-process subject/client/operation/input-bound idempotency for synthetic tests;
- immediate synthetic read-after-create and cross-tenant non-enumeration;
- fixed mocked Supabase request/response and MCP runtime evidence.

Required production evidence is defined in [SPEC-0002](../../specs/0002-bounded-task-project-creation.md). No live write is authorized or proven before publisher RPC/RLS/idempotency deployment and staging approval.

## Phase 6: packaging and self-hosting candidates — implemented, external evidence incomplete

Implemented artifacts:

- root Git-installable npm package metadata with `prometheemcp` bin;
- compiled local login artifact included in package inventory;
- non-root multi-stage container and private Compose network;
- Caddy TLS/static edge candidate;
- encrypted single-user session volume and bounded health configuration.

Required external evidence:

- minimal non-root container image;
- HTTPS reverse-proxy contract;
- production issuer, resource, origin, and secret validation;
- health/readiness design;
- backup/restore when operator state exists;
- clean install, upgrade, rollback, revocation, and dependency-failure exercises;
- SBOM, provenance, secret scanning, and vulnerability review.

The package dry-run proves the CLI and login assets are present, but no reviewed Git ref, npm package, image, tag, or deployment has been produced. Clean Git+npx installation, container build, Caddy/TLS, key rotation, rollback, and Windows execution remain unverified.

## Deferred capabilities

- current live status;
- Realtime subscriptions;
- content caching;
- durable MCP tasks;
- update/delete/bulk mutations or timer control;
- feed, chat, notes, profiles, screenshots, signals, or social data.

Each requires new evidence and potentially a new ADR.

## Review roles

- Promethee backend owner: schema, RLS, RPC, quotas, compatibility, and upstream authorization.
- Promethee product/privacy owner: use cases, consent, branding, retention, and disclosure.
- MCP service owner: protocol, application boundary, operations, and tests.
- Security reviewer: threat model, auth, tenant isolation, secrets, dependencies, and artifacts.
- Documentation reviewer: executable contracts, evidence, and limitations remain aligned.
