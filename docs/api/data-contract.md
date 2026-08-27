# Draft data contract

## Status and principles

This document defines the minimal normalized data the proposed MCP may return. It is not a copy of Promethee's internal schema.

Principles:

- expose product concepts rather than table rows;
- omit fields by default;
- use user identity from authorization, never response payload;
- return explicit timestamps and units;
- distinguish absent, redacted, and unknown values;
- reject unexpected source shapes instead of passing them through.

All identifiers are strings. Whether they are raw Promethee identifiers or MCP-issued opaque references remains an open decision.

## Task

```json
{
  "id": "task_ref",
  "title": "Prepare client report",
  "status": "open",
  "projectId": "project_ref",
  "scheduledDate": null,
  "createdAt": "2026-08-27T08:00:00Z",
  "updatedAt": null
}
```

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `id` | string | yes | stable/opaque under final contract |
| `title` | string | yes | untrusted user-controlled text; bounded length |
| `status` | `open \| completed` | yes | deleted tasks excluded unless explicitly requested/approved |
| `projectId` | string or null | yes | references an approved project record |
| `scheduledDate` | `YYYY-MM-DD` or null | no | only if approved by Promethee |
| `createdAt` | RFC 3339 or null | no | source semantics must be documented |
| `updatedAt` | RFC 3339 or null | no | unavailable when source does not expose it safely |

Excluded: sync state, XP internals, recurrence internals, parent/session/completion identifiers, bonus state, source internals, and all unspecified columns.

## Project

```json
{
  "id": "project_ref",
  "name": "Client A",
  "status": "active"
}
```

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `id` | string | yes | stable/opaque under final contract |
| `name` | string | yes | untrusted user-controlled text; bounded length |
| `status` | `active \| archived` | yes | mapping requires publisher approval |

Excluded: descriptions, logos, covers, public/social state, sync state, and unspecified columns.

## Session

```json
{
  "id": "session_ref",
  "task": "Prepare client report",
  "taskId": null,
  "projectId": null,
  "startedAt": "2026-08-27T08:00:00Z",
  "endedAt": "2026-08-27T08:45:00Z",
  "workedSeconds": 2400,
  "pauseSeconds": 300
}
```

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `id` | string | yes | raw or opaque decision pending |
| `task` | string or null | yes | historical snapshot; untrusted text |
| `taskId` | string or null | no | only if publisher supplies a safe relationship |
| `projectId` | string or null | no | only if publisher supplies a safe relationship |
| `startedAt` | RFC 3339 | yes | normalized from publisher-defined units |
| `endedAt` | RFC 3339 or null | yes | null semantics must be publisher-defined |
| `workedSeconds` | non-negative integer or null | yes | exact formula must be publisher-owned |
| `pauseSeconds` | non-negative integer or null | no | return only when approved and meaningful |

The MCP must not derive worked time from undocumented internal fields. Promethee should expose the normalized value through the integration facade.

Excluded: user ID, XP, app context, end reason, parked/resume internals, sync state, notes, fragments, screenshots, signals, AI outputs, and unspecified columns.

## Time report

```json
{
  "from": "2026-08-24T00:00:00+02:00",
  "to": "2026-08-31T00:00:00+02:00",
  "timeZone": "Europe/Brussels",
  "groupBy": "project",
  "totalWorkedSeconds": 7200,
  "groups": [
    {
      "key": "project_ref",
      "label": "Client A",
      "workedSeconds": 7200,
      "sessionCount": 3
    }
  ]
}
```

Reports should be calculated by a publisher-approved RPC so date boundaries, pauses, deleted records, and duration semantics remain consistent with Promethee.

## Current status

Blocked draft shape:

```json
{
  "state": "running",
  "task": "Prepare client report",
  "startedAt": "2026-08-27T08:00:00Z",
  "workedSeconds": 1200,
  "sourceUpdatedAt": "2026-08-27T08:20:00Z"
}
```

Do not implement this model until Promethee defines:

- authoritative source;
- allowed states;
- staleness threshold;
- pause/worked-time formula;
- behavior across multiple devices;
- whether task text is safe to expose.

## Text safety

All titles and labels are user-controlled data. MCP descriptions and responses must not treat their content as instructions. Implementations should preserve text as data fields, enforce length/encoding bounds, and avoid rendering active HTML or automatically fetching embedded URLs.

## Time and locale

- Transport timestamps use RFC 3339 with an explicit offset or `Z`.
- Durations use integer seconds.
- Date grouping requires an explicit IANA timezone.
- The server must define daylight-saving boundary behavior in tests.
- Human-readable localization belongs to the client; protocol enum values remain stable English identifiers.

## Pagination

- Cursors are opaque and bound to the subject, scope, filter, and ordering.
- Clients must not construct or modify cursors.
- Cursor expiry and replay behavior require an implementation decision.
- A cursor must not reveal internal row identifiers or query structure.

## Source compatibility

The adapter should validate a publisher-supplied contract version and the exact response schema. Unknown fields may be ignored only if the contract permits additive compatibility; missing or invalid required fields fail closed.
