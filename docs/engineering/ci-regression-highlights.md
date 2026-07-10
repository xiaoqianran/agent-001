# CI、多场景回归与叙事高光（GOAL-009）

## 本地等价 CI

```bash
pnpm install --frozen-lockfile
pnpm test
pnpm regression
```

全程 **Stub LLM**（不要设 `GSS_LLM=1`，不要注入 API key）。目标总时长 **&lt; 3 分钟**。

GitHub Actions：`.github/workflows/ci.yml`（push/PR → main；`pnpm install --frozen-lockfile` + `pnpm test` + `pnpm regression`；无密钥）。

## 回归套件

```bash
pnpm regression
```

冒烟（seed=42, days=3）：

| 场景 | 断言 |
|------|------|
| solo-cabin | agents=1 |
| dyad-cabin | agents=2 |
| trio-cabin | agents=3 |
| commons-cabin | publicGoods / contribute 字段 |
| assembly-cabin | checkpoint 可 JSON 序列化 |

额外检查：

- `check:determinism` — trio 双跑 fingerprint equal  
- `check:scarce-direction` — abundant totalFood &gt; scarce  

立法路径 / 制度方向：由 `pnpm test` 中 `legislature.test` / `institution.test` 覆盖（回归入口日志会注明）。

失败时 exit 1，并打印失败 case 名。

## 叙事高光

规则检测（非 LLM）：`detectHighlights` / `detectHighlightsFromOrch`（`@gss/experiment`）。

```typescript
type HighlightKind =
  | 'conflict' | 'policy_passed' | 'norm_emerged'
  | 'promise_broken' | 'public_good_shift' | 'injection';

interface NarrativeHighlight {
  id: string;
  kind: HighlightKind;
  tick: number;
  day?: number;
  summary: string;
  agentIds?: string[];
  refs?: { proposalId?: string; eventType?: string; metricKey?: string };
}
```

### CLI

```bash
pnpm sim highlights --scenario assembly-cabin --days 5 --seed 42
pnpm sim run --scenario commons-cabin --days 3 --seed 42 --highlights-out ./hl.json
```

输出为 **JSON 数组**（可为空 `[]`）。

### Observer

```http
GET /highlights
```

### 检测规则（P0）

| kind | 信号 |
|------|------|
| policy_passed | proposal.status === 'passed' |
| conflict | action sequence `REJECT` + `INSUFFICIENT_RESOURCE` / `MUTEX` / `NOT_ALLOWED` / `OUT_OF_RANGE` |
| injection | timeline `inject.*`（可选） |
| norm_emerged / promise_broken | metrics 汇总 |

简报 `renderDailyBrief` 会附带 `highlightCount` 与最多 5 条高光摘要。

## 偏差表

| 规格 | 实现 |
|------|------|
| 可选 typecheck 进 CI | 未加入（typecheck 各包状态不一，避免假红） |
| public_good_shift kind | 类型已声明；默认检测器未强制产出 |
| 失败即停 vs 聚合 | 回归聚合全部 case 后统一非 0 退出，并打印全部失败名 |
| GET /highlights | 已实现 |

## GOAL-010 候选

见 `docs/goals/GOAL-009-ci-regression-highlights.md` 文末。
