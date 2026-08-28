# Reference Ledger

## Product constraints

- Surface and journey: unified personal connection card plus a separate publisher authorization route.
- Content constraints: English review copy, one explicit retention choice, one sequential email/code form, terminal connection state, and separate publisher identity/read/create permissions.
- Accessibility: keyboard-first, visible focus, 200% zoom, reduced motion, email autofill/one-time-code compatibility, and non-color state cues.
- Brand constraints: Promethee's dark matte chrome, compact labels, orange action accent, green confirmed status, rounded panels, and restrained depth.

## Sources

### R1 — Promethee desktop home screenshot

- Exact source: user-provided conversation attachment dated 2026-08-26; no reusable file remains in the workspace.
- Creator: Promethee.
- Role: visual system, density, surface hierarchy, typography, and semantic color.
- Direct observations: base near `#171717`; chrome near `#222222`; panels near `#252525`; borders near `#383735`; primary text near `#F3F0EC`; orange near `#F0643A`; green near `#20C878`; matte surfaces without decorative gradients.
- Adaptation: one quiet authorization panel, a compact product lockup, and orange reserved for the active decision.
- No-copy boundary: no feed layout, profile, portraits, artwork, icons, or proprietary component code.
- Reuse: principle only.

### R2 — Promethee task and timer screenshots

- Exact source: user-provided conversation attachments dated 2026-08-26; no reusable file remains in the workspace.
- Creator: Promethee.
- Role: control geometry, compact spacing, focus accent, and short status language.
- Direct observations: 32–40px controls, rounded pills, 1px neutral strokes, orange selected marks, 6–12px internal gaps, and high-contrast key values.
- Adaptation: compact inputs, short labels, a single ember rail, and quiet inactive details.
- No-copy boundary: no timer outline, proprietary icon, exact popover geometry, or HUD interaction.
- Reuse: principle only.

### R3 — Supabase OAuth 2.1 flows

- URL: https://supabase.com/docs/guides/auth/oauth-server/oauth-flows
- Maintainer: Supabase.
- Role: authorization-code-with-PKCE sequence and custom consent information architecture.
- Direct observations: the UI receives an authorization identifier, preserves it through login, retrieves request details, and explicitly approves or denies.
- Adaptation: login states that authentication is not consent; consent shows the client, resource, redirect, requested identity scopes, and data boundary before actions.
- No-copy boundary: no Supabase dashboard layout, code sample, or branding.
- Reuse: protocol principle only.

### R4 — MCP authorization specification

- URL: https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization
- Maintainer: Model Context Protocol project.
- Role: protected-resource discovery, authorization-server relationship, and resource-bound tokens.
- Direct observations: the resource server advertises authorization servers; the client uses OAuth; the access token is intended for a specific MCP resource.
- Adaptation: the consent screen separates requesting client, authorization identity, MCP resource, and data permission.
- No-copy boundary: no protocol-site layout or illustration.
- Reuse: terminology and trust model only.

### R5 — WCAG 2.2

- URL: https://www.w3.org/TR/WCAG22/
- Maintainer: W3C Web Accessibility Initiative.
- Role: contrast, focus visibility, target size, reflow, errors, and reduced dependence on color.
- Adaptation: 2px warm focus outline, associated field errors, 44px primary controls, visible labels, and stacked narrow-screen actions.
- Reuse: normative constraints.

### R6 — Unified sign-in card reference

- Exact source: user-provided conversation attachment dated 2026-08-28, 998×1002 pixels.
- Creator: unknown; used as composition reference only.
- Role: personal connection silhouette, hierarchy, field rhythm, and single-action emphasis.
- Direct observations: one centered card about 720×870px; approximately 52px outer radius; a centered 100px identity tile; 64px stacked controls; 32–48px section gaps; centered title/body; one full-width primary action.
- Adaptation: one 560px matte Promethee-dark ConnectionCard, 24px radius, 56px original product mark, 48px controls, unified retention/email/code flow, and one changing primary action.
- No-copy boundary: no pale palette, clouds, glass blur, proprietary icon, password, forgot-password, social-provider buttons, glossy gradient, or source copy.
- Reuse: composition principle only.

## Synthesis

### Visual problem

- Decision to support: choose restart retention and authenticate once without a second personal settings surface.
- Current failure to avoid: a split, sparse admin-style layout makes a two-field connection feel like a dashboard and separates the retention consequence from login.

### Direction A — Single Pass

- Thesis: adapt Promethee's operational dark UI into one complete personal connection card.
- Hierarchy: product mark, direct title, restart-retention choice, sequential email/code controls, one primary action, one quiet trust line.
- Typography: system sans, centered 650-weight title, compact visible labels, mono only for the six-digit code.
- Geometry: 12px controls, 16px retention group, 24px panel, 1px matte borders.
- Color: charcoal foundation; orange for current step and primary decision; green only for confirmed success; red only for blocking failure.
- Signature: a centered original 56px sprout/connection mark identifies the integration without copying Promethee assets.
- Motion: 90–180ms feedback; no ambient movement; reduced motion is immediate.

## Selected direction

- Selection: Direction A, `Single Pass`, is presented for human review.
- Rationale: it keeps the real personal setup in one compact surface, preserves Promethee restraint, and adapts the user's reference without copying irrelevant authentication controls.
- Approval: absent until the human approves the generated snapshot hash.

## No-go list

- No side context panel, step rail, separate personal Settings page, dashboard, analytics, connection manager, or post-login navigation.
- No gradients, glows, glass blur, clouds, oversized artwork, or marketing hero treatment.
- No password/social method, hidden labels, invisible keyboard focus, or publisher consent inferred from personal login.
- No raw token, authorization code, full redirect URI, secret, or production endpoint in the interface.
- No claim that the preview is connected, official, or production-ready.
