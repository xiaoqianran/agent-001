# GOAL-012：承诺断点续跑评估夹具（评估 #1 缩小版）

> 可直接作为下一条 `/goal` 正文使用（整份粘贴，或：`执行 docs/goals/GOAL-012-eval-promise-resume.md`）。

---

## 一句话目标

在 **GOAL-001～011**（dyad 承诺/记忆、checkpoint、resume、metrics、explain、CI）之上，落地蓝图 **评估 #1 的缩小可执行夹具**：正式 **eval 套件入口**（`runEval` / `pnpm sim eval` / `pnpm eval`），首条用例 **`promise-resume`**：承诺建立 → 落 checkpoint → resume 后续日 → 断言 **承诺状态/关系/前瞻记忆仍在**，且履约或可解释的违约路径可测；结果 JSON 可复现、可进 regression（可选）；无密钥。

**非目标：** 真 30 日长跑 CI、完整八项评估一次做完、Belief/谣言（#4）、Observer token、新 UI。

---

## 前置依赖

- GOAL-002：`dyad-cabin`、MemoryStore 承诺类地板、Social promises  
- GOAL-001：`toCheckpoint` / `fromCheckpoint` / `resume`  
- GOAL-009：`pnpm regression` 可挂 eval 子集  
- 架构延续：Domain-first；Stub LLM；`docs/COMMIT_CONVENTION.md`；**禁止**提交密钥  

设计真源：蓝图 §十五 评估 #1；附录 B 小群体承诺。

---

## 范围（In Scope）

### P0 — Eval 框架（最小）

```typescript
type EvalStatus = 'pass' | 'fail' | 'skip';

interface EvalAssertion {
  id: string;
  ok: boolean;
  detail: string;
}

interface EvalCaseResult {
  id: string;              // e.g. 'promise-resume'
  status: EvalStatus;
  seed: string;
  durationMs: number;
  assertions: EvalAssertion[];
  summary: string;
  artifacts?: Record<string, unknown>; // metrics snippet, promise ids, etc.
}

interface EvalSuiteResult {
  format: 'gss-eval@1';
  ranAt: string;
  cases: EvalCaseResult[];
  passed: number;
  failed: number;
}

function runEvalCase(id: string, opts?: EvalRunOpts): Promise<EvalCaseResult>
function runEvalSuite(ids?: string[]): Promise<EvalSuiteResult>
```

- 包位置建议：`packages/sim/src/eval/` 或 `packages/experiment/src/eval/`（**优先 sim**，贴近场景）  
- CLI：  
  ```bash
  pnpm sim eval --case promise-resume --seed 42
  pnpm sim eval --suite core          # 至少含 promise-resume
  # 或根脚本
  pnpm eval --case promise-resume
  ```  
- 失败时 **exit 1**；stdout 可打印 JSON 摘要；可选 `--out ./eval-report.json`  

### P0 — 用例 `promise-resume`（评估 #1 缩小）

对齐附录 B，**缩短为可 CI 的 N 日**（默认建议 N_pre + N_post ≤ 8 模拟日总量）：

| 阶段 | 行为 | 硬断言（须全部可测） |
|------|------|----------------------|
| **Phase 1** | `dyad-cabin` 跑 `warmupDays`（默认 2–3） | 至少 1 条 `promise` **pending 或 kept** 出现在 Social（或 action 序列中有 promise 相关 + listPromises 非空） |
| **Checkpoint** | `toCheckpoint` 写入（可内存或临时文件） | checkpoint 含 `memory` + `social`；format `gss-checkpoint@1` |
| **Phase 2** | `fromCheckpoint` + `runDays(resumeDays)`（默认 2–4） | 时钟前进；**不得**因 resume 丢光全部 promise 记录 |
| **记忆** | resume 后 | 至少一侧：promise-class 记忆仍可 `retrieve` **或** Social `listPromises` 仍含 phase1 的 promiseId（kept/pending/broken 任一稳定状态） |
| **社会结果（至少 1 条）** | 履约或违约 | **A** `kept ≥ 1` 在全程；**或** broken 时 trust/关系边可观测下降 / DecisionTrace 可查（二选一写清断言） |

实现约束：

1. 禁止 theater：断言读 **真实** `orch.getSocial().listPromises()` / `getMemory().retrieve` / action sequence，不手写假状态当绿。  
2. 同 seed 双跑：`status` 与关键 assertion `ok` 一致（确定性）。  
3. 若默认 seed 下偶发无 promise：允许固定 `seed` 列表重试 **≤3** 个种子，或使用已证明可产生 promise 的 seed（如现有 `promise-fulfill` 用 `42`）；文档写死默认 seed。  

