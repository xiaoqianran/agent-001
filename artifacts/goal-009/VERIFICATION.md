# GOAL-009 verification

Date: 2026-07-10

## Commands

```bash
pnpm test
# → 24 files / 92 tests pass (see scratch test.log)

pnpm regression
# → ALL PASS ~392ms; 5 cabin smokes + determinism + scarce direction

pnpm sim highlights --scenario assembly-cabin --days 5 --seed 42
# → JSON array with conflict + policy_passed (+ norm_emerged)

pnpm sim run --scenario commons-cabin --days 3 --seed 42 --highlights-out ./hl.json
# → highlightCount > 0, file is JSON array
```

## CI

`.github/workflows/ci.yml`: `pnpm install --frozen-lockfile`, `pnpm test`, `pnpm regression`, `GSS_LLM=0`, no secrets.

## Notes

- Stub LLM only; no API keys in repo.
- Engineering: `docs/engineering/ci-regression-highlights.md`
