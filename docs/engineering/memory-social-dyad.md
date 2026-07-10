# Memory + Social Dyad（GOAL-002 / 阶段 B 入口）

## 快速开始

```bash
pnpm install
pnpm test
pnpm sim run --scenario dyad-cabin --days 5 --seed 42
pnpm sim run --scenario dyad-cabin --days 2 --seed 42 --checkpoint ./ckpts/d.json
pnpm sim resume --checkpoint ./ckpts/d.json --days 3
pnpm sim compare-seeds --scenario dyad-cabin --seed 42 --days 5
```

## 新增包

| 包 | 职责 |
|----|------|
| `@gss/memory` | Episodic / Social / Prospective；encode / retrieve / decay；承诺重要性地板 `0.75` |
| `@gss/social` | 关系边 + `PromiseRecord`；事件归约；只读 `SocialSlice` |

## 数据流

```
World.apply(speak/give)
  → DomainEvent (message.delivered | promise.made | …)
  → Runtime.reduce → SocialGraph.reduce + MemoryStore.encode
  → 下 tick Cognition 读 SocialSlice + retrieve(memories)
  → ActionProposal（可履约 give / 再 promise）
```

- Cognition / Memory **不**依赖可写 World。  
- 面对面：`speak` 仅 **同 place** 产生 `message.delivered`；异地 → `message.undelivered`。  
- `intent=promise` 且送达成功 → `promise.made` + Prospective/Social 记忆（promise-class）。

## Checkpoint

`CheckpointBundle` 增加 `memory` + `social` 快照；续跑后 `retrieve` 与 pending/kept 承诺仍可用。

## 权威指纹

在 GOAL-001 字段上增加 `memoryDigest` / `socialDigest`（hash）。

## 与蓝图映射

| 蓝图 | 本实现 |
|------|--------|
| §4 记忆生命周期 | 三类 + encode/retrieve/decay |
| 评估 #1 承诺记忆 | promise-class 地板 + checkpoint 续跑 |
| 阶段 B 小群体 | `dyad-cabin` 2 Agent |
| 信息局部化 | 同地 speak |

## 偏差表

| 条款 | 实现 | 理由 |
|------|------|------|
| 七类记忆 | 仅 E/S/P | GOAL-002 范围 |
| 向量检索 | 关键词+标签打分 | 无 ANN 依赖 |
| 完整 SocialAuthority | 最小图+承诺 | 非声誉/权力全量 |
| 规范涌现 | 未做 | GOAL-003+ |
