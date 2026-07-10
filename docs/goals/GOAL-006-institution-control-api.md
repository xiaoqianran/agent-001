# GOAL-006：制度旋钮实验 + Control Room API 桩 + 回放时间线（阶段 F 加深）

> 可直接作为下一条 `/goal` 正文使用（整份粘贴，或：`执行 docs/goals/GOAL-006-institution-control-api.md`）。

---

## 一句话目标

在 **GOAL-001～005**（运行时、记忆/社会、规范、实验指标、公共品与 bundle）之上，落地 **可注入的制度参数旋钮**（影响公共品/提取/规范压力的规则权重）、**Control Room 只读/注入 API 桩**（无精美前端）、以及 **事件时间线导出** 便于回放与因果浏览；无 API key 默认可复现。

**非目标：** 完整 Control Room Web UI、分叉 COW 多世界、网格搜索集群、司法全流程、实网 LLM 门槛。

---

## 前置依赖

- GOAL-001～005 全部可运行（含 `commons-cabin`、`gss-bundle@1`、compare-params）  
- 架构延续：Domain-first；Agent 永不写 World；Stub LLM；TypeScript monorepo；`docs/COMMIT_CONVENTION.md`；**禁止**提交密钥  

设计真源：蓝图 §8 Control Room、§11 制度参数/回放、评估 #5/#7 方向。

---

## 范围（In Scope）

### P0 — 制度参数 `InstitutionParams`（可注入规则旋钮）

在 `@gss/experiment` 或 runtime 配置中扩展（与 `ExperimentParams` 合并或嵌套均可，**文档写清**）：

```typescript
interface InstitutionParams {
  /** 0..1 对 withdraw_public 的额外门槛/失败率倾向（规则侧，非随机 LLM） */
  enforcementStrength?: number;
  /** 0..1 公共贡献的声誉/选项加分强度 */
  contributionReward?: number;
  /** 0..1 提取公共品时的 trust 惩罚或选项降权 */
  freeRidePenalty?: number;
  /** true 时 SocialSlice/观察可见他人对 granary 的贡献摘要 */
  transparency?: boolean;
}
```

- 经 CLI：`--param enforcementStrength=0.8` 或 `--param institution.enforcementStrength=0.8`  
- **必须**影响 shipped 行为路径之一（例如）：  
  - `enforcementStrength` 高 → `withdraw_public` 需更多前提（如 co-location + 当日已 contribute）或认知对 withdraw 大幅降权 + World 可选 `NO_PERMISSION`  
  - `contributionReward` 高 → cooperative 路径更易 contribute  
  - `transparency` → LocalObservation 或 SocialSlice 增加 `publicLedger` 只读摘要  
- 对照测试（主指标二选一，文档钉死）：  
  - **高执法** 条件下 `freeRideWithdrawals` **低于** 低执法；或  
  - **高贡献奖励** 下 `totalContributed` **高于** 低奖励  

### P0 — Control Room API 桩（无 UI）

新增 `@gss/control` 或 `packages/runtime` 内 `ControlRoomService`：

```typescript
interface ControlRoomService {
  getWorldView(): WorldViewDTO;           // 地点、agent 位置、granary stock
  getAgentView(id: AgentId): AgentViewDTO; // needs、最近 DecisionTrace 摘要
  listTimeline(fromTick?: number, toTick?: number): TimelineEvent[];
  inject(injection: Injection): void;     // 审计日志 + 合法注入
  freeze(): void;
  resume(): void;
}
```

**Injection 最小种类（GOAL-001 契约方向）：**

| kind | 效果 |
|------|------|
| `resource` | 增减某池或 granary stock（经 World 合法路径或 authority 方法，**禁止** cognition 直写） |
| `oracle_message` | 向 agent 注入一条可检索 episodic/记忆（或挂起消息） |
| `param` | 运行中热更新 InstitutionParams 子集（记录审计） |
| `event` | 推送一条 DomainEvent 风格日志（可选触发 social 侧） |

- 所有 inject **写 audit 日志**（数组即可，进 checkpoint 可选）  
- `freeze`：后续 `advanceOneTick` no-op 或抛可控状态，直到 `resume`  
- CLI 示例：  
  ```bash
  pnpm sim control snapshot --scenario commons-cabin --seed 42 --days 1 --out ./snap.json
  pnpm sim control inject --checkpoint ./ckpts/x.json --kind resource --payload '{"granaryDelta":2}'
  ```
  （具体 CLI 形状可简化为 `pnpm sim inject` / `pnpm sim timeline`，但须有 **可测的 shipped API**）

