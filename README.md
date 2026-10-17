# amax

An agent-native ERP for software and professional-services companies, covering delivery, people, payroll and money. Agents keep the records: commits log time, deployments move releases, and an inbox agent turns Teams and email into suggestions. People make the decisions. Every capability is an MCP tool with the same permissions as the UI.

**Live mock:** https://chan4lk.github.io/amax/ (the interactive mock is at `/mock/`)

## What's here

| Path | What it is |
|---|---|
| `PRODUCT.md` | Product brief: users, purpose, positioning, principles |
| `docs/roadmap.md` | Modules and phasing, from PSA to services ERP |
| `.specclaw/changes/001-amax-foundation/` | The first specclaw change: scope, 17 acceptance criteria, and `fixtures.md` (the single source of demo data) |
| `.specclaw/mock/index.html` | The interactive whole-app mock, built as one self-contained HTML file |
| `docs/reviews/` | Adversarial reviews of the mock |
| `app/` | A minimal Next.js 16 app that statically exports the landing page and serves the mock |

## Run locally

```bash
npm install
npm run dev        # http://localhost:3000, mock at /mock/
npm run build      # static export to out/
```

### Database (from change 003)

```bash
podman compose -f deploy/dev/compose.yaml up -d        # or docker compose
export DATABASE_MIGRATE_URL=postgres://amax:amax@127.0.0.1:5440/amax      # schema owner
export DATABASE_URL=postgres://amax_app:amax_app@127.0.0.1:5440/amax      # app role, RLS applies
export AUDIT_HASH_KEY=$(openssl rand -hex 32) CRON_SECRET=$(openssl rand -hex 16)
pnpm db:migrate
pnpm test          # DB tests run when DATABASE_MIGRATE_URL is set (required in CI)
```

The app still boots without a database; `/api/jobs/tick` answers 503 until one is configured.

GitHub Pages deploys from `main` through `.github/workflows/pages.yml`, with `BASE_PATH=/amax`.

All demo data is fictional (Lumen Labs, Maya Fernando and others). Client names are Microsoft sample companies.
