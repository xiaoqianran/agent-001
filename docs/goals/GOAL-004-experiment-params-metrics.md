# GOAL-004：实验参数注入 + 宏观指标 + 对照跑（阶段 F 入口 / 评估 #5 迷你）

> 可直接作为下一条 `/goal` 正文使用（整份粘贴，或：`执行 docs/goals/GOAL-004-experiment-params-metrics.md`）。

---

## 一句话目标

在 **GOAL-001～003**（运行时、记忆/关系、规范涌现、trio 稀缺）之上，落地 **最小实验科学表面**：`institutionParams` / 场景参数可注入、运行后产出 **可复现的宏观指标快照**、支持 **同 seed 双条件对照**（评估 #5 迷你：改一个稀缺参数，指标有可解释差异），无 API key、无 Control Room UI。

**非目标：** 完整实验平台 UI、世界分叉 COW 文件系统、参数网格搜索集群、论文自动生成、实网 LLM 门槛、司法/市场全量。

---

## 前置依赖

- GOAL-001：TickOrchestrator、checkpoint、seed、solo-cabin  
- GOAL-002：memory/social、dyad-cabin  
- GOAL-003：NormTracker、trio-cabin、emergent_norm_count  
- 架构延续：Domain-first；Agent 永不写 World；Stub LLM；TypeScript monorepo；`docs/COMMIT_CONVENTION.md`；**禁止**提交密钥  

设计真源：蓝图 §8 Experiment、§11 变量注入/指标、评估 #5、PR-13/14 精神。

---

## 范围（In Scope）

### P0 — 实验参数（Institution / Scenario Params）

新增 `@gss/experiment`（或 `packages/sim` 内清晰子模块，**推荐独立包**便于边界）：

```typescript
interface ExperimentParams {
  seed: string;
  scenario: 'solo-cabin' | 'dyad-cabin' | 'trio-cabin';
  days: number;
  /** 稀缺旋钮：storehouse 初始食物 */
  storehouseFood?: number;
  /** woods 初始食物 */
  woodsFood?: number;
  /** 规范阈值覆盖（可选；默认生产阈值） */
  normThresholds?: { tFreq?: number; tActors?: number; windowTicks?: number };
  /** 标签：baseline | scarce | abundant | custom */
  label?: string;
}
```

- `createSimulation` / 场景工厂 **读取** params 覆盖世界初始池数量（不只是写死 5/2）  
- CLI：  
  ```bash
  pnpm sim run --scenario trio-cabin --days 5 --seed 42 \
    --param storehouseFood=3 --param woodsFood=1 --label scarce
  pnpm sim run --scenario trio-cabin --days 5 --seed 42 \
    --param storehouseFood=20 --param woodsFood=10 --label abundant
  ```
- 参数进入 checkpoint 与 run summary（可审计）

### P0 — 宏观指标快照（Metrics）

运行结束（或按日）计算 **纯函数指标**（无 LLM）：

| 指标 | 含义（最小） |
|------|----------------|
| `totalFood` | 世界池 + 各 agent 库存 food 之和 |
| `foodGini` | agent 持有 food 的基尼系数（0～1） |
| `meanHunger` / `maxHunger` | needs.hunger 统计 |
| `giveOkCount` / `takeOkCount` | 行动序列中成功 give/take 次数 |
| `emergentNormCount` | 已有 |
| `promiseKept` / `promiseBroken` | social promises 状态计数 |
| `ticks` / `days` / `seed` / `params` | 元数据 |

```typescript
interface RunMetrics {
  meta: { seed: string; scenario: string; days: number; label?: string; params: Record<string, unknown> };
  totals: { totalFood: number; agentCount: number };
  inequality: { foodGini: number };
  wellbeing: { meanHunger: number; maxHunger: number };
  actions: { giveOk: number; takeOk: number; workOk: number };
  social: { emergentNormCount: number; promiseKept: number; promiseBroken: number };
}
```

- `pnpm sim metrics --from-checkpoint ./ckpts/x.json` 或 run 结束默认打印/写 `--metrics-out ./out/metrics.json`  
- 单测：给定伪造 world/agent 状态，**真实** `computeRunMetrics` 输出可断言的 gini/totalFood  

### P0 — 对照跑（评估 #5 迷你）

- CLI 或 API：  
  ```bash
  pnpm sim compare-params --scenario trio-cabin --seed 42 --days 5 \
    --a storehouseFood=3 --b storehouseFood=20
  ```
