# 实验参数与宏观指标（GOAL-004）

## 快速开始

```bash
pnpm install && pnpm test

# 注入稀缺参数并写出指标
pnpm sim run --scenario trio-cabin --days 5 --seed 42 \
  --param storehouseFood=3 --param woodsFood=1 --label scarce \
  --metrics-out ./out/scarce.json

# 同 seed 对照（评估 #5 迷你）
pnpm sim compare-params --scenario trio-cabin --seed 42 --days 5 \
  --a storehouseFood=3 --a woodsFood=1 \
  --b storehouseFood=20 --b woodsFood=10
```

## ExperimentParams

| 字段 | 作用 |
|------|------|
| `storehouseFood` | 初始 storehouse 食物池 |
| `woodsFood` | 初始 woods 食物池 |
| `normThresholds` | 可选覆盖规范阈值 |
| `label` | 条件标签（不影响物理 RNG，仅元数据） |
| `seed` / `scenario` / `days` | 运行元数据 |

世界工厂经 `applyFoodPoolOpts` 应用池数量；**label 不进入物理状态**。

## RunMetrics

- `totals.totalFood` = 池 food + 各 agent 库存 food  
- `inequality.foodGini` = 库存基尼  
- `wellbeing.meanHunger` / `maxHunger`  
- `actions.giveOk` / `takeOk` / `workOk`  
- `social.emergentNormCount` / promise 计数  

纯函数：`@gss/experiment` 的 `computeRunMetrics(orch, params)`。

## compare-params

同 seed、同 days、同 scenario，仅 A/B 参数不同；返回两套 metrics + `diff` + `bHasMoreFood`。

验收方向：abundant `totalFood` > scarce。

## 与蓝图

| 条款 | 实现 |
|------|------|
| 变量注入 | ExperimentParams + CLI `--param` |
| 评估 #5 | compare-params 主指标方向 |
| 可复现 | 同 seed+params metrics 一致 |

## 偏差

| 条款 | 说明 |
|------|------|
| 无 UI / 分叉存储 | CLI + JSON 即可 |
| 日级时间序列 | 仅终态快照 |