### P0 — 与 metrics / explain / regression 衔接

- `EvalCaseResult.artifacts` 可含：`promiseCount`、`kept`、`broken`、`pending`、可选 `explain` 摘要（若存在 promise-related highlight）。  
- **可选 P0：** `pnpm regression` 末尾调用 `promise-resume` 或单独 `pnpm eval` 进 CI workflow 一步。  
  - 若担心时长：仅 `pnpm test` 内集成测 + CI 已有 test 即可；文档说明。  

### P1 — 扩展点（本 goal 可不实现，但预留 id）

| case id | 对应评估 | 说明 |
|---------|----------|------|
| `promise-resume` | #1 | **本 goal 必做** |
| `institution-shock` | #5 | 可复用 fork-compare 结果包装（可选薄包装） |
| `seed-repro` | #8 | 可复用 compare-seeds（可选） |

### 明确 Out of Scope

- 评估 #3 组织阶层、#4 谣言 BeliefStore  
- 30 日真实墙钟跑满  
- 外部 baselining 排行榜  
- LLM 评判「是否像社会」  

---

## 与蓝图评估的映射

| 评估 # | 本 goal 贡献 |
|--------|----------------|
| 1 断点后续记得恩怨与承诺 | **主交付**（缩小 N 日版） |
| 8 可复现 | 同 seed eval 稳定；进测试/可选 CI |
| 7 可追溯 | 可选 artifacts 挂 explain/trace |

---

## 验收标准（Acceptance Criteria）

1. **`runEvalCase('promise-resume')` 已导出**，返回 `gss-eval` 风格结果；失败时 `status: 'fail'` 且 assertions 标明哪条挂。  
2. **自动化测试**调用 shipped eval（非 reimplement）：默认 seed 下 `status === 'pass'`（或文档种子列表中至少一颗 pass，测试固定使用该 seed）。  
3. **CLI** `pnpm sim eval --case promise-resume`（或 `pnpm eval`）exit 0 当 pass；JSON 可解析。  
4. **真 checkpoint 路径**：测试或实现内必须 `toCheckpoint` → `fromCheckpoint`（或等价 resume API），禁止只连续 `runDays` 假装 resume。  
5. **`pnpm test` / `pnpm regression` 全绿**；无密钥；conventional commits。  
6. **文档** `docs/engineering/eval-promise-resume.md` + README；GOAL-011 指针更新。  

---

## 验证计划（Verification plan）

1. `pnpm install && pnpm test` → `{SCRATCH}/test.log`  
2. `pnpm sim eval --case promise-resume --seed 42`（或文档命令）→ `{SCRATCH}/eval-promise.json`，`status=pass`  
3. 抽查结果含 checkpoint/resume 相关 assertion 为 ok  
4. `pnpm regression` 仍绿  
5. secrets 扫描  

---

## 建议实现顺序

1. Eval 类型 + `runEvalCase` 注册表  
2. 实现 `promise-resume` 场景逻辑（warmup → ckpt → resume → assert）  
3. 单元/集成测试驱动 shipped API  
4. CLI + 可选 CI/regression 挂钩  
5. engineering 文档 + commits  

---

## 完成定义（Definition of Done）

- 验收 1–6 满足  
- 偏差表写入 engineering 文档  
- 向用户说明：如何跑 eval、断言含义、GOAL-013 建议（Belief #4 或 token 鉴权）  

---

## 给用户的 /goal 粘贴版（短）

```
执行 docs/goals/GOAL-012-eval-promise-resume.md

在 GOAL-001～011 之上落地：
- 最小 eval 框架（gss-eval@1）：runEvalCase / suite；CLI pnpm sim eval
- 用例 promise-resume：dyad 承诺 → 真 checkpoint → resume → 断言 promise/记忆仍在 + 履约或可解释违约
- 测试驱动 shipped eval（禁止假绿）；无密钥

架构延续：Domain-first；Stub LLM；TypeScript monorepo。
验证按该文档 Verification plan 留证；commit 遵循 docs/COMMIT_CONVENTION.md。
```

---

## 建议再下一条（本 goal 完成后）

**GOAL-013 候选：**

1. **BeliefStore 最小版** + 谣言 vignette（评估 #4）  
2. **Observer 写路径 OBSERVER_TOKEN**  
3. **eval 扩展**：`institution-shock` / `seed-repro` 包装进 suite  
4. **单 Agent fault 隔离** 夹具显式化（评估 #6）  
