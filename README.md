# Promethee MCP

Promethee MCP lets an AI assistant work with your Promethee tasks and projects without asking you to paste credentials into a conversation. It can list tasks and projects, inspect one task, and create one task or project when you explicitly request it.

The local MCP starts through `npx`, hosts its own passwordless sign-in page on `127.0.0.1`, and keeps the Promethee email code inside the browser. It never extracts a desktop session and never includes a service-role key.

## Install v0.1.0 from GitHub

You can let your LLM configure the MCP. Send it this instruction:

```text
Install Promethee MCP as a user-scoped stdio server. Use npx with the reviewed GitHub Release archive
https://github.com/BRYANN2K/promethee-mcp/releases/download/v0.1.0/promethee-mcp-0.1.0.tgz and the prometheemcp --stdio executable.
Reconnect the MCP, call promethee_connection_status, and give me its login URL.
Never ask me to paste the email code or tokens into the conversation.
```

Or run the onboarding yourself:

```bash
npx -y --package=https://github.com/BRYANN2K/promethee-mcp/releases/download/v0.1.0/promethee-mcp-0.1.0.tgz prometheemcp
```

The terminal lets you configure Codex, Claude Code, or copy a generic MCP JSON block. It prints the exact command first and changes a client configuration only after confirmation.

### Codex

```bash
codex mcp add promethee -- \
  npx -y \
  --package=https://github.com/BRYANN2K/promethee-mcp/releases/download/v0.1.0/promethee-mcp-0.1.0.tgz \
  prometheemcp --stdio
```

### Claude Code

```bash
claude mcp add --scope user promethee -- \
  npx -y \
  --package=https://github.com/BRYANN2K/promethee-mcp/releases/download/v0.1.0/promethee-mcp-0.1.0.tgz \
  prometheemcp --stdio
```

### Generic MCP configuration

```json
{
  "mcpServers": {
    "promethee": {
      "command": "npx",
      "args": [
        "-y",
        "--package=https://github.com/BRYANN2K/promethee-mcp/releases/download/v0.1.0/promethee-mcp-0.1.0.tgz",
        "prometheemcp",
        "--stdio"
      ]
    }
  }
}
```

After the client starts the server, ask it to connect Promethee. The MCP calls `promethee_connection_status` and returns a local URL such as `http://127.0.0.1:3210/login`. Choose `7 days` or `Never`, enter your email, and verify the six-digit code in that browser page. The running MCP detects the connection immediately; no reinstall is required.

The commands above pin the reviewed `v0.1.0` release archive. This avoids rebuilding a mutable Git checkout during installation.

### Hermes / VPS handoff

Give Hermes this instruction on the VPS:

```text
Install the public GitHub release BRYANN2K/promethee-mcp at the exact v0.1.0 tag.
Read docs/operations/self-hosting.md before making changes. Configure the checked-in
Docker Compose deployment with operator-owned secrets outside Git, validate it with
docker compose config, build it, start it, and report the health and MCP discovery
results. Never expose port 3210 directly and never print secrets or Promethee tokens.
```

For a single-user VPS, the checked-in Compose topology places the MCP on a private network behind Caddy. The browser connection is operator-protected, MCP clients use a separate bearer, and the Promethee session is AES-256-GCM encrypted at rest for at most seven days. One connection card lets the user choose `7 days` or `Never` before entering the email code; `Never` removes all stored token material while retaining the preference. See [Self-hosting](docs/operations/self-hosting.md).

## What works today

The local stdio server exposes one onboarding tool and five bounded account tools:

- `promethee_connection_status`;
- `promethee_list_tasks`;
- `promethee_get_task`;
- `promethee_list_projects`;
- `promethee_create_project`;
- `promethee_create_task`.

The implementation includes:

