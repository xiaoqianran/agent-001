# GOAL-012 verification

```bash
pnpm test
pnpm regression
pnpm sim eval --case promise-resume --seed 42 --out {SCRATCH}/eval-promise.json
```

- Result format `gss-eval@1`, status pass
- Assertions include checkpoint + resume + social outcome
- `artifacts.usedRealCheckpoint === true`
