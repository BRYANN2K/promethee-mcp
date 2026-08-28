# Threat model

## Scope

This threat model covers the local stdio/loopback onboarding composition, proposed remote MCP resource server, browser login/consent surface, operator state, bounded create-task/create-project contract, and approved outbound calls to Promethee Supabase.

It does not assess Promethee's internal infrastructure, the MCP client implementation, update/delete/bulk mutations, or timer control.

## Protected assets

- Promethee user identity and account access.
- Task names, project names, session history, and time reports.
- Access tokens, refresh tokens, authorization codes, and signing configuration.
- Consent grants and revocation state.
- Promethee backend availability and quotas.
- The integrity of MCP responses and audit evidence.
- The integrity of tasks/projects created on a user's behalf.
- Promethee and project branding/trust.

## Actors

- Legitimate Promethee user.
- Legitimate MCP client acting with consent.
- Self-hosted MCP operator.
- Promethee publisher/administrator.
- Malicious remote caller.
- Malicious or compromised MCP client.
- Compromised deployment or dependency.
- Curious operator with infrastructure access.

## Security invariants

1. A request can access data only for its authenticated subject.
2. A tool can use only the scopes declared for that tool.
3. No distributed component contains an RLS-bypassing Promethee credential.
4. No desktop session, cookie, token file, or private IPC is reused.
5. A mutation can invoke only its fixed create RPC with an explicit write permission and durable idempotency; update/delete/bulk/timer operations remain impossible.
6. A backend error, missing policy, or ambiguous identity fails closed.
7. Logs and metrics do not contain Promethee content or credentials.
8. Production access is impossible in ordinary tests.
9. The local LLM receives only connection state and a loopback URL; email codes and session tokens remain in the browser/server boundary.

## Threats and mitigations

| Threat | Impact | Proposed controls | Evidence required |
| --- | --- | --- | --- |
| Broken object-level authorization | Cross-user data exposure | Derive subject from JWT; RLS; no caller `user_id`; negative tenant tests | Promethee RLS review and synthetic multi-user tests |
| Token accepted for wrong resource | Confused deputy and privilege reuse | Validate issuer, audience/resource, client and scopes | Token validation tests against wrong issuer/audience/resource |
| Client policy upgrades an identity-only token | Undisclosed read/write authority | Intersect the token's granted scopes with the approved-client allowlist; never grant from allowlist alone | Missing-token-scope tests and staging token inspection |
| Stolen refresh token | Persistent account access | Encrypt at rest; rotate; revoke; short sessions; no logs | Storage design and revocation exercise |
| Malicious redirect/client registration | Authorization-code theft | Exact redirect validation; PKCE; controlled client registration | Auth-server configuration review |
| Service-role leakage | Complete RLS bypass | Prohibit service-role credential in images/runtime; secret scanning; deployment policy | Image/config inspection |
| Arbitrary backend proxy | Expanded private API access | Closed tool registry and fixed RPC/view mapping | Contract and route tests |
| Prompt injection in task text | Model manipulation | Treat returned text as untrusted data; structured responses; no instructions from content | Client-facing safety copy and schema tests |
| Resource exhaustion | Backend quota exhaustion or outage | Per-subject/client limits; bounded ranges/pages; deadlines; circuit breaking | Load model and failure tests |
| SSRF through metadata or URLs | Internal network access | Fixed upstream origins; strict discovery trust; no caller-controlled fetch | Network allowlist tests |
| Cross-tenant cache key | Data leak through cache | No first-release content cache; subject/scope-bound keys if added | Cache isolation tests |
| Sensitive logging | Persistent privacy breach | Structured allowlist logs; header/body redaction | Log capture tests |
| Supply-chain compromise | Token/data theft | Lock dependencies; provenance review; minimal image; update policy | SBOM and reproducible build evidence |
| Unreviewed release archive | Package-code execution under the user account | Pin the versioned GitHub asset URL and checksum; print exact client command; no hidden shell execution | clean install and package-provenance exercise |
| Hostile local page pairs a session | Account-token capture or wrong-process pairing | loopback-only bind; exact Host/Origin; same-origin mutation routes; no token in URL | browser/route origin tests |
| LLM requests the OTP or token | Credential disclosure into conversation history | status tool returns URL only; server instructions prohibit code/token requests; no credential tool input | tool schema/instruction tests |
| Self-hosting misconfiguration | Public admin surfaces or weak TLS | secure defaults; startup validation; reverse-proxy guidance | deployment scan and runbook exercise |
| Configuration disclosure | Cursor forgery or integration abuse | never print cursor keys, publishable keys, client policy, tokens, or environment dumps | CLI diagnostic capture tests |
| Schema/RLS drift | Silent widening or breakage | dedicated facade; response schema fail-closed; compatibility probe | staging contract suite |
| Duplicate creation after timeout/retry | Repeated tasks/projects and billing/workflow harm | caller request identifier; publisher-owned durable idempotency; no blind retry | replay, conflict, timeout, and independent-readback tests |
| Prompt-induced write | Unwanted task/project creation by a compromised or manipulated client | separate write consent; precise tool descriptions; least scopes; per-client/user rate limits; user-visible audit contract | adversarial client and scope-denial tests |
| Cross-project task creation | Write into another user's or inaccessible project | token-derived subject; RPC membership validation; uniform not-found behavior | two-user RLS and non-enumeration tests |
| Stale remote state | Incorrect user conclusions | freshness fields; no action acknowledgement claim | sync semantics from Promethee |
| Unapproved branding/interface use | Legal and trust harm | explicit unofficial status; no endorsement claim; publisher sign-off for official integration | written ownership and branding decision |

