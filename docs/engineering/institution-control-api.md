# 制度旋钮与 Control Room API（GOAL-006）

## 快速开始

```bash
pnpm install && pnpm test

# 高执法跑 commons
pnpm sim run --scenario commons-cabin --days 5 --seed 42 \
  --param enforcementStrength=0.9 --param freeRidePenalty=0.8

# 执法高低对照（主指标：freeRideWithdrawals）
pnpm sim compare-params --scenario commons-cabin --seed 42 --days 5 \
  --a freeRiderCount=2 --a enforcementStrength=0 \
  --b freeRiderCount=2 --b enforcementStrength=0.9 --b freeRidePenalty=0.8

# 注入与时间线
pnpm sim inject --scenario commons-cabin --seed 1 --kind resource --payload '{"granaryDelta":2}'
pnpm sim timeline --from-checkpoint ./ckpts/x.json --out ./tl.json
```

## InstitutionParams

| 旋钮 | 作用 |
|------|------|
| `enforcementStrength` ≥0.5 | World：`withdraw_public` 要求该 agent 曾 contribute，否则 `NO_PERMISSION` |
| `contributionReward` | 认知：contribute 选项 +0.35×reward |
| `freeRidePenalty` | 认知：withdraw 选项 −0.55×penalty；并随 enforcement 再降 |
| `transparency` | `LocalObservation.publicLedger` 可见贡献账 |

## ControlRoomService（`@gss/control`）

- `getWorldView` / `getAgentView`
- `listTimeline` / `inject` / `freeze` / `resume`
- inject kinds: `resource` | `oracle_message` | `param` | `event`
- 资源注入仅经 `WorldAuthority.adjustGranaryStock` / `adjustPool`

## 主指标（验收）

**高执法 → freeRideWithdrawals 更低**（同 freeRiderCount=2）。

## Bundle

可选字段：`institutionParams`、`timeline`、`auditLog`（旧 bundle 仍可 validate）。
