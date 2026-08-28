# Architecture decision records

Record consequential decisions with status, context, options, outcome, consequences, and supersession links.

| ADR | Status | Decision |
| --- | --- | --- |
| [ADR-0001](0001-use-promethee-supabase-as-system-of-record.md) | Proposed | Use Promethee Supabase as the proposed system of record. |
| [ADR-0002](0002-require-independent-user-scoped-authentication.md) | Proposed | Require independent user-scoped authentication. |
| [ADR-0003](0003-expose-read-only-mcp-over-streamable-http.md) | Proposed | Expose a read-only MCP over Streamable HTTP. |
| [ADR-0004](0004-separate-headless-cli-from-browser-authorization-ui.md) | Accepted | Separate the headless MCP CLI from the browser authorization UI. |
| [ADR-0005](0005-add-bounded-create-tools-through-publisher-rpcs.md) | Accepted | Add bounded task/project creation through fixed publisher-owned RPCs. |
| [ADR-0006](0006-add-a-loopback-personal-session-mode.md) | Accepted | Add an explicit loopback personal-session mode using fixed user-scoped PostgREST operations. |
| [ADR-0007](0007-persist-a-single-user-personal-session-behind-a-trusted-edge.md) | Accepted | Persist one encrypted personal session for at most seven days behind a trusted single-user edge. |
| [ADR-0008](0008-use-git-npx-stdio-onboarding-with-a-loopback-login.md) | Accepted | Use Git+npx stdio onboarding with a same-process loopback login. |
