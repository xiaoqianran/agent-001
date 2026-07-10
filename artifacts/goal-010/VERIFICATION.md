# GOAL-010 verification

Date: 2026-07-10

## Commands

```bash
pnpm test
# explain unit + integration + observer /explain green

pnpm regression
# still ALL PASS

pnpm exec tsx apps/sim-cli/src/cli.ts explain \
  --scenario commons-cabin --days 3 --seed 42 \
  --from-highlight-kind conflict --out {SCRATCH}/explain.json
# found: true, links non-empty
```

## Query forms shipped

- tick + agent
- action-line (exact / substring)
- proposalId
- highlightKind / highlightId

## No secrets

Stub only; no API keys in new files.
