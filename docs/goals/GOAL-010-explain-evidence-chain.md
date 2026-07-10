# GOAL-010：因果解释 explain + 最小证据链（评估 #7）

> 可直接作为下一条 `/goal` 正文使用（整份粘贴，或：`执行 docs/goals/GOAL-010-explain-evidence-chain.md`）。

---

## 一句话目标

在 **GOAL-001～009**（内核、制度、Observer、立法、高光与 CI）之上，落地 **冲突/行动可追溯的最小证据链**：给定 timeline 事件、action 序列行、proposal、highlight 或 `(tick, agentId)`，输出结构化 **`EvidenceChain`**（关联 DecisionTrace、拒绝码、记忆/提案引用、世界摘要），经 **CLI / Control API / 可选 HTTP** 可查；同 seed 可复现、有自动化测试、无密钥。

**非目标：** 完整因果图可视化 UI、LLM 生成「新闻稿式」解释、全量 30 日 explain 性能压测、Belief 谣言完整场景（#4）、Observer 生产级 OAuth（仅 P1 最小 token）。

---

## 前置依赖

- GOAL-007/009：timeline、highlights、Observer 只读 API  
- Runtime：`getTraces()` / checkpoint 含 `DecisionTrace[]`；`getActionSequence()`  
- Social：`PolicyBoard` proposals；Memory：`MemoryStore`  
- 架构延续：Domain-first；解释只读不写 World；Stub LLM；`docs/COMMIT_CONVENTION.md`；**禁止**提交密钥  

---

## 范围（In Scope）

### P0 — EvidenceChain 契约

```typescript
interface EvidenceLink {
  kind:
    | 'decision_trace'
    | 'action_sequence'
    | 'domain_event'
    | 'memory'
    | 'proposal'
    | 'institution'
    | 'highlight'
    | 'world_snapshot';
  ref: string;           // id or sequence line or proposalId
  tick?: number;
  summary: string;
}

interface EvidenceChain {
  query: {
    /** 原始查询串或结构化键 */
    key: string;
    tick?: number;
    agentId?: string;
    eventType?: string;
  };
  found: boolean;
  summary: string;       // 一行中文/英文可读结论
  links: EvidenceLink[];
  /** 可选：匹配到的 DecisionTrace 精简投影（勿整包巨型 dump 也可接受截断） */
  trace?: {
    agentId: string;
    tick: number;
    dominantNeeds: string[];
    optionsTop: Array<{ verb?: string; score: number; rejectReason?: string }>;
    chosen?: string;
    retrievedMemoryIds: string[];
    attended: Array<{ kind: string; salience: number; ref?: string }>;
  };
}
```

- 包位置建议：`@gss/experiment` 的 `explain.ts` 或 `@gss/control` 的 `explain.ts`（**优先 control/experiment 只读聚合，不新增重依赖环**）  
- 纯函数优先：`explain(input: ExplainQuery, snapshot: ExplainSnapshot): EvidenceChain`  
- 另提供：`explainFromOrch(orch, query)` 从 TickOrchestrator 取 traces / sequence / proposals / metrics  

### P0 — 查询形态（至少支持 3 种）

| 查询 | 含义 | 解析策略（示例） |
|------|------|------------------|
| `tick` + `agentId` | 该 Agent 在该 tick 的决策 | 匹配 `DecisionTrace`；附带同 tick 的 action sequence 行 |
| `actionLine` 或 sequence 子串 | 如 `12:agent-bob:take:REJECT:INSUFFICIENT_RESOURCE` | 解析 tick/actor/verb/code；挂 reject 与 trace |
| `proposalId` | 如 `prop-1` | 提案状态、作者、patch、相关 votes 摘要；若 passed 则 institution 变化说明 |
| 可选 | `highlightId` | 从 highlight.refs 反查 |

**找不到时：** `found: false`，`summary` 说明未命中，`links: []`，**不得抛未捕获异常**（CLI exit 0 输出 JSON 亦可，或 exit 3 文档约定一种）。

### P0 — 与高光/时间线的衔接

- 对 `kind: conflict` 的 NarrativeHighlight：`explain` 应能从 `refs` 或 tick/agent 给出至少 1 条 `action_sequence` 或 `decision_trace` link  
- 对 `policy_passed`：能从 `proposalId` 给出 proposal + institution 相关 link  
- 不要求完整图搜索；**规则拼接**即可  

### P0 — CLI

```bash
pnpm sim explain --scenario commons-cabin --days 3 --seed 42 \
  --tick 5 --agent agent-bob

pnpm sim explain --scenario assembly-cabin --days 5 --seed 42 \
  --proposal prop-1

pnpm sim explain --scenario commons-cabin --days 3 --seed 42 \
  --action-line '5:agent-bob:withdraw_public:REJECT:INSUFFICIENT_RESOURCE'

# 可选：从已有 checkpoint
pnpm sim explain --from-checkpoint ./ckpts/x.json --tick 2 --agent agent-alice

# 可选：把某次 run 的 highlights 中第一条 conflict 自动 explain
pnpm sim explain --scenario commons-cabin --days 3 --seed 42 --from-highlight-kind conflict
```

