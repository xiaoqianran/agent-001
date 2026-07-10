# GOAL-011 verification

## Commands

```bash
pnpm test
pnpm regression

pnpm sim run --scenario commons-cabin --days 2 --seed 42 \
  --param freeRiderCount=2 --param initialGranary=8 \
  --checkpoint {SCRATCH}/parent.json

pnpm sim fork-compare --from-checkpoint {SCRATCH}/parent.json --days 4 \
  --a enforcementStrength=0 --a freeRidePenalty=0 --a label=low \
  --b enforcementStrength=0.9 --b freeRidePenalty=0.8 --b label=high \
  --report-out {SCRATCH}/fork-report.md

pnpm sim compare-params --scenario commons-cabin --seed 42 --days 5 \
  --a freeRiderCount=0 --b freeRiderCount=2 \
  --report-out {SCRATCH}/compare-report.md
```

## Notes

- Fork metrics are post-parent deltas for freeRide/contribute/actions.
- Report format `gss-report@1`; renderer shared with compare-params.
