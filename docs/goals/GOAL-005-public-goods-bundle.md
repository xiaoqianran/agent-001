# GOAL-005：公共品 / 搭便车 vignette + 实验包导出（阶段 E–F 加深）

> 可直接作为下一条 `/goal` 正文使用（整份粘贴，或：`执行 docs/goals/GOAL-005-public-goods-bundle.md`）。

---

## 一句话目标

在 **GOAL-001～004**（运行时、记忆/社会、规范、实验参数与指标对照）之上，落地 **公共品（共享粮仓/修缮）与搭便车张力** 的可运行 vignette，以及 **可复现实验包导出/导入（gss-bundle@1 最小）**；无 API key、无 Control Room UI。

**非目标：** 完整税制与国家机器、司法全流程、媒体工业、千人混同、UI 仪表盘动画、强制实网 LLM。

---

## 前置依赖

- GOAL-001～003：world/runtime/cognition/memory/social/norms、solo/dyad/trio  
- GOAL-004：`@gss/experiment` 参数、RunMetrics、compare-params  
- 架构延续：Domain-first；Agent 永不写 World；Stub LLM；TypeScript monorepo；`docs/COMMIT_CONVENTION.md`；**禁止**提交密钥  

设计真源：蓝图 §7.4 公共品与集体行动、评估可实验性、实验包导出精神。

---

## 范围（In Scope）

### P0 — 公共品状态（World / Economy 最小）

在 world 或薄 `@gss/economy`（推荐 **world 内 PublicGood 实体 + social/experiment 指标**，避免过度分包）增加：

```typescript
PublicGood {
  id: 'granary' | string
  placeId: PlaceId          // 如 cabin 或 storehouse
  level: number             // 0..1 或整数等级
  stock: number             // 公共库存（food 等）
  contributors: Record<AgentId, number>  // 累计贡献
}
```

**行动（结构化，经 WorldAuthority validate/apply）：**

| ActionType | 含义 | 效果（最小） |
|------------|------|----------------|
| `contribute` | 向公共品投入个人库存 food | 个人 inventory−；public stock+；level 可缓升；记贡献 |
| `harvest_public` 或 `take` 带 target public | 从公共品提取（搭便车） | public stock−；个人 inventory+；可降信任/规范压力（规则） |

- 也可用现有 `give` 到系统实体 + 新 verb `contribute` / `withdraw_public`（二选一，文档写清）  
- **私有 take 池** 与 **公共 stock** 必须区分，防止幻觉混用  

**可选规则（推荐做简版）：**

- 公共 `stock` 每日/每 N tick **缓慢衰减**（管理成本）或 **缓慢生产加成**（level 高 → 全图 work 产出 +ε）  
- 贡献编码 social/prospective 记忆；纯抽取可降 relation trust  

### P0 — 场景 `commons-cabin`（或扩展 trio）

- 3 Agent（可复用 Alice 合作 / Bob 抢夺 / Carol 中性）  
- 私有池 **稀缺** + 中央 **granary** 公共品  
- 角色倾向：  
  - cooperative：更高 `contribute` 权重  
  - free_rider / grabber：更高 `withdraw_public` / 私有 take  
  - neutral：混合  
- CLI：  
  ```bash
  pnpm sim run --scenario commons-cabin --days 5 --seed 42
  pnpm sim run --scenario commons-cabin --days 5 --seed 42 \
    --param storehouseFood=4 --param initialGranary=2
  ```

**出口标准：**

1. 无 key ≥5 日 exit 0；3 agent 合法 place  
2. 出现至少一次成功 `contribute` **或** 公共 stock 相对初始有可观测变化（贡献/提取）  
3. RunMetrics 扩展：`publicStock`、`totalContributed`、`freeRideWithdrawals`（命名可微调）  
4. 同 seed 可复现；checkpoint 含 public good 状态  

### P0 — 搭便车对照（评估向）

- `compare-params` 或专用：  
  - 条件 A：全员偏合作（或高 contribute 权重）  
  - 条件 B：1 合作 + 2 搭便车（通过 roleHint / param `freeRiderCount`）  
- 断言方向（测试驱动 shipped 函数）：例如 B 的 `publicStock` 终态 **不高于** A，或 B 的 `freeRideWithdrawals` **高于** A（选 **一条** 主指标写死在测试里并文档说明）  

