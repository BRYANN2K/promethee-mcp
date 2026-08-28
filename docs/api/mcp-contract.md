# Draft MCP contract

## Status

**Implemented against synthetic data and mocked Promethee boundaries.** The local stdio composition exposes one connection-status tool plus five account tools. The HTTP compositions expose the five account tools. Production limits, OAuth permission behavior, RPC deployment, RLS, and Promethee compatibility still require publisher approval and staging evidence.

## Transport and authorization

### Local Git+npx composition

- Transport: MCP stdio launched as `npx -y --package=<reviewed-git-ref> prometheeemcp --stdio`.
- Browser bridge: an exact-origin login surface on `http://127.0.0.1:<bounded-port>/login` owned by the same process.
- Before browser pairing, only `promethee_connection_status` succeeds; the five account tools return `authentication_required` without an upstream data call.
- After pairing, each account tool resolves the current user-scoped application at call time, so the MCP process does not restart.
- The email code and session tokens are never MCP inputs or results.

### Remote HTTP composition

- Proposed endpoint: `https://<deployment-domain>/mcp`.
- Transport: MCP Streamable HTTP.
- Authentication: OAuth bearer access token issued for the exact MCP resource.
- Content type, session handling, protocol version, and Origin behavior follow the selected MCP specification and SDK version.
- The first release should prefer stateless requests unless an accepted capability requires server-side sessions.

The implementation exposes OAuth Protected Resource Metadata and challenges unauthenticated requests. Synthetic mode uses a local test issuer. Configured Supabase mode advertises the pinned Promethee issuer and exact public resource, but `doctor` deliberately performs no live verification.

## Local onboarding tool

### `promethee_connection_status`

Reports whether the local stdio process has a usable browser-paired Promethee session.

- Input: closed empty object.
- Disconnected output: `{ "connected": false, "loginUrl": "http://127.0.0.1:<port>/login" }`.
- Connected output: `{ "connected": true }`.
- The URL is loopback-only and contains no token, code, identity, or user content.
- The tool is local-onboarding metadata, not an account read and not part of remote HTTP mode.
- Server instructions require the LLM to give the URL to the user and never request an email code or token in the conversation.

## Synthetic slice policy

Until Promethee approves production bounds, the executable synthetic slice uses deliberately small deterministic limits: default page size `2`, maximum page size `3`, cursor input at most `512` bytes, cursor lifetime `60` seconds, text fields at most `128` UTF-8 bytes, adapter deadline `25` milliseconds in contract tests, and a maximum structured result size of `16 KiB`. These are test-policy values, not Promethee production promises.

Lists use the facade's stable total order. The synthetic facade orders by `id` ascending. A production facade must own an approved total order and tie-breaker; the MCP layer must not repair an unstable backend order.

## Common response metadata

Every successful data result should include:

| Field | Type | Meaning |
| --- | --- | --- |
| `observedAt` | RFC 3339 timestamp | Time the MCP server obtained the result |
| `freshness` | `current \| delayed \| unknown` | Source freshness classification under an approved rule |
| `sourceVersion` | string or null | Promethee facade contract version, when provided |

List responses additionally include an opaque `nextCursor` or `null`.

## Implemented tools

### `promethee_list_tasks`

Returns the user's approved task fields with optional project and completion filters.

- Scope: `tasks:read`
- Backend: dedicated read-only task/project view or RPC
- Stability: implemented contract; live facade unverified

Input:

| Field | Type | Required | Constraint |
| --- | --- | --- | --- |
| `projectId` | string | no | approved identifier format |
| `status` | `open \| completed \| all` | no | defaults to `open` in the future contract |
| `cursor` | string | no | opaque server-issued cursor |
| `limit` | integer | no | server-capped; exact maximum unresolved |

Output: `{ "tasks": Task[], "observedAt": string, "freshness": "unknown", "sourceVersion": null, "nextCursor": string | null }` for the synthetic slice.

Failure behavior:

- missing scope: authorization failure;
- unknown or cross-user project: empty result, without disclosing whether the project exists;
- invalid cursor/input: tool execution error without a backend call;
- schema mismatch: dependency compatibility error, fail closed.

### `promethee_get_task`

Returns one approved task record owned by the authenticated user.

- Scope: `tasks:read`
- Backend: dedicated task lookup RPC
- Input: `{ "taskId": "<opaque-id>" }`
- Output: `{ "task": Task, "observedAt": string, "freshness": "unknown", "sourceVersion": null }` for the synthetic slice.
- Missing, deleted, and cross-user identifiers return the same public `not_found` error.

### `promethee_list_projects`

Returns the user's approved project fields.

- Scope: `tasks:read`
- Backend: dedicated project view or RPC
- Input: cursor and bounded limit only.
- Output: `{ "projects": Project[], "observedAt": string, "freshness": "unknown", "sourceVersion": null, "nextCursor": string | null }` for the synthetic slice.

Synthetic cursors are authenticated opaque values bound to the subject, OAuth client, issuer, resource, tool, required scope, filter set, page size, ordering version, and expiry. Identical replay is allowed before expiry. Tampered, expired, cross-principal, cross-tool, or filter-mismatched cursors all return `invalid_cursor` without an adapter call.

## Deferred tools

### `promethee_list_sessions`

Returns bounded historical session records.

