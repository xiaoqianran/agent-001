# GOAL-013：BeliefStore 最小版 + 谣言 vignette（评估 #4 缩小版）

> 可直接作为下一条 `/goal` 正文使用（整份粘贴，或：`执行 docs/goals/GOAL-013-belief-rumor-vignette.md`）。

---

## 一句话目标

在 **GOAL-001～012**（记忆、对话、认知、checkpoint、explain、eval）之上，落地 **最小 BeliefStore**（Agent 私有信念，可检查点）与 **谣言 vignette**：一 Agent 散布错误命题 → 他者按规则接受写入信念 → 审议对行动施加 **beliefBias** → 集体行为相对无谣言基线可解释偏移；**World 事实不变**；`DecisionTrace.beliefsUsed` 可查；可测、可复现、无密钥。

**非目标：** 完整贝叶斯认知、媒体工业、多跳舆论动力学、向量知识图谱、真网 LLM 谣言生成、30 日谣言长跑。

---

## 前置依赖

- GOAL-002：speak / message 通道、MemoryStore  
- GOAL-010：`explain` / `beliefsUsed` 字段已在 DecisionTrace 契约中（现多为空）  
- GOAL-012：eval 注册表可挂可选 case（P1）  
- 架构延续：Domain-first；**信念是 Agent 内部/私有权威，不得由 cognition 直写 World**；Stub LLM；`docs/COMMIT_CONVENTION.md`；**禁止**提交密钥  

设计真源：蓝图评估 #4；附录 C-bis（可映射到现有 cabin/woods 资源场景，不必新建东田）。

---

## 范围（In Scope）

### P0 — Belief 契约 + BeliefStore

```typescript
interface Belief {
  id: string;
  owner: AgentId;
  /** stable proposition key, e.g. "poisoned(woods)" */
  proposition: string;
  /** 0..1 subjective confidence */
  confidence: number;
  source?: AgentId | 'oracle' | 'self';
  tickCreated: number;
  tickUpdated: number;
  /** optional polarity for bias direction */
  polarity?: 'avoid' | 'prefer' | 'neutral';
  payload?: Record<string, unknown>;
}

class BeliefStore {
  upsert(b: Omit<Belief, 'id'> & { id?: string }): Belief;
  get(owner: AgentId, proposition: string): Belief | undefined;
  list(owner: AgentId): Belief[];
  /** decay or leave confidence as-is (minimal: optional linear decay) */
  tickDecay?(tick: number): void;
  snapshot(): unknown;
  static fromSnapshot(s: unknown): BeliefStore;
}
```

- 包位置：`@gss/memory` 内并列模块，或独立 `@gss/belief`（**优先 memory 包或 contracts + runtime 持有**，避免环依赖）  
- **检查点：** `CheckpointBundle` 扩展可选 `beliefs?: unknown`（向后兼容；缺省不炸）  
- Runtime 持有 `BeliefStore` 并随 checkpoint 序列化/恢复  

### P0 — 谣言传播（规则，非 LLM）

1. **发言/消息** 可携带结构化命题（扩展 `speak` / message args 或专用 verb `spread_claim`）：  
   - `args: { claim: "poisoned(woods)", confidence?: number }`  
2. **接收者** 同地听到后以确定性规则接受：  
   ```text
   accept = hash(seed, tick, listener, claim) / 2^32 < baseAccept
            或 trust(speaker→listener) 加权（可选简化：固定 baseAccept=0.7 + 角色）
   ```  
   - 接受则 `BeliefStore.upsert({ owner: listener, proposition, confidence, source: speaker, polarity: 'avoid' })`  
3. **散布者** 自身可先持有该信念（角色 `rumormonger` 或场景参数 `rumorAgentId`）  

确定性：同 seed 同配置 → 同接受集合（或同 accept 决策序列）。

### P0 — beliefBias 进入审议

- `RuleCognitiveEngine` 读 **只读** belief 切片（Runtime 注入 `BeliefSlice` / 经 observation 扩展，**不**给 World 写柄）  
- 对相关选项降权/提权：  
  - 例：`poisoned(woods)` + polarity avoid → 降低 `move→woods` / `take` 在 woods 的分数  
- `DecisionTrace.beliefsUsed` 填入实际影响决策的 `proposition` 或 belief id 列表（非空当 bias 生效时）  

### P0 — 场景 vignette

二选一（实现时选更贴现有 world 的一种，文档写死）：

**推荐 A — 映射现有 dyad/trio 资源（少改 world）：**

| 项 | 内容 |
|----|------|
| 场景 | 扩展 `trio-cabin` 或新 `rumor-cabin`（3 Agent） |
| 事实 | woods 有 food；**无**真实毒/危险 flag |
| 谣言 | Agent R：`poisoned(woods)` |
| 基线 | 无谣言短跑 → woods 相关 take/move 次数 W0 |
| 处理 | 有谣言短跑 → woods 活动 W1，期望 **W1 < W0**（同 seed 结构对照） |
| World | woods 资源池总量事实不变（或至少 fertile/存在性不变） |