### P0 — 实验包 gss-bundle@1（最小）

```typescript
interface GssBundleV1 {
  format: 'gss-bundle@1';
  createdAt: string;
  experimentParams: ExperimentParams;
  seed: Seed;
  metrics: RunMetrics;
  /** optional short series */
  dailyMetrics?: Array<{ day: number; totalFood: number; publicStock?: number; meanHunger: number }>;
  checkpointRef?: string;  // 可选：旁路 checkpoint 路径或内嵌小快照
}
```

- `pnpm sim export-bundle --scenario commons-cabin --days 5 --seed 42 --out ./bundles/run.json`  
  （实现上可 run → metrics → 可选日级采样 → 写 bundle）  
- `pnpm sim inspect-bundle --in ./bundles/run.json` 打印摘要  
- 单测：export 后 format 正确、seed/params/metrics 齐全；**不要求**跨机完整二进制兼容超集  

### P1 — 日级指标时间序列（轻量）

- Runtime 或 sim 在 **每日边界**（hourInDay===0 或 day 变化）采样 `totalFood` / `publicStock` / `meanHunger` 写入数组  
- 进入 bundle.dailyMetrics；非强制 UI  

### P1 — 文档

- `docs/engineering/public-goods-bundle.md`：行动语义、角色、指标、bundle 字段、与公地悲剧/集体行动映射  
- README 增加 commons-cabin / export-bundle  

### 明确 Out of Scope

- 税收、货币、完整市场出清  
- 议会立法修改规则（可后续 GOAL）  
- Control Room、分叉 COW 多世界  
- 向量记忆、强制 LLM  
- 论文自动生成  

---

## 验收标准（Acceptance Criteria）

1. **可运行：** `pnpm test`；`pnpm sim run --scenario commons-cabin --days 5 --seed 42` 无 key exit 0。  
2. **公共品权威：** World 持有 granary/public stock；contribute/withdraw 经 validate/apply；认知不写 World。  
3. **指标：** RunMetrics（或扩展）含公共品相关字段；单测断言计算函数。  
4. **集体行动对照：** 至少一条 shipped 测试：合作条件 vs 搭便车条件主指标方向符合文档。  
5. **Bundle：** export 生成 `gss-bundle@1`；字段校验测试通过。  
6. **可复现 + checkpoint** 含公共品状态；无密钥；conventional commits。  

---

## 验证计划（Verification plan）

1. `pnpm test` → `{SCRATCH}/test.log`  
2. `pnpm sim run --scenario commons-cabin --days 5 --seed 42 --metrics-out ...` → exit 0  
3. 对照跑（CLI 或测试内 compare）→ 主指标方向  
4. `export-bundle` → 文件 format 与 metrics 齐全  
5. secrets 扫描  

---

## 建议实现顺序

1. World：PublicGood + contribute/withdraw_public 行动  
2. Cognition：roleHint free_rider / cooperative 选项  
3. 场景 commons-cabin + 参数 initialGranary  
4. Metrics 扩展 + 对照测试  
5. 日级采样（可选）+ export-bundle / inspect-bundle  
6. 文档与 commits  

---

## 完成定义（Definition of Done）

- 验收 1–6 满足  
- 偏差表写入 engineering 文档  
- 向用户说明：如何观察公地张力、bundle 字段、下一 goal 建议  

---

## 给用户的 /goal 粘贴版（短）

```
执行 docs/goals/GOAL-005-public-goods-bundle.md

在 GOAL-001～004 之上落地：
- 公共品 granary（公共 stock + 贡献记录）；结构化 contribute / withdraw_public（经 World 校验）
- 场景 commons-cabin（3 Agent：合作/搭便车/中性）+ 相关 RunMetrics
- 合作 vs 搭便车条件对照（主指标方向可测）
- gss-bundle@1 导出（params + metrics + 可选 dailyMetrics）
- 无 key 可复现；checkpoint 含公共品状态

架构延续：Domain-first，Agent 永不写 World；Stub LLM；TypeScript monorepo。
验证按该文档 Verification plan 留证；commit 遵循 docs/COMMIT_CONVENTION.md；禁止提交密钥。
```

---

## 建议再下一条（本 goal 完成后）

**GOAL-006：** 制度参数实验包（执法强度/透明度旋钮）+ 简单回放时间线导出；或 **Control Room API 桩**（观察/注入事件，无精美前端）。  
