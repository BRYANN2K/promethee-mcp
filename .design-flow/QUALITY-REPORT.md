# Quality Report

## Scope

- Surface/journey: packaged local `/login` shell served by the stdio MCP process; retention loading, email/code pairing, disconnected/connected boundary.
- Diff/baseline: `web/src/auth/personal-bridge.ts` now permits an exact same-origin loopback bridge in production; the approved visual composition and copy are unchanged.
- Approved artifact locators/digests: `.design-flow/workflow.json`, approved snapshot `4227597ce79a5aa5ebd128d218ea6b8f6746303c173ae1e668af26d896cdc9ba`.
- Viewports, roles, states, and environments: source/test coverage plus a fresh Aside Browser run at its 1600 CSS-pixel viewport; narrow viewport and browser zoom controls were unavailable.
- Required dimensions: truth/copy, retained design system, authentication state behavior, static runtime/security, package inclusion.

## Evidence

| ID | Dimension | Method/command | Locator/environment | Result | Fresh after final mutation? |
| --- | --- | --- | --- | --- | --- |
| E1 | Approved baseline | `design_flow.py check-build --root .` | `.design-flow/workflow.json` | PASS | yes |
| E2 | Product/data behavior | `cd web && npm run check` | 24 frontend tests, typecheck, and isolated Vite check build | PASS | yes |
| E3 | Product/data behavior | `npm run check` | 75 root tests, including same-process pairing | PASS | yes |
| E4 | Runtime/security | `tests/local-onboarding.test.ts` | loopback URL, auth gating, CSP, methods, traversal, same-process unlock | PASS | yes |
| E5 | Package | `npm pack --dry-run --json --ignore-scripts` | CLI plus `web/dist/index.html` and hashed assets | PASS | yes |
| E6 | Direction/composition | source diff against approved UI artifacts | no visual token, layout, component, motion, or copy change | PASS | yes |
| E7 | Browser/accessibility/runtime | Aside Browser snapshot, screenshot, keyboard traversal, console/request capture | 1600 px: real login card rendered; settings loaded; visible keyboard focus; zero console errors and failed requests | PASS | yes |
| E8 | Responsive/zoom | browser viewport and zoom controls | Aside page surface exposed neither viewport resizing nor zoom emulation | UNAVAILABLE | yes |
| E9 | Release-build safety | unconfigured `cd web && npm run build` plus before/after hashes | refused with exit 2 and preserved the configured `web/dist` bytes | PASS | yes |

## Findings

### F1 — Packaged login rendered the configuration-blocked state

- Severity: BLOCKER
- Dimension: Product and data behavior
- Locator: packaged `web/dist` loaded from `http://127.0.0.1:<port>/login`
- Violated contract or observable failure: the local Git+npx journey requires the unified email-code page, but the first browser run displayed `This authorization host is not configured.`
- Evidence IDs: E7, E9
- User/product impact: every fresh local install would receive a URL that could not authenticate.
- Smallest durable correction: rebuild the reviewed artifact with the browser-safe public client configuration and prevent unconfigured checks/builds from overwriting it.
- Disposition: fixed
- Recheck evidence: E2, E7, E9

## Dimension verdicts

| Dimension | Verdict | Evidence/findings |
| --- | --- | --- |
| Truth and copy | PASS | Approved copy is unchanged; E6. |
| Direction and composition | PASS | Approved visual system is unchanged; E1, E6. |
| Design system and states | PASS | No visual-system mutation; frontend state tests and rendered configured state pass; E2, E6, E7. |
| Product and data behavior | PASS | Same-process disconnected-to-connected flow, auth gating, and configured login render pass; E3, E4, E7, F1 fixed. |
| Motion | NOT_APPLICABLE | No motion change. |
| Accessibility and responsive | SKIPPED | Wide accessibility tree and focus evidence pass; narrow/zoom evidence remains unavailable; E7, E8. |
| Marketing/runtime/performance | PASS | Static artifact, headers, bounds, configured rendering, overwrite guard, and package inventory pass; E4, E5, E7, E9. |

## Final verdict

- Verdict: PASS_WITH_NOTES
- Blocking finding IDs: none; F1 fixed
- Residual major/minor/note IDs: none
- Evidence gaps: 320 px, 200% zoom, and reduced-motion browser execution were unavailable in this environment.
- Production, publication, role, browser, or device effects not performed: no live Promethee authentication/data call, no Git install from a pushed ref, no registry publication, no VPS deployment, no Windows execution.
