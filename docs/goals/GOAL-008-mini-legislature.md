# GOAL-008：迷你立法环（提案 → 投票 → 生效）+ 社会简报

> 可直接作为下一条 `/goal` 正文使用（整份粘贴，或：`执行 docs/goals/GOAL-008-mini-legislature.md`）。

---

## 一句话目标

在 **GOAL-001～007**（仿真内核、公共品、制度旋钮、Control/Observer）之上，落地 **Agent 可提案修改 InstitutionParams 的迷你立法环**（提案→同地投票→通过后生效），并输出 **规则模板社会简报**（可选 Stub/LLM 润色，默认无 key）；可复现、可测、不引入完整议会 UI。

**非目标：** 多院制/宪法法院、完整政党、Web 立法前端、强制实网 LLM、千人议会。

---

## 前置依赖

- GOAL-006：`InstitutionParams`、enforcement / contributionReward / freeRidePenalty / transparency  
- GOAL-005：commons-cabin、公共品  
- GOAL-007：observer（可选展示提案列表）  
- 架构延续：Domain-first；制度生效须经权威路径（Runtime/World/Control 应用，**非** cognition 私写）；Stub LLM；`docs/COMMIT_CONVENTION.md`；**禁止**提交密钥  

---

## 范围（In Scope）

### P0 — 提案与投票状态（Social / 新薄模块）

```typescript
interface PolicyProposal {
  id: string;
  author: AgentId;
  createdTick: number;
  /** patch to InstitutionParams, e.g. { enforcementStrength: 0.8 } */
  patch: InstitutionParams;
  status: 'open' | 'passed' | 'rejected' | 'expired';
  votes: Record<AgentId, 'yea' | 'nay' | 'abstain'>;
  placeId: PlaceId;       // 投票须同地（如 cabin 议事）
  expireTick?: number;
}
```

- 存储：`SocialGraph` 扩展或 `@gss/policy` 包，**事件归约** + checkpoint 序列化  
- 指标：`proposalsOpen` / `proposalsPassed` / 当前 institution 快照  

### P0 — 结构化行动

| ActionType | 含义 |
|------------|------|
| `propose_policy` | args: patch 字段；须在议事地点（默认 cabin） |
| `vote_policy` | args: proposalId, vote yea/nay/abstain；须与提案同 place |

- World 或 PolicyAuthority 校验：地点、提案 open、一人一票  
- 通过规则（可配置，默认写死可测）：  
  - `yeas >= ceil(presentAgents * 0.5)` 且 `yeas > nays`，或  
  - 固定 `yeas >= 2`（3 人 vignette）  
- **通过后**：Runtime 调用已有 `applyInstitution(merge(current, patch))`，写 audit/timeline  

### P0 — 认知倾向

- 角色：cooperative 更易提案提高 `contributionReward` / enforcement；free_rider 更易提案降低 enforcement 或投 nay 对严法  
- 选项生成：规则表 + 当前 institution 读入 DecisionTrace（`attended` 可记 `policy.open`）  

### P0 — 场景 `assembly-cabin`（或扩展 commons-cabin）

- 3 Agent，公共品保留  
- 参数：`assemblyPlace=cabin`、`voteThreshold`、初始 institution  
- CLI：  
  ```bash
  pnpm sim run --scenario assembly-cabin --days 5 --seed 42
  pnpm sim compare-params --scenario assembly-cabin --seed 42 --days 5 \
    --a freeRiderCount=0 --b freeRiderCount=2
  ```

**出口：**

1. 无 key ≥5 日 exit 0  
2. 至少一条测试路径出现 **passed proposal** 且 institution 字段相对初始变化  
3. 同 seed 可复现  

### P0 — 社会简报（规则模板）

```typescript
function renderDailyBrief(orch, day): string
// 例：Day 3 | food=.. | granary=.. | enforcement=.. | proposals passed=..
```

- `pnpm sim brief --scenario assembly-cabin --days 3 --seed 42`  
- 或 run 结束 `--brief-out ./brief.md`  
- **默认纯模板**；`GSS_LLM=1` 时可选润色（不作为验收门槛）  

### P1 — Observer 只读扩展

- `GET /proposals` 列表 open/passed  
- 静态页增加提案表格（可选）  

### 明确 Out of Scope

- 复杂修法程序、宪法审查  
- 媒体舆论工业  
- 多世界立法同步  

---

## 验收标准（Acceptance Criteria）

1. `propose_policy` / `vote_policy` 经权威校验；认知不直写 institution。  
2. 通过后 `applyInstitution` 生效（如 enforcementStrength 变化可被后续 withdraw 规则观测）。  
3. 至少一条 shipped 测试：从提案到 passed 的完整路径（可用脚本化高权重角色或注入投票，但 **生效** 必须走真实 apply）。  
4. `renderDailyBrief` 或 CLI brief 产出非空文本，含 day 与至少一项宏观量。  
5. checkpoint 含 proposals + institution；同 seed 可复现。  
6. 文档 + conventional commits + 无密钥。  

---

## 验证计划（Verification plan）

1. `pnpm test` → `{SCRATCH}/test.log`  
2. `pnpm sim run --scenario assembly-cabin --days 5 --seed 42` exit 0  
3. 立法路径测试：passed + institution 变化  
4. `pnpm sim brief ...` 或 brief-out 文件非空  
5. secrets 扫描  

---

## 建议实现顺序

1. PolicyProposal 状态机 + checkpoint  
2. World/Runtime 行动 validate/apply + 通过后 applyInstitution  
3. Cognition 提案/投票选项  
4. assembly-cabin + 测试  
5. brief 模板 + CLI  
6. 文档与 commits  

---

## 完成定义（Definition of Done）

- 验收 1–6 满足  
- 偏差表写入 engineering 文档  
- 向用户说明：如何观察立法生效、简报字段、下一 goal 建议  

---

## 给用户的 /goal 粘贴版（短）

```
执行 docs/goals/GOAL-008-mini-legislature.md

在 GOAL-001～007 之上落地：
- PolicyProposal 状态机；propose_policy / vote_policy（同地议事）；通过后 applyInstitution
- 场景 assembly-cabin（3 Agent + 公共品 + 立法）；至少一条测试走通提案→通过→旋钮变化
- 规则模板社会简报 CLI/brief-out（默认无 LLM）
- checkpoint 含提案与 institution；无 key 可复现

架构延续：Domain-first，Agent 永不写 World/institution 私改；Stub LLM；TypeScript monorepo。
验证按该文档 Verification plan 留证；commit 遵循 docs/COMMIT_CONVENTION.md；禁止提交密钥。
```

---

## 建议再下一条（本 goal 完成后）

**GOAL-009：** 多场景回归套件 + CI workflow；或 **叙事高光检测**（冲突/立法通过自动标记）；或 Observer 写入开关的安全鉴权最小实现。  
