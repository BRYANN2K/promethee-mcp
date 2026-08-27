# Implementation plan

## Status

Planning only. No framework, dependency, validation command, production endpoint, or deployment artifact has been approved or created.

## Delivery strategy

Build the service as independently verifiable slices. Do not begin a slice whose external contract or authority is unresolved.

## Phase 0: publisher agreement

Owner: Promethee decision-maker and repository owner.

Required outcomes:

- written authorization for the integration and repository;
- approved product name, ownership, license, and disclosure boundary;
- approved user-data categories and use cases;
- approved authentication option and client registration model;
- approved staging environment and synthetic accounts;
- approved views/RPCs, scopes, quotas, and support owner;
- privacy, incident, retention, and revocation ownership.

Exit evidence: completed [integration request](../handover/promethee-integration-request.md) with named deciders.

## Phase 1: executable foundation

Select and record:

- supported Node.js and TypeScript versions;
- npm version and lockfile policy;
- MCP SDK and HTTP framework;
- test runner, typecheck, lint, and build commands;
- runtime configuration schema;
- dependency update and security review process.

Create only after review:

- package manifest and lockfile;
- minimal source/test layout;
- health endpoint separated from MCP data;
- structured redacted logger;
- configuration validation;
- continuous integration using synthetic fixtures.

Exit evidence: clean install, typecheck, tests, build, and a no-production-network test.

## Phase 2: authorization skeleton

Implement:

- protected resource metadata;
- OAuth challenge handling;
- issuer metadata/JWKS discovery with fixed trust configuration;
- authorization code + PKCE flow through the selected issuer;
- exact resource/audience/scope validation;
- consent and revocation UX or integration;
- encrypted refresh-token storage if required.

Use synthetic issuer fixtures first. Production issuer access remains disabled.

Exit evidence:

- wrong issuer, resource, client, redirect, signature, expiry, and scope fail closed;
- tokens/codes never appear in logs;
- revocation test passes;
- security review accepts the token boundary.

## Phase 3: Promethee adapter contract

Promethee provides staging-only read facades for tasks, projects, and historical sessions.

Implement:

- fixed operation allowlist;
- user-token forwarding without a caller `user_id`;
- bounded inputs and timeouts;
- response schema validation and field minimization;
- compatibility/version check;
- normalized errors and cancellation.

Exit evidence:

- synthetic and staging two-user isolation tests;
- unexpected/missing fields fail closed;
- no arbitrary URL/table/RPC can be selected by a request;
- no production host is reachable from ordinary tests.

## Phase 4: smallest MCP slice

Implement only:

- `promethee_list_tasks`;
- `promethee_list_projects`;
- their scopes, schemas, pagination, and errors.

Exit evidence:

- protocol conformance tests;
- authorization before any adapter call;
- cursor and output bounds;
- malicious task text remains inert structured data;
- publisher accepts rendered results from synthetic/staging data.

## Phase 5: sessions and reporting

Add:

- `promethee_list_sessions`;
- `promethee_get_time_report`;
- timezone and daylight-saving fixtures;
- publisher-owned duration aggregation.

Exit evidence:

- report totals match publisher reference fixtures;
- deleted/paused/incomplete session behavior is documented;
- maximum ranges and rate limits are measured and configured.

## Phase 6: self-hosting candidate

Create reviewed deployment artifacts only after the service works in staging:

- minimal container image;
- non-root runtime;
- HTTPS reverse-proxy contract;
- secret injection and rotation guide;
- health/readiness checks;
- backup/restore if operator state is persisted;
- upgrade and rollback procedure;
- SBOM and provenance.

Exit evidence: clean VPS exercise, security scan, revocation exercise, backup/restore exercise where applicable, and no secret in image/history/logs.

## Deferred capabilities

- current live status;
- Realtime subscriptions;
- content caching;
- durable MCP tasks;
- writes or timer control;
- feed, chat, notes, profiles, screenshots, signals, or social data.

Each requires new evidence and potentially a new ADR.

## Review roles

- Promethee backend owner: schema, RLS, RPC, quotas, compatibility.
- Promethee product/privacy owner: use cases, consent, branding, retention.
- MCP service owner: protocol, token validation, operations, tests.
- Security reviewer: threat model, auth, tenant isolation, secrets, dependencies.
- Documentation reviewer: contracts match implementation and evidence.