- 默认 stdout **JSON**（`EvidenceChain`）  
- 可选 `--out ./chain.json`  

### P0 — Control / 只读 API（薄）

- `ControlRoomService.explain(query)` 或独立导出函数（测试可直接测纯函数）  
- Observer（推荐 P0 或 P1）：  
  - `GET /explain?tick=&agent=`  
  - `GET /explain?proposalId=`  
  - `GET /explain?actionLine=`（URL encode）  

### P0 — 测试（禁止 theater）

1. **单元：** 伪造 `ExplainSnapshot`（traces + actionSequence + proposals）→ `explain` 返回 `found: true` 且 links 含期望 kind。  
2. **集成：** 真实 `createSimulation` + 短跑后：  
   - 至少一条 `REJECT:INSUFFICIENT_RESOURCE`（或已有 conflict 信号）可 `explain` 成功；  
   - 或 assembly 上对 **真实 passed proposal** `explain --proposal` 成功。  
3. 同输入同输出（确定性）。  

### P1 — Observer 写路径最小鉴权（可选，同一 goal 可做小步）

- 已有 `OBSERVER_ALLOW_WRITE=1`；增加可选 `OBSERVER_TOKEN`：  
  - 写接口（`POST /inject`、`POST /run/step`）要求 header `Authorization: Bearer <token>` 或 `X-GSS-Token`  
  - 未配置 token 时行为与现网一致（仅 ALLOW_WRITE）  
  - 配置 token 但错误/缺失 → 401  
- **不做** 完整用户体系  

### 明确 Out of Scope

- 交互式因果图前端  
- 跨 run 全局事件数据库  
- 强制 LLM 润色 explain  
- 完整 Belief 谣言评估 #4 场景  
- 云端多租户鉴权  

---

## 与蓝图评估的映射

| 评估 # | 本 goal 贡献 |
|--------|----------------|
| 7 冲突可追溯 | **主交付**：EvidenceChain + explain |
| 5 制度可解释 | proposal → institution link |
| 8 可复现 | 同 seed 查询稳定；进 `pnpm test` |

---

## 验收标准（Acceptance Criteria）

1. **`explain` / `explainFromOrch` 已导出**，对合法查询返回结构化 `EvidenceChain`；未命中不崩溃。  
2. **至少支持** `(tick, agentId)`、`proposalId`、action-line（或等价 sequence 查询）三种之一组合中的 **≥2 种**，且文档列出全部已支持形态。  
3. **自动化测试**：fixture 单元 + 至少 1 条真实短跑集成（conflict 或 policy）。  
4. **CLI** `pnpm sim explain ...` 产出合法 JSON；可选 `--out`。  
5. **现有 `pnpm test` / `pnpm regression` 全绿**；无密钥；conventional commits。  
6. **文档** `docs/engineering/explain-evidence-chain.md` + README 链接；GOAL-009 指针更新。  

---

## 验证计划（Verification plan）

1. `pnpm install && pnpm test` → `{SCRATCH}/test.log`  
2. `pnpm regression` → 仍绿  
3. `pnpm sim explain --scenario commons-cabin --days 3 --seed 42 --from-highlight-kind conflict`（或文档等价命令）→ JSON `found: true` 或可解释的 found:false + 测试证明 found 路径  
4. assembly proposal explain（若集成测覆盖可只留测试日志）  
5. secrets 扫描；workflow 无需改密钥  

---

## 建议实现顺序

1. `EvidenceChain` 类型 + `explain` 纯函数 + 单元测试  
2. `explainFromOrch` + 与 highlights 衔接  
3. CLI `explain`  
4. Control/Observer 只读路由  
5. 集成测试 + engineering 文档  
6. （可选）OBSERVER_TOKEN  
7. commits  

---

## 完成定义（Definition of Done）

- 验收 1–6 满足  
- 偏差表写入 engineering 文档  
- 向用户说明：如何对 conflict/提案做 explain、JSON 字段含义、GOAL-011 建议  

---

## 给用户的 /goal 粘贴版（短）

```
执行 docs/goals/GOAL-010-explain-evidence-chain.md

在 GOAL-001～009 之上落地：
- EvidenceChain + explain / explainFromOrch（只读聚合 DecisionTrace、action sequence、proposal、可选 highlight）
- 至少支持 tick+agent、proposalId、action-line 中的两种以上查询
- CLI：pnpm sim explain ...（JSON / --out）；可选 GET /explain
- 单元 + 真实短跑集成测试（conflict 或 policy_passed 路径）；无密钥

架构延续：Domain-first；解释不写 World；Stub LLM；TypeScript monorepo。
验证按该文档 Verification plan 留证；commit 遵循 docs/COMMIT_CONVENTION.md。
```

---

## 建议再下一条（本 goal 完成后）

**GOAL-011 候选：**

1. **实验包 v2**：checkpoint fork + A/B bundle 对比 MD/HTML 报告  
2. **eval 夹具**：承诺 resume（#1）或谣言-信念（#4）缩小场景  
3. **Observer 写路径鉴权硬化**（若 010 未做 token）  
4. **BeliefStore 最小版** + 信息失真 vignette  
