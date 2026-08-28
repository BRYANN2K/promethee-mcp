# Product Story

## Evidence boundary

- Primary sources: `PROJECT.md`, `software-project.json`, `README.md`, ADR-0007, the authentication architecture, user-provided Promethee screenshots from 2026-08-26, and the user-provided unified sign-in reference from 2026-08-28.
- Implemented evidence: five bounded task/project MCP tools; explicit personal and publisher compositions; a real sequential Promethee email-code browser flow; an encrypted single-user session store with seven-day and memory-only modes; and synthetic production-boundary tests.
- Unknowns: Promethee publisher approval, official OAuth/RPC deployment, brand license, public product name, and live VPS compatibility.
- Forbidden material: desktop sessions, local Promethee databases, private IPC, credentials, customer content, production tokens, and invented production connectivity.

## Audience and context

- Primary audience: the single operator of a self-hosted Promethee MCP.
- Triggering situation: the operator opens one protected page to choose session renewal and connect with a Promethee email code.
- Job to be done: decide whether the server may restore the session for seven days, authenticate once, and leave with a clear connected result.
- Revisit behavior: a user who chose `Never` returns only after a restart; a user who chose `7 days` normally does not return until retention expires or authentication fails.
- Separate audience: a future registered publisher OAuth client continues to use a distinct consent route and is not mixed into the personal connection page.

## Product mechanism

- What this slice does: combines the personal retention choice, email entry, code verification, MCP pairing, and terminal signed-in state in one compact connection card.
- How it creates the outcome: the page first loads the server-owned retention choice, lets the user select `7 days` or `Never`, sends the code through the pinned Promethee identity origin, saves the retention choice, then pairs the verified session once.
- Why this approach differs: the user makes the only durable decision next to the authentication fields it affects; there is no post-login dashboard or settings detour.
- What it does not do: expose tokens, manage multiple users, show analytics, edit Promethee data directly, offer password/social login, or copy the desktop session.
- Non-fit: shared/multi-user hosting and deployments without the exact trusted HTTPS bridge and source-pinned identity origin.

## Story

- Recognition: “Choose how long this server may keep me signed in, then connect.”
- Central argument: personal MCP setup should feel like one deliberate handshake, not a miniature admin product.
- Proof: the backend stores only the selected preference in `Never` mode and one authenticated encrypted session for at most seven days in `7 days` mode.
- Main objection and response: “Will my token be shown or copied?” No token is rendered; the browser sends the verified session only to the configured MCP bridge.
- Primary action: `Send code`, then `Connect` in the same form.
- Success condition: the user sees `Connected` and can close the page without another setup step.

## Voice

- Tone: compact, direct, calm, and specific.
- Preserve: connect, email, code, seven days, never, signed in.
- Avoid: “get started”, “unlock”, “seamless”, “secure by design”, “review your permissions”, and other interchangeable onboarding language.
- Consequences are stated where the choice is made, not buried in a separate trust panel.

## Journey and measurement

- Entry: `/login` behind operator authentication.
- Primary journey: load server retention → choose `7 days` or `Never` → enter email → receive code → enter code → save choice → pair session → `Connected`.
- Failure journey: settings unavailable, invalid email, delivery failure, malformed/incorrect/expired code, rate limit, identity rejection, or bridge failure → preserve the user's choice and show one actionable recovery.
- Publisher journey: a valid OAuth request uses `/oauth/consent` separately and never reuses the personal connection card as implicit approval.
- Telemetry: none in this slice; never record email, code, session material, task content, or retention secrets.
