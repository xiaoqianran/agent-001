# agent-001 — Generative Social Simulator

多 Agent 持续运行的**生成式社会模拟系统（Generative Social Simulator）** 设计与实现仓库。

目标不是 demo 小镇，而是可长期运转、可注入变量、可观测涌现、可复现实验的社会实验平台。

## 快速开始（GOAL-001 运行时地基）

```bash
pnpm install
pnpm test
pnpm sim run --scenario solo-cabin --days 7 --seed 42
pnpm sim run --scenario dyad-cabin --days 5 --seed 42
pnpm sim run --scenario trio-cabin --days 5 --seed 42
```

断点续跑：

```bash
pnpm sim run --scenario trio-cabin --days 2 --seed 42 --checkpoint ./ckpts/t.json
pnpm sim resume --checkpoint ./ckpts/t.json --days 3
```

同 seed 确定性比对：

```bash
pnpm sim compare-seeds --scenario trio-cabin --seed 42 --days 5
```

工程说明：

- [Runtime 地基](docs/engineering/runtime-foundation.md)
- [记忆与小群体](docs/engineering/memory-social-dyad.md)
- [规范与三人稀缺](docs/engineering/norms-scarce-trio.md)

### 包一览

| 包 | 职责 |
|----|------|
| `@gss/contracts` | 领域 Freeze 类型、Seed、ActionProposal |
| `@gss/world` | WorldAuthority：局部观察 + validate/apply |
| `@gss/runtime` | TickOrchestrator、EventBus、checkpoint |
| `@gss/agent` | AgentState / 需求 |
| `@gss/cognition` | 规则优先认知（**不**依赖 world） |
| `@gss/llm` | Stub + 可选 OpenAI-compatible NewAPI |
| `@gss/sim` / `sim-cli` | solo-cabin 场景与 CLI |

架构：**Domain-first** 自研内核；Agent 永不持有 World 写路径。

## 文档

- [总体设计蓝图](docs/design/generative-social-simulator-blueprint.md)
- [Git Commit 规范](docs/COMMIT_CONVENTION.md)
- [GOAL-001 规格](docs/goals/GOAL-001-runtime-foundation.md)（已完成：运行时地基）
- [GOAL-002 规格](docs/goals/GOAL-002-memory-social-dyad.md)（已完成：记忆 + 小群体）
- [GOAL-003 规格](docs/goals/GOAL-003-norms-scarce-trio.md)（下一步：规范涌现 + 三人稀缺）
- [Runtime 工程说明](docs/engineering/runtime-foundation.md)
- [记忆与小群体](docs/engineering/memory-social-dyad.md)

## 核心目标

1. 长期一致性  
2. 社会涌现  
3. 可实验性  
4. 可观测性  
5. 可持续运行  
6. 可介入性  

## 近程建设（阶段 A–F）

从认知个体完备 → 小群体社会 → 共享世界与资源 → 组织与制度 → 经济与信息生态 → 实验科学平台化。

## 本地 LLM 配置（可选）

默认 **Stub**（无密钥可跑通测试与 7 日模拟）。实网：

```bash
export GSS_LLM=1
export NEWAPI_BASE_URL="https://newapi-jp2.xiaoqianran.xyz"
export NEWAPI_API_KEY="sk-..."   # 勿提交进 Git
export NEWAPI_MODEL="openai/gpt-oss-120b"
```

`.env` 已被 `.gitignore` 忽略；参考 `.env.example`。
