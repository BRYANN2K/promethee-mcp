---
name: promethee-mcp-ui
description: Use when implementing or changing the approved Promethee MCP unified personal connection card or separate publisher OAuth consent surface. Enforces Single Pass tokens, exact retention/auth sequencing, states, accessibility, and repository boundaries.
license: UNLICENSED
metadata:
  version: "1.0.0"
  author: Promethee MCP
  category: project
  tags: ui, auth, oauth, mcp
---

# Promethee MCP UI

## Project contract

The approved `.design-flow/artifacts/DESIGN.md`, `.design-flow/artifacts/tokens.json`, and `.design-flow/artifacts/COMPONENTS.md` are the sources of truth. This file is generated into `.agents/skills/promethee-mcp-ui/SKILL.md`; edit and reapprove this source rather than the compiled copy.

- Surface: one unified personal connection page plus a separate future publisher OAuth consent route.
- Protected UI root: `web/`.
- Product routes: `/login` and `/oauth/consent` only for the current slice; do not add `/settings`.
- State ownership: retention and connection are MCP-server-owned; radio/email/code draft state is component-owned; publisher authorization request/client details remain publisher-server-owned.
- Data boundary: personal retention/authentication is separate from publisher OAuth identity/read/create permission review.

## Implementation rules

1. Personal `/login` contains retention, email, code, pairing, and connected result in one centered ConnectionCard. Do not add a side panel, settings page, dashboard, or post-login navigation.
2. Load `/connect/settings` before enabling Send code. Values are exactly `seven-days` and `memory`, displayed as `7 days` and `Never` with their restart consequences.
3. Preserve the selected retention through email and code states. After OTP verification, PUT the choice first and POST the session only after the settings response succeeds. A failed setting must prevent pairing.
4. Personal success may render only after MCP pairing succeeds. Authentication success or a saved setting alone is not `Connected`.
5. Publisher login/consent remains separate; authentication must not imply OAuth approval.
6. Reuse approved tokens/components and implement hover, focus-visible, pressed, disabled, pending, success, validation, invalid/expired code, rate limit, settings failure, pairing failure, and dependency-blocked states.
7. Never render raw tokens, codes after rejection, authorization values, service keys, full redirects, desktop sessions, task content, subject IDs, storage paths, or production credentials.
8. Keep browser auth per-tab, disable automatic durable browser refresh, clear local auth after failed identity verification, and clear the code after every rejected attempt.
9. Send one sequential Supabase email OTP with `shouldCreateUser: false`, verify only the `email` token type, and never retry as signup.
10. Production personal login requires an exact HTTPS MCP bridge configured at build time plus the source-pinned Supabase identity origin. Publisher OAuth additionally requires one valid authorization identifier.
11. Do not add analytics, password/social login, client management, token copy, revocation UI, project/task content, or timer surfaces.

### Verified libraries and conventions

- Native TypeScript/HTML/CSS with Vite `8.2.2`; no frontend framework, icon, router, form, state, or motion package is installed.
- Supabase browser authentication uses `@supabase/supabase-js` `2.112.4`; TypeScript is `7.0.2`; npm is `10.9.2`.
- The isolated preview is native HTML/CSS/JS and never makes a network request.
- Product login sends email/code only through the pinned Supabase SDK, then sends the verified session only to the exact MCP bridge.

### Prohibited drift

- No arbitrary visual values outside the token contract.
- No split auth layout, step rail, card wall, glass blur, glow, decorative gradient, ambient art, password field, social providers, or invisible focus.
- No claim of official status, live connectivity, arbitrary-host safety, or publisher approval.
- No new dependency or framework without separate authorization.
- No desktop-session extraction fallback.

## Verification

- Backend: `npm run check`.
- Frontend: `cd web && npm run check`.
- Browser: wide and 320px, 200% zoom, keyboard order, focus-visible, reduced motion, email autofill, one-time-code behavior, incorrect/expired/rate-limited code, settings failure before pairing, duplicate-action prevention, connected result, console, and network inspection.
- Preview evidence proves composition only, never authentication, persistence, RLS, live compatibility, or production deployment.
