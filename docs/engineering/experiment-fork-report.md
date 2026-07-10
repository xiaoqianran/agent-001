# 实验分叉 fork + A/B 对照报告（GOAL-011）

## 概念

```text
parent checkpoint (tick=T)
   ├─ branch A: applyInstitution(patchA) → run +days → metricsΔ
   └─ branch B: applyInstitution(patchB) → run +days → metricsΔ
```

两侧从**同一父 checkpoint 反序列化**（深拷贝），经 `applyInstitution` / 可选 ControlRoom `inject` 后各自 `runDays`。  
报告中的 `freeRideWithdrawals` / `totalContributed` / 行动计数为 **fork 后增量**（去掉父历史共享部分），便于 A/B 对照。

## CLI

```bash
# 1) 落父检查点
pnpm sim run --scenario commons-cabin --days 2 --seed 42 \
  --param freeRiderCount=2 --param initialGranary=8 \
  --checkpoint ./ckpts/parent.json

# 2) 真分叉 + Markdown 报告
pnpm sim fork-compare \
  --from-checkpoint ./ckpts/parent.json \
  --days 4 \
  --a enforcementStrength=0 --a freeRidePenalty=0 --a label=low \
  --b enforcementStrength=0.9 --b freeRidePenalty=0.8 --b label=high \
  --report-out ./reports/fork-enforcement.md

# 无预置 checkpoint：内部 warmup 再 fork（报告 meta 含 warmupDays）
pnpm sim fork-compare \
  --scenario commons-cabin --seed 42 --warmup-days 2 --days 3 \
  --a enforcementStrength=0 --b enforcementStrength=0.9 \
  --report-out ./reports/fork-warm.md

# 双跑对照（非 fork）也可写同一渲染器报告
pnpm sim compare-params --scenario commons-cabin --seed 42 --days 5 \
  --a freeRiderCount=0 --b freeRiderCount=2 \
  --report-out ./reports/compare.md
```

## API

```typescript
import {
  forkAndRun,
  forkCompare,
  warmupAndForkCompare,
  buildCompareReport,
  renderReportMarkdown,
} from "@gss/sim"; // report helpers also from @gss/experiment

const { markdown, report, a, b } = await forkCompare({
  parent: "./ckpts/parent.json", // or CheckpointBundle
  days: 3,
  a: { enforcementStrength: 0, label: "A" },
  b: { enforcementStrength: 0.9, label: "B" },
});
// report.format === "gss-report@1"
```

### gss-report@1

- `meta`: scenario, seed, parentTick, daysAfterFork, labelA/B, optional warmupDays, mode  
- `paramsA` / `paramsB`  
- `metricsA` / `metricsB` + `diff`（来自 `buildCompareResult` / `diffMetrics`）  
- `notes`: 规则结论（如 freeRide / totalFood 方向）  
- 可选 highlights  

`renderReportMarkdown` 输出标题、meta 表、参数 JSON、指标 diff 表、Conclusion。

### Bundle 可选字段

`gss-bundle@1` 可含 `forkParentRef` / `branchLabel`（缺省不破坏 validate）。

## 偏差表

| 规格 | 实现 |
|------|------|
| HTML 报告 | 未做（P1） |
| OBSERVER_TOKEN | 未做 |
| explain 嵌入报告 | 未默认嵌入；highlights 采样可选 |
| compare-params | 支持 `--report-out`，mode=`compare-params` |

## 测试

- `packages/experiment/src/report.test.ts` — 纯渲染/diff  
- `packages/sim/src/fork.test.ts` — 真 parent 分叉 + 确定性 + warmup meta  
