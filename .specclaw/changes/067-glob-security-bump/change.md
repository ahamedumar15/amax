# Fix the glob command-injection alert

**Change:** 067-glob-security-bump · **Created:** 2026-10-18

## Problem

Dependabot alert #1 (high): the `glob` CLI runs `-c/--cmd` matches with `shell: true`, so a crafted
filename can inject commands. Affects `glob` >=10.2.0 <10.5.0. We pull `glob@10.3.3` transitively,
build-time only: `@opennextjs/aws` → `@node-minify/core@9.0.2` → `glob`. No runtime path, but the alert
stays open until the lockfile resolves a patched version.

## Mock Delta

No screen change.

## Acceptance Criteria

1. **AC-1** `pnpm-lock.yaml` resolves no `glob` version in >=10.2.0 <10.5.0 (pin with a scoped
   `pnpm.overrides` entry, `"glob@>=10.2.0 <10.5.0": "^10.5.0"`, unless upstream bump removes it).
2. **AC-2** `pnpm build` (incl. the Cloudflare/OpenNext build) and `pnpm test --force` pass; CI green.
3. **AC-3** Dependabot alert #1 closes after merge.

## Tasks

- [x] `T1` — Add scoped `pnpm.overrides` for glob and regenerate the lockfile (AC-1)
  Files: package.json, pnpm-lock.yaml
- [ ] `T2` — Run `pnpm build`, the OpenNext build and `pnpm test --force`; confirm CI green (AC-2, AC-3)
  Files: none
  Depends: T1

## Verify
