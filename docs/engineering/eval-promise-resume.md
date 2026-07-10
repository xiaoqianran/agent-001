# 承诺断点续跑评估（GOAL-012 / 评估 #1 缩小版）

## 跑 eval

```bash
pnpm sim eval --case promise-resume --seed 42
pnpm eval --case promise-resume --seed 42
pnpm sim eval --suite core --out ./eval-report.json
```

- 输出 **JSON**（`gss-eval@1` 包装或 suite）
- `status=pass` → exit 0；`fail` → exit 1
- 默认 seed：`42`（与 `promise-fulfill` 测试一致）

## API

```typescript
import { runEvalCase, runEvalSuite, listEvalCases } from "@gss/sim";

const r = await runEvalCase("promise-resume", { seed: "42" });
// r.assertions, r.artifacts.usedRealCheckpoint === true
const suite = await runEvalSuite("core");
// suite.format === "gss-eval@1"
```

## `promise-resume` 流程

1. **Phase 1** `dyad-cabin` warmup（默认 3 日）→ 至少 1 条 pending/kept promise  
2. **`toCheckpoint`** 真序列化（须含 `memory` + `social`，format `gss-checkpoint@1`）  
3. **`fromCheckpoint` + runDays(resume)** 新实例（非连续同一 orch）  
4. 断言：时钟前进；phase1 promise id 未全丢；promise-class 记忆可 retrieve **或** social 仍持有 id  
5. 社会结果：全程 `kept≥1`，或 `broken` 且 trust↓/trace 可查  

## 断言 id

| id | 含义 |
|----|------|
| phase1.has_promise | warmup 后有 promise |
| checkpoint.format / has_memory / has_social | 检查点结构 |
| resume.fresh_instance / clock_advanced | 真 resume |
| resume.promises_not_lost | id 保留 |
| resume.memory_or_social | 记忆或 social |
| social_outcome.kept_or_broken | 履约或可解释违约 |

## 偏差表

| 规格 | 实现 |
|------|------|
| CI workflow 单独 step | 未加；由 `pnpm test` 覆盖 |
| regression 挂钩 | 未强制；可手动 `pnpm eval` |
| seed 重试 | suite 无显式 seed 时 runner 可试候选；CLI 指定 seed 则单跑 |

## 测试

`packages/sim/src/eval/eval.test.ts` 调用 shipped `runEvalCase`（禁止假绿）。
