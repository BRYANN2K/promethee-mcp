# Components

## Inventory

| Component | Product need | Source primitive | Variants | Status |
|---|---|---|---|---|
| ConnectionCard | Hold the complete personal connection journey | `main`, `article`, `form` | email, code, connected, blocking | review |
| ProductMark | Identify this integration without copying Promethee assets | original CSS/SVG mark | default, confirmed | review |
| RetentionChoice | Choose seven-day encrypted renewal or no renewal before login | `fieldset`, `legend`, native radios | loading, 7 days, Never, unavailable | review |
| EmailCodeFlow | Complete the sequential passwordless flow | labels, inputs, buttons | email, code, pending, invalid, failed | review |
| ConnectionResult | End setup without opening another product surface | status region | 7 days, Never | review |
| ConsentRequest | Support a separate publisher OAuth allow/deny decision | `article`, sections, actions | requested, pending, denied, error | review |
| IdentityRow | Separate client, resource, and return context | description-list row | client, resource, return | review |
| DataAccessRow | Explain one OAuth or MCP permission group | list item | identity, read, create | review |
| InlineStatus | Explain loading, success, warning, or error | status paragraph | progress, success, warning, error | review |
| ActionButton | Submit or recover | `button` | primary, secondary, quiet | review |

## Component contracts

### ConnectionCard

- Purpose: give one operator one complete, bounded connection journey.
- Non-purpose: settings area, dashboard, account center, marketing page, or OAuth consent surface.
- Anatomy: centered product mark and label, one `h1`, one-sentence explanation, retention choice, email/code flow, live result, privacy/support footer.
- Composition: maximum 560px; one matte surface; no side panel, step rail, nested card wall, social login, decorative illustration, or secondary navigation.
- State: preference loading, email, code, connected, dependency blocked.
- Responsive: 40px inner padding wide, 24px narrow, 16px minimum page gutter; no horizontal overflow at 320px or 200% zoom.
- Accessibility: one main landmark, one `h1`, logical native-form order, skip link in product, no focus trap.

### RetentionChoice

- Purpose: decide before authentication whether the resulting session may survive restart.
- Non-purpose: arbitrary TTL editor, token viewer, grant manager, or post-login settings page.
- Anatomy: `Renew this session` legend; two equal native-radio labels; value, consequence, and visible selected cue.
- Values: `seven-days` displayed as `7 days`; `memory` displayed as `Never`.
- Interaction: load the current server value before enabling Send code; preserve the draft through code delivery/resend; save it after successful OTP verification and before pairing. A failed save prevents pairing.
- Security: `Never` removes token material but may preserve the non-secret preference; never render token, subject, key, session ID, deadline, or file path.
- Accessibility: grouped radios, full-row labels, visible focus, checked state plus visible text, consequence not conveyed by color alone.

### EmailCodeFlow

- Purpose: authenticate through one sequential Promethee email-code flow and pair the MCP.
- Non-purpose: account creation, password login, social login, or token import.
- Anatomy: visible email label/input/help; Send code; in-place code delivery status; visible code label/input; Change email and Send a new code recovery; one primary button; live status.
- Bounds: email 254 characters; code exactly six ASCII digits.
- Interaction: send email with `shouldCreateUser: false`; reveal code only after delivery; verify only `email`; save retention; pair session; replace the form with ConnectionResult only after pairing succeeds.
- Failure: clear rejected code; keep email and retention; classify invalid/expired, rate-limited, unavailable, settings, and pairing failures without exposing provider prose.
- Accessibility: `autocomplete=email`, `autocomplete=one-time-code`, `inputmode=numeric`, associated errors, first invalid focus, duplicate submit disabled, pending/results announced.
- Security: no credential logging, analytics, URLs, preview requests, or MCP-client exposure; clear tab auth after failed identity verification.

### ConnectionResult

- Purpose: confirm the actual MCP bridge result and let the user leave.
- Anatomy: confirmed mark, `Connected`, one retention-specific consequence, `You can close this page.`
- State: 7-day or Never copy derived from the response-confirmed server choice.
- Forbidden: dashboard links, token copy, fake metrics, task previews, or “all secure” claims.

### ConsentRequest

- Purpose: make one future publisher OAuth/MCP access decision understandable.
- Non-purpose: personal connection, retention choice, token display, or implicit approval after login.
- Anatomy: client identity, resource, return context, identity scopes, separate read/create permissions, mutation consequence, deny/allow actions, live result.
- State: requested, allowing, denied, success/redirect pending, invalid/expired.
- Accessibility: safe DOM action order, status announcement, no automatic focus on Allow.
- Security: raw tokens/codes and full redirect query are never rendered; request details are server-validated.

### IdentityRow

- Purpose: distinguish requesting client, MCP resource, and return destination.
- Responsive: label stacks above value below 420px; long hosts wrap.
- Accessibility: description-list semantics; fixture state includes text.
- Failure: unknown or unregistered destination blocks approval.

### DataAccessRow

- Purpose: explain one identity/read/create permission consequence.
- Composition: identity, reads, create-project, and create-task remain visibly distinct; update/delete are never implied.
- Accessibility: decorative icon; full consequence text; unknown policy blocks approval.

### InlineStatus

- Purpose: announce state without a modal or toast stack.
- Variants: progress, success, warning, error.
- Accessibility: `role=status` for progress/success; alert semantics for blocking failures; no repeated announcement.

### ActionButton

- Purpose: express one explicit action and stable pending state.
- Variants: primary (Send code/Connect/Allow), secondary (Deny), quiet (Change email/resend).
- Size: 48px personal primary, 44px consent primary, 36px quiet minimum.
- Forbidden: glossy gradient, glow, bounce, spinner-only label, icon-only critical action.

## State matrix

| Surface | Default | Loading | Validation/error | Success/denial | Blocking |
|---|---|---|---|---|---|
| Connection | loaded retention + email | loading choice, sending, verifying, saving, pairing | invalid email/code, expired/rate-limited code, settings/pairing failure | Connected with exact retention consequence | settings or bridge unavailable disables form |
| Publisher consent | request details + both actions | Allowing, duplicate blocked | request error keeps context | announce result and registered return | invalid destination removes Allow |

## Composition coverage

- Personal journey: ConnectionCard, ProductMark, RetentionChoice, EmailCodeFlow, ConnectionResult, InlineStatus, ActionButton.
- Publisher journey: ConsentRequest, IdentityRow, DataAccessRow, InlineStatus, ActionButton.
- Explicit exclusions: separate Settings route, side context panel, dashboard navigation, analytics, token viewer, client manager, timer controls, password/social authentication.
