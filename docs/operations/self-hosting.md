# Self-hosting blueprint

## Status

The public `v0.1.0` source release has a tested GitHub Release+npx local stdio composition, a loopback personal HTTP composition, a validated publisher-RPC Supabase composition, a separately built passwordless web package, and a checked-in single-user Docker Compose/Caddy deployment candidate. It is not yet a verified VPS deployment: the release has not been exercised on a clean host, key rotation and rollback are unproven, and live Promethee compatibility remains unofficial and version-sensitive.

The Node process binds to loopback by default. Only the complete personal production environment may select `0.0.0.0`, and only on the private Compose network behind the checked-in HTTPS edge. Never publish port `3210` directly.

## Run the local deny-all composition

Prerequisites:

- Node.js `>=22.14.0 <23`;
- the exact dependencies from `package-lock.json` already installed;
- a current TypeScript build.

Build and start:

```bash
npm run build
npm start
```

The equivalent CLI-only operator commands are:

```bash
npm run cli -- doctor --json
npm run cli -- serve --port 3210
```

The explicit `serve` and `doctor` commands never prompt and never request a Promethee password or token. `doctor` is offline. The default `serve` command selects the synthetic deny-all runtime; `--mode personal` selects the browser-connected loopback runtime; `--mode supabase` selects the completely configured publisher-RPC composition.

The process binds to `127.0.0.1:3210`. Shared runtime settings are:

| Setting | Default | Constraint | Purpose |
| --- | --- | --- | --- |
| `PROMETHEE_MCP_PORT` | `3210` | integer `1`–`65535` | Select the loopback listening port. |
| `PROMETHEE_MCP_MODE` | `synthetic` | `synthetic`, `personal`, or `supabase` | Select the explicit composition. |

The local composition exposes `/healthz`, `/mcp`, and MCP OAuth protected-resource metadata. It also advertises synthetic authorization, token, and JWKS URLs on the same loopback authority, but those authorization-server endpoints are not implemented.

Every bearer token is rejected by default. There is no development bypass, shared token, Promethee credential, or supported environment variable that enables data calls. Functional protocol tests inject an in-memory synthetic verifier directly in the test harness.

Synthetic mode accepts no Promethee/Supabase origin, key, service-role credential, or arbitrary bind host. Its only data source is the in-process fixture adapter.

## Local GitHub Release+npx onboarding

For a local MCP client, use the reviewed release archive:

```bash
npx -y --package=https://github.com/BRYANN2K/promethee-mcp/releases/download/v0.1.0/promethee-mcp-0.1.0.tgz prometheeemcp
```

On a human terminal, this prints a Codex/Claude Code/generic configuration choice and requires confirmation before running a client-specific add command. When an MCP client launches the same executable with piped stdio, zero arguments start JSON-RPC directly; `prometheemcp --stdio` is the explicit form.

The stdio process also serves `/login` and the bounded connection bridge on `127.0.0.1`. Ask the MCP to call `promethee_connection_status`, open the returned URL, and complete the code there. Do not paste the code into the terminal or LLM. Pairing unlocks the same running process.

Local state is stored under the platform user configuration directory (`~/Library/Application Support/prometheemcp` on macOS, `%APPDATA%\\prometheemcp` on Windows, and `$XDG_CONFIG_HOME/prometheemcp` or `~/.config/prometheemcp` on Linux). `PROMETHEE_MCP_CONFIG_DIR` may override this with an absolute path. The seven-day encrypted envelope and its local key are bounded and permission-restricted; `Never` stores only the non-secret preference. This protects accidental file disclosure but not compromise of the operating-system user.

The release archive is immutable by convention and has been exercised directly through `npx`. Verify the release checksum before introducing it into a managed environment. Installing from a Git ref is not the supported `v0.1.0` path because npm `10.9.2` fails its Git packaging step before this package starts.

