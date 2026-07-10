# GOAL-001：GSS 运行时地基（契约 + World 权威 + Tick 编排 + 单 Agent 日环骨架）

> 可直接作为下一条 `/goal` 正文使用（可整份粘贴，或写：`执行 docs/goals/GOAL-001-runtime-foundation.md`）。

---

## 一句话目标

在仓库 `agent-001` 中落地 **生成式社会模拟系统（GSS）可运行的最小地基**：冻结领域契约、实现分区权威中的 **World 校验/应用**、实现确定性 **TickOrchestrator** 与检查点骨架，并用 **规则优先的认知 tick（LLM 可选/可 stub）** 跑通 **单 Agent 多日环不崩 + 断点续跑**，为阶段 A 与后续社会层铺路。

**非目标：** demo 小镇 UI、多 Agent 热闹对话、CrewAI/AutoGen 全家桶、完整记忆/规范涌现/实验分叉 UI。

---

## 架构约束（必须遵守，已拍板）

1. **Domain-first：** World / Runtime / Contracts 自研；**不以** AutoGen / CrewAI / MetaGPT 等为内核。  
2. **LLM 是可替换部件：** 经 `LlmPort` 接入 OpenAI-compatible API（NewAPI）；默认提供 **StubLlm** 使 CI/本地无密钥也可跑通。  
3. **认知层：** 实现显式多阶段循环（至少 Perceive → Retrieve/Feel 简化 → Deliberate → Decide → Act → Feedback）；**允许**后续用 LangGraph 替换审议子图，但本 goal **不强制**引入 LangGraph。  
4. **权威不变量：** Agent/Cognition **永不**持有 World 写句柄；只产出 `ActionProposal`；变更仅经 `WorldAuthority.validate` + `apply`。  
5. **可复现：** `Seed` + 确定性 `agentOrder`；同 seed 下权威状态（无 LLM 随机时）逐 tick 一致。  
6. **实现语言：** **TypeScript（推荐）** 单栈 monorepo，便于附录 E 契约与长期工程；若仓库已有强约束可说明，但默认 TS。  
7. **密钥：** 只读环境变量 / `.env`（gitignore）；**禁止**把真实 API Key 写入仓库。

设计真源：`docs/design/generative-social-simulator-blueprint.md`（尤其八层、分区权威、TickOrchestrator 相位、附录 E、PR-01…06、阶段 A）。

Commit 规范：`docs/COMMIT_CONVENTION.md`。

---

## 范围（In Scope）

### P0 — 仓库与契约（对齐 PR-01）

- monorepo 骨架（建议 pnpm workspace 或等价）：  
  - `packages/contracts` — 附录 E 中本阶段需要的 **Freeze** 类型  
  - `packages/world` — WorldAuthority  
  - `packages/runtime` — TickOrchestrator、EventBus、Checkpoint  
  - `packages/agent` — AgentState、需求/目标/情绪最小状态  
  - `packages/cognition` — CognitiveEngine（规则 + 可选 LLM）  
  - `packages/llm` — LlmPort、StubLlm、OpenAICompatibleLlm  
  - `apps/sim-cli` 或 `packages/sim` — 可执行入口：跑 N 日、存档、恢复  
- 共享类型与校验（zod 或等价 runtime schema，至少对 `ActionProposal` / `ActionResult`）  
- 依赖方向 lint 或文档化规则：**cognition/agent 不得 import world 可写实现**（至少测试或 eslint 边界说明 + 架构测试）

### P0 — World（对齐 PR-02 最小集）

- 多层空间最小模型：至少一个 `Place` 图（可简化为地点列表 + 邻接）  
- 实体：Agent 位置镜像、可携带物品/资源池（食物/能量相关即可）  
- `observe(agentId) → LocalObservation`（严格局部：只能看见同 place / 邻接规则内实体）  
- `validate(proposal) → ValidationResult` + `apply → ActionResult`  
- 支持行动子集：`move` | `rest` | `take` | `give` | `speak`（speak 可只记事件不解析语言）| `work`（可选，产资源）  
- 互斥 / 前提失败码：`PRECONDITION` | `MUTEX` | `OUT_OF_RANGE` 等与契约一致  

