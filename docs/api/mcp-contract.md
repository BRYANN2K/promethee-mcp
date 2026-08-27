# Draft MCP contract

## Status

**Proposed and unimplemented.** Names, schemas, scopes, pagination limits, and compatibility rules require Promethee approval.

## Transport and authorization

- Proposed endpoint: `https://<deployment-domain>/mcp`.
- Transport: MCP Streamable HTTP.
- Authentication: OAuth bearer access token issued for the exact MCP resource.
- Content type, session handling, protocol version, and Origin behavior follow the selected MCP specification and SDK version.
- The first release should prefer stateless requests unless an accepted capability requires server-side sessions.

The implementation must also expose OAuth Protected Resource Metadata through the standard discovery path and challenge unauthenticated requests appropriately.

## Common response metadata

Every successful data result should include:

| Field | Type | Meaning |
| --- | --- | --- |
| `observedAt` | RFC 3339 timestamp | Time the MCP server obtained the result |
| `freshness` | `current \| delayed \| unknown` | Source freshness classification under an approved rule |
| `sourceVersion` | string or null | Promethee facade contract version, when provided |

List responses additionally include an opaque `nextCursor` or `null`.

## Proposed tools

### `promethee_list_tasks`

Returns the user's approved task fields with optional project and completion filters.

- Scope: `tasks:read`
- Backend: dedicated read-only task/project view or RPC
- Stability: draft

Input:

| Field | Type | Required | Constraint |
| --- | --- | --- | --- |
| `projectId` | string | no | approved identifier format |
| `status` | `open \| completed \| all` | no | defaults to `open` in the future contract |
| `cursor` | string | no | opaque server-issued cursor |
| `limit` | integer | no | server-capped; exact maximum unresolved |

Output: a list of [Task](data-contract.md#task) records plus common metadata.

Failure behavior:

- missing scope: authorization failure;
- unknown project: empty result or stable not-found error, pending Promethee decision;
- invalid cursor/input: tool execution error without a backend call;
- schema mismatch: dependency compatibility error, fail closed.

### `promethee_get_task`

Returns one approved task record owned by the authenticated user.

- Scope: `tasks:read`
- Backend: dedicated task lookup RPC
- Input: `{ "taskId": "<opaque-id>" }`
- Cross-user and deleted-record behavior: must not reveal whether another user's identifier exists.

### `promethee_list_projects`

Returns the user's approved project fields.

- Scope: `tasks:read`
- Backend: dedicated project view or RPC
- Input: cursor and bounded limit only
- Output: [Project](data-contract.md#project) records

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

## Proposed resources

Resources may provide canonical read-only snapshots when client support makes them useful:

- `promethee://tasks/open`
- `promethee://projects`
- `promethee://reports/today`

Resource URIs are draft identifiers, not deployed URLs. Resources must enforce the same scopes and bounds as tools.

## Explicitly excluded operations

- arbitrary SQL, table, column, RPC, Storage, Realtime, or Edge Function access;
- task creation, update, completion, deletion, or reordering;
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

Errors must not expose SQL, policy text, internal URLs, tokens, stack traces, or cross-user existence.

## Compatibility

Before release, define:

- supported MCP protocol date/version;
- server implementation version;
- Promethee facade contract version;
- deprecation and migration policy;
- maximum page/report bounds;
- stable error identifiers.

No compatibility guarantee exists yet.