The reviewed release archive contains the configured `web/dist` artifact. Frontend `npm run check` uses a synthetic public configuration and writes only to ignored `.tmp/web-check-dist`; it cannot overwrite the packaged login. Frontend `npm run build` refuses an unconfigured release build so a successful source check cannot silently replace the usable login with the configuration-blocked state.

## Personal loopback mode

Start the MCP and auth UI in separate terminals:

```bash
npm run build
npm run cli -- serve --mode personal --port 3210
```

```bash
cd web
npm run dev -- --port 4175
```

Open `http://127.0.0.1:4175/login` and complete the Promethee email-code flow. The page sends the verified access/refresh session once to `http://127.0.0.1:3210/connect/session`. The server validates the session through the pinned `https://auth.promethee.io/auth/v1/user` endpoint and keeps it only in memory.

After the page reports `MCP connected`, point a local MCP client at `http://127.0.0.1:3210/mcp`. This local personal mode intentionally accepts the operating-system loopback boundary instead of a second bearer grant. Do not publish this memory-only composition directly.

The adapter can only:

- select bounded fields from `tasks` and `task_projects` for the verified subject;
- insert one task or project with a deterministic idempotency identifier;
- refresh the connected Supabase session in memory.

It cannot choose an arbitrary table, column, filter, RPC, or user. Stopping the loopback server clears the session. `GET /connect/status` returns only connection state and expiry, never identity or tokens.

## Single-user VPS candidate

The root `compose.yaml` builds two services:

- `edge`: Caddy terminates TLS, protects browser and `/connect/*` routes with operator Basic Auth, adds the trusted edge secret, and serves the static web package;
- `mcp`: the non-root Node process stays on the private network, validates the public Host/Origin, requires a distinct MCP bearer, and owns one encrypted Promethee session file.

Copy `.env.production.example` to an operator-owned environment file outside source control and replace every placeholder. The configuration is intentionally all-or-nothing. Required values are:

| Setting | Purpose |
| --- | --- |
| `MCP_DOMAIN` | Public DNS name used for TLS and the exact MCP resource URL. |
| `ACME_EMAIL` | ACME certificate contact. |
| `PROMETHEE_SUPABASE_PUBLISHABLE_KEY` | Browser-safe Promethee key; service-role and secret keys are forbidden. |
| `PROMETHEE_MCP_ADMIN_USER` / `PROMETHEE_MCP_ADMIN_PASSWORD_HASH` | Operator access to browser and connection routes. Escape every `$` in a Caddy password hash as `$$` for Compose interpolation. |
| `PROMETHEE_MCP_PERSONAL_ACCESS_TOKEN` | Separate 43–128 character Base64URL bearer configured in the MCP client. |
| `PROMETHEE_MCP_EDGE_TOKEN` | Separate 43–128 character Base64URL edge-to-backend secret. |
| `PROMETHEE_MCP_CURSOR_KEY_BASE64URL` | Exact 32-byte Base64URL cursor key. |
| `PROMETHEE_MCP_SESSION_KEY_BASE64URL` | Different exact 32-byte Base64URL session-encryption key. Losing it requires a new email code. |

The container fixes `PROMETHEE_MCP_SESSION_FILE` to `/var/lib/promethee-mcp/session.enc` on the `session-data` volume. Do not back that volume up without encrypting and protecting it to the same standard as the session key. Never store the session key beside the volume backup.

Operator sequence after the images have been independently reviewed:

```bash
docker compose config --quiet
docker compose build --pull
docker compose up -d
docker compose ps
```

These commands are operational instructions, not evidence that they have been executed in this repository. Open `https://<MCP_DOMAIN>/login`, choose `7 days` or `Never`, then complete the email-code connection on the same card. The page saves the choice before it pairs the verified session; if that save fails, pairing does not occur. Configure the MCP client for `https://<MCP_DOMAIN>/mcp` with `Authorization: Bearer <PROMETHEE_MCP_PERSONAL_ACCESS_TOKEN>`.

