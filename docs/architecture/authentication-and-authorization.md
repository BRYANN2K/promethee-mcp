# Authentication and authorization

## Outcome

An MCP client should receive a token for the MCP resource only after the user authenticates independently and approves narrowly defined scopes. The service must never reuse credentials extracted from the Promethee desktop application.

## Evidence

**Observed:** Promethee 1.3.26 uses Supabase Auth with passwordless email authentication. Its desktop access and refresh tokens are stored through Electron `safeStorage`; the analysis explicitly requires external projects to perform their own authentication rather than read or decrypt that session.

**Sourced:** the MCP authorization specification requires protected resource discovery and an OAuth 2.1-compatible authorization server for protected remote MCP resources. It also requires resource indicators so a token is issued for the intended MCP server.

**Sourced:** Supabase documents an OAuth 2.1/OIDC server mode with authorization code and PKCE, discovery, consent UI integration, and MCP-oriented client registration support.

**Unknown:** whether Promethee's current Supabase Auth deployment enables the required OAuth server features and whether Promethee will authorize this project as a resource/client.

## Browser flow

### Local stdio onboarding

1. The MCP client launches `prometheemcp --stdio` through the reviewed GitHub Release tarball.
2. The process starts JSON-RPC on stdio and a bounded HTTP login surface on `127.0.0.1`.
3. The client calls `promethee_connection_status`; the MCP returns only the local login URL.
4. The user chooses `7 days` or `Never`, enters their email, and verifies the six-digit code in that browser page.
5. The page sends the verified session only to the same loopback origin.
6. The running server verifies the session with Promethee Auth and swaps in a caller-bound adapter for subsequent tool calls.
7. A later status call reports only `connected: true`; no process restart or token copy is required.

The LLM never receives the email address, code, access token, refresh token, or browser publishable key from this flow. Account tools remain visible while disconnected so clients have a stable tool catalog, but they fail before any upstream data operation.

### Remote OAuth flow

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

Steps 5–8 are implemented in `web/`: the login route sends and verifies Promethee's email OTP through the pinned Supabase origin, and the consent route loads the provider authorization details before approving or denying. The complete flow still needs a registered OAuth client, deployed consent URL, exact MCP resource, and staging code-exchange evidence.

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

## MCP permission contracts

The executable contract maps all current task/project reads to `tasks:read` and uses distinct scopes for both create capabilities:

| Scope | User-facing meaning | Backend surface |
| --- | --- | --- |
| `tasks:read` | Read the user's approved task fields | dedicated task view or RPC |
| `projects:read` | Read the user's approved project fields | dedicated project view or RPC |
| `tasks:write` | Create one task with bounded input | fixed create-task RPC with RLS and durable idempotency |
| `projects:write` | Create one project with bounded input | fixed create-project RPC with RLS and durable idempotency |
| `sessions:read` | Read the user's approved historical session fields | dedicated session view or RPC |
| `reports:read` | Read aggregated time totals derived from approved sessions | aggregation RPC |
| `status:read` | Read an explicitly defined current-status observation | dedicated status RPC; optional |

These names are the MCP permission contract, not a claim about the current Promethee Supabase OAuth deployment. The verifier intersects the scopes actually present in a resource-bound access token with a server-owned allowlist for the OAuth client. It never upgrades an identity-only token from client policy alone. If the deployed Supabase OAuth server cannot issue these custom resource scopes, every data tool fails as `insufficient_scope`; Promethee must then approve an access-token hook or a separate authorization broker. Production writes remain blocked until the displayed read/write contract is enforceable end to end.

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

Supabase documents that an MCP server may call its APIs on behalf of the user with the Supabase OAuth access token, allowing RLS to evaluate both `auth.uid()` and the OAuth `client_id`. The raw token is therefore permitted only in the HTTP authentication boundary and a request-scoped Supabase adapter closure. It is absent from `AuthContext`, tool inputs, application use-case arguments, cursors, results, and logs.

A production adapter may use this token only through a publisher-approved mechanism that:

- preserves the authenticated subject without trusting a caller-provided user ID;
- requires an MCP-specific audience set by an approved Supabase access-token hook;
- maps approved OAuth client IDs to server-owned MCP permissions without treating OIDC scopes as database authorization;
- may include a public/publishable Supabase gateway key where the gateway requires one.

The service must not accept, store, or use:

- a Supabase `service_role` or secret key in a distributed image;
- tokens copied from Promethee desktop storage;
- cookies or private IPC output;
- a caller-supplied user identifier as authorization;
- tokens received through MCP prompts or tool arguments.

The request-scoped adapter seam, verifier, CLI configuration reader, OTP page, and consent page are implemented. No production token hook, OAuth client, RPC/RLS deployment, or staging connection has been approved or enabled.

## Personal session storage

The local stdio composition and fully configured single-user production mode implement ADR-0007 retention semantics. The local composition defaults a new install to seven-day retention, generates a per-user encryption key in the platform configuration directory, and restores an existing `Never` preference without token persistence. The key and ciphertext are protected by the operating-system user boundary; this is not a claim of protection after compromise of that account.

The explicit development `serve --mode personal` composition remains memory-only unless persistence is deliberately injected. Persistent modes enforce:

- access and refresh tokens are held in one AES-256-GCM authenticated envelope under an operator-provided 32-byte key;
- the envelope is bounded, atomically replaced, permissioned `0600`, and rejected when malformed, non-canonical, expired, or not a regular file;
- the seven-day deadline is fixed when persistence is enabled and is not silently extended by token refresh;
- a successful upstream refresh atomically replaces both stored tokens;
- each refresh is bound to the session generation that started it, so disconnect or re-pair invalidates an older in-flight result;
- an irrecoverable refresh failure, expired retention, explicit disconnect, or `Never` choice removes all stored token material;
- `Never` persists only the non-secret preference so a later login cannot silently re-enable storage;
- the unified connection page loads the retention choice before enabling email entry and saves it before pairing the verified session;
- retention responses never contain tokens, encryption keys, subjects, session identifiers, or file paths.

The production MCP bearer and trusted-edge secret are separate deployment credentials; neither is a Promethee token. Multi-user grant storage, centralized revocation, and publisher OAuth remain outside this personal composition.

## Self-hosting concern

Arbitrary self-hosted domains complicate OAuth redirect registration. Before claiming one-command self-hosting, select one supported model:

- centrally hosted authorization with self-hosted MCP resource servers;
- pre-registration of each deployment;
- standards-compliant dynamic client registration or client metadata documents;
- a publisher-approved loopback/device-style flow.

The repository implements the UI/runtime sides of a pre-registered Supabase OAuth client; it does not create or register that client automatically.

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
