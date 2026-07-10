# GOAL-009：CI 回归套件 + 多场景冒烟 + 叙事高光

> 可直接作为下一条 `/goal` 正文使用（整份粘贴，或：`执行 docs/goals/GOAL-009-ci-regression-highlights.md`）。

---

## 一句话目标

在 **GOAL-001～008**（运行时、记忆/规范、实验指标、公共品、制度、Observer、立法与简报）之上，把仓库从「本地可跑」升级为 **可持续守护的实验平台**：落地 **GitHub Actions CI**、**多场景回归套件**（同 seed 冒烟 + 关键对照断言），以及 **叙事高光检测**（冲突 / 立法通过 / 规范涌现等自动标记，可导出、可测）；默认 Stub、无密钥。

**非目标：** 云端多租户、30 日真跑 CI（过慢）、完整精美 UI、强制实网 LLM、Observer 写入鉴权（可 GOAL-010）、八项评估全量夹具（本 goal 覆盖已有能力的回归与高光子集）。

---

## 前置依赖

- GOAL-001～008 已完成并在 `main` 可测  
- 场景：`solo-cabin` / `dyad-cabin` / `trio-cabin` / `commons-cabin` / `assembly-cabin`  
- 指标、`compare-params`、`compare-seeds`、brief、timeline、proposals  
- 架构延续：Domain-first；Stub LLM；`docs/COMMIT_CONVENTION.md`；**禁止**提交密钥  

---

## 范围（In Scope）

### P0 — GitHub Actions CI

新增 `.github/workflows/ci.yml`（或等价）：

| 步骤 | 要求 |
|------|------|
| 触发 | `push` / `pull_request` 到 `main`（及可选 `workflow_dispatch`） |
| 环境 | Node 22 LTS + `pnpm`（对齐 `packageManager`） |
| 安装 | `pnpm install --frozen-lockfile` |
| 测试 | `pnpm test` |
| 回归 | `pnpm regression`（见下；失败即红） |
| 密钥 | **不**注入任何 API key；全程 Stub |

可选 P1：`pnpm typecheck`（若各包 typecheck 已稳定）。

**出口：** 空提交或本 goal 合并后，CI 绿；无密钥日志。

### P0 — 多场景回归套件

新增脚本（推荐其一或组合）：

```bash
pnpm regression
# 内部可调用：tsx scripts/regression.ts 或 packages/sim 内 export 的 runRegressionSuite()
```

**冒烟矩阵（固定 seed，天数短，CI 友好）：**

| 场景 | days | seed | 硬断言（示例，可微调但须可测） |
|------|------|------|--------------------------------|
| solo-cabin | 3 | 42 | exit 0；agent 数 = 1 |
| dyad-cabin | 3 | 42 | exit 0；agent 数 = 2 |
| trio-cabin | 3 | 42 | exit 0；agent 数 = 3 |
| commons-cabin | 3 | 42 | exit 0；metrics 含 granary / contribute 相关字段 |
| assembly-cabin | 3 | 42 | exit 0；可序列化 checkpoint |

**对照 / 确定性（至少各 1 条，可并入 `pnpm test` 或 regression）：**

1. **同 seed 确定性：** `compare-seeds`（或双跑 fingerprint）至少对 1 个多 agent 场景 equal。  
2. **制度 / 稀缺方向：** 复用已有夹具精神——如 trio 稀缺 vs 丰裕 `totalFood` 方向，或 commons 高/低 enforcement 主指标方向（已有测试可引用，不必重写逻辑，但须出现在回归入口或文档清单）。  
3. **立法路径：** assembly / legislature 至少一条「提案→passed→institution 变化」仍绿（已有 `legislature.test` 即可计入）。

实现偏好：

- 回归入口打印摘要表（scenario / ok / ms / key metrics）  
- 失败时非 0 退出码 + 明确失败场景名  
- 总时长目标：本地与 CI **< 3 分钟**（优先砍 days，不砍场景覆盖）

### P0 — 叙事高光（NarrativeHighlight）

从已有事件 / timeline / metrics / proposals 中 **规则检测** 高光时刻（非 LLM 编剧）：

```typescript
type HighlightKind =
  | 'conflict'           // 资源不足拒绝、偷窃/抢夺失败、显著 trust↓ 等（择已有信号）
  | 'policy_passed'      // 立法通过
  | 'norm_emerged'       // emergent_norm 计数上升（若已有）
  | 'promise_broken'     // 违约/未履约（若已有信号）
  | 'public_good_shift'  // granary 或 contribute 突变（可选阈值）
  | 'injection';         // ControlRoom 注入（可选）

interface NarrativeHighlight {
  id: string;
  kind: HighlightKind;
  tick: number;
  day?: number;
  summary: string;           // 一行中文或英文可读摘要
  agentIds?: string[];
  refs?: { proposalId?: string; eventType?: string; metricKey?: string };
}
```

**API / CLI：**

| 入口 | 说明 |
|------|------|
| `detectHighlights(input)` | 纯函数：timeline + metrics + proposals（+ 可选 DomainEvent 流）→ `NarrativeHighlight[]` |
| `pnpm sim highlights --scenario assembly-cabin --days 5 --seed 42` | 打印 JSON 或 Markdown 列表 |
| 可选 | run 结束 `--highlights-out ./highlights.json` |
| 可选 P1 | Observer `GET /highlights` 只读 |