- closed input, source, and output schemas;
- exact `tasks:read`, `projects:write`, and `tasks:write` checks;
- a token-free application boundary: the bearer token never reaches use cases or `AuthContext`;
- a caller-bound adapter factory that may confine a verified user token to one upstream request scope;
- a Supabase verifier for fixed issuer, exact MCP audience, asymmetric JWKS, token scopes, and approved OAuth clients;
- a Supabase facade restricted to exactly three read RPCs and two create RPCs;
- an explicit personal mode restricted to fixed PostgREST operations on `tasks` and `task_projects` using the connected user's RLS session;
- encrypted single-user session recovery across restarts, with a fixed seven-day deadline and a persistent memory-only opt-out;
- a configured CLI mode that joins OAuth verification, MCP authorization, and request-scoped fixed RPC calls; only the complete personal production composition may bind to a private container interface;
- a dependency-free CLI with offline diagnostics for both synthetic and Supabase modes;
- in-memory idempotency and read-after-create behavior for the synthetic write contract;
- two-user synthetic isolation fixtures;
- AES-256-GCM cursors bound to subject, tool, scope, filters, page size, and ordering;
- bounded pages, text, cursors, request bodies, responses, and upstream execution time;
- strict Host and Origin checks;
- OAuth protected-resource metadata with synthetic local endpoints;
- generic text results that keep task and project content in structured data;
- fail-closed handling for invalid inputs, malformed source responses, missing scopes, timeouts, and invalid cursors.

The zero-argument executable uses terminal detection: a human TTY receives onboarding, while an MCP client with piped stdio receives JSON-RPC only. The existing `serve` command remains local, synthetic, and deny-all unless `--mode personal` or `--mode supabase` is selected. Tests inject controlled sessions and mocked upstream responses; ordinary validation never contacts or mutates Promethee.

A separate `web/` package implements Promethee's passwordless email-code login and a real Supabase OAuth approve/deny surface. Consent names identity, read, and create access before approval. The connection page also includes the requested link to [@bryann2k_dev on X](https://x.com/bryann2k_dev).

## Integration status

Personal mode is implemented and its complete browser-pairing-to-MCP path is covered with mocked upstream tests. It uses the current table contract evidenced by the public unaffiliated Android client. Live behavior remains version-sensitive and is not an official Promethee integration.

The publisher-integrated Supabase mode still has these gates:

- Promethee has not deployed or approved the five versioned RPC contracts used by this repository;
- production RLS, OAuth client registration, MCP audience/scopes, idempotency, quotas, refresh/revocation, and staging compatibility remain unverified;
- sessions, time reports, current status, update/delete, and timer control are outside this version;
- executed container builds, TLS/Caddy validation, VPS rollout, key-rotation, and rollback evidence for the checked-in deployment candidate;
- the public `v0.1.0` GitHub source release is the reviewed distribution point; no npm package, container image, or hosted deployment is published.

The publisher mode fails closed when an RPC or permission is absent. Personal mode deliberately uses only fixed direct operations on `tasks` and `task_projects`; it never exposes arbitrary PostgREST or generic RPC access.

## Toolchain

- Node.js `>=22.14.0 <23`;
- npm `10.9.2`;
- TypeScript `7.0.2`;
- `@modelcontextprotocol/server` and `@modelcontextprotocol/node` `2.0.0`;
- Zod `4.4.3`;
- JOSE `6.2.10`.

Versions are locked in `package-lock.json`.

## Validate

With the locked dependencies already present, run:

```bash
npm run typecheck
npm test
```

The available commands are:

| Command | Effect |
| --- | --- |
| `npm run typecheck` | Type-checks source and tests without emitting files. |
| `npm test` | Builds product source, compiles tests separately, and runs synthetic plus mocked integration tests. |
| `npm run build` | Compiles product source only to the ignored `dist/product/` directory. |
| `npm run check` | Runs typecheck, build, and all tests. |
| `npm start` | Starts the already-built deny-all synthetic server on loopback. |
| `npm run cli -- serve --mode personal` | Starts the browser-connected personal MCP; memory-only on loopback or encrypted seven-day retention with the complete production environment. |
| `npm run cli -- --help` | Shows the source-build CLI contract. |

Validation evidence covers local contracts and mocked upstream behavior, not live Promethee compatibility or production security.

