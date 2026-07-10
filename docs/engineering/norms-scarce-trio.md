# 规范涌现 + 三人稀缺（GOAL-003）

## 快速开始

```bash
pnpm install
pnpm test
pnpm sim run --scenario trio-cabin --days 5 --seed 42
pnpm sim compare-seeds --scenario trio-cabin --seed 42 --days 5
pnpm sim run --scenario trio-cabin --days 2 --seed 42 --checkpoint ./ckpts/t.json
pnpm sim resume --checkpoint ./ckpts/t.json --days 3
```

## 描述性规范

| 项 | 生产默认 | 测试 knobs（`TEST_NORM_THRESHOLDS`） |
|----|----------|--------------------------------------|
| `tFreq` | 5 | 3 |
| `tActors` | 2 | 2 |
| `windowTicks` | 72（约 3 日） | 48 |

- 事件：`action.applied` 成功后，Runtime 用 **apply 后 place** + `verb` + `actor` 调用 `SocialGraph.recordAppliedAction`。  
- 达阈 → spawn `Norm{ origin: 'emergent', kind: 'descriptive' }`。  
- **`emergent_norm_count`** = 仅 `origin==emergent`；`injectNorm` 的 injected/institutional **不计入**。  
- 测试可用 `createSimulation({ testNormThresholds: true })`；**不**用 injected 冒充涌现。

## trio-cabin 参数

- Agent：Alice（cooperative）、Bob（grabber）、Carol（neutral）  
- 食物：storehouse **5**，woods **2**（稀缺）  
- 初始：Alice/Bob 在 cabin，Carol 在 woods  

## Checkpoint / 指纹

- `social.norms` 快照进 checkpoint  
- 指纹增加 `normDigest`、`emergentNormCount`  

## 认知

- 只读 `activeNorms`；对同 place 匹配 `actionType` 的选项 **+0.08×strength**  
- 不写 Norm / World  

## 与蓝图

| 条款 | 实现 |
|------|------|
| 评估 #2 非编剧规范 | emergent spawn + 计数指标 |
| 阶段 B→C | 3 人稀缺共享世界入口 |
| PR-09/10b 精神 | 规范计数 + 稀缺 vignette |

## 偏差

| 条款 | 说明 |
|------|------|
| 生产阈值下 5 日可能不涌现 | 允许测试阈值夹具；生产默认不变 |
| 无完整制裁树 | 仅 descriptive + 微加权 |
