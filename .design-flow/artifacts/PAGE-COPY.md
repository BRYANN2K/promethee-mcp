# Page Copy

## Surface contract

- Product routes: `/login` and `/oauth/consent`; the review uses a non-routed isolated preview.
- Personal audience: the single operator connecting a self-hosted MCP.
- Personal primary action: choose retention, send the email code, then connect on the same page.
- Publisher primary action: explicitly allow or deny one registered OAuth request on the separate consent route.
- Supporting claim IDs: C2, C4, C5, C10, C11, C12.

## Message hierarchy

### Personal connection

- Product label: `Promethee MCP`
- Heading: `Connect to Promethee`
- Body: `Choose how long this server can keep you signed in, then use the code sent to your email.`
- Retention legend: `Renew this session`
- Seven-day option: `7 days`
- Seven-day detail: `Restore the connection after a restart.`
- Memory option: `Never`
- Memory detail: `Keep it only until this server stops.`
- Loading retention: `Loading your current choice…`
- Retention unavailable: `Session renewal is unavailable. Connection is paused.`
- Email label: `Email`
- Email placeholder: `you@example.com`
- Email help: `We’ll send a six-digit code. No account will be created.`
- Send-code action: `Send code`
- Code-sent title: `Code sent`
- Code-sent detail: `Enter the latest code from your email.`
- Change-email action: `Change email`
- Code label: `6-digit code`
- Code placeholder: `000000`
- Verify action: `Connect`
- Resend action: `Send a new code`
- Pending delivery: `Sending code…`
- Pending verify: `Connecting…`
- Invalid email: `Enter a valid email address.`
- Invalid code: `Enter the six-digit code.`
- Incorrect or expired code: `This code is incorrect or has expired.`
- Incorrect-code recovery: `Enter the latest code or send a new one.`
- Rate limit: `Too many attempts. Wait a moment, then send a new code.`
- Verification unavailable: `Promethee could not verify this code. Nothing was connected.`
- Settings failure: `Your renewal choice could not be saved. Nothing was connected.`
- Pairing failure: `The MCP could not accept this session. Try again.`
- Signed-in title: `Connected`
- Signed-in body, seven days: `This server can restore your session for up to 7 days.`
- Signed-in body, never: `This session ends when the server stops.`
- Signed-in close guidance: `You can close this page.`
- Privacy line: `Your code goes to Promethee. Tokens are never displayed here.`
- Support line: `Like my work? Follow @bryann2k_dev on X.`
- Preview note: `Design preview · no live connection`

### Publisher OAuth consent

- Eyebrow: `CONNECTION REQUEST`
- Heading: `Claude Desktop wants to connect.`
- Body: `Review the identity and data boundaries before you decide.`
- Client label: `Requesting client`
- Client fixture: `Claude Desktop`
- Resource label: `MCP resource`
- Resource fixture: `mcp.example.test`
- Redirect label: `Returns to`
- Redirect fixture: `Registered client address`
- Identity section: `Identity shared`
- Identity value: `Basic account identity (openid, email)`
- Data section: `Promethee data access`
- Read value: `Read tasks and projects`
- Project create value: `Create projects`
- Task create value: `Create tasks`
- Primary action: `Allow requested access`
- Secondary action: `Deny`
- Mutation note: `Create actions change your Promethee data. Each action still requires its own scoped tool call.`
- Approving: `Allowing…`
- Denied result: `Request denied. Nothing was shared.`
- Request error: `This request is invalid or expired. No access was granted.`

## Interface microcopy

| Context | Message | User action | Source |
|---|---|---|---|
| Review navigation | `Connection`, `Publisher OAuth`, `States` | Inspect isolated design states | Review artifact only |
| Retention consequence | `Restore after restart` / `Until this server stops` | Choose before authentication | ADR-0007 |
| Loading | `Loading your current choice…` | Wait without submitting | Server-owned setting |
| Success | `Connected` | Close the page | Personal bridge result |
| Preview | `Design preview · no live connection` | Distinguish review from product | C2 |

## Public-page metadata

- Login title: `Promethee MCP — Connect`
- Consent title: `Promethee MCP — Review connection`
- Meta description: `Connect a self-hosted Promethee MCP with an email code.`
- Indexability: both routes are `noindex, nofollow`.
- Heading outline: one `h1` per surface; grouped controls use `fieldset` and `legend`.
- Structured data: none.