## MCP-specific considerations

- Validate the `Origin` header as required by the Streamable HTTP transport.
- Keep stdio stdout exclusively for JSON-RPC and send human onboarding only when both streams are TTYs.
- Bind durable MCP tasks to the authenticated authorization context if task capabilities are ever enabled.
- Do not expose a generic URL-fetching tool.
- Do not accept tokens through tool inputs or prompts.
- Return structured, bounded data and identify user-controlled text as data.
- Avoid server-initiated requests in the first release unless a reviewed use case needs them.

## Privacy posture

The service processes personal productivity data. Before production, document:

- controller/processor roles;
- user-facing purpose and lawful basis;
- retention and deletion;
- infrastructure region;
- subprocessors;
- incident notification ownership;
- data export and account deletion behavior;
- whether AI clients retain received tool output.

No compliance claim is made by this document.

## Abuse cases to test

- User A requests User B's task/session identifier.
- A token for another resource calls the MCP endpoint.
- A token with `tasks:read` calls a reporting tool.
- A token with only read scopes calls a create tool.
- The same create request is replayed after a response timeout.
- A request identifier is reused with different task/project content.
- User A attempts to create a task in User B's project.
- An MCP client sends an oversized range, cursor, or task identifier.
- A backend returns an unexpected extra field or wrong type.
- A malicious task title contains instructions, Markdown links, or encoded content.
- JWKS rotation occurs while requests are active.
- The issuer, backend, or revocation service is unavailable.
- A revoked grant attempts refresh and access.
- Two self-hosted deployments use the same subject with different scope sets.

## Residual risks

- Data already returned to an MCP client cannot be recalled by revoking the server grant.
- The operator can observe timing and tool names even when content logging is disabled.
- A compromised MCP client can misuse legitimately granted data.
- Promethee schema, policies, and synchronization behavior remain unknown until publisher review.

## Revisit triggers

- Any update, delete, bulk, or timer-control tool is proposed.
- Promethee authorizes additional tables or personal data categories.
- Content caching or replication is added.
- Multi-region or multi-operator hosting is introduced.
- MCP authorization or transport specifications change.
- A security incident or RLS defect is discovered.