### P0 — Runtime（对齐 PR-03 最小集）

- `TickOrchestrator` 固定相位（可实现蓝图 0–12 的**子集**，但必须文档化实际相位，且顺序稳定）：  
  至少：`clock_advance → order_agents → observe → cognitive_tick → collect_proposals → validate/apply(serial) → emit_events → feedback_encode → (optional) checkpoint`  
- 确定性顺序：`hash(seed, tick, agentId)` 或蓝图等价函数（实现固定、有测试）  
- 进程内 `EventBus`  
- Checkpoint：序列化 World + Agent 内部状态 + 时钟 + seed；`save` / `load` 后继续跑  
- 单 Agent 故障隔离：cognitive 抛错 → 记 `agent.fault`，**不**拖垮进程  

### P0 — Agent + Cognition（对齐 PR-04…06 骨架）

- `AgentState` 最小：identity 摘要、needs（至少 energy/hunger/rest）、goals（至少 daily + intent）、emotion/physiology 子集、embodiment 镜像字段  
- 规则审议优先：  
  - 饥饿/疲劳高 → 倾向 `take` 食物 / `rest`  
  - 否则可 `move` 或 `work`  
- `DecisionTrace` 落盘或可查询（内存 + checkpoint 内），含 dominantNeeds、chosen action  
- `LlmPort`：Stub 返回空/固定结构；OpenAI-compatible 实现读 `NEWAPI_BASE_URL` / `NEWAPI_API_KEY` / `NEWAPI_MODEL`；**无 key 时自动 Stub**  
- 可选：当 `GSS_LLM=1` 且 key 存在时，审议阶段可调用 LLM **生成 utterance 或辅助选项**，但仍必须产出结构化 `ActionProposal`，经 World 校验  

### P0 — 可运行场景（阶段 A 迷你出口）

- 场景：`solo-cabin`（单人小屋 + 林地/仓库邻接）  
- CLI 例如：  
  - `pnpm sim run --scenario solo-cabin --days 7 --seed 42`  
  - `pnpm sim run --scenario solo-cabin --days 3 --seed 42 --checkpoint ./ckpts/a`  
  - `pnpm sim resume --checkpoint ./ckpts/a --days 4`  
- 出口标准（本 goal）：  
  1. 无 LLM 时 7 日跑完 exit 0  
  2. 中途 checkpoint 后 resume，Agent 仍存在、时钟单调、位置合法  
  3. 同 seed 两次 pure-rule 运行，权威摘要（tick、位置、资源总量、行动序列哈希）一致  

### P1 — 观测与文档（应做）

- 结构化日志：每 tick 一行 JSON 或 event log 文件  
- `docs/engineering/runtime-foundation.md`：如何跑、相位表、包依赖图、与蓝图章节映射  
- README 增加「快速开始」  

### 明确 Out of Scope（本 goal 不做）

- SocialAuthority 全量、规范涌现、声誉冲突  
- Ledger/市场/契约  
- 多 Agent 互动与谣言  
- 完整七类记忆生命周期（可预留 MemoryStore 接口 + 仅 episodic 列表）  
- Control Room UI、实验 fork UI  
- 阶段 B–F 功能  
- 提交真实密钥、依赖闭源必须联网的测试作为唯一门槛  

---

## 验收标准（Acceptance Criteria）

