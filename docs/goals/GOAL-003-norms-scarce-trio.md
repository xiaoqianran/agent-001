# GOAL-003：描述性规范涌现 + 三人稀缺场景（阶段 B 收尾 / C 入口）

> 可直接作为下一条 `/goal` 正文使用（整份粘贴，或：`执行 docs/goals/GOAL-003-norms-scarce-trio.md`）。

---

## 一句话目标

在 **GOAL-001 运行时**与 **GOAL-002 记忆/关系/承诺**之上，落地 **可统计的描述性规范涌现**（评估 #2 迷你版）与 **三人稀缺资源场景 `trio-cabin`**：无 API key 可复现多日运行、检查点续跑，出现 **非注入的 emergent 规范**与 **资源竞争/合作（给予/拿走/工作）**，为阶段 C 共享世界与阶段 D 制度实验铺路。

**非目标：** 完整制度/法律全流程、市场与账本、声誉权力全量、Control Room UI、千人规模、强制实网 LLM、AutoGen/Crew 主机。

---

## 前置依赖

- GOAL-001：`contracts/world/runtime/agent/cognition/llm/sim`，solo-cabin  
- GOAL-002：`memory/social`，dyad-cabin，局部 speak，承诺履约（有库存才 give）  
- 架构延续：Domain-first；Agent 永不写 World；Stub LLM 默认可复现；TypeScript monorepo；`docs/COMMIT_CONVENTION.md`；**禁止**提交真实密钥  

设计真源：蓝图 §3 规范涌现、§6 社会、评估 #2 / #5 方向、阶段 B→C、PR-09/10b 精神。

---

## 范围（In Scope）

### P0 — 描述性规范涌现（Norm counters）

扩展 `@gss/social`（或新建薄模块 `@gss/norms`，推荐仍放 social 以免包爆炸）：

```
NormObservationCounter {
  scope: { placeId?: string; groupId?: string }
  actionType: ActionType   // 如 take | work | give | rest
  windowTicks: number
  count: number
  uniqueActors: Set<AgentId>
}

Norm {
  id, kind: 'descriptive' | …,
  scope, strength,
  origin: 'emergent' | 'institutional' | 'injected',
  evidence: counter snapshot,
  createdAt
}
```

**规则（最小可实现）：**

1. 每次成功 `action.applied` → 更新对应 `(placeId, actionType)` 滚动计数（窗口默认 3 日 tick，即 `3 * ticksPerDay`）  
2. 当 `count >= T_freq`（默认 5）且 `uniqueActors >= T_actors`（默认 2）→ **spawn** `Norm{ origin:'emergent', kind:'descriptive' }`  
3. 指标：`emergent_norm_count = count(norms where origin=='emergent')`（**排除** injected/institutional）  
4. 可选 Phase 轻量：`norm.violation` 目击后小幅改 relation（不要求完整制裁行动）  
5. Norm 表进入 **checkpoint**；指纹可含 `normDigest`  

**不变量：**

- 涌现路径 **不可** 把 `origin` 写成 `injected`  
- 禁止 LLM 直接写 Norm 表；仅事件归约  
- Cognition 只读 `SocialSlice.activeNorms`（或等价只读字段）  

### P0 — 场景 `trio-cabin`（3 Agent + 稀缺）

- 地图：沿用 cabin–woods–storehouse  
- **3 Agent**：如 Alice / Bob / Carol  
- **稀缺：** storehouse 食物池初始偏少（如 4–6），woods 少量；饥饿驱动竞争  
- 行为空间：move / take / work / give / speak(promise|request) / rest（沿用现有）  
- **不写死剧本结局**，用初始 needs/角色倾向诱导互动：  
  - 至少一人偏合作（更高 give 权重）  
  - 至少一人偏争抢（更高 take 权重）  
- CLI：  
  ```bash
  pnpm sim run --scenario trio-cabin --days 5 --seed 42
  pnpm sim run --scenario trio-cabin --days 2 --seed 42 --checkpoint ./ckpts/t.json
  pnpm sim resume --checkpoint ./ckpts/t.json --days 3
  pnpm sim compare-seeds --scenario trio-cabin --seed 42 --days 5
  ```

**出口标准：**

1. 无 key ≥5 日 exit 0；3 名 agent 均在合法 place  
2. 同 seed 双跑指纹一致（含 social/memory/norm digest）  
3. 在**无** `origin:injected` 规范的种子集上，`emergent_norm_count > 0`（可用固定 seed 夹具；若随机不足，允许在测试中用「加速计数窗口/更低阈值」**仅测试配置**，生产默认阈值不变，并在文档标明）  
4. Checkpoint 续跑后：norm 表与 memory/social 仍在；clock 单调  

