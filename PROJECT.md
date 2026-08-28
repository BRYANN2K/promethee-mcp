# promethee-mcp

A self-hostable TypeScript MCP server with bounded task/project reads, create-only mutations, a headless CLI, and an external Promethee sign-in/consent surface.

## Project contract

- Kind: `backend`
- Profile: `spec-driven`
- Runtime: Node.js `>=22.14.0 <23`
- Languages: `typescript`
- Package manager: npm `10.9.2`
- MCP SDK: `@modelcontextprotocol/server` and `@modelcontextprotocol/node` `2.0.0`
- Source roots: `src`
- Test roots: `tests`
- Spec workflow: `generic`

`software-project.json` is the machine-readable source for this contract. Exact dependency versions and executable scripts remain authoritative in `package.json` and `package-lock.json`.

## Implemented scope

The zero-argument executable is now a local onboarding entry point: it presents client setup on a human TTY and serves the personal MCP over stdio when launched by an MCP client. The explicit `serve` command remains synthetic and deny-all by default. The repository implements:

- Streamable HTTP MCP transport;
- three read tools plus `promethee_create_project` and `promethee_create_task`;
- closed Zod schemas and distinct read/project-write/task-write checks;
- token-free application and adapter interfaces;
- synthetic A/B tenant fixtures;
- encrypted context-bound pagination;
- strict request, timeout, cancellation, and output bounds;
- synthetic JWT verification and OAuth protected-resource metadata;
- a Supabase OAuth JWT verifier with fixed issuer, exact audience, asymmetric JWKS, token scopes, and approved-client policy;
- a request-scoped application seam that confines the user bearer token to an upstream adapter factory;
- a Supabase adapter limited to three fixed read RPCs and two fixed create RPCs;
- a Supabase composition factory plus CLI configuration reader that joins OAuth verification, MCP authorization, and the fixed RPC adapter without widening the loopback bind;
- an explicit personal composition that validates a browser-authenticated user session, keeps it in memory on loopback, or stores one AES-256-GCM-encrypted session for at most seven days in the fully configured single-user deployment, and exposes only fixed `tasks`/`task_projects` PostgREST reads and creates under RLS;
- a dependency-free operator CLI with Git+npx client onboarding, stdio personal mode, synthetic and explicitly configured Supabase HTTP modes, offline `doctor`, stable exit codes, and JSON diagnostics;
- a separately built Vite browser package whose compiled `/login` shell can be served by the local stdio process, chooses retention, performs the real Promethee passwordless email-code flow, and pairs the verified personal session, while `/oauth/consent` separately reviews and submits publisher OAuth decisions;
- a connection-status MCP tool that gives an LLM only the loopback login URL before pairing and never exposes an email code or token;
- a loopback-only entry point whose default authenticator denies every token.

The local stdio composition binds its login surface to `127.0.0.1`, resolves account authorization at tool-call time, and can restore the selected seven-day or `Never` retention behavior from the platform user-config directory. The CLI can also select the Supabase composition from validated environment configuration. Publisher HTTP composition remains on loopback; the complete single-user personal production configuration may bind to the private container network behind the checked-in TLS edge. `doctor` validates configuration without network access. The browser package is pinned to `https://auth.promethee.io`, rejects secret/service-role browser keys, sends the real passwordless email code, verifies it, and submits Supabase OAuth approve/deny decisions.

The onboarding tool plus all five account tools, their application ports, synthetic behavior, fixed-RPC adapter, direct personal adapter, encrypted restart recovery, and mocked end-to-end evidence are implemented. Personal mode is explicitly enabled over local stdio, loopback HTTP, or the complete trusted-edge single-user configuration and remains version-sensitive; publisher mode still needs the five versioned RPCs, RLS, MCP audience/client policy, custom permission semantics, quotas, and OAuth registration. No ordinary repository test contacts or mutates Promethee.

## Constraints

- Promethee-managed Supabase remains the proposed system of record; staging and production access require explicit publisher approval.
- The connected modes may expose only bounded task/project reads and creates. Personal mode derives the user from `/auth/v1/user`; publisher mode uses the approved OAuth/RPC boundary. Updates, deletes, completion, bulk, and timer control remain excluded.
- The verified bearer token never reaches application use cases or `AuthContext`. Publisher mode confines it to the request-scoped fixed-RPC adapter. Personal mode confines it to the connection store and request-scoped fixed PostgREST adapter; production persistence is an encrypted, single-user, seven-day maximum governed by ADR-0007.
- Distributed artifacts must never contain privileged database credentials or reuse sessions extracted from the Promethee desktop application.
- Ordinary development and validation use synthetic fixtures and never query or mutate Promethee production data.
- The explicit `serve` command remains loopback, synthetic, and deny-all by default. The zero-argument/piped executable is the local personal stdio composition. Only a complete personal production configuration can bind to `0.0.0.0`, and it is intended solely for a private container network behind the trusted HTTPS edge. Publisher mode continues to bind to loopback.
- The CLI never requests Promethee credentials. Human onboarding only configures a client command; the email and OTP stay in the loopback browser page. `doctor` performs no network access in either mode.
- The repository is public as an unofficial source release. It must not imply Promethee ownership or endorsement, and no license is selected until ownership and contribution terms are decided.

## Open decisions

- Obtain an accountable Promethee decider and approve the official integration boundary.
- Choose between Promethee Supabase OAuth server mode and a separately operated authorization broker.
- Approve the request-scoped Supabase user-token forwarding boundary and its audience, client allowlist, fixed RPCs, and RLS policy.
- Approve MCP scopes and dedicated read-only views or RPC functions.
- Approve the create-only RPC, RLS, durable idempotency, quota, and audit contracts from ADR-0005/SPEC-0002.
- Approve exact field, identifier, ordering, deletion, freshness, quota, and compatibility semantics.
- Define data retention, audit logging, abuse controls, availability targets, and backup ownership.
- Exercise the released composition on a clean VPS behind the checked-in TLS reverse proxy and record rollback evidence.
- Decide repository ownership, product naming, branding, license, contribution policy, and the process for releases after `v0.1.0`.

## Validation contract

| Command | Contract |
| --- | --- |
| `npm run typecheck` | TypeScript validation without output. |
| `npm test` | Build followed by all compiled Node synthetic tests. |
| `npm run build` | Emit the TypeScript build under ignored `dist/`. |
| `npm run check` | Typecheck and full test sequence. |

Latest local evidence is recorded only after a complete validation run. The exact dependency installation reported zero npm audit findings; a clean `npm ci` exercise remains outstanding. This evidence covers only the synthetic implementation and local protocol/runtime boundaries.