- 同 seed、同 days、仅 params 不同；各跑一遍 pure-rule；输出两份 `RunMetrics` + **diff 摘要**（如 `ΔtotalFood`、`ΔfoodGini`、`ΔemergentNormCount`）  
- 验收夹具：固定 seed 下，**abundant 的 totalFood 显著高于 scarce**（或 gini/饥饿方向可解释）；测试驱动 shipped `compareParams` / 双跑函数，禁止手写假 diff  

### P0 — 与现有系统集成

- checkpoint 可选写入 `experimentParams` + 最后 `metrics`  
- 指纹逻辑 **不因** label 字符串变化而破坏同参可复现；params 影响世界初始则指纹应反映资源差异  
- 保持 stub 默认可复现  

### P1 — 文档

- `docs/engineering/experiment-params-metrics.md`：参数表、指标定义、对照示例、与评估 #5 映射、偏差表  
- README 快速开始增加 compare-params / metrics-out  

### 明确 Out of Scope

- Control Room / 上帝 UI  
- 世界分叉 COW 多分支存储  
- 网格搜索、贝叶斯优化  
- 因果图完整追溯 UI（DecisionTrace 已有则保持）  
- 完整制度文本立法流程  
- 实网 LLM 作为 pass gate  

---

## 验收标准（Acceptance Criteria）

1. **可运行：** `pnpm install && pnpm test`；`pnpm sim run --scenario trio-cabin --days 5 --seed 42 --param storehouseFood=3` 无 key exit 0。  
2. **参数生效：** 不同 `storehouseFood` 初始池数量在 world 中可测（单测读 world 快照）。  
3. **指标：** `computeRunMetrics`（或等价 shipped 函数）对真实 run/checkpoint 产出 JSON；含 totalFood、foodGini、emergentNormCount 等。  
4. **对照：** 同 seed 双条件比较 API/CLI 产出两套 metrics 与 diff；测试断言 scarce vs abundant 在 totalFood（或文档约定的主指标）上方向正确。  
5. **可复现：** 同 seed+同 params 双跑 metrics 一致（或权威指纹一致）。  
6. **文档 + conventional commits + 无密钥。**  
7. **边界：** experiment/metrics 不给 cognition 写 World 的路径；不引入 AutoGen/Crew。  

---

## 验证计划（Verification plan）

执行者自行跑并写入 `{SCRATCH}`：

1. `pnpm test` — 全绿；覆盖 params→初始池、metrics 计算、compare-params 方向断言  
2. `pnpm sim run ... --param storehouseFood=3 --metrics-out ...` — exit 0，metrics 文件存在  
3. `pnpm sim compare-params ... --a storehouseFood=3 --b storehouseFood=20` — exit 0，diff 可解释  
4. 同 seed 双跑一致性  
5. secrets 扫描  

---

## 建议实现顺序

1. `ExperimentParams` 类型 + 场景工厂应用 storehouseFood/woodsFood  
2. `computeRunMetrics` 纯函数 + 单测（含 gini）  
3. CLI：`--param`、`--metrics-out`、`compare-params`  
4. 对照夹具测试  
5. checkpoint 写入 params/metrics（可选但推荐）  
6. 文档与 commits  

---

## 完成定义（Definition of Done）

- 验收 1–7 满足  
- 偏差表写入 engineering 文档  
- 向用户说明：如何跑 scarce vs abundant 对照、指标含义、下一 goal 建议（GOAL-005：公共品/搭便车 vignette 或 DecisionTrace 因果导出）  

---

## 给用户的 /goal 粘贴版（短）

```
执行 docs/goals/GOAL-004-experiment-params-metrics.md

在 GOAL-001～003 之上落地最小实验层：
- ExperimentParams：可注入 storehouseFood/woodsFood 等，影响 trio/场景初始资源
- computeRunMetrics：totalFood、foodGini、饥饿统计、give/take 计数、emergentNormCount 等
- CLI：--param、--metrics-out；compare-params 同 seed 双条件对照（评估 #5 迷你）
- 测试：参数生效、指标可算、scarce vs abundant 主指标方向正确、同参可复现

架构延续：Domain-first，Agent 永不写 World；Stub LLM；TypeScript monorepo。
验证按该文档 Verification plan 留证；commit 遵循 docs/COMMIT_CONVENTION.md；禁止提交密钥。
```

---

## 建议再下一条（本 goal 完成后）

**GOAL-005：** 公共品（修路/共享粮仓）+ 搭便车 vignette；或 **实验包导出 gss-bundle@1** 与简单日级指标时间序列。  
