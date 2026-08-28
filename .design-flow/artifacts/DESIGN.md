# Design System

## Direction

The selected direction is **Single Pass**: one centered Promethee-dark connection card that contains the only durable choice and the complete email-code flow. It adapts the supplied unified sign-in reference's silhouette and hierarchy without copying its pale palette, password/social controls, glass effect, clouds, or artwork.

## Principles

1. One personal page, one outcome. Retention, email, code, and connection result stay in the same card.
2. Put consequence beside choice. `7 days` and `Never` explain restart behavior in-place.
3. Form before reassurance. The actual controls dominate; trust copy is one quiet footer line, not a second panel.
4. Stable silhouette. The card does not become a dashboard after login; success replaces the form in place.
5. Orange is interaction, not decoration. It marks selection, focus, and the primary action only.

## Reference adaptation

- Retained from the 998×1002 reference: one centered card occupying roughly 70% of the canvas width, a centered 56–72px identity tile, a title/body stack, full-width form controls, and one dominant button.
- Adapted for this product: 560px maximum card, 24px outer radius, 48px controls, 28–36px major vertical spacing, and Promethee's matte charcoal palette.
- Explicitly rejected: pale sky background, glass blur, cloud artwork, password field, forgot-password link, social providers, black glossy gradient button, and oversized 50px+ card radius.

## Visual language

- Foundation: near-black canvas with one low-contrast structural line behind a matte charcoal card.
- Signature: a centered 56px original sprout/connection mark in a raised square, followed by the `Promethee MCP` wordmark.
- Typography: platform system sans; 30px connection title, 15px body, 12–13px labels and option consequences.
- Shape: 12px controls, 16px option group, 24px connection card, full-width primary action.
- Depth: one restrained shadow and one neutral border; no glass, blur, glow, grain, decorative gradient, or ambient animation.
- Icons: original `currentColor` line SVGs only; email/code icons are decorative and labels remain visible.

## Color roles

- Canvas/chrome provide the dark Promethee context.
- Warm near-white is reserved for the title, selected values, and primary labels.
- Ember orange marks selected retention, focus, and primary action.
- Green appears only after the server confirms pairing.
- Red is limited to actionable validation or connection failure.
- Muted text never carries the only explanation of a retention consequence.

## Typography

- Connection title: 30px/1.15, weight 650, centered, maximum 5 words.
- Body: 15px/1.5, weight 450, centered, maximum 58 characters per line.
- Field/legend labels: 12px/1.3, weight 650.
- Option value: 14px/1.25, weight 650; consequence 11px/1.4.
- Mono is reserved for the six-digit code and publisher resource hosts.

## Layout

- Review chrome: 52px top bar exists only in `.design-flow/preview`.
- Personal product: one centered card, maximum 560px, with 40px desktop padding and 24px narrow padding.
- Card header: mark → product label → title → one-sentence consequence, centered.
- Form order: retention fieldset → email → code state → live status → primary action → recovery action → privacy/support footer.
- The retention selector is two equal columns inside one grouped control; it stacks only when consequences would wrap below two lines.
- At 520px the card uses 16px page gutters and 24px padding. At 320px no label, consequence, error, or action clips.
- Publisher consent remains a separate 600px route and does not share the personal card's retention controls.

## Components

- `ReviewBar` exists only in the isolated preview.
- `ConnectionCard` provides the centered product mark, message hierarchy, sequential form, and terminal success state.
- `RetentionChoice` is a native radio group inside the connection form; its server value loads before submit is enabled.
- `EmailCodeFlow` owns the sequential email/code states and one primary action whose label changes from `Send code` to `Connect`.
- `ConnectionResult` replaces the form only after both retention save and MCP pairing succeed.
- `ConsentRequest`, `IdentityRow`, and `DataAccessRow` remain limited to the separate publisher OAuth route.
- `InlineStatus` carries loading, success, or recovery without modal interruption.

## Form and interaction rules

- On load, fetch the server-owned retention choice; keep submission disabled until it succeeds.
- The selected radio is component draft state until verification. After a valid code, save the choice first; only then pair the verified session. If saving fails, do not pair.
- Send the email with account creation disabled. Reveal the code inside the same card only after delivery succeeds.
- Change email clears the code and returns to the email state. Resend preserves the retention choice.
- Verify exactly six ASCII digits as the `email` token type; never retry as signup.
- Personal success means the MCP pairing response succeeded; authentication alone is not enough.
- Publisher authentication and OAuth approval remain separate and cannot inherit personal connection semantics.

## Accessibility

- Native `fieldset`, `legend`, radios, labels, inputs, and buttons define the form.
- Primary controls are at least 48px; all secondary targets are at least 36px.
- `:focus-visible` uses a 2px ember outline with 2px canvas offset; focus is never suppressed.
- Selected retention has radio state, border, text, and a visible `Selected` cue—not color alone.
- Errors are associated with their field; pending and result copy use polite live regions.
- At 200% zoom, retention → email → code → primary → recovery remains the reading and focus order.
- Reduced motion makes state replacement immediate.

## State coverage

- Connection: loading preference, 7-day selected, Never selected, email default/invalid/sending, code sent/invalid/expired/rate-limited/verifying, settings failure, pairing failure, and connected.
- Publisher consent: requested, allowing, denied, success/redirect pending, invalid/expired.
- Shared: hover, focus-visible, pressed, disabled, dependency unavailable, 320px reflow, 200% zoom, and reduced motion.

## Data and security display

- Never display access tokens, refresh tokens, encryption keys, subject IDs, session identifiers, storage paths, full redirects, or task content.
- The personal card may state only the consequence proven by ADR-0007.
- `Never` means no token survives a server restart; it does not claim to revoke Promethee's upstream session.
- Publisher identity scopes and MCP permissions remain on the separate consent route.

## Quality gate

- The review snapshot must contain the unified personal connection card, code-entry transition, connected result, representative error states, and separate publisher consent.
- Product files under `web/` remain untouched until explicit snapshot approval and successful design-flow compilation.
- Real implementation evidence must include keyboard flow, 320px/200% reflow, reduced motion, invalid/expired code, settings failure before pairing, duplicate-action prevention, and console/network inspection.