The production web build accepts the bridge only when `VITE_MCP_BASE_URL` is the page's own exact HTTPS origin. The Compose build sets both to `https://${MCP_DOMAIN}`. Cross-origin bridges and production loopback HTTP are rejected before the page can send a verified session.

`7 days` stores one AES-256-GCM authenticated envelope and restores it after a server restart until the fixed deadline. Refreshing an upstream access token updates the envelope but does not extend that deadline. `Never` immediately removes all stored access/refresh token material, leaves the current session usable only in memory, and preserves the non-secret preference across restart.

For rollback, stop the candidate, redeploy the previously reviewed image/configuration, and re-run the health and MCP protocol checks. If the session format or key changed, remove the encrypted session volume only with explicit operator authorization and reconnect by email code. There is no data migration and no Promethee content cache.

## Configured Supabase mode

Connected mode is selected explicitly:

```bash
npm run build
npm run cli -- doctor --mode supabase --json
npm run cli -- serve --mode supabase
```

`doctor` parses the complete configuration without DNS, HTTP, JWKS, OAuth, or data requests. It reports `configured-unverified`; it does not claim that Promethee exposes the required contract.

| Setting | Secret | Required contract |
| --- | --- | --- |
| `PROMETHEE_MCP_PUBLIC_URL` | no | Exact canonical HTTPS URL ending in `/mcp`. |
| `PROMETHEE_SUPABASE_PUBLISHABLE_KEY` | public-by-design, controlled | Browser-safe `sb_publishable_…` or legacy anon JWT; service-role/secret values are rejected. |
| `PROMETHEE_MCP_CURSOR_KEY_BASE64URL` | yes | Canonical unpadded Base64URL for exactly 32 random bytes. |
| `PROMETHEE_MCP_CLIENT_POLICY_JSON` | controlled | JSON object from approved OAuth client IDs to non-empty arrays drawn from `tasks:read`, `tasks:write`, and `projects:write`. |
| `PROMETHEE_MCP_SLICE_POLICY_JSON` | controlled | Complete bounded policy object; no production numeric defaults are guessed. |
| `PROMETHEE_MCP_ALLOWED_ORIGINS` | no | Optional comma-separated exact HTTPS origins; the public MCP origin is always included. |

The Supabase origin is pinned in code to `https://auth.promethee.io/`. Host validation allows only the public MCP authority and the exact local loopback authority. The client policy, publishable key, and cursor key are never emitted by `doctor` or startup messages.

The slice-policy JSON contains exactly these keys: `defaultPageSize`, `maxPageSize`, `maxIdentifierBytes`, `maxTextBytes`, `maxCursorBytes`, `maxBackendPageTokenBytes`, `maxSourceVersionBytes`, `maxResponseBytes`, `upstreamTimeoutMs`, `cursorTtlMs`, and `orderingVersion`. Every number is a positive integer and the default page size cannot exceed the maximum. Promethee must approve production values.

The reverse proxy must preserve the public `Host`, terminate valid TLS, forward only `/mcp`, the OAuth protected-resource metadata route, and the deliberately public health endpoint, and apply deployment-level rate limits. The browser UI is a separate static artifact; it is not served by this Node process.

Stop the local process with `SIGINT` or `SIGTERM`; the installed lifecycle closes the MCP handler and Node server.

## Validation boundary

The local composition and test suite verify only:

- loopback Node server lifecycle;
- Host and Origin rejection;
- request-size limits;
- OAuth protected-resource metadata generation;
- strict synthetic bearer/JWT validation in injected test compositions;
- all five synthetic Tasks/Projects tools and their application boundaries;
- configured Supabase CLI startup without upstream network access;
- end-to-end read and create calls using signed synthetic tokens and mocked fixed RPCs.
- end-to-end browser pairing and task creation through mocked direct PostgREST/RLS responses in personal mode.
- encrypted session restoration, seven-day expiry, memory-only preference persistence, and failure-safe settings writes;
- all five MCP calls through the trusted-edge/static-bearer production runtime against controlled doubles;
- static Compose configuration expansion with synthetic placeholder values.