### P0 — 回放时间线导出

- 从 EventBus 日志 / actionSequence / DecisionTrace 合成：  
  ```typescript
  TimelineEvent {
    tick: number;
    type: string;       // action.applied | promise.made | inject | tick.completed | …
    actor?: AgentId;
    summary: string;
    refs?: string[];
  }
  ```
- `pnpm sim timeline --from-checkpoint ./ckpts/x.json --out ./tl.json`  
  或 run 结束 `--timeline-out`  
- 单测：跑短场景后 timeline 非空，且含至少一种 action 与（若注入）inject 记录  

### P0 — 与 bundle / metrics 集成

- `gss-bundle@1` **扩展可选字段**（向后兼容）：  
  - `institutionParams?: InstitutionParams`  
  - `timeline?: TimelineEvent[]`（可截断 max N）  
  - `auditLog?: InjectionAudit[]`  
- 旧 bundle 无这些字段仍 `validate` 通过；新导出可带上  

### P1 — 文档

- `docs/engineering/institution-control-api.md`：旋钮语义、API 列表、时间线字段、与评估 #5/#7 映射  
- README 增加 control / timeline / 制度参数示例  

### 明确 Out of Scope

- React/Vue Control Room 前端  
- 世界分叉 fork UI  
- 完整因果图可视化  
- 立法投票改规则的全流程  
- 强制 LLM  

---

## 验收标准（Acceptance Criteria）

1. **制度旋钮生效：** 至少两个不同 `InstitutionParams` 设定下，shipped 对照测试主指标方向符合文档。  
2. **ControlRoomService（或等价）可测：** getWorldView / listTimeline / inject / freeze-resume 有单元或集成测试驱动真实实现。  
3. **注入审计：** inject 产生 audit 记录；resource 类注入改变 granary/池且仍经 World 权威路径。  
4. **时间线：** 导出 JSON 非空；含 tick 有序事件。  
5. **可复现：** 同 seed + 同制度参数 → 指标一致；无密钥；conventional commits。  
6. **文档 + README** 说明旋钮与 CLI。  

---

## 验证计划（Verification plan）

1. `pnpm test` → `{SCRATCH}/test.log`  
2. `pnpm sim run --scenario commons-cabin --days 5 --seed 42 --param enforcementStrength=0.9`（或文档参数名）exit 0  
3. 制度高低对照测试或 CLI compare 输出方向正确 → `{SCRATCH}/institution_compare.json`  
4. inject + timeline 导出 → `{SCRATCH}/timeline.json` 非空  
5. freeze 后 tick 不前进 / resume 后继续（测试）  
6. secrets 扫描  

---

## 建议实现顺序

1. `InstitutionParams` 解析 + 传入 cognition/world 规则  
2. 高低执法/奖励对照测试  
3. `ControlRoomService` + inject/audit/freeze  
4. timeline 构建与 CLI  
5. bundle 可选字段扩展  
6. 文档与 commits  

---

## 完成定义（Definition of Done）

- 验收 1–6 满足  
- 偏差表写入 engineering 文档  
- 向用户说明：如何调执法强度、如何导出时间线、下一 goal 建议  

---

## 给用户的 /goal 粘贴版（短）

```
执行 docs/goals/GOAL-006-institution-control-api.md

在 GOAL-001～005 之上落地：
- InstitutionParams 旋钮（enforcementStrength / contributionReward / freeRidePenalty / transparency）影响公共品相关规则，对照测试主指标方向可测
- ControlRoomService 桩：getWorldView、listTimeline、inject（resource/oracle_message/param）、freeze/resume + 审计日志
- 事件时间线导出（JSON）；可选写入 gss-bundle 扩展字段
- 无 key 可复现；注入不绕过 World 权威

架构延续：Domain-first，Agent 永不写 World；Stub LLM；TypeScript monorepo。
验证按该文档 Verification plan 留证；commit 遵循 docs/COMMIT_CONVENTION.md；禁止提交密钥。
```

---

## 建议再下一条（本 goal 完成后）

**GOAL-007：** 简单 Web 观测页（只读地图 + 时间线）或 **制度文本可被 agent 提议修改** 的迷你立法环；或规模兴趣管理（降频边缘 agent）成本门禁硬化。  
