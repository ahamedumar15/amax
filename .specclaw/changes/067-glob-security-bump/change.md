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
- [x] `T2` — Run `pnpm build`, the OpenNext build and `pnpm test --force`; confirm CI green (AC-2, AC-3)
  Files: none
  Depends: T1

## Verify

**Verdict:** PASS

- AC-1: pass — `pnpm-lock.yaml` resolves `glob@10.5.0` and `glob@13.0.6` only; `pnpm why glob -r` shows no 10.2–10.4.x. Lockfile diff is glob, jackspeak 2.3.6 → 3.4.3, plus package-json-from-dist.
- AC-2: pass — `turbo run build --force` exit 0; `turbo run test --force --concurrency=2` exit 0 (35/35); `pnpm --filter @amax/web build:cloudflare` exit 0 ("OpenNext build complete"); `pnpm lint` exit 0 (graph check ok). CI pending on the PR.
- AC-3: pending — the alert closes once the PR merges and Dependabot rescans.

Notes:
- First test runs at default concurrency hit 5 s timeouts in `@amax/auth` password hashing and `@amax/testing` ac3-boundaries, with host load average at 40 on 8 cores. Both pass alone and at `--concurrency=2`. glob is build-only, so neither failure touches it.
- `specclaw-preset-check .` exit 1: every violation is the repo-wide `comment` rule in existing source; none in package.json or pnpm-lock.yaml.
- Quality: not_run. `specclaw-quality-scan` fails with jq "Argument list too long" (same as 066). This change has no source code, so no duplicates are possible.
- Screenshots: none. The change has no UI ("No screen change").
- specclaw-review: not run. Review runs once per module end (operator rule), and this is a dependency bump.