They do not by themselves verify live Promethee RLS, data correctness, long-term schema compatibility, public TLS, an executed Caddy/container build, operating-system hardening, external client registration, or production availability.

## Intended operator outcome

After publisher approval and staging validation, an operator can run the MCP resource server on a VPS while Promethee continues to own authentication policy and the source data.

Self-hosting the MCP would not self-host or copy Promethee Supabase.

## Implemented single-user candidate components

The repository now contains:

- a Caddy TLS/static edge configuration;
- non-root multi-stage Node and web container definitions;
- a private Compose network and persistent session volume;
- exact browser Basic Auth, trusted-edge secret, and MCP bearer boundaries;
- one encrypted seven-day personal session store;
- bounded health checks, read-only MCP filesystem, dropped capabilities, and log rotation.

Still absent are publisher approval, multi-user authorization, deployment metrics, a runtime outbound allowlist, signed immutable images, SBOM/provenance, and clean-host deployment/rollback evidence.

## Proposed network exposure

Public, after implementation and approval:

- HTTPS MCP endpoint;
- OAuth protected-resource metadata;
- browser login/consent routes only when owned by the approved deployment;
- minimal health endpoint that reveals no dependency or user detail.

Private:

- operator database;
- metrics endpoint;
- administrative/revocation interface;
- container/runtime control plane.

No Supabase Studio, database port, debug inspector, source map, or internal admin endpoint should be public.

## Remaining production configuration work

The executable validates the complete personal production environment and refuses partial configuration. The deployment still needs a host secret-provider integration, edge rate limits, content-free structured logging, immutable image provenance, and named rollback ownership.

No `service_role` or other RLS-bypassing setting may exist. A verified Supabase user token may be captured only by the publisher fixed-RPC adapter or the personal connection/direct adapter. It must never enter `AuthContext`, application use cases, logs, or a caller-selected data operation. The sole permitted persistent personal-token state is the ADR-0007 encrypted envelope.

## Host baseline for a future release

Requirements remain unmeasured, but the operator should plan for:

- a supported 64-bit Linux distribution;
- automatic security updates or a documented patch cadence;
- a firewall exposing only HTTPS and restricted administration;
- time synchronization;
- encrypted storage for operator secrets/state;
- a least-privilege service account;
- resource limits and restart policy;
- monitored TLS certificate renewal;
- outbound allowlisting where the platform supports it.

Exact CPU, memory, disk, and version requirements remain unknown until a deployable artifact is measured.

## Secrets, data, and backups

- Inject secrets at runtime; never bake them into images or Git.
- Separate staging and production issuers, keys, databases, and domains.
- Never expose Promethee or OAuth tokens through environment dumps, crash reports, metrics, or support bundles.
- Keep the first release free of Promethee content caches.
- If refresh grants are persisted, encrypt them and define tested rotation, restore, retention, revocation, and deletion behavior.

## Upgrade and rollback gate

A future release requires:

- immutable versioned artifact;
- migration inventory for operator state;
- compatibility check against the approved facade version;
- staged rollout and health verification;
- documented rollback boundary;
- clean install, upgrade, rollback, revocation, and dependency-failure exercises;
- SBOM, provenance, secret scan, and vulnerability review.

## Stop conditions

Do not deploy when:

- Promethee approval is missing or revoked;
- the issuer, resource, scopes, facade, and upstream authorization mechanism are not finalized;
- the deployment requires a service-role credential, persists a user token outside the ADR-0007 envelope, or exposes it outside the selected fixed-RPC or personal adapter;
- HTTPS or exact Host/Origin validation is absent;
- tenant isolation has not passed publisher-owned staging RLS tests;
- logging can include tokens or user content;
- no operator owns patching, incidents, revocation, upgrade, and rollback.
