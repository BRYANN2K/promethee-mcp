# promethee-mcp

A proposed self-hostable MCP service that exposes approved Promethee data through user-scoped access to the Promethee Supabase backend.

## Project contract

- Kind: `backend`
- Profile: `spec-driven`
- Languages: `typescript`
- Package managers: `npm`
- Source roots: `src`
- Test roots: `tests`
- Spec workflow: `generic`

`software-project.json` is the machine-readable source for this bootstrap contract. It records repository facts, not installed or executed tooling.

## Constraints

- Promethee-managed Supabase remains the proposed system of record; production access requires explicit publisher approval.
- The first release is read-only and uses only documented user-scoped authorization.
- Distributed artifacts never contain privileged database credentials or reuse sessions extracted from the Promethee desktop application.
- Ordinary development and validation use synthetic fixtures and never query or mutate Promethee production data.
- The repository remains private until ownership, branding, licensing, and disclosure boundaries are approved.

## Open decisions

- Obtain an accountable Promethee decider and approve the official integration boundary.
- Choose between Promethee Supabase OAuth server mode and a separately operated authorization broker.
- Approve the MCP scopes and the dedicated read-only views or RPC functions exposed by Promethee.
- Select the TypeScript HTTP framework and MCP SDK version after implementation review.
- Define data retention, audit logging, abuse controls, availability targets, and backup ownership.
- Approve repository ownership, product naming, branding, license, distribution, and release process.

## Validation contract

No validation commands are declared.

These commands are declarations, not evidence that validation has run.
