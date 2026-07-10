# 因果解释 explain + 证据链（GOAL-010）

只读聚合：不写 World。对应蓝图评估 **#7 冲突可追溯**。

## CLI

```bash
# 默认：第一条 conflict 高光
pnpm sim explain --scenario commons-cabin --days 3 --seed 42

# 显式查询形态（均支持）
pnpm sim explain --scenario commons-cabin --days 3 --seed 42 --from-highlight-kind conflict
pnpm sim explain --scenario commons-cabin --days 3 --seed 42 --tick 5 --agent agent-bob
pnpm sim explain --scenario commons-cabin --days 3 --seed 42 \
  --action-line '5:agent-bob:withdraw_public:REJECT:INSUFFICIENT_RESOURCE'
pnpm sim explain --scenario assembly-cabin --days 5 --seed 42 --proposal prop-1

# 写出文件
pnpm sim explain --scenario commons-cabin --days 3 --seed 42 \
  --from-highlight-kind conflict --out ./chain.json

# 从 checkpoint
pnpm sim explain --from-checkpoint ./ckpts/x.json --tick 2 --agent agent-alice
```

Stdout 为 **JSON `EvidenceChain`**（`found` 布尔 + `summary` + `links[]` + 可选 `trace`）。未命中时 `found: false`，不抛异常，exit 0。

## 支持的查询形态

| 形态 | CLI / API | 说明 |
|------|-----------|------|
| `tick` + `agentId` | `--tick` `--agent` | DecisionTrace + 同 tick action sequence |
| `actionLine` | `--action-line` | 精确或子串匹配序列行；REJECT 附加 domain_event |
| `proposalId` | `--proposal` | 提案状态/票/patch；passed 时附 institution |
| `highlightKind` | `--from-highlight-kind` | 首条该 kind 高光再展开 |
| `highlightId` | `--highlight-id` | 指定高光 id |

## 程序 API

```typescript
import { explain, explainFromOrch, snapshotFromOrch } from "@gss/experiment";
// or from @gss/sim

const chain = explain({ tick: 5, agentId: "agent-bob" }, snapshot);
const live = explainFromOrch(orch, { proposalId: "prop-1" });

// Control Room
control.explain({ actionLine: "..." });
```

### EvidenceChain 字段

- `query.key` — 规范化查询键  
- `found` / `summary`  
- `links[]` — `kind`: `decision_trace` | `action_sequence` | `domain_event` | `memory` | `proposal` | `institution` | `highlight` | `world_snapshot`  
- `trace?` — DecisionTrace 精简投影  

## Observer HTTP

```http
GET /explain?tick=5&agent=agent-bob
GET /explain?proposalId=prop-1
GET /explain?actionLine=...
GET /explain?highlightKind=conflict
```

## 偏差表

| 规格 | 实现 |
|------|------|
| OBSERVER_TOKEN 写鉴权 | 未做（GOAL-011 候选） |
| from-checkpoint 经 CLI | 已支持 |
| 记忆 link | 仅在 trace.retrievedMemoryIds 可 `get` 时附加 |

## 测试

- `packages/experiment/src/explain.test.ts` — 纯函数 fixture  
- `packages/sim/src/explain.test.ts` — commons conflict + assembly proposal  
- `packages/observer` — GET `/explain`  