### P0 — 认知对规范的最小反应（可选但推荐）

- Deliberate 读到 active descriptive norm 时：对「符合规范的 actionType 在该 place」小幅加分；或对反复 take 在「已涌现分享/克制规范」的 place 小幅减分（规则表即可，不必 LLM）  
- DecisionTrace 可记录 `normsConsidered: NormId[]`（字段可进 contracts 扩展，或放 `attended` signal）

### P1 — 成本门禁（轻量，非主验收）

- `CognitiveBudget` 或 Runtime 级：每 agent 每 tick 默认 reactive；记录 `tokensUsed` 累计  
- Stub 路径 tokens=0 仍通过  
- 单测：预算结构存在且 sim 不崩溃即可（**不做**真 NewAPI 门槛）

### P1 — 文档

- `docs/engineering/norms-scarce-trio.md`：计数阈值、窗口、场景参数、与评估 #2 映射、偏差表  
- README 增加 `trio-cabin` 快速开始  
- 交叉链接 GOAL-001/002 工程文档  

### 明确 Out of Scope

- 指令性规范/禁忌/完整制裁行动树  
- Ledger、市场、税收、契约法  
- 声誉多维 / 权力 / 冲突状态机全量  
- 实验 fork / 参数扫描 CLI  
- 向量记忆、LangGraph 强制  
- 实网 LLM 作为 pass gate  

---

## 验收标准（Acceptance Criteria）

1. **可运行：** `pnpm install && pnpm test && pnpm sim run --scenario trio-cabin --days 5 --seed 42` 无 key 成功。  
2. **Norm 机制为真源代码：** 存在 counter → spawn emergent Norm 的 shipped 实现 + 单测（达阈 spawn；injected 不计入 emergent_norm_count）。  
3. **SocialSlice/只读：** 认知不写 Norm；边界测试保留/扩展。  
4. **trio-cabin：** 3 agent、稀缺池、≥5 日、合法位置。  
5. **确定性：** 同 seed 指纹 equal。  
6. **Checkpoint：** save/load 含 norms（+既有 memory/social）；续跑后状态连续。  
7. **评估 #2 迷你：** 至少一条夹具/测试断言 `emergent_norm_count > 0`（在约定 seed 或测试用阈值下）。  
8. **文档 + conventional commits + 无密钥。**  

---

## 验证计划（Verification plan）

执行者自行跑并写入 `{SCRATCH}`：

1. `pnpm test` — 全绿；覆盖 norm spawn、emergent 计数、trio 五日、确定性、checkpoint、边界  
2. `pnpm sim run --scenario trio-cabin --days 5 --seed 42` — exit 0；日志含 3 agent  
3. `pnpm sim compare-seeds --scenario trio-cabin --seed 42 --days 5` — equal  
4. checkpoint 2 日 → resume 3 日 — day 连续；norm/memory 仍在  
5. secrets 扫描  

---

## 建议实现顺序

1. NormCounter + spawn + `emergent_norm_count` + 单测  
2. Runtime：action.applied → 计数；checkpoint/fingerprint  
3. SocialSlice 暴露 activeNorms；认知微加权  
4. `createTrioCabinWorld` + 三角色 cognition roleHint  
5. CLI 场景注册  
6. 评估夹具 seed  
7. 文档与 commits  

---

## 完成定义（Definition of Done）

- 验收 1–8 满足  
- 偏差表写入 engineering 文档  
- 向用户说明：如何看 emergent_norm_count、trio 稀缺参数、下一 goal 建议  

---

## 给用户的 /goal 粘贴版（短）

```
执行 docs/goals/GOAL-003-norms-scarce-trio.md

在 GOAL-001/002 之上落地阶段 B 收尾 / C 入口：
- 描述性规范：对 (place, actionType) 滚动计数，达阈 spawn origin=emergent 的 Norm；指标 emergent_norm_count（排除 injected）
- Norm 进 checkpoint 与指纹；认知只读 activeNorms，可对合规行动微加权
- 场景 trio-cabin：3 Agent + 稀缺食物池；move/take/work/give/speak/rest；无 key ≥5 日、同 seed 可复现、checkpoint 续跑
- 至少一条测试/夹具断言 emergent_norm_count > 0

架构延续：Domain-first，Agent 永不写 World；Stub LLM；TypeScript monorepo。
验证按该文档 Verification plan 留证；commit 遵循 docs/COMMIT_CONVENTION.md；禁止提交密钥。
```

---

## 建议再下一条（本 goal 完成后）

**GOAL-004：** 实验层最小能力 — seed 已有基础上的 **institutionParams 注入**、简单对照指标导出（基尼/资源分布）、评估 #5 迷你（改一个池大小看宏观指标变化）；或 **PublicGood 搭便车**  vignette。  
