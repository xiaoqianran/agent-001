# GOAL-003 verification

- pnpm test: 42 passed
- NormTracker: threshold spawn, injected excluded from emergent_norm_count
- trio-cabin 5d seed=42: exit 0, 3 agents, legal places
- compare-seeds trio: equal true
- checkpoint 2d+resume 3d: social.norms present
- emergent_norm_count > 0: trio.test.ts with TEST_NORM_THRESHOLDS (documented)
- no sk- secrets
