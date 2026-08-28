# Data flow and trust boundaries

## Data policy

Promethee MCP should retrieve the minimum fields needed for the requested tool, return a normalized response, and avoid persistent copies of Promethee content in the first release.

## Trust boundaries

### Boundary 1: user and MCP client

The MCP client is not automatically trusted. It receives only the scopes the user approves, and its redirect URI and client identity must be validated during authorization.

Risks include malicious prompt content, excessive tool calls, confused-deputy authorization, and tokens exposed by the client.

### Boundary 2: MCP client and resource server

All requests cross public HTTPS. The resource server authenticates before parsing tool-specific content deeply, validates the MCP protocol version and origin requirements, applies request size limits, and rate-limits by subject and client.

### Boundary 3: resource server and authorization service

The resource server trusts only configured issuers and verified signing keys. Discovery metadata is not permission to trust an arbitrary issuer supplied by a request.

### Boundary 4: resource server and Promethee Supabase

The resource server may pass a verified Supabase OAuth user token only into a request-scoped Supabase adapter closure. Application use cases receive only normalized authorization facts. The adapter calls only five fixed RPC names—three reads and two create-only mutations—and Supabase must enforce the same user, OAuth `client_id`, MCP audience, tool permission, and operation policy through RLS.

### Boundary 5: Promethee RLS and stored data

Promethee owns the authoritative authorization and data policy. RLS derives the subject from the token. The integration must not add a caller-provided `user_id` filter and then treat that filter as authorization.

### Boundary 6: operator storage and logs

Operational state must be separated from Promethee content. The single-user personal deployment may store only the ADR-0007 encrypted authentication envelope and non-secret retention preference; it never caches task or project content. Logs may contain request IDs, tool names, latency, status classes, client ID, and pseudonymous subject IDs; they must not contain task titles, session labels, email addresses, tokens, or raw tool results.

### Boundary 7: trusted single-user edge

The checked-in VPS candidate terminates TLS and operator browser authentication at Caddy. It adds a deployment-secret header to `/connect/*`; browsers cannot supply that trust by themselves. `/mcp` bypasses browser Basic Auth and requires its own backend-validated static bearer. The Node service is not published directly and accepts only the configured public Host/Origin plus its private authority.

### Boundary 8: local stdio process and loopback browser

An MCP client launches the local process over stdio. JSON-RPC is the only stdout protocol. The same process serves a bounded static login shell and connection bridge on `127.0.0.1`; it never binds the onboarding surface to a LAN or public interface. Exact Host and Origin checks protect connection mutations. The status tool may disclose only the loopback login URL and connection boolean. The GitHub Release archive, checksum, `npx`, and installed dependency lock are supply-chain boundaries; the supported path executes the reviewed archive instead of rebuilding a Git checkout.

## Read flow

1. Receive an authenticated MCP tool request.
2. Resolve the tool to a fixed scope and backend operation.
3. Validate the JSON input against a closed schema.
4. Apply server-side maximum date ranges, page sizes, and timeouts.
5. Capture the verified Supabase user token inside a request-scoped adapter and call one fixed allowlisted RPC. Configured CLI mode composes this path; repository tests replace the HTTP boundary with a mock.
6. Reject backend rows that fail the expected response schema.
7. Remove fields not in the MCP data contract.
8. Attach source observation time and freshness metadata.
9. Return the normalized result.
10. Record content-free operational metrics.

For local stdio, steps 1–2 first resolve the current browser-paired connection. When none exists, the use case returns `authentication_required` before step 3 and the user can obtain the separate loopback login URL from `promethee_connection_status`.

## Create flow

1. Require `projects:write` or `tasks:write` before parsing tool input.
2. Validate one closed create object plus a canonical 16–64 character `clientRequestId`.
3. Call exactly `mcp_create_project_v1` or `mcp_create_task_v1`; never select a table, URL, or RPC from input.
4. Let the publisher boundary derive the user from the access token and bind durable idempotency to subject, OAuth client, operation, request identifier, and canonical input.
5. Validate the closed created/replayed/conflict/not-found outcome and return only normalized fields.
6. Never retry an ambiguous write with a new request identifier.

The synthetic facade implements this behavior in memory. The Supabase adapter and MCP runtime are verified with mocked HTTP, but the authoritative durable RPC behavior is unavailable until Promethee deploys it.

## Proposed data minimization

### Tasks

Candidate fields:

- stable task identifier;
- task title;
- completion/deletion status;
- project identifier;
- schedule metadata when explicitly approved;
- timestamps required for ordering.

Exclude XP internals, recurrence internals, session linkage, sync state, and unrelated metadata unless an accepted tool contract requires them.

### Projects

Candidate fields:

- stable project identifier;
- project name;
- ordering and deletion state where needed.

Exclude public/social metadata and media URLs from the first release.

### Sessions and reports

Candidate fields:

- stable session identifier or a server-issued opaque reference;
- task label or approved task reference;
- start and end timestamps;
- worked duration;
- pause duration only when needed for an approved report;
- source observation/freshness time.

Exclude application context, notes, screenshots, AI content, signal summaries, feed state, and social data.

Whether the MCP may expose raw Promethee identifiers is an open decision. An opaque server reference is safer when a client does not need cross-operation identity.

## Retention

The first release should use no content cache. If caching is later required:

- define the exact fields and purpose;
- set a short TTL;
- encrypt at rest;
- partition by subject and deployment;
- delete on revocation/account deletion;
- prevent cache entries from satisfying requests with broader or changed scopes;
- document backup and log retention separately.

Aggregated operational metrics must not be reversible into user activity timelines.

## Pagination and bounds

Every list operation must have:

- a server-defined maximum page size;
- stable ordering and an opaque cursor;
- a maximum report interval;
- bounded output size;
- no unbounded text search or arbitrary filter expression;
- cancellation and backend timeout handling.

Exact numeric limits remain open until Promethee provides quotas and performance evidence.

## Freshness and consistency

Observed remote rows may not equal current desktop state. The service must distinguish:

- `observedAt`: when the MCP server obtained the result;
- `sourceUpdatedAt`: publisher-provided source timestamp, when available;
- `freshness`: `current`, `delayed`, or `unknown` according to an approved rule.

The service must not represent a remote snapshot as proof that a local desktop action succeeded.

## Deletion and revocation

Revocation stops future access but may not remove data already delivered to an MCP client. Consent copy must say this clearly.

Operator-owned refresh tokens, grant records, and content caches must be deleted when the grant is revoked. Promethee account deletion remains owned by Promethee and is outside the first-release MCP contract.
