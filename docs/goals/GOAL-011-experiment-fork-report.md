# GOAL-011：实验分叉 fork + A/B 对照报告（实验包 v2）

> 可直接作为下一条 `/goal` 正文使用（整份粘贴，或：`执行 docs/goals/GOAL-011-experiment-fork-report.md`）。

---

## 一句话目标

在 **GOAL-001～010**（参数对照、gss-bundle@1、制度注入、explain、CI）之上，把实验平台从「双跑 metrics JSON」升级为 **可分叉续跑 + 可读对照报告**：支持从 **checkpoint 分叉**（同父状态、不同旋钮/注入后各自推进），产出 **Markdown（优先）/ 可选 HTML** 对照报告（含关键 metrics diff、参数表、可选高光/ explain 摘要）；可测、可复现、无密钥。

**非目标：** 多世界实时同步 UI、完整因果图前端、云端实验队列、强制 LLM 写报告、全量 30 日 fork 矩阵。

---

## 前置依赖

- GOAL-004/005：`compareParams`、`gss-bundle@1`、export-bundle  
- GOAL-006：ControlRoom inject / institution  
- GOAL-009/010：highlights、explain（报告中可选引用）  
- Runtime：`toCheckpoint` / `fromCheckpoint`  
- 架构延续：Domain-first；分叉后写路径仍经 World 权威；Stub LLM；`docs/COMMIT_CONVENTION.md`；**禁止**提交密钥  

---

## 范围（In Scope）

### P0 — Checkpoint 分叉（fork）

概念：

```text
parent checkpoint (tick=T)
   ├─ branch A: applyParamPatch_A / inject_A → run +days
   └─ branch B: applyParamPatch_B / inject_B → run +days
```

API 建议（命名可微调，须导出且可测）：

```typescript
interface ForkSpec {
  /** path or in-memory CheckpointBundle */
  parent: CheckpointBundle | string;
  /** extra simulated days after fork */
  days: number;
  /** ExperimentParams / InstitutionParams overrides */
  paramPatch?: Partial<ExperimentParams>;
  /** optional one-shot inject at fork boundary */
  inject?: { kind: string; payload: Record<string, unknown> };
  label?: string;
}

interface ForkRunResult {
  label: string;
  parentTick: number;
  finalTick: number;
  metrics: RunMetrics;
  checkpoint?: CheckpointBundle;
  highlights?: NarrativeHighlight[];
}

function forkAndRun(spec: ForkSpec): Promise<ForkRunResult>
// or forkPair(parent, { a, b }) → { a, b, compare }
```

约束：

1. 两分支必须从 **同一父 checkpoint 反序列化**（禁止各自分开 createSimulation 冒充分叉，除非文档明确「伪分叉=双跑」且测试区分）。  
2. `paramPatch` / `inject` 生效须走已有权威路径（`applyInstitution` / ControlRoom.inject / 创建时 institution）。  
3. 同 parent + 同 patch + 同 seed 确定性（双跑 fingerprint 或 metrics 一致）。  

CLI：

```bash
# 先落父检查点
pnpm sim run --scenario commons-cabin --days 2 --seed 42 --checkpoint ./ckpts/parent.json

# 分叉对照续跑
pnpm sim fork-compare \
  --from-checkpoint ./ckpts/parent.json \
  --days 3 \
  --a enforcementStrength=0 \
  --b enforcementStrength=0.9 \
  --report-out ./reports/fork-enforcement.md
```

可选简写（无预置 checkpoint 时）：内部先跑 `warmupDays` 再 fork——须在报告 meta 标明 warmup。

### P0 — 对照报告（Markdown 优先）

```typescript
interface ExperimentReport {
  format: 'gss-report@1';
  title: string;
  createdAt: string;
  meta: {
    scenario: string;
    seed: string;
    parentTick?: number;
    daysAfterFork: number;
    labelA: string;
    labelB: string;
  };
  paramsA: Record<string, unknown>;
  paramsB: Record<string, unknown>;
  metricsA: RunMetrics;
  metricsB: RunMetrics;
  diff: CompareResult['diff'] & Record<string, number>; // 可扩展
  notes?: string[];
  /** optional */
  highlightsA?: NarrativeHighlight[];
  highlightsB?: NarrativeHighlight[];
  sampleExplains?: EvidenceChain[];
}

function buildCompareReport(...): ExperimentReport
function renderReportMarkdown(report: ExperimentReport): string
// P1: renderReportHtml(report): string
```

报告 MD 至少包含：

1. 标题与 meta（scenario / seed / parentTick / days）  
2. 参数表 A vs B  
3. 关键指标表 + diff（totalFood、meanHunger、publicStock、freeRideWithdrawals、proposalsPassed 等已有字段）  
4. 一行结论模板（规则生成，如 `B freeRideWithdrawals lower than A by N` 或 `B has more food`）  
5. 可选：各分支 highlight 计数 / 最多 3 条摘要  

