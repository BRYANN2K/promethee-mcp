# Promethee MCP

Promethee MCP is a proposed self-hostable Model Context Protocol service for querying a user's approved Promethee tasks, projects, sessions, and time reports from AI clients.

The project is currently an **architecture and integration proposal**. It contains no executable server, no production credentials, and no authorization from Promethee to access or redistribute its private interfaces.

## Product idea

Promethee already synchronizes selected product data through a Supabase backend. Instead of reading the desktop SQLite database, this service would authenticate each user independently and expose a small, read-only MCP contract backed by publisher-approved Supabase views or RPC functions.

The intended user journey is:

1. Add the remote MCP endpoint to a compatible AI client.
2. Complete login and consent in an external browser page.
3. Authenticate with the user's own Promethee account.
4. Query only the scopes the user approved.
5. Revoke the MCP grant without changing the Promethee desktop session.

Example questions the proposed service should support:

- “What tasks are still open in my current project?”
- “How much time did I spend on Client A this week?”
- “Prepare a daily time report grouped by project.”
- “Which task was active in my latest completed session?”

## Proposed boundaries

- Promethee-managed Supabase remains the system of record.
- Authentication is independent; the service never extracts the desktop application's tokens or session files.
- Every data request is evaluated as the authenticated user and remains subject to Row Level Security.
- The first release is read-only.
- The server exposes a narrow MCP model, not arbitrary PostgREST, SQL, RPC, Storage, or Edge Function access.
- Ordinary development uses synthetic fixtures and never calls Promethee production.
- No service-role or other RLS-bypassing credential is accepted in a distributed deployment.

## Repository status

| Area | Status |
| --- | --- |
| Product scope | Proposed |
| Promethee publisher approval | Required |
| Authentication design | Proposed; mechanism not selected |
| MCP tools and resources | Draft contract |
| Supabase views/RPCs | Requested; not implemented |
| TypeScript service | Not implemented |
| Self-hosting image | Not implemented |
| Production validation | Not authorized or performed |

Nothing in this repository is an availability, compatibility, or security claim about Promethee.

## Documentation

- [Documentation map](docs/README.md)
- [System overview](docs/architecture/system-overview.md)
- [Authentication and authorization](docs/architecture/authentication-and-authorization.md)
- [Data flow and trust boundaries](docs/architecture/data-flow-and-trust-boundaries.md)
- [Threat model](docs/architecture/threat-model.md)
- [Draft MCP contract](docs/api/mcp-contract.md)
- [Draft data contract](docs/api/data-contract.md)
- [Implementation plan](docs/development/implementation-plan.md)
- [Self-hosting blueprint](docs/operations/self-hosting.md)
- [Promethee integration request](docs/handover/promethee-integration-request.md)
- [Architecture decisions](docs/adr/README.md)
- [Product specification](specs/0001-read-only-mcp.md)

## Evidence and limitations

The initial proposal is grounded in a read-only static analysis of Promethee 1.3.26 dated 2026-08-24. That analysis observed a Supabase-based backend, user authentication, and remote `tasks`, `task_projects`, and `sessions` usage. It also states that the server schema, RLS policies, quotas, and Edge Function implementations were not available in the application package and were not remotely validated.

The analysis document is intentionally not copied into this repository. Before implementation, Promethee must provide or approve a canonical integration contract, a non-production environment, and synthetic fixtures.

Authoritative external references:

- [Model Context Protocol authorization](https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization)
- [Model Context Protocol transports](https://modelcontextprotocol.io/specification/2025-11-25/basic/transports)
- [Supabase Auth](https://supabase.com/docs/guides/auth)
- [Supabase OAuth 2.1 server](https://supabase.com/docs/guides/auth/oauth-server)
- [Supabase API security](https://supabase.com/docs/guides/api/securing-your-api)

## Implementation prerequisite

Do not begin production integration until the questions in [Promethee integration request](docs/handover/promethee-integration-request.md) have accountable answers. In particular, the project needs publisher approval for naming, authentication, scopes, approved endpoints, rate limits, retention, support, and disclosure.

## License

No license has been selected. The repository remains private while ownership, branding, and distribution are unresolved.
