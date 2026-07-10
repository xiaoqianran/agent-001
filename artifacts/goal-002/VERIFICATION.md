# GOAL-002 verification summary

- `pnpm test`: 33 passed (incl. promise-fulfill: give:OK + promise.kept)
- Fix: `LocalObservation.selfInventory` + cognition gates give only when stocked; take/move ranked above give when empty
- `dyad-cabin` 5d seed=42: exit 0, 2 agents, legal places
- `compare-seeds` dyad: equal true
- checkpoint path covered by run.test.ts; memory/social in bundle
- secrets: no long sk- keys

Regression (skeptic): empty-inventory give spam eliminated; kept promises appear within 5 days.