- Scope: `sessions:read`
- Backend: dedicated session view or RPC

Input:

| Field | Type | Required | Constraint |
| --- | --- | --- | --- |
| `from` | RFC 3339 timestamp | yes | inclusive lower bound |
| `to` | RFC 3339 timestamp | yes | exclusive upper bound; after `from` |
| `projectId` | string | no | only if publisher facade supports it |
| `cursor` | string | no | opaque |
| `limit` | integer | no | server-capped |

Output: [Session](data-contract.md#session) records plus common metadata.

### `promethee_get_time_report`

Returns server-computed aggregates over an approved bounded interval.

- Scope: `reports:read`
- Backend: dedicated aggregation RPC
- No raw SQL, arbitrary grouping expression, or client-supplied timezone database rule

Input:

| Field | Type | Required | Constraint |
| --- | --- | --- | --- |
| `from` | RFC 3339 timestamp | yes | inclusive |
| `to` | RFC 3339 timestamp | yes | exclusive and server-bounded |
| `groupBy` | `day \| task \| project` | yes | closed enum |
| `timeZone` | IANA timezone | yes | validated allowlisted format |

Output: [Time report](data-contract.md#time-report).

### `promethee_get_current_status`

Optional tool for a publisher-defined current-session observation.

- Scope: `status:read`
- Status: blocked until Promethee defines the authoritative remote source and freshness semantics
- Must never claim that a desktop action succeeded
- Must not be implemented by guessing from the latest historical session

### `promethee_create_project`

Implemented in the MCP, application, synthetic facade, and fixed-RPC adapter; not live-verified.

- Scope: `projects:write`
- Backend: fixed publisher-owned `mcp_create_project_v1` RPC only
- Input: closed `{ "name": string, "clientRequestId": string }`
- Output: one normalized Project plus common observation metadata
- Retry: identical replays use the same `clientRequestId`; conflicting reuse fails as `idempotency_conflict`
- Tool hints: not read-only, non-destructive, idempotent, closed-world

### `promethee_create_task`

Implemented in the MCP, application, synthetic facade, and fixed-RPC adapter; not live-verified.

- Scope: `tasks:write`
- Backend: fixed publisher-owned `mcp_create_task_v1` RPC only
- Input: closed `{ "title": string, "projectId": string | null, "clientRequestId": string }`
- Output: one normalized Task plus common observation metadata
- Project access: unavailable and cross-user projects share one public failure behavior
- Retry: identical replays use the same `clientRequestId`; conflicting reuse fails as `idempotency_conflict`
- Tool hints: not read-only, non-destructive, idempotent, closed-world

The exact creation requirements and evidence are defined in [SPEC-0002](../../specs/0002-bounded-task-project-creation.md). Production writes fail closed until Promethee deploys and approves the RPC, RLS, idempotency, quota, audit, and consent enforcement contracts.

## Proposed resources

Resources may provide canonical read-only snapshots when client support makes them useful:

- `promethee://tasks/open`
- `promethee://projects`
- `promethee://reports/today`

Resource URIs are draft identifiers, not deployed URLs. Resources must enforce the same scopes and bounds as tools.

## Explicitly excluded operations

- arbitrary SQL, table, column, RPC, Storage, Realtime, or Edge Function access;
- task/project update, completion, archive, deletion, reordering, bulk import, or any creation path outside the two fixed accepted tools;
- session start, pause, resume, stop, rename, or deletion;
- account/profile, chat, feed, notes, screenshot, window activity, or social access;
- URL fetching and generic backend debugging;
- credentials, token, schema, policy, or user enumeration.

## Error model

The implementation should define stable public error identifiers. Proposed categories:

| Identifier | Meaning | Retry |
| --- | --- | --- |
| `invalid_input` | Tool arguments fail the closed schema | No; correct input |
| `authentication_required` | No usable token | Re-authorize |
| `insufficient_scope` | Grant lacks the tool scope | Step-up authorization if supported |
| `access_denied` | Backend/RLS denied the request | No blind retry |
| `rate_limited` | Deployment or upstream quota reached | Only after supplied delay |
| `dependency_unavailable` | Approved Promethee facade unavailable | Bounded retry by client policy |
| `incompatible_source` | Backend response/version is unsupported | No retry until compatibility restored |
| `response_too_large` | Bounded result cannot be returned safely | Narrow request |
| `not_found` | The requested task is unavailable to this subject | No |
| `invalid_cursor` | Cursor is invalid, expired, or does not match this request | Start a new listing |
| `idempotency_conflict` | A create request identifier was reused with different canonical input | Use a new identifier only for a genuinely new intent |
| `request_cancelled` | The caller cancelled bounded work | Retry only by caller choice |
| `internal_error` | An unexpected internal failure occurred | Bounded retry by client policy |

Errors must not expose SQL, policy text, internal URLs, tokens, stack traces, or cross-user existence.

## Compatibility

Before release, define:

- supported MCP protocol date/version;
- server implementation version;
- Promethee facade contract version;
- deprecation and migration policy;
- maximum page/report bounds;
- stable error identifiers.

For the synthetic slice, source responses use a closed schema: missing, invalid, and additional fields fail as `incompatible_source`. Additive compatibility may be introduced only by a versioned production facade contract. No production compatibility guarantee exists yet.
