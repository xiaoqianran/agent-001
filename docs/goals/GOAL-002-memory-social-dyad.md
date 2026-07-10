# GOAL-002：记忆生命周期 + 小群体关系/承诺 + 局部对话（阶段 B 入口）

> 可直接作为下一条 `/goal` 正文使用（整份粘贴，或：`执行 docs/goals/GOAL-002-memory-social-dyad.md`）。

---

## 一句话目标

在 **GOAL-001 运行时地基**之上，落地 **可检查点的 MemoryStore（情景/社会/前瞻最小生命周期）**、**2–3 Agent 关系边与承诺**、**同地面对面对话通道**，跑通场景 **`dyad-cabin`（或 `trio-cabin`）**：无 API key 多日可复现、断点续跑后仍记得关键承诺/恩怨，为阶段 B 与后续规范涌现铺路。

**非目标：** 完整七类记忆、规范涌现计数器完备、市场/账本、Control Room UI、千人规模、AutoGen/Crew 主机。

---

## 前置依赖

- 仓库已具备 GOAL-001：`packages/contracts|world|runtime|agent|cognition|llm|sim`，CLI `pnpm sim`，solo-cabin 7 日可跑。  
- 架构约束延续 GOAL-001：  
  - Domain-first；Agent/Cognition **永不**持有 World 写句柄  
  - 纯规则路径默认可复现；LLM 仅 Stub 可选  
  - TypeScript monorepo；commit 遵循 `docs/COMMIT_CONVENTION.md`  
  - **禁止**提交真实 API 密钥  

设计真源：`docs/design/generative-social-simulator-blueprint.md`（记忆生命周期、Social 关系、通信局部化、评估 #1 承诺记忆、阶段 B）。

---

## 范围（In Scope）

### P0 — MemoryStore（对齐蓝图 §4 最小集 / PR-05 骨架）

新建 `packages/memory`（或放在 `cognition` 内清晰子模块，**推荐独立包** `@gss/memory`）：

| 类型 | 本 goal 必须 | 说明 |
|------|--------------|------|
| **Episodic** | 是 | 事件摘要：谁/何地/何时/做了什么 |
| **Social** | 是 | 承诺、亏欠、恩怨条目（结构化字段） |
| **Prospective** | 是 | 「答应在未来 tick/日做什么」 |
| Semantic / Procedural / Self / Collective | 否 | 接口可预留，实现可 stub |

**生命周期最小操作：**

- `encode(event)` → 重要性评分（规则：承诺/违约/给予资源 → 高重要性地板值）  
- `retrieve(query, k)` → 相关性 × 时效 × 重要性（可用简单关键词 + tick 衰减，**不强制**向量库）  
- `decay(tick)` → 低重要性模糊/降权  
- （可选）`distort` 接口占位，本 goal 可不启用  

**不变量：**

- Social / Prospective **承诺类**记忆有 **重要性地板值**（checkpoint 后仍可被 retrieve）  
- MemoryStore 进入 **checkpoint**（与 Agent/World 一并 save/load）  
- 编码来自 Runtime 反馈 / 对话结果，**不是** Cognition 私写 World  

### P0 — Social 最小（关系 + 承诺，非全量 SocialAuthority）

可在 `packages/social` 或 `runtime` 侧实现 **最小 SocialGraph**：

```
RelationEdge {
  a, b
  dimensions: { affinity, trust, debt, ... }  // 至少 affinity + trust + debt
  type: 'stranger' | 'acquaintance' | 'friend' | ...
}
PromiseRecord {
  id, from, to, content, dueTick?, status: pending|kept|broken
}
```

- 由 **DomainEvent** 归约（如 `action.applied` give/speak 承诺句、显式 `promise` 行动若新增）  
- Cognition **只读** `SocialSlice`（局部：与我相关的边 + 我的 pending promises），**不**直接改图  
- 违约 / 兑现更新 trust/debt，并 **encode Social + Prospective 记忆**

### P0 — 局部对话通道

- 通道：**面对面** — 仅 **同 place** 可 `speak` 送达（GOAL-001 已有雏形，需强化）  
- `speak` 可携带结构化意图：`inform | request | promise | thank | refuse`（字段进 `structured.args` 或扩展）  
- 接收方：message → 可选 encode episodic + 更新 PersonModel 最小字段（可选）或仅记忆  
- **禁止**全局广播；不同 place 的 agent 收不到  

### P0 — 认知接入记忆

扩展 `RuleCognitiveEngine`（或后继引擎）：

1. Perceive / Attend  
2. **Retrieve** 从 MemoryStore 拉 top-k（含承诺）  
3. Feel / Deliberate：选项分考虑 pending promise（如「应去送食物」）  
4. Decide → ActionProposal  
5. Feedback → encode  

`DecisionTrace` 必须记录：`retrievedMemoryIds`、`dominantNeeds`、`chosen`；若使用承诺则 options/score 可解释。

### P0 — 场景 `dyad-cabin`（推荐主场景）

- 地图：沿用/扩展 solo-cabin（cabin–woods–storehouse）  
- **2 Agent**：如 Alice + Bob  
- 初始：可分处或同 cabin；有限食物池  
- 剧本**不写死结局**，但用规则 + 初始目标诱导：  
  - 一方可 `promise` 在 N tick 内给对方食物  
  - 或共同工作/交换  
