# Claims

## Policy

Only claims marked `publish` may appear as factual product copy. Proposed behavior must remain visibly conditional until configured and verified. The isolated preview is always labeled.

## Ledger

| ID | Exact claim | Class | Status | Source and locator | Scope/caveat | Allowed surfaces |
|---|---|---|---|---|---|---|
| C1 | The current server exposes three bounded read-only Tasks/Projects MCP tools. | fact | publish | `README.md` → What works today; `src/mcp/create-server.ts` | Repository implementation only; no live Promethee claim | Preview technical note, developer docs |
| C2 | The design preview is not connected to Promethee or Supabase. | fact | publish | `.design-flow/preview/`; `PROJECT.md` | Applies only to the isolated preview | Login, consent, states |
| C3 | The repository contains an unconfigured composition for Supabase JWT verification, MCP authorization, and three fixed RPC calls. | fact | publish | `src/runtime/supabase-runtime.ts`; `tests/supabase-runtime.test.ts` | Verified with synthetic tokens and mocked HTTP only | Technical trust detail, developer docs |
| C4 | A verified user token stays out of `AuthContext` and application use cases; only the request-scoped fixed-RPC adapter may hold it. | fact | publish | `src/runtime/supabase-runtime.ts`; `src/adapters/supabase/supabase-facade.ts` | No staging or production evidence | Technical trust detail |
| C5 | The intended authorization journey uses explicit login and consent before returning to the MCP client. | derived | publish | `docs/architecture/authentication-and-authorization.md`; Supabase OAuth flow docs | Proposed until an approved authorization server is configured | Login, consent |
| C6 | Email-and-password login is supported by the target Promethee identity provider. | unknown | reject | Repository evidence and the reviewed Android client observe only passwordless email codes | Must be confirmed and enabled by the publisher before any future design change | None |
| C7 | Promethee MCP is an official Promethee product. | unknown | reject | No publisher authorization in repository | Naming and ownership unresolved | None |
| C8 | The repository owner accepted a bounded contract for future create-task and create-project tools through fixed publisher-owned RPCs. | fact | publish | `docs/adr/0005-add-bounded-create-tools-through-publisher-rpcs.md`; `specs/0002-bounded-task-project-creation.md` | Contract only; not implemented, connected, or publisher-approved | Review fixture note, developer docs |
| C9 | A production credential form is safe on an arbitrary self-hosted authorization origin. | unknown | reject | No trusted-host or publisher deployment contract exists | Production must pin the approved identity origin in the reviewed source artifact and require a valid OAuth request | None |
| C10 | Passwordless sign-in with a six-digit email code is used by the reviewed unofficial Android client. | fact | publish | `PrometheeApi.java` at reviewed commit `d36d447`; repository auth documentation | Evidence about the unofficial client, not publisher approval or production compatibility | Review rationale, developer docs |
| C11 | Production personal mode can retain one authenticated session encrypted at rest for at most seven days and restore it after restart. | fact | publish | `src/runtime/personal-connection.ts`; `src/runtime/encrypted-personal-session-file.ts`; `tests/personal-connection.test.ts` | Single-user mode only; requires an operator-supplied 32-byte key and state volume | Personal connection, developer docs |
| C12 | Choosing no renewal removes encrypted token material while the current in-memory session remains available until restart or expiry; only the non-secret preference persists. | fact | publish | `PersonalConnectionStore.setRetention`; focused persistence tests | Does not revoke the current upstream Promethee session | Personal connection, developer docs |

## Review fixtures

| ID | Fixture | Why needed | Required label |
|---|---|---|---|
| F1 | `bryann@example.com` | Exercise email and validation layout | `Design preview` |
| F2 | `Claude Desktop` and `mcp.example.test` | Exercise client/resource identity and consent hierarchy | `Review fixture` |
| F3 | `openid`, `email`, task/project reads, and create-only Task/Project permissions | Distinguish identity, read, and write scopes without implying live support | `Review fixture` |

## Excluded claims

- The login works against Promethee today.
- The password method is enabled in Promethee Supabase Auth.
- The OAuth client, redirect, fixed RPCs, RLS, or production endpoint is approved.
- Task/project creation works against Promethee today.
- The service is official, production-ready, deployed, or connected.
