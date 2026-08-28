# SPEC-0002: Bounded task and project creation

## Status

Implemented and verified against the synthetic facade and mocked fixed-RPC adapter. Not enabled or verified against Promethee: publisher-owned RPC deployment, RLS, quotas, OAuth permission enforcement, and staging evidence remain absent.

## Outcome

An authenticated agent with explicit write scopes can create one project or one task without receiving generic database access and without producing duplicates after a safe retry.

## Functional requirements

### Authorization and consent

- FR-201: `promethee_create_project` requires `projects:write`.
- FR-202: `promethee_create_task` requires `tasks:write`.
- FR-203: Read and write scopes are separate; `tasks:read` or `projects:read` never implies a write scope.
- FR-204: Browser authentication never grants a write scope by itself.
- FR-205: Consent describes project creation and task creation separately from identity scopes and read access.

### Create project

- FR-210: Input is a closed object with `name` and `clientRequestId` only.
- FR-211: `name` is non-empty after trimming, valid UTF-8, and bounded by the active policy.
- FR-212: The authoritative source chooses the identifier, owner, timestamps, and default active state.
- FR-213: Output is one normalized Project plus common observation metadata.

Proposed input:

```json
{
  "name": "Client A",
  "clientRequestId": "req_01k4w0g6z6k2vt0m"
}
```

### Create task

- FR-220: Input is a closed object with `title`, `projectId`, and `clientRequestId` only.
- FR-221: `title` is non-empty after trimming, valid UTF-8, and bounded by the active policy.
- FR-222: `projectId` is either an approved bounded identifier or `null`.
- FR-223: A missing, archived, inaccessible, or cross-user project fails without revealing cross-user existence.
- FR-224: The authoritative source chooses the task identifier, owner, timestamps, default open state, and all unspecified fields.
- FR-225: Output is one normalized Task plus common observation metadata.

Proposed input:

```json
{
  "title": "Prepare client report",
  "projectId": "project_ref",
  "clientRequestId": "req_01k4w0j67p1a2b3c"
}
```

### Idempotency

- FR-230: `clientRequestId` matches `^[A-Za-z0-9_-]{16,64}$`.
- FR-231: The authoritative mutation boundary binds idempotency to subject, OAuth client, tool, request identifier, and canonical input.
- FR-232: An identical replay returns the original normalized resource and does not create another row.
- FR-233: Reusing an identifier with different canonical input returns `idempotency_conflict` and creates nothing.
- FR-234: The MCP never blindly retries an ambiguous timed-out write with a new identifier.

### Fixed backend boundary

- FR-240: The production adapter may invoke only publisher-approved `mcp_create_project_v1` and `mcp_create_task_v1` RPC contracts.
- FR-241: The adapter forwards no caller-supplied user ID, table, column, SQL, RPC name, or URL.
- FR-242: RPCs execute as the verified user under RLS and validate project membership independently.
- FR-243: Unexpected or additional response fields fail as `incompatible_source` until an approved versioned compatibility rule says otherwise.
- FR-244: Live write configuration stays unreachable until publisher approval and staging evidence exist.

## Tool annotations

Both tools declare:

- `readOnlyHint: false`;
- `destructiveHint: false`;
- `idempotentHint: true`;
- `openWorldHint: false`.

These annotations describe client behavior and never replace scope checks, RLS, validation, or durable idempotency.

## Error contract

| Error | Meaning | Retry |
| --- | --- | --- |
| `invalid_input` | Closed schema, length, encoding, or identifier validation failed | Correct input |
| `authentication_required` | No usable user token | Re-authorize |
| `insufficient_scope` | Required write scope is absent | Obtain explicit consent |
| `access_denied` | RLS or project membership rejected the operation | No blind retry |
| `not_found` | Target project is unavailable to the subject | No |
| `idempotency_conflict` | Request identifier was reused with different input | Use a new identifier only for a genuinely new intent |
| `rate_limited` | Deployment or publisher quota is exhausted | After the supplied delay, with the same identifier |
| `dependency_unavailable` | Approved facade is unavailable before an authoritative result | Reconcile first; do not create a new intent |
| `incompatible_source` | RPC response does not match the closed contract | No |
| `request_cancelled` | Caller cancelled while the result may be unknown | Reconcile or replay with the same identifier |

## Security and privacy requirements

- SR-201: Logs contain tool name, outcome class, bounded timing, and non-reversible correlation metadata only; no title, project name, project identifier, user identifier, token, or RPC body.
- SR-202: Rate limits apply per subject, OAuth client, tool, and deployment.
- SR-203: Task/project text is stored and returned as untrusted data, never interpreted by the server.
- SR-204: A compromised client cannot widen scope, select a different RPC, or supply ownership.
- SR-205: Revocation blocks new writes immediately under the authorization-server contract.
- SR-206: No production write occurs during repository tests or browser design review.

## Non-goals

- Updating, completing, deleting, archiving, restoring, reordering, or bulk-importing tasks/projects.
- Creating sessions or controlling timers.
- Direct PostgREST table writes or generic RPC execution.
- Inferring Promethee's private schema or defaults.
- Claiming live compatibility before publisher staging acceptance.

## Required evidence

- Closed-schema and boundary-length unit tests.
- Missing-scope tests proving zero facade calls.
- One-create, identical-replay, and conflicting-replay tests.
- Two-user project isolation and non-enumeration tests.
- Timeout/cancellation tests covering ambiguous outcomes.
- Fixed-RPC request and closed-response adapter tests with mocked HTTP only.
- Synthetic MCP protocol tests for tool schemas, annotations, structured output, and stable errors.
- Publisher staging tests for RLS, idempotency durability, quotas, revocation, and independent readback.
- Consent browser evidence showing read and write categories before approval.

## Related decisions

- [ADR-0005](../docs/adr/0005-add-bounded-create-tools-through-publisher-rpcs.md)
- [ADR-0002](../docs/adr/0002-require-independent-user-scoped-authentication.md)
- [ADR-0003](../docs/adr/0003-expose-read-only-mcp-over-streamable-http.md)
