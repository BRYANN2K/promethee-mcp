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
