# hello (sample module)

A minimal module that proves the platform's module contract: a folder under `modules/` with a `module.ts` manifest is discovered at build time and appears in the rail at `/hello`. Delete the folder and it is gone.

- **Owner:** platform team
- **Contracts:** `greeting()` in `contracts.ts`
- **Events:** none
- **Tests:** `pnpm --filter @amax/hello test`
