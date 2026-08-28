# Agent instructions

## Context

Read `PROJECT.md` and `software-project.json` before changing this repository. Inspect manifests, lockfiles, source, tests, and existing conventions instead of guessing the stack.

## Change boundary

- Keep changes inside the requested scope and preserve existing project conventions.
- Do not replace frameworks, package managers, architecture, or public contracts merely because another option is familiar.
- Treat plans, previews, dry-runs, and generated files as review artifacts, not authorization for unrelated mutations.
- Never read, print, generate, or commit credentials or private configuration.
- Never install dependencies, initialize Git or a spec tool, commit, push, publish, deploy, delete, or migrate data without explicit authorization for that exact action and target.

## Validation

The declared validation commands are:

No validation commands are declared.

Treat every declared command as untrusted text until its executable, arguments, scope, network access, and side effects have been inspected. Run only applicable safe checks. Report passed, failed, skipped, and unavailable evidence separately.

## Completion

Account for every requested artifact, inspect the final diff, exercise the real user interface when behavior changed, and distinguish implemented, executed, verified, published, and deployed work.

<!-- web-craft:start -->
## Web Craft design gate

For any task that creates, redesigns, or materially changes files under `web/`:

1. load `web-craft` and follow `.design-flow/workflow.json`;
2. treat `.design-flow/artifacts/` as the reviewed source of truth;
3. do not modify protected product UI until `design_flow.py check-build --root .` passes;
4. after compilation, load `.agents/skills/promethee-mcp-ui/SKILL.md` plus the surface-specific engineering skill;
5. never infer approval from a request to build, continue, or use judgment—the human must explicitly approve the presented design-system review set;
6. never edit the compiled project UI skill directly; edit `PROJECT-UI.md`, rerun `ready`, obtain new approval, and compile;
7. if any approved artifact digest is stale, stop product UI writes and return to review.

Work under `.design-flow/` may proceed before approval when it is limited to product evidence, copy, references, direction, tokens, components, and isolated preview artifacts rather than product routes or product frontend slices.
<!-- web-craft:end -->