CLI：

```bash
pnpm sim compare-params --scenario commons-cabin --seed 42 --days 5 \
  --a freeRiderCount=0 --b freeRiderCount=2 \
  --report-out ./reports/freerider.md

# 已有 JSON compare 结果也可：
pnpm sim report --a-metrics ./a.json --b-metrics ./b.json --out ./r.md
```

（若 `report` 子命令成本高，可仅在 `fork-compare` / `compare-params` 增加 `--report-out`。）

### P0 — 与 bundle 的衔接

- fork 两端可各自 `export-bundle` 或报告内嵌 metrics（不必新 format 强制）  
- 可选：`gss-bundle@1` 增加可选字段 `forkParentRef` / `branchLabel`（**向后兼容**；validate 不因缺字段失败）  

### P0 — 测试

1. **单元：** `renderReportMarkdown` 对固定 `ExperimentReport` fixture 含标题、diff 数字、两 label。  
2. **集成：** 真实 parent checkpoint → fork A/B（如 enforcement 0 vs 0.9）→ 报告文件非空；主指标方向与既有 institution 测试一致（或可解释）。  
3. **确定性：** 同 parent 文件 + 同 A patch 双跑 metrics 一致（或 fingerprint）。  
4. 禁止 theater：报告数字必须来自真实 `computeRunMetrics` / `compare` 路径。  

### P1 — 可选增强

- 简单 HTML 报告（单文件、无构建链）  
- 报告中对 B 的某条 conflict 调用 `explain` 嵌入 1 段 EvidenceChain 摘要  
- `OBSERVER_TOKEN` 写路径最小鉴权（010 未做）  

### 明确 Out of Scope

- 交互式分叉树浏览器  
- 多分支 >2 的完整实验设计器  
- 分布式 runner  
- LLM 自动撰写论文式报告  

---

## 与蓝图评估的映射

| 评估 # | 本 goal 贡献 |
|--------|----------------|
| 5 制度→宏观 | fork 后 institution 对照 + 报告可读 |
| 8 同种子可复现 / 分叉可对比 | **主交付**：真 checkpoint fork + 报告 |
| 7 可追溯 | 可选嵌入 explain/highlights |

---

## 验收标准（Acceptance Criteria）

1. **真分叉路径存在：** 从同一 parent checkpoint 加载两次，分别应用不同 patch 后 `runDays`，导出两侧 metrics。  
2. **`fork-compare`（或文档等价）+ `--report-out`** 产出非空 Markdown，含 meta、参数、diff。  
3. **`renderReportMarkdown` / `buildCompareReport` 有单元测试**；至少 1 条集成测驱动真实 sim。  
4. **compare-params 可写报告**（`--report-out`）或与 fork-compare 共用渲染器。  
5. **`pnpm test` / `pnpm regression` 全绿**；无密钥；conventional commits。  
6. **文档** `docs/engineering/experiment-fork-report.md` + README；GOAL-010 指针更新。  

---

## 验证计划（Verification plan）

1. `pnpm install && pnpm test` → `{SCRATCH}/test.log`  
2. `pnpm regression` → 仍绿  
3. 父 checkpoint → `fork-compare --report-out` → 文件含 `gss-report` 或标题/diff 关键字  
4. 报告中的 diff 与程序内 `buildCompareResult` 一致（测试断言）  
5. secrets 扫描  

---

## 建议实现顺序

1. `buildCompareReport` + `renderReportMarkdown` + 单测  
2. `forkAndRun` / `forkCompare` 基于 checkpoint  
3. CLI `fork-compare` + compare-params `--report-out`  
4. 集成测试 + 可选 bundle 字段  
5. engineering 文档 + commits  

---

## 完成定义（Definition of Done）

- 验收 1–6 满足  
- 偏差表写入 engineering 文档  
- 向用户说明：如何做制度分叉对照、报告字段、GOAL-012 建议  

---

## 给用户的 /goal 粘贴版（短）

```
执行 docs/goals/GOAL-011-experiment-fork-report.md

在 GOAL-001～010 之上落地：
- 从同一 parent checkpoint 真分叉：两侧不同 paramPatch/institution 后各自续跑
- buildCompareReport + renderReportMarkdown（gss-report@1 或等价）；CLI fork-compare / compare-params --report-out
- 单元 + 真实 fork 集成测试（指标方向可解释）；无密钥

架构延续：Domain-first；分叉写路径仍经权威；Stub LLM；TypeScript monorepo。
验证按该文档 Verification plan 留证；commit 遵循 docs/COMMIT_CONVENTION.md。
```

---

## 建议再下一条（本 goal 完成后）

**GOAL-012 候选：**

1. **eval 夹具**：承诺 resume（#1）缩小版 N 日  
2. **BeliefStore 最小版** + 谣言 vignette（#4）  
3. **Observer 写路径 token 鉴权**  
4. **explain 报告深度嵌入** + 时间线深链  
