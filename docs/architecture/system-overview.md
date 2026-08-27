# System overview

## Purpose

Promethee MCP would let an authenticated user query a constrained view of their Promethee work data from a compatible AI client without installing or controlling the Promethee desktop application.

This page explains the proposed component boundaries. It does not prove that Promethee currently permits the integration.

## System context

The proposed request path has five roles:

1. **Resource owner**: the Promethee user who approves access.
2. **MCP client**: an AI application acting on the user's behalf.
3. **Authorization service**: the browser-facing login and consent flow.
4. **Promethee MCP server**: the protected resource server hosted by the operator.
5. **Promethee Supabase backend**: the proposed system of record and policy enforcement point.

The normal flow is:

1. The MCP client discovers the protected resource metadata exposed by the MCP server.
2. The user is redirected to a browser-based authorization flow.
3. The authorization service authenticates the user without reading the desktop app's session.
4. The user approves explicit MCP scopes.
5. The client receives an access token restricted to the MCP resource.
6. The MCP server validates the token, maps the tool to an allowlisted backend operation, and calls a publisher-approved read-only view or RPC.
7. Supabase evaluates the request using the authenticated user's identity and RLS policies.
8. The MCP server validates and minimizes the response before returning it to the client.

## Observed Promethee foundation

The 2026-08-24 read-only analysis of Promethee 1.3.26 observed:

- a Supabase backend at `https://auth.promethee.io`;
- Supabase Auth, PostgREST, PostgreSQL RPC, Storage, Realtime, and Edge Function usage;
- a passwordless email login flow;
- remote operations involving `tasks`, `task_projects`, and `sessions`;
- a local SQLite cache with synchronization metadata.

The same analysis did **not** establish the server schema, active grants, RLS policies, quotas, Edge Function implementation, or permission for an external distributed integration.

## Proposed components

### MCP resource server

Responsibilities:

- implement MCP Streamable HTTP;
- expose protected resource metadata;
- validate issuer, audience/resource, expiry, scopes, and token signature;
- map each MCP operation to one allowlisted backend call;
- enforce bounded inputs, pagination, timeouts, and output schemas;
- redact tokens and user content from operational logs;
- emit security and availability metrics without recording tool results.

Non-responsibilities:

- no arbitrary SQL or PostgREST proxy;
- no Promethee desktop discovery or IPC;
- no local SQLite access;
- no user impersonation through a service-role credential;
- no mutation of Promethee data in the first release.

### Browser login and consent UI

Responsibilities:

- display the exact requesting MCP client and redirect destination;
- authenticate the user through the approved Promethee identity path;
- show requested scopes in plain language;
- approve or deny the authorization request;
- provide grant and device revocation.

The UI is external to the Promethee desktop app, but it must not imply publisher endorsement until branding and ownership are approved.

### Promethee integration facade

The preferred backend surface is a small set of publisher-owned read-only views or RPC functions. This facade should:

- derive user identity from the JWT, never from a client-supplied `user_id`;
- return only fields required by the MCP contract;
- enforce deterministic limits and ordering;
- hide internal schema and synchronization details;
- preserve the option to change tables without breaking the MCP contract.

Direct table queries are a fallback for a controlled prototype only and require explicit approval plus an RLS review.

## Deployment topology

The proposed self-hosted deployment contains:

- one HTTPS reverse proxy;
- one stateless TypeScript MCP service;
- one authorization/consent web surface or an approved external authorization service;
- an optional local operational database for grants, audit events, and rate-limit state;
- outbound HTTPS access to the approved Promethee Supabase endpoints.

Promethee data should not be replicated into the operator's database for the first release. Short-lived in-memory caching may be considered later only with an explicit retention decision.

## Availability and consistency

- The MCP service is unavailable when Promethee Auth or the approved data facade is unavailable.
- A valid token does not guarantee a permitted query; RLS or scope checks may return denial.
- Remote data may lag behind local desktop state because synchronization semantics are unknown.
- Session observations are informational unless Promethee defines an authoritative current-session contract.
- Tool responses must include `observedAt` and, where available, source freshness metadata.

## Non-goals

- Controlling Pause, Resume, Start, Stop, or task completion.
- Reading desktop session files, cookies, tokens, or private IPC.
- Mirroring all Promethee tables or RPC functions.
- Exposing feed, chat, notes, screenshots, profiles, contacts, or unrelated personal data.
- Circumventing RLS, rate limits, or publisher policy.

## Related documents

- [Authentication and authorization](authentication-and-authorization.md)
- [Data flow and trust boundaries](data-flow-and-trust-boundaries.md)
- [Draft MCP contract](../api/mcp-contract.md)
- [Promethee integration request](../handover/promethee-integration-request.md)