**备选 B — 最小东田/西田（若愿意加 place）：** east_field / west_field 两 pool。

CLI：

```bash
pnpm sim run --scenario rumor-cabin --days 5 --seed 42
pnpm sim compare-params --scenario rumor-cabin --seed 42 --days 5 \
  --a rumorEnabled=0 --b rumorEnabled=1
# 或 eval
pnpm sim eval --case rumor-belief
```

### P0 — 测试（禁止 theater）

1. **单元：** BeliefStore upsert/list/snapshot round-trip  
2. **集成：** 真短跑  
   - 至少 1 个非散布者 `get(proposition)` 有信念 **或** traces 含 `beliefsUsed`  
   - 对照：谣言开 vs 关，woods 相关行动计数方向可解释（W1 ≤ W0 或严格 <，文档写清阈值）  
   - World 事实：woods 初始 food 配置未因谣言被代码改写（断言资源规则/初始 pool）  
3. **确定性：** 同 seed 双跑 belief 列表或 accept 序列一致  

### P1 — eval / explain 挂钩

- `runEvalCase('rumor-belief')` 包装上述断言（可选，建议做以便与 GOAL-012 并列）  
- `explain` 对含 beliefsUsed 的 trace 增加 `EvidenceLink kind` 可扩展为 `belief`（可选）  
- highlight kind 可选 `rumor_spread`  

### 明确 Out of Scope

- 连续意见动力学 / 回音室完整模型  
- 媒体帖子广场  
- LLM 生成谣言文本作验收门槛  
- Observer 鉴权（另 goal）  

---

## 与蓝图评估的映射

| 评估 # | 本 goal 贡献 |
|--------|----------------|
| 4 信息失真影响集体决策 | **主交付**（缩小 cabin/woods 版） |
| 7 可追溯 | beliefsUsed + 可选 explain |
| 8 可复现 | 同 seed accept/bias 稳定 |

---

## 验收标准（Acceptance Criteria）

1. **BeliefStore** 可 upsert/list，并进入 checkpoint 序列化/恢复（缺省字段向后兼容）。  
2. **谣言路径** 经权威消息/行动传播；接受者信念写入 **不**修改 World 事实字段。  
3. **beliefBias** 影响选项分数；生效时 `DecisionTrace.beliefsUsed` 非空（至少一条集成路径）。  
4. **对照测试**：谣言开 vs 关，woods（或等价）活动方向可解释；数字来自真实 action sequence。  
5. **`pnpm test` / `pnpm regression` 全绿**；无密钥；conventional commits。  
6. **文档** `docs/engineering/belief-rumor.md` + README；GOAL-012 指针更新。  

---

## 验证计划（Verification plan）

1. `pnpm install && pnpm test` → `{SCRATCH}/test.log`  
2. `pnpm sim run --scenario rumor-cabin --days 5 --seed 42`（或文档场景名）exit 0  
3. 对照命令或测试日志显示 W1 相对 W0 方向  
4. 可选：`pnpm sim eval --case rumor-belief`  
5. secrets 扫描  

---

## 建议实现顺序

1. Belief 类型 + BeliefStore + checkpoint 字段  
2. Runtime 注入 belief 切片到认知  
3. spread_claim / speak args + 接受规则  
4. beliefBias 与 beliefsUsed  
5. rumor-cabin（或参数化 trio）+ 对照测试  
6. 可选 eval case + 文档 + commits  

---

## 完成定义（Definition of Done）

- 验收 1–6 满足  
- 偏差表写入 engineering 文档  
- 向用户说明：如何开谣言对照、命题约定、GOAL-014 建议  

---

## 给用户的 /goal 粘贴版（短）

```
执行 docs/goals/GOAL-013-belief-rumor-vignette.md

在 GOAL-001～012 之上落地：
- BeliefStore 最小版（可检查点）；谣言经消息/行动传播写入他者信念，不改 World 事实
- 认知 beliefBias + DecisionTrace.beliefsUsed
- 场景 vignette（rumor-cabin 或等价）+ 谣言开/关对照测试（woods 活动方向可解释）
- 无密钥；conventional commits

架构延续：Domain-first；信念非 World 写路径；Stub LLM；TypeScript monorepo。
验证按该文档 Verification plan 留证；commit 遵循 docs/COMMIT_CONVENTION.md。
```

---

## 建议再下一条（本 goal 完成后）

**GOAL-014 候选：**

1. **Observer OBSERVER_TOKEN** 写路径鉴权  
2. **eval 扩展**：institution-shock / seed-repro / rumor-belief 进 core suite  
3. **fault 隔离** 显式夹具（评估 #6）  
4. **多跳谣言** 或简单媒体频道  
