# 公共品与实验包（GOAL-005）

## 快速开始

```bash
pnpm install && pnpm test

pnpm sim run --scenario commons-cabin --days 5 --seed 42 --metrics-out ./out/m.json
pnpm sim compare-params --scenario commons-cabin --seed 42 --days 5 \
  --a freeRiderCount=0 --a label=cooperative \
  --b freeRiderCount=2 --b label=free-ride
pnpm sim export-bundle --scenario commons-cabin --days 5 --seed 42 --out ./bundles/run.json
pnpm sim inspect-bundle --in ./bundles/run.json
```

## 公共品 granary

- 状态：`WorldState.publicGoods.granary`（`stock`、`contributors`、`withdrawals`、`totalContributed`、`totalWithdrawn`）
- **与私有 `isPool` 食物池分离**，不混用
- 行动（经 `WorldAuthority.validate/apply`）：
  - `contribute`：个人 inventory food → public stock（须在 granary.placeId）
  - `withdraw_public`：public stock → 个人 inventory（搭便车）

## commons-cabin

| 角色 | freeRiderCount | 倾向 |
|------|----------------|------|
| Alice | always | cooperative（contribute） |
| Bob | ≥1 | free_rider |
| Carol | ≥2 | free_rider，否则 neutral |

参数：`initialGranary`、`storehouseFood`、`woodsFood`、`freeRiderCount`。

## 指标

`RunMetrics.publicGoods`：

- `publicStock`、`totalContributed`、`freeRideWithdrawals`、`granaryLevel`
- `actions.contributeOk` / `withdrawPublicOk`

**对照主指标：** free-ride 条件的 `freeRideWithdrawals` **>** cooperative。

## gss-bundle@1

```json
{
  "format": "gss-bundle@1",
  "experimentParams": {},
  "seed": { "value": "42" },
  "metrics": { "publicGoods": {} },
  "dailyMetrics": [{ "day": 0, "totalFood": 0, "publicStock": 0, "meanHunger": 0 }]
}
```

## Checkpoint

`world.publicGoods` 随 world 快照一并序列化。

## 偏差

| 条款 | 说明 |
|------|------|
| 无完整税制 | 仅粮仓公共品 |
| 日级序列 | 按 day 变化采样，非 wall-clock |
