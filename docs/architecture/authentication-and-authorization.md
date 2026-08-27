# Authentication and authorization

## Outcome

An MCP client should receive a token for the MCP resource only after the user authenticates independently and approves narrowly defined scopes. The service must never reuse credentials extracted from the Promethee desktop application.

## Evidence

**Observed:** Promethee 1.3.26 uses Supabase Auth with passwordless email authentication. Its desktop access and refresh tokens are stored through Electron `safeStorage`; the analysis explicitly requires external projects to perform their own authentication rather than read or decrypt that session.

**Sourced:** the MCP authorization specification requires protected resource discovery and an OAuth 2.1-compatible authorization server for protected remote MCP resources. It also requires resource indicators so a token is issued for the intended MCP server.

**Sourced:** Supabase documents an OAuth 2.1/OIDC server mode with authorization code and PKCE, discovery, consent UI integration, and MCP-oriented client registration support.

**Unknown:** whether Promethee's current Supabase Auth deployment enables the required OAuth server features and whether Promethee will authorize this project as a resource/client.

## Proposed browser flow

1. The MCP client calls the MCP endpoint without a token.
2. The server returns `401` with a `WWW-Authenticate` challenge pointing to protected resource metadata.
3. The client discovers the approved authorization issuer.
4. The client creates an authorization request with PKCE and the MCP resource indicator.
5. The user opens the external login/consent page.
6. The user authenticates with their own Promethee identity.
7. The page displays the client, redirect URI, requested scopes, and data categories.
8. The user approves or denies the grant.
9. The client exchanges the authorization code for access and refresh tokens.
10. The MCP server validates every access token before processing a request.

No token is entered into an AI conversation or copied from the Promethee application.

## Authorization-server options

### Option A: Promethee Supabase OAuth server

Promethee enables and owns the OAuth server configuration. The external page handles login and consent while Promethee Auth issues tokens.

Benefits:

- one user identity and revocation authority;
- standard OAuth discovery and PKCE;
- tokens can carry the user and MCP client identity;
- compatible with RLS and custom token claims.

Requirements:

- Promethee approval and configuration ownership;
- verified support in the deployed Auth version;
- approved client registration policy;
- approved redirect origins and consent copy;
- resource/audience validation agreed with the MCP service.

### Option B: separately operated authorization broker

The MCP operator authenticates the user against an approved Promethee login flow, then issues its own MCP-scoped token.

Costs and risks:

- the operator may need to hold a Promethee refresh token;
- revocation and session expiry can diverge;
- two issuers and two security domains must be operated;
- account linking becomes a new sensitive contract;
- token exchange must not widen privileges.

This option remains a fallback, not the preferred design.

## Proposed scopes

| Scope | User-facing meaning | Backend surface |
| --- | --- | --- |
| `tasks:read` | Read the user's approved task and project fields | dedicated task/project view or RPC |
| `sessions:read` | Read the user's approved historical session fields | dedicated session view or RPC |
| `reports:read` | Read aggregated time totals derived from approved sessions | aggregation RPC |
| `status:read` | Read an explicitly defined current-status observation | dedicated status RPC; optional |

Scopes are proposals. Promethee must approve the names, claims, field projections, and escalation behavior.

## Token validation

The MCP resource server must validate at least:

- signature against the issuer's current JWKS;
- trusted issuer;
- audience and MCP resource indicator;
- expiration and not-before claims;
- granted scopes for the requested tool;
- authorized MCP client identity when available;
- revocation/session policy defined by the issuer.

The server must reject tokens minted for the generic Supabase API when they are not explicitly valid for the MCP resource. It must never accept a publishable key as user authentication.

## Backend credential boundary

The service may use only:

- a publisher-approved public/publishable Supabase key where the gateway requires one; and
- the authenticated user's scoped access token.

The service must not accept, store, or use:

- a Supabase `service_role` or secret key in a distributed image;
- tokens copied from Promethee desktop storage;
- cookies or private IPC output;
- a caller-supplied user identifier as authorization;
- tokens received through MCP prompts or tool arguments.

## Session storage

Preferred behavior:

- keep access tokens in memory only;
- encrypt refresh tokens at rest when refresh is required;
- bind stored grants to an issuer, subject, MCP client, resource, and scope set;
- rotate refresh tokens according to issuer behavior;
- delete the grant on logout, revocation, account deletion, or irrecoverable refresh failure;
- never log authorization codes, tokens, email OTPs, or authorization headers.

The exact storage mechanism is an open implementation decision.

## Self-hosting concern

Arbitrary self-hosted domains complicate OAuth redirect registration. Before claiming one-command self-hosting, select one supported model:

- centrally hosted authorization with self-hosted MCP resource servers;
- pre-registration of each deployment;
- standards-compliant dynamic client registration or client metadata documents;
- a publisher-approved loopback/device-style flow.

The repository currently promises none of these.

## Failure behavior

| Condition | Required behavior |
| --- | --- |
| Missing token | Return an OAuth challenge; do not call Promethee |
| Invalid issuer/resource/signature | Reject without fallback |
| Missing scope | Return a scope challenge or access denial |
| Expired access token | Require refresh/re-authorization; do not retry backend calls blindly |
| Supabase `401`/`403` | Return an authorization failure without exposing backend detail |
| RLS denial | Treat as final for the request |
| Unknown client or redirect | Deny authorization |
| Authentication unavailable | Fail closed; do not use cached identity to widen access |

## References

- [MCP authorization specification](https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization)
- [Supabase Auth](https://supabase.com/docs/guides/auth)
- [Supabase OAuth server](https://supabase.com/docs/guides/auth/oauth-server)
- [Supabase API security](https://supabase.com/docs/guides/api/securing-your-api)
