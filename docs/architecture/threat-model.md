# Threat model

## Scope

This threat model covers the proposed remote MCP resource server, browser login/consent surface, operator state, and approved outbound calls to Promethee Supabase.

It does not assess Promethee's internal infrastructure, the MCP client implementation, or a future write/control capability.

## Protected assets

- Promethee user identity and account access.
- Task names, project names, session history, and time reports.
- Access tokens, refresh tokens, authorization codes, and signing configuration.
- Consent grants and revocation state.
- Promethee backend availability and quotas.
- The integrity of MCP responses and audit evidence.
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
5. The first release performs no Promethee mutation or timer control.
6. A backend error, missing policy, or ambiguous identity fails closed.
7. Logs and metrics do not contain Promethee content or credentials.
8. Production access is impossible in ordinary tests.

## Threats and mitigations

| Threat | Impact | Proposed controls | Evidence required |
| --- | --- | --- | --- |
| Broken object-level authorization | Cross-user data exposure | Derive subject from JWT; RLS; no caller `user_id`; negative tenant tests | Promethee RLS review and synthetic multi-user tests |
| Token accepted for wrong resource | Confused deputy and privilege reuse | Validate issuer, audience/resource, client and scopes | Token validation tests against wrong issuer/audience/resource |
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
| Self-hosting misconfiguration | Public admin surfaces or weak TLS | secure defaults; startup validation; reverse-proxy guidance | deployment scan and runbook exercise |
| Schema/RLS drift | Silent widening or breakage | dedicated facade; response schema fail-closed; compatibility probe | staging contract suite |
| Stale remote state | Incorrect user conclusions | freshness fields; no action acknowledgement claim | sync semantics from Promethee |
| Unapproved branding/interface use | Legal and trust harm | private repo; publisher sign-off; explicit unofficial status | written ownership and branding decision |

## MCP-specific considerations

- Validate the `Origin` header as required by the Streamable HTTP transport.
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

- Any write or timer-control tool is proposed.
- Promethee authorizes additional tables or personal data categories.
- Content caching or replication is added.
- Multi-region or multi-operator hosting is introduced.
- MCP authorization or transport specifications change.
- A security incident or RLS defect is discovered.