**检测规则（最小可测集，P0 至少 2 类）：**

1. **policy_passed**：任意 proposal `status === 'passed'` → 一条高光。  
2. **conflict**：timeline/audit 中出现资源拒绝、insufficient、theft 相关事件，或 metrics 中可解释的冲突计数 → 至少能在稀缺 trio / commons 路径测到 0 或 1 条（允许「本 seed 无冲突则空列表」，但须有 **强制夹具** 能造出 ≥1 条）。  
3. 第三类任选：`norm_emerged` / `promise_broken` / `injection` 之一。

**出口：**

- 单元测试：对伪造 timeline/proposals 的 fixture，检测结果稳定、同输入同输出。  
- 集成：`assembly-cabin` 跑通后，若出现 passed proposal，highlights 含 `policy_passed`。  

### P1 — 指标与简报挂钩

- `renderDailyBrief` 或独立 section：当日若有高光，追加 `Highlights: ...`  
- metrics 可选字段：`highlightCount` / 按 kind 计数  

### 明确 Out of Scope

- 云 CI 矩阵多 OS  
- 真 30 日长跑 job  
- LLM 生成「新闻稿」式叙事（可后接）  
- 完整八项评估 #1–#8 全量（本 goal 映射 #5/#6/#7/#8 的 **回归与可观测子集**）  
- Observer 写路径鉴权  

---

## 与蓝图评估的映射

| 评估 # | 本 goal 贡献 |
|--------|----------------|
| 5 制度→宏观 | 回归保留 institution / commons 对照 |
| 6 单点失败不崩 | CI 持续跑通；fault 夹具若已有则纳入清单（无则不新造） |
| 7 冲突可追溯 | 高光 + timeline refs，非完整 explain() |
| 8 同种子可复现 | compare-seeds / fingerprint 进 CI 或 regression |

---

## 验收标准（Acceptance Criteria）

1. **CI 文件存在且可运行：** `.github/workflows/*.yml` 含 install + `pnpm test` + 回归；不依赖密钥。  
2. **`pnpm regression`（或文档等价命令）** 覆盖 ≥4 个场景短跑，失败非 0。  
3. **`detectHighlights` + 至少 2 种 kind** 有自动化测试；立法路径能产生 `policy_passed`。  
4. **CLI** `pnpm sim highlights ...` 或 `--highlights-out` 产出非空结构（当检测有结果时）或合法空数组 JSON。  
5. **现有 `pnpm test` 全绿**；无密钥提交；conventional commits。  
6. **文档：** `docs/engineering/ci-regression-highlights.md`（或等价）说明如何本地跑 CI 等价命令、高光字段与偏差表；README 链到 GOAL-009 完成状态。  

---

## 验证计划（Verification plan）

1. `pnpm install && pnpm test` → 留日志  
2. `pnpm regression` → 全场景 ok  
3. `pnpm sim highlights --scenario assembly-cabin --days 5 --seed 42`（或文档命令）→ 合法输出  
4. 对 highlights 单元测试 / 立法集成测试绿  
5. 检查 workflow YAML 语法合理；secrets 扫描（无 key）  
6. 可选：用 `act` 本地模拟 CI（非强制）  

---

## 建议实现顺序

1. `detectHighlights` + 单元测试 + CLI / highlights-out  
2. `scripts/regression.ts` + `package.json` script；串起多场景短跑  
3. `.github/workflows/ci.yml`  
4. brief/metrics 挂钩（P1）  
5. engineering 文档 + README + GOAL-008 完成指针  
6. commits：`feat` / `test` / `ci` / `docs` 分离  

---

## 完成定义（Definition of Done）

- 验收 1–6 满足  
- 偏差表写入 engineering 文档  
- 向用户说明：如何本地等价 CI、如何读 highlights、建议的 GOAL-010  

---

## 给用户的 /goal 粘贴版（短）

```
执行 docs/goals/GOAL-009-ci-regression-highlights.md

在 GOAL-001～008 之上落地：
- GitHub Actions CI：pnpm install --frozen-lockfile + pnpm test + 多场景回归；全程 Stub，无密钥
- pnpm regression：solo/dyad/trio/commons/assembly 等短跑冒烟 + 确定性/对照断言入口
- NarrativeHighlight 规则检测（至少 policy_passed + conflict 一类）；detectHighlights + CLI/highlights-out；可选 GET /highlights
- 文档 + conventional commits；禁止提交密钥

架构延续：Domain-first；Agent 永不写 World；Stub LLM；TypeScript monorepo。
验证按该文档 Verification plan 留证；commit 遵循 docs/COMMIT_CONVENTION.md。
```

---

## 建议再下一条（本 goal 完成后）

**GOAL-010 候选（择一或合并为小 scope）：**

1. **Observer 写路径最小鉴权**（`OBSERVER_TOKEN` / 默认关 inject）  
2. **实验包 v2**：分叉 fork + A/B bundle 对比报告 HTML/MD  
3. **eval 夹具深化**：承诺续跑（#1）或谣言-信念（#4）缩小场景  
4. **explain(eventId)** 证据链最小版（评估 #7）  
