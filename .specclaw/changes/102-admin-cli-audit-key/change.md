# Admin CLI audit key

**Change:** 102-admin-cli-audit-key · **Created:** 2026-11-12

## Problem

`pnpm --filter @amax/auth admin principal-add` and `admin user-deactivate` crash before they do anything, with
"amax: configureRuntime({ db, auditKey }) before writing to the audit or trace chain". Both write an audit entry, but
`packages/auth/bin/admin.ts` opens the database without ever configuring the runtime's audit key. So nobody can create
a service principal from the CLI (the specclaw sync principal is the file's own example), or deactivate a user from it.

## Mock Delta

What changes on screen, and where to see it: [`102-admin-cli-audit-key`](../../mock/index.html#102-admin-cli-audit-key)

No screen changes. The section shows the CLI's output for `principal-add` before (the crash) and after (the principal and
its token), and the message it gives when `AUDIT_HASH_KEY` isn't set.

## Acceptance Criteria

1. **AC-1** With `DATABASE_MIGRATE_URL` and `AUDIT_HASH_KEY` set, `admin principal-add` creates the principal, prints
   its id and its token once, and writes the principal's audit entry, which verifies on the audit chain.
2. **AC-2** With the same variables, `admin user-deactivate` deactivates the user and writes its audit entry.
3. **AC-3** Every command that writes an audit entry (`principal-add` and `user-deactivate`) refuses to start when
   `AUDIT_HASH_KEY` is unset, with the message "set AUDIT_HASH_KEY (the deployment's audit key)", and exits non-zero
   before anything is written. `tenant-add`, `user-add` and `scim-token` keep working without it.
4. **AC-4** After its command finishes, the CLI exits on its own: it doesn't hang on an open database connection.
5. **AC-5** The usage comment at the top of `admin.ts` and the README's sign-in section name `AUDIT_HASH_KEY` for the
   commands that need it.

## Tasks

No UI: the change is the admin CLI only (the mock section shows its output).

- [x] `T1` — Admin CLI configures the runtime with `AUDIT_HASH_KEY` before `principal-add` and `user-deactivate`, and refuses them without it before connecting or writing (AC-1, AC-2, AC-3, AC-4)
  Files: packages/auth/bin/admin.ts
- [x] `T2` — Test the CLI as a process against the test database: both commands succeed with the key and their audit entries verify on the chain, both exit non-zero with the message and write nothing without it, the other three commands still run without it, and each run exits on its own within a timeout (AC-1, AC-2, AC-3, AC-4)
  Files: packages/auth/tests/admin-cli-102.test.ts
  Depends: T1
- [x] `T3` — Name `AUDIT_HASH_KEY` for those two commands in the CLI's usage comment and the README's sign-in section (AC-5)
  Files: packages/auth/bin/admin.ts, README.md
  Depends: T1

## Verify

Quality: not_run (`specclaw-quality-scan` fails on Windows: jq "Argument list too long"). `specclaw-preset-check`
flags none of this change's files; it fails repo-wide on existing files, which this change doesn't touch.

<!-- Filled by verify: a **Verdict:** PASS|FAIL line, then one `- AC-n: pass|fail — evidence`
     line per criterion, quality before → after, preset check, and screenshot paths
     (or "compared by eye: <who>"). -->
