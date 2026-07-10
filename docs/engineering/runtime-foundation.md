# Runtime Foundation (GOAL-001)

Domain-first GSS 运行时地基：契约、World 权威、确定性 Tick 编排、规则认知、Stub/可选 LLM。

## 快速开始

```bash
pnpm install
pnpm test
pnpm sim run --scenario solo-cabin --days 7 --seed 42
pnpm sim run --scenario solo-cabin --days 3 --seed 42 --checkpoint ./ckpts/a.json --log ./logs/run.jsonl
pnpm sim resume --checkpoint ./ckpts/a.json --days 4
pnpm sim compare-seeds --seed 42 --days 2
```

无 `NEWAPI_API_KEY` 时自动使用 **StubLlm**。可选实网：

```bash
export GSS_LLM=1
export NEWAPI_BASE_URL=https://newapi-jp2.xiaoqianran.xyz
export NEWAPI_API_KEY=...   # 勿提交
export NEWAPI_MODEL=openai/gpt-oss-120b
```

## 包结构

```
packages/contracts   Freeze 类型 + zod(ActionProposal) + agentOrder/hash32
packages/world       WorldAuthority (observe/validate/apply) + solo-cabin
packages/agent       AgentState, needs drift, internal patch
packages/cognition   RuleCognitiveEngine（不依赖 world）
packages/llm         LlmPort, StubLlm, OpenAiCompatibleLlm
packages/runtime     EventBus, TickOrchestrator, checkpoint, fingerprint
packages/sim         场景装配 + run/resume API
apps/sim-cli         CLI
```

**依赖方向：** `cognition` / `agent` → `contracts`（**禁止** → `world`）。仅 `runtime` / `sim` 持有 `WorldAuthority` 写入口。

## Tick 相位（GOAL-001 子集）

相对蓝图 0–12，本阶段实现稳定子集：

| 顺序 | 相位 | 说明 |
|------|------|------|
| 1 | `clock_advance` | tick+1，更新 day/hour |
| 2 | `clear_mutex` | 清空上 tick 具身互斥 |
| 3 | `order_agents` | `hash(seed\|tick\|agentId)` 排序 |
| 4 | `observe` | `WorldAuthority.observe` 局部观察 |
| 5 | `cognitive_tick` | 规则审议 → `ActionProposal` + `DecisionTrace` |
| 6 | `collect_proposals` | 收集提案 |
| 7 | `validate_apply_serial` | 按序 validate+apply（串行） |
| 8 | `emit_events` | EventBus 发布 |
| 9 | `feedback_encode` | 需求/位置反馈写入 AgentState |
| 10 | `tick_complete` | `tick.completed` 事件 |

未实现：并行 think、Social/Ledger 归约、夜间批量反思、兴趣管理降频。

## 与蓝图 / PR 映射

| 蓝图 / PR | 本实现 |
|-----------|--------|
| PR-01 contracts | `packages/contracts` |
| PR-02 World | `packages/world` |
| PR-03 Runtime | `packages/runtime` TickOrchestrator + checkpoint |
| PR-04 Agent | `packages/agent` 最小状态 |
| PR-05 Memory | **未做**（仅 memoryOps 占位） |
| PR-06 Cognition | `packages/cognition` 规则优先 |
| PR-07 LLM | `packages/llm` Stub + optional NewAPI |
| 阶段 A 出口 | solo-cabin 7 日 + 续跑 + 同 seed 指纹 |

## 偏差表

| 蓝图条款 | 实现 | 理由 |
|----------|------|------|
| 认知 11 阶段全量 | 合并为 Perceive/Attend/Feel/Deliberate/Decide/Feedback | GOAL-001 最小可跑 |
| 七类记忆生命周期 | 未实现 MemoryStore | 留给 GOAL-002 |
| Tick 相位 0–12 全量 | 10 步子集 | 文档化；确定性优先 |
| 分区 Social/Ledger | 仅 World | 范围裁剪 |
| LLM 默认深度审议 | 默认 Stub；规则选行动 | 无 key 可复现 |

## 权威指纹

`AuthorityFingerprint`：`tick`, `day`, `agentPlaces`, `resourceTotals`, `actionSequenceHash`, `needs`。  
同 seed pure-rule 双跑应完全相等。