## Start the deny-all local server

Build before starting:

```bash
npm run build
npm start
```

The server binds to `127.0.0.1:3210` by default. `PROMETHEE_MCP_PORT` may select another integer port from `1` through `65535`.

Available local routes include `/mcp`, `/healthz`, and OAuth protected-resource metadata. MCP data calls still fail authentication because the entry point deliberately installs a verifier that rejects every bearer token. This mode is useful for inspecting startup, discovery, request boundaries, and lifecycle behavior; it is not a usable Promethee service.

Select the immediately usable personal composition with `--mode personal`. Select the publisher-RPC composition only with `--mode supabase` or `PROMETHEE_MCP_MODE=supabase`. See the [self-hosting guide](docs/operations/self-hosting.md) for both boundaries.

## Run the browser connection UI

The browser package is independent from the CLI:

```bash
cd web
npm run check
npm run dev -- --port 4174
```

Copy `web/.env.example` to ignored `web/.env.local` only in an authorized environment, then set the browser-safe publishable/legacy anon key and exact MCP bridge origin. The Supabase URL is pinned to `https://auth.promethee.io`. Never use a service-role or `sb_secret_…` key. `/login` loads the server-owned retention choice, sends and verifies the passwordless email code, saves the selected retention, and pairs the verified session on one page. `/oauth/consent` remains a separate publisher flow that loads and submits the Supabase authorization decision. A real consent request still requires an OAuth client and consent path registered by the provider.

`npm run check` builds with a synthetic public configuration into ignored `.tmp/web-check-dist`; it does not replace the packaged login. `npm run build` is the release build and refuses to replace `web/dist` when no browser-safe configuration or ignored Vite environment file is present.

## CLI-only operator surface

After `npm run build`, the CLI can be invoked without a dashboard:

```bash
npm run cli -- --help
npm run cli -- doctor
npm run cli -- doctor --json
npm run cli -- serve --port 3210
npm run cli -- doctor --mode personal --json
npm run cli -- serve --mode personal --port 3210
npm run cli -- doctor --mode supabase --json
npm run cli -- serve --mode supabase --port 3210
```

`doctor` is offline and never prints publishable keys, cursor/session keys, client policy, edge secrets, or MCP bearer values. Configuration precedence is flags, environment, then defaults. The publisher mode binds to loopback; a complete personal production configuration may bind only to the private container network behind the checked-in HTTPS edge.

The CLI intentionally has no password, token-import, or desktop-session command. Personal mode receives the independently verified browser session from an exact allowed origin. Loopback keeps it in memory; the single-user production composition can persist it only in the ADR-0007 encrypted envelope. Supabase publisher mode uses the separate OAuth contract.

## Product boundary

Every enabled integration authenticates the user independently. Publisher mode calls a small set of owned read/create RPCs; personal mode uses fixed `tasks`/`task_projects` PostgREST operations on loopback. Both must continue to:

- avoid the Promethee desktop application's tokens, cookies, session files, SQLite database, and private IPC;
- derive identity from approved authorization rather than a caller-supplied user ID;
- remain subject to publisher-owned RLS;
- expose a narrow MCP model rather than arbitrary PostgREST, SQL, RPC, Storage, Realtime, or Edge Function access;
- make creation separately consented, scoped, rate-limited, RLS-protected, and durably idempotent;
- contain no service-role or other RLS-bypassing credential;
- keep ordinary tests unable to reach Promethee production.

Nothing in this repository is an availability, compatibility, authorization, or security claim about Promethee.

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
- [Bounded creation specification](specs/0002-bounded-task-project-creation.md)

## Publisher gate

Do not treat configured mode as live-ready until the [integration request](docs/handover/promethee-integration-request.md) has accountable answers for ownership, authentication, scopes, the five RPCs, RLS, field semantics, quotas, retention, incidents, support, branding, and disclosure.

The repository is public for this unofficial source release. No license has been selected, and no Promethee ownership, endorsement, or compatibility guarantee is implied.
