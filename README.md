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
pnpm sim run --scenario trio-cabin --days 5 --seed 42 \
  --param storehouseFood=3 --label scarce --metrics-out ./out/m.json
pnpm sim compare-params --scenario trio-cabin --seed 42 --days 5 \
  --a storehouseFood=3 --b storehouseFood=20
pnpm sim run --scenario commons-cabin --days 5 --seed 42 --metrics-out ./out/commons.json
pnpm sim export-bundle --scenario commons-cabin --days 5 --seed 42 --out ./bundles/run.json
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
- [实验参数与指标](docs/engineering/experiment-params-metrics.md)

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
- [GOAL-003 规格](docs/goals/GOAL-003-norms-scarce-trio.md)（已完成：规范涌现 + 三人稀缺）
- [GOAL-004 规格](docs/goals/GOAL-004-experiment-params-metrics.md)（已完成：实验参数 + 指标对照）
- [GOAL-005 规格](docs/goals/GOAL-005-public-goods-bundle.md)（已完成：公共品 + 实验包）
- [GOAL-006 规格](docs/goals/GOAL-006-institution-control-api.md)（已完成：制度旋钮 + Control API）
- [GOAL-007 规格](docs/goals/GOAL-007-observer-http.md)（已完成：只读观测 HTTP + LOD）
- [GOAL-008 规格](docs/goals/GOAL-008-mini-legislature.md)（已完成：迷你立法环 + 简报）
- [GOAL-009 规格](docs/goals/GOAL-009-ci-regression-highlights.md)（已完成：CI 回归 + 叙事高光）
- [GOAL-010 规格](docs/goals/GOAL-010-explain-evidence-chain.md)（已完成：explain 证据链）
- [GOAL-011 规格](docs/goals/GOAL-011-experiment-fork-report.md)（已完成：实验分叉 + 对照报告）
- [GOAL-012 规格](docs/goals/GOAL-012-eval-promise-resume.md)（已完成：承诺 resume eval 夹具）
- [GOAL-013 规格](docs/goals/GOAL-013-belief-rumor-vignette.md)（下一步：BeliefStore + 谣言 vignette）
- [Runtime 工程说明](docs/engineering/runtime-foundation.md)
- [记忆与小群体](docs/engineering/memory-social-dyad.md)
- [规范与三人稀缺](docs/engineering/norms-scarce-trio.md)
- [实验参数与指标](docs/engineering/experiment-params-metrics.md)
- [公共品与实验包](docs/engineering/public-goods-bundle.md)
- [制度旋钮与 Control API](docs/engineering/institution-control-api.md)
- [只读观测与 LOD](docs/engineering/observer-http.md)
- [迷你立法与简报](docs/engineering/mini-legislature.md)
- [CI / 回归 / 叙事高光](docs/engineering/ci-regression-highlights.md)
- [因果解释 explain](docs/engineering/explain-evidence-chain.md)
- [实验分叉与对照报告](docs/engineering/experiment-fork-report.md)
- [承诺 resume 评估](docs/engineering/eval-promise-resume.md)

### 观测页

```bash
pnpm observer --scenario commons-cabin --seed 42 --days 1 --port 8787
# 浏览器打开 http://127.0.0.1:8787/
```

### 立法与简报

```bash
pnpm sim run --scenario assembly-cabin --days 5 --seed 42 --brief-out ./brief.md
pnpm sim brief --scenario assembly-cabin --days 3 --seed 42
```

### CI 等价与高光

```bash
pnpm test
pnpm regression
pnpm sim highlights --scenario assembly-cabin --days 5 --seed 42
pnpm sim run --scenario commons-cabin --days 3 --seed 42 --highlights-out ./hl.json
```

### 因果解释（证据链）

```bash
pnpm sim explain --scenario commons-cabin --days 3 --seed 42 --from-highlight-kind conflict
pnpm sim explain --scenario commons-cabin --days 3 --seed 42 --tick 5 --agent agent-bob
pnpm sim explain --scenario assembly-cabin --days 5 --seed 42 --proposal prop-1
```

### 实验分叉与对照报告

```bash
pnpm sim run --scenario commons-cabin --days 2 --seed 42 --checkpoint ./ckpts/parent.json
pnpm sim fork-compare --from-checkpoint ./ckpts/parent.json --days 3 \
  --a enforcementStrength=0 --b enforcementStrength=0.9 \
  --report-out ./reports/fork.md
pnpm sim compare-params --scenario commons-cabin --seed 42 --days 5 \
  --a freeRiderCount=0 --b freeRiderCount=2 --report-out ./reports/compare.md
```

### 评估夹具（eval）

```bash
pnpm sim eval --case promise-resume --seed 42
pnpm eval --suite core --out ./eval-report.json
```

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
