# Dependency updates: the six open Dependabot PRs in one change

**Change:** 040-dependency-updates · **Created:** 2026-10-17
**Lane:** Platform · **Module:** `package.json, apps/*, packages/ui, .github, Dockerfile, tsconfig.base.json` · **Depends on:** [001](../archive/001-amax-foundation/change.md)

## Problem

Six Dependabot PRs (#3–#8) were open, each touching the lockfile, so they conflict with one another and with every feature branch. Two need judgement rather than a merge button: TypeScript 7 changes compiler options, and the Docker bump goes to Node 25, a short-lived odd release.

## Mock Delta

None. No screen changes.

## Acceptance Criteria

1. **AC-1** One PR applies #4 (react/react-dom 19.3.0, wrangler 4.149.0), #5 (actions: checkout v7, setup-node v7, pnpm/action-setup v6, upload-pages-artifact v5, deploy-pages v5), #6 (@playwright/test 1.64.0) and #7 (TypeScript 7.0.2), and the six Dependabot PRs are closed pointing to it.
2. **AC-2** Node goes to **24 LTS** (Docker image, CI and Pages) instead of #3's Node 25, and `@types/node` to 24 instead of #8's 26, so types match the runtime. `dependabot.yml` ignores odd Node majors and `@types/node` majors from now on.
3. **AC-3** TypeScript 7 compiles the repo: `baseUrl` is gone from `tsconfig.base.json` (paths are now `./`-relative) and `types: ["node"]` is explicit, since TS 7 no longer pulls in `@types` automatically.
4. **AC-4** Everything still passes: `pnpm lint`, `pnpm test` (DB tests included), `pnpm build`, both e2e suites, the Cloudflare build, the mock site build, and the Docker image serves `/healthz` on Node 24.

## Tasks

- [x] `T1` — Apply the five updates, Node 24 LTS and `@types/node` 24; TypeScript 7 tsconfig changes; Dependabot ignore rules (AC-1, AC-2, AC-3)
  Kind: config
  Files: package.json, apps/web/package.json, apps/mock/package.json, apps/mock/tsconfig.json, packages/ui/package.json, tsconfig.base.json, Dockerfile, .github/**, pnpm-lock.yaml
- [x] `T2` — Verify every target and close the Dependabot PRs (AC-4, AC-1)
  Kind: test
  Depends: T1

## Verify

**Verdict:** PASS
- AC-1: pass — versions above in the manifests and lockfile; workflows use the new action majors.
- AC-2: pass — `Dockerfile` `node:24-alpine` (container reports v24.22.0), setup action and Pages use Node 24; `@types/node` 24; ignore rules added.
- AC-3: pass — `tsc` 7.0.2 lint clean across all 11 workspaces; Next's build type-check passes.
- AC-4: pass — `pnpm lint`, `pnpm test` (103 tests, Postgres), `pnpm build`, `e2e` (1) and `e2e:auth` (5) on Playwright 1.64, `build:cloudflare`, `@amax/mock` build, Docker `/healthz`.