- CLI：  
  ```bash
  pnpm sim run --scenario dyad-cabin --days 5 --seed 42
  pnpm sim run --scenario dyad-cabin --days 2 --seed 42 --checkpoint ./ckpts/d.json
  pnpm sim resume --checkpoint ./ckpts/d.json --days 3
  ```

**出口标准（本 goal）：**

1. 无 key 跑完 ≥5 日，exit 0，两名 agent 均存活于合法 place  
2. 同 seed 双跑权威指纹一致（扩展指纹：可含 promise 状态哈希、记忆条数或关键记忆 id 集合）  
3. **检查点续跑后**：至少一条 **pending/kept 承诺** 或 **高重要性 social 记忆** 仍可被 `retrieve` 命中（对应评估 #1 的迷你版）  
4. 分处两地时 `speak` **不可**送达；同地可送达（测试覆盖）  

### P1 — 观测与文档

- 日志：tick 级 JSON；可选导出「承诺表」「关系边」摘要  
- `docs/engineering/memory-social-dyad.md`：数据模型、事件归约、与蓝图映射、偏差表  
- README 更新场景列表与快速开始  
- 更新 `docs/engineering/runtime-foundation.md` 交叉链接（一句即可）  

### 明确 Out of Scope

- 规范涌现 `emergent_norm_count` 完整夹具（GOAL-003/后续）  
- 多维声誉 / 权力 / 冲突状态机全量  
- Ledger、市场、契约法  
- 向量数据库、ANN  
- LangGraph 强制引入  
- 实网 LLM 作为验收门槛  
- Control Room / 实验 fork UI  

---

## 验收标准（Acceptance Criteria）

1. **可安装可运行：** `pnpm install && pnpm test && pnpm sim run --scenario dyad-cabin --days 5 --seed 42` 无 key 成功。  
2. **MemoryStore 为真源模块：** 存在可导入的 encode/retrieve/decay；被 cognition 与 checkpoint 使用；单测覆盖「承诺记忆地板值 + retrieve」。  
3. **关系/承诺：** 存在边与 PromiseRecord；事件驱动更新；SocialSlice 只读暴露给认知。  
4. **局部说话：** 同 place 送达 / 异 place 拒绝或不可达，有测试。  
5. **DecisionTrace：** 至少一次 tick 的 `retrievedMemoryIds` 非空（在已有记忆后），且含 chosen。  
6. **确定性：** 同 seed pure-rule 双跑指纹一致。  
7. **Checkpoint：** save → load → resume 后 clock 单调；**承诺或关键 social 记忆可 retrieve**。  
8. **边界：** cognition/memory **不** import 可写 World 实现；依赖测试保留/扩展。  
9. **文档 + commit 规范 + 无密钥**；可推送 `origin`。  

---

## 验证计划（Verification plan）

执行者自行跑并在 `{SCRATCH}` 留证：

1. `pnpm test` — 全绿；含 memory、social/promise、local speak、checkpoint memory、determinism、boundary  
2. `pnpm sim run --scenario dyad-cabin --days 5 --seed 42` — exit 0  
3. 同 seed 双跑 / `compare-seeds`（或扩展命令）— 指纹 equal  
4. checkpoint：2 日 save → resume 3 日 → 断言记忆/承诺仍在  
5. secrets 扫描：无长 `sk-`；`.env` ignore  

---

## 建议实现顺序

1. `@gss/memory`：类型 + MemoryStore + 单测  
2. 承诺/关系：`@gss/social` 最小图 + reduce(event)  
3. World/Interaction：强化 speak 局部送达与 promise 相关 args  
4. Cognition：retrieve 接入 + 承诺驱动选项  
5. Runtime：checkpoint 序列化 memory + social  
6. 场景 `dyad-cabin` + CLI  
7. 测试与指纹扩展  
8. 文档与 conventional commits  

---

## 完成定义（Definition of Done）

- 验收 1–9 全部满足  
- 与蓝图偏差写入 engineering 文档偏差表  
- 向用户说明：如何跑 dyad-cabin、承诺续跑如何验证、下一 goal 建议（GOAL-003：规范涌现计数 + 成本分级 / 或 制度参数实验迷你）  

---

## 给用户的 /goal 粘贴版（短）

```
执行 docs/goals/GOAL-002-memory-social-dyad.md

在 GOAL-001 地基上落地阶段 B 入口：
- packages/memory：Episodic/Social/Prospective 最小生命周期（encode/retrieve/decay，承诺重要性地板值，进 checkpoint）
- 最小关系图 + PromiseRecord（事件归约；认知只读 SocialSlice）
- 同 place 面对面 speak（结构化意图 promise/request 等）；异地不可达
- 认知循环接入 Retrieve；DecisionTrace 记录 retrievedMemoryIds
- 场景 dyad-cabin（2 Agent），无 key 跑 ≥5 日、同 seed 可复现、checkpoint 后续跑仍能 retrieve 承诺/社会记忆

架构延续：Domain-first，Agent 永不写 World；Stub LLM；TypeScript monorepo。
验证按该文档 Verification plan 留证；commit 遵循 docs/COMMIT_CONVENTION.md；禁止提交密钥。
```

---

## 建议再下一条（本 goal 完成后）

**GOAL-003：** 描述性规范涌现计数器 + `emergent_norm_count` 夹具；或稀缺资源 3 Agent 冲突/合作整合（PR-09/10b）；成本分级可选。  
