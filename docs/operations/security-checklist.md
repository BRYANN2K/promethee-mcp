# Security checklist

Use this checklist before enabling each environment. Items are not currently satisfied merely because they are documented.

## Governance

- [ ] Promethee has approved the integration, data fields, scopes, naming, and deployment model.
- [ ] An accountable security and incident owner is named.
- [ ] Privacy purpose, retention, deletion, and subprocessor roles are documented.
- [ ] Production and staging boundaries are separate.

## Authentication

- [ ] OAuth authorization code with PKCE is exercised end to end.
- [ ] Protected resource and authorization-server metadata validate against the selected MCP spec.
- [ ] Issuer, signature, expiry, resource/audience, client, and scope are validated.
- [ ] Redirect URIs are exact and no wildcard is accepted.
- [ ] Revocation blocks both access and refresh.
- [ ] Desktop Promethee tokens/session files are never read or reused.

## Authorization and data

- [ ] Every tool maps to one fixed scope and one fixed approved backend operation.
- [ ] RLS derives identity from the JWT; caller `user_id` is ignored/rejected.
- [ ] Two-user negative tests prove cross-tenant isolation.
- [ ] Response schemas fail closed on missing/invalid required fields.
- [ ] Only the data-contract fields leave the adapter.
- [ ] No arbitrary table, RPC, filter expression, URL, or Storage operation is exposed.
- [ ] The deployment contains no service-role/RLS-bypassing credential.

## MCP and input safety

- [ ] Origin and protocol-version behavior match the supported Streamable HTTP specification.
- [ ] Request sizes, page sizes, report ranges, output sizes, and execution times are bounded.
- [ ] Cursors are opaque and bound to subject, scope, filters, and ordering.
- [ ] User-controlled task/project text remains structured inert data.
- [ ] No generic URL fetch, shell, SQL, or debugging tool exists.

## Operations

- [ ] TLS configuration and renewal are monitored.
- [ ] Admin, database, metrics, debug, and source-map surfaces are private.
- [ ] The runtime is non-root with resource limits.
- [ ] Secrets are runtime-injected and rotation is documented.
- [ ] Logs exclude bodies, results, emails, OTPs, codes, cookies, tokens, and authorization headers.
- [ ] Rate limits protect users, clients, deployments, and Promethee quotas.
- [ ] Dependency outage, timeout, schema drift, and JWKS rotation are tested.
- [ ] Backup/restore and deletion are tested if sensitive operator state exists.

## Supply chain

- [ ] Dependencies and versions are locked and reviewed.
- [ ] Build provenance and an SBOM are produced.
- [ ] Images contain only runtime artifacts and no development credentials.
- [ ] Secret and vulnerability scans run on the reviewed source/artifact.
- [ ] Release approval and rollback are documented.

## Release evidence

- [ ] All declared checks pass on the exact release commit.
- [ ] Staging contract/RLS tests pass with synthetic accounts.
- [ ] The final image/configuration has been inspected for credentials.
- [ ] The documentation matches the implemented tools, scopes, limits, and errors.
- [ ] Known gaps are accepted by named deciders.
