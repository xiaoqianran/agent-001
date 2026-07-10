# Git Commit 规范

本仓库采用 [Conventional Commits](https://www.conventionalcommits.org/) 风格的简化版，便于阅读历史、生成变更说明，以及后续接 commitlint / CI。

## 格式

```
<type>(<scope>): <subject>

<body>

<footer>
```

- `type`：**必填**
- `scope`：**可选**，标明影响模块（见下方推荐 scope）
- `subject`：**必填**，一句话说明做了什么
- `body` / `footer`：**可选**

单行也可，适合小改动：

```
docs: 修正蓝图中 PersonModel 字段说明
```

## Type 速查

| 类型 | 用途 | 何时用 | 示例 |
|------|------|--------|------|
| `feat` | 新功能 / 新能力 | 用户或运行时可见的行为增加 | `feat(agent): 添加分层目标冲突仲裁` |
| `fix` | 修复缺陷 | 修 bug、修错误行为 | `fix(runtime): 修复同 tick 资源抢占顺序` |
| `docs` | 文档 | 只改文档、注释中的说明性文字 | `docs: 更新总体设计蓝图` |
| `style` | 纯格式 | 不影响逻辑（空格、换行、格式化） | `style: 统一 TypeScript 缩进` |
| `refactor` | 重构 | 非 feat、非 fix 的代码结构调整 | `refactor(memory): 拆分编码与巩固流程` |
| `perf` | 性能 | 以性能为目标的改动 | `perf(runtime): 兴趣管理降频边缘 Agent` |
| `test` | 测试 | 加测、改测、测具 | `test(world): 补充行动校验用例` |
| `build` | 构建 / 依赖 | 打包工具、包版本、锁文件 | `build: 升级 TypeScript 到 5.x` |
| `ci` | 持续集成 | GitHub Actions 等流水线 | `ci: 在 PR 上运行契约检查` |
| `chore` | 杂项维护 | 不适合上面类型时的仓库维护 | `chore: 补充 .gitignore 规则` |
| `revert` | 回滚 | 撤销某次提交 | `revert: 回滚 feat(agent) 目标仲裁` |

### 如何快速选型

```
是修 bug？          → fix
是新功能/新能力？    → feat
只改文档？          → docs
只改格式？          → style
只改测试？          → test
只改 CI？           → ci
只改构建/依赖？      → build
结构调整、行为不变？ → refactor
为了更快/更省？      → perf
回滚？              → revert
以上都不是          → chore
```

## Scope（推荐，可选）

与蓝图八层及工程包对齐，小写、简短：

| scope | 含义 |
|-------|------|
| `world` | 世界权威、空间、物品、行动校验 |
| `agent` | 身份、需求、目标、情绪、具身 |
| `social` | 关系、规范、声誉、冲突 |
| `economy` | 账本、契约、市场、公共品 |
| `cognition` | 认知循环、记忆、ToM、信念 |
| `interaction` | 通信通道、双轨行动 |
| `runtime` | 调度、检查点、成本、故障隔离 |
| `experiment` | 种子、注入、分叉、指标、回放 |
| `contracts` | PR-01 领域契约 / 共享类型 |
| `docs` | 设计文档与规范本身 |
| `repo` | 仓库骨架、工具链 |

示例：`feat(cognition): 实现 11 阶段认知循环骨架`

不确定 scope 时可以省略，不要硬凑。

## Subject 写法

- 用**祈使句 / 陈述「做了什么」**：`添加`、`修复`、`更新`，不要 `添加了`、`修复了`
- **简明**：建议 ≤ 50 个汉字或 ≤ 72 个字符；不以此为硬门禁，但避免段落当标题
- **首字母**：英文 subject 小写开头（`add` 而非 `Add`）；中文直接写
- **句末不加句号**
- **不写**无信息量标题：`update`、`fix bug`、`改了一下`

| 不推荐 | 推荐 |
|--------|------|
| `update` | `docs: 补充 TickOrchestrator 相位说明` |
| `fix: 修 bug` | `fix(runtime): 修复检查点恢复后时钟回拨` |
| `feat: 好多改动` | `feat(social): 添加描述性规范涌现计数器` |

## Body（可选）

仅在需要时补充：

- **为什么**改（背景、约束、关联决策）
- **怎么做的**要点（若 diff 本身不够明显）
- **副作用 / 迁移**注意点

每行建议不超过 72 字符（中文可略放宽）。与 subject 空一行。

```
fix(runtime): 串行化同 tick 资源 apply

并行 think 后若并行 apply，同 seed 下结果不稳定。
改为按 agentOrder 串行 validate+apply，保证评估 #8 可复现。
```

## Footer（可选）

常见用途：

```
Refs: #12
Closes: #34
BREAKING CHANGE: ActionProposal 去掉顶层 type，统一走 structured.verb
```

- 破坏性变更：用 `BREAKING CHANGE:` 说明迁移方式；也可在 type 后加 `!`：`feat(contracts)!: 调整 ActionResult 字段`
- 关联 issue：`Refs:` / `Closes:` / `Fixes:`

## 提交粒度

- **一个 commit 只做一类事**：文档归 docs，功能归 feat，不要混在一个「大杂烩」里
- **可独立理解、可回滚**：审查者只看 message + diff 应能懂意图
- 本地可用多次小 commit；推送到 `main` 前可按需整理，但不要改写已推送的共享历史（除非团队明确允许）

## 与本仓库现状

| 场景 | 建议 type |
|------|-----------|
| 改蓝图 / README / 本规范 | `docs` |
| 落地 PR-01 契约与包骨架 | `feat(contracts)` 或 `chore(repo)`（仅脚手架时） |
| 补测试夹具 | `test` |
| 只改 Actions 工作流 | `ci` |

## 示例（贴合 GSS）

```
docs: 添加生成式社会模拟系统总体设计蓝图

feat(world): 实现 WorldAuthority 行动校验入口

fix(cognition): 承诺类记忆重要性不低于地板值

refactor(social): 将规范计数器从关系图中拆出

test(experiment): 添加同 seed 分叉可比性夹具

chore(repo): 补充 commit 规范文档
```

## 非目标

- 不强制英文；中英文均可，**同一 commit 内语言尽量统一**
- 不强制每个 commit 都有 body / scope
- 不在此规范中绑定具体 commitlint 版本；若启用 CI，以本文件 type 列表为准做 allowlist 即可
