# Self-hosting blueprint

## Status

This is an architecture blueprint, not an installation guide. The repository has no container image, Compose file, package, executable, or tested command. Do not expose a deployment based only on this document.

## Intended operator outcome

An approved operator should eventually be able to run the MCP resource server on a VPS while Promethee continues to own authentication policy and the source data.

Self-hosting the MCP does **not** self-host or copy Promethee Supabase.

## Proposed runtime components

- TLS reverse proxy on the public edge.
- Stateless TypeScript MCP service.
- Authorization/consent UI or connection to the approved central authorization service.
- Optional operator database for encrypted refresh grants, revocation metadata, rate limits, and content-free audit events.
- Metrics and logs with strict redaction.
- Outbound HTTPS allowlist limited to approved identity and Promethee facade origins.

## Proposed network exposure

Public:

- HTTPS MCP endpoint.
- OAuth protected resource metadata.
- Browser login/consent routes only if hosted by the deployment.
- Minimal health endpoint that reveals no dependency or user detail.

Private:

- operator database;
- metrics endpoint;
- administrative/revocation interface;
- container/runtime control plane.

No Supabase Studio, database port, debug inspector, source map, or internal admin endpoint should be public.

## Proposed configuration contract

The following names are placeholders for later implementation, not supported configuration:

| Setting | Secret | Purpose |
| --- | --- | --- |
| `MCP_PUBLIC_URL` | no | canonical HTTPS resource URL |
| `MCP_AUTH_ISSUER` | no | exact trusted OAuth issuer |
| `MCP_ALLOWED_ORIGINS` | no | explicit browser origin allowlist |
| `PROMETHEE_SUPABASE_URL` | no | publisher-approved backend origin |
| `PROMETHEE_PUBLISHABLE_KEY` | public-by-design but controlled | approved Supabase gateway key where required |
| `GRANT_ENCRYPTION_KEY` | yes | encrypt operator-held refresh grants if storage is required |
| `OPERATOR_DATABASE_URL` | yes | private operator-state connection |
| `LOG_LEVEL` | no | bounded log verbosity without content logging |

The service must refuse startup when canonical URLs are insecure/invalid, required secrets are absent, origins are wildcarded, or production mode enables debug logging.

No `service_role` setting should exist.

## Host baseline

Before implementation selects exact requirements, the operator should plan for:

- supported 64-bit Linux distribution;
- automatic security updates or a documented patch cadence;
- firewall exposing only HTTPS and restricted administration;
- time synchronization;
- encrypted storage for operator secrets/state;
- least-privilege service account;
- resource limits and restart policy;
- monitored TLS certificate renewal;
- outbound allowlisting where the platform supports it.

Exact CPU, memory, disk, and version requirements are unknown until load and runtime measurements exist.

## Secret management

- Inject secrets at runtime, never bake them into images or Git.
- Separate staging and production issuers, keys, databases, and domains.
- Restrict secret read access to the service identity.
- Define rotation for grant-encryption and operator-database credentials.
- Never expose Promethee or OAuth tokens through environment dumps, crash reports, metrics, or support bundles.
- A self-hoster supplies operator secrets; Promethee supplies only explicitly approved public client configuration.

## Data and backups

The preferred first release stores no Promethee content. If refresh grants are persisted, backups contain sensitive authentication material and require encryption, tested restore, retention limits, and deletion behavior.

Document separately:

- what operator state is backed up;
- encryption and key ownership;
- recovery point and recovery time targets;
- restore authorization;
- deletion propagation to backups;
- what happens when encryption keys are lost or rotated.

## Health and observability

Proposed signals:

- process readiness;
- authorization metadata/JWKS reachability;
- Promethee facade latency and status class;
- per-tool success/error/timeout counts;
- rate-limit activity;
- token validation failures by category without token content;
- response schema incompatibility;
- event-loop and resource saturation.

Health endpoints must not test with a real user token or expose tenant data.

## Upgrade and rollback

Before a release process exists, every upgrade design should require:

- immutable versioned image;
- migration inventory for operator state;
- compatibility check against the Promethee facade version;
- staged rollout and health verification;
- documented rollback boundary;
- special handling when an irreversible state migration exists.

Do not label an image production-ready until clean-install, upgrade, rollback, revocation, and dependency-failure exercises pass.

## Stop conditions

Do not deploy when:

- Promethee approval is missing or revoked;
- the issuer/resource/scopes are not finalized;
- the deployment requires a service-role key;
- HTTPS or exact origin validation is absent;
- tenant isolation is not proven;
- staging contract tests fail;
- logging can include tokens or user content;
- no operator owns patching, incidents, and revocation.