1. **可安装可运行：** 干净环境按 README 安装依赖后，无 API key 能 `sim run --days 7 --seed 42` 成功。  
2. **契约存在且被引用：** `packages/contracts` 导出本阶段 Freeze 类型；world/runtime/cognition 使用这些类型，而非复制粘贴分叉。  
3. **世界权威：** 存在测试：非法 `move` / 互斥行动被 reject；合法 `apply` 后观察与状态一致；cognition 包无法（或不通过测试允许）直接写 World 存储。  
4. **确定性：** 同 seed 双跑，行动序列或状态指纹一致（无 LLM 路径）。  
5. **检查点：** save → 改内存或新进程 load → resume 后 tick 连续、关键状态保留（至少：agentId、placeId、needs 快照、seed）。  
6. **故障隔离：** 注入 cognitive 抛错的 Agent（或测试 double）时，运行继续并产生 fault 事件。  
7. **DecisionTrace：** 至少一次成功行动的 trace 可被测试读到（dominantNeeds + chosen）。  
8. **文档：** 工程说明 + README 快速开始；映射到蓝图 PR-01…03 / 阶段 A。  
9. **Git：** 变更按 `docs/COMMIT_CONVENTION.md` 提交；可推送到 `origin`（若环境有权限）；**不含**密钥。  

---

## 验证计划（Verification plan）

执行者必须自己跑并在 `{SCRATCH}` 或仓库 `artifacts/goal-001/` 留下输出摘要：

1. `pnpm test`（或等价）— 契约/world/runtime 单测通过  
2. `pnpm sim run --scenario solo-cabin --days 7 --seed 42` — exit 0，保存日志路径  
3. 两次同 seed 运行，比对状态指纹脚本 exit 0  
4. checkpoint 往返脚本：run 3 日 → save → resume 4 日 → 断言总天数与状态  
5. 静态检查：仓库中无 `sk-` 真实密钥；`.env` 被 gitignore  

---

## 建议实现顺序（给执行 Agent）

1. monorepo + contracts（ActionProposal, ValidationResult, Seed, Tick, AgentId…）  
2. world 最小地图 + validate/apply + observe  
3. runtime TickOrchestrator + EventBus + 确定性 order  
4. agent state + rule cognitive engine + DecisionTrace  
5. checkpoint save/load  
6. sim-cli 场景 solo-cabin  
7. 测试 + 确定性/续跑脚本  
8. llm port stub + optional OpenAI-compatible  
9. 文档与 README；按规范 commit（可多 commit：`chore(repo)` / `feat(contracts)` / `feat(world)` / `feat(runtime)` / `feat(cognition)` / `test` / `docs`）  

---

## 完成定义（Definition of Done）

- 上述验收 1–9 全部满足  
- 蓝图 **不要求** 本 goal 改写；若实现与蓝图有意偏差，在 `docs/engineering/runtime-foundation.md` 写 **偏差表**（蓝图条款 → 实现 → 理由）  
- 向用户汇报：如何运行、测试结果摘要、与下一 goal（建议 GOAL-002：MemoryStore + 社会关系最小 B）的接口留白  

---

## 给用户的 /goal 粘贴版（短）

```
执行 docs/goals/GOAL-001-runtime-foundation.md

在 agent-001 用 TypeScript monorepo 落地 GSS 运行时地基：
packages/contracts（附录 E 本阶段 Freeze）、world（WorldAuthority 局部观察+行动校验/应用）、
runtime（确定性 TickOrchestrator、EventBus、checkpoint）、agent+cognition（规则优先认知 tick、DecisionTrace）、
llm（Stub + 可选 OpenAI-compatible NewAPI）。

架构：Domain-first 自研内核，不用 AutoGen/CrewAI 当主机；Agent 永不写 World。
场景 solo-cabin：无 key 跑通 7 日、同 seed 可复现、checkpoint 续跑、单 agent 故障隔离。
验证按该文档 Verification plan 执行并留证据；commit 遵循 docs/COMMIT_CONVENTION.md；禁止提交密钥。
```

---

## 建议的下一条 goal（本 goal 完成后）

**GOAL-002（已成文）：** [docs/goals/GOAL-002-memory-social-dyad.md](./GOAL-002-memory-social-dyad.md) — MemoryStore + 关系/承诺 + 局部对话 + `dyad-cabin`。  
**GOAL-003（预告）：** 描述性规范涌现计数 / 稀缺整合场景；成本分级与兴趣管理可选。  
