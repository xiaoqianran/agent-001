# GOAL-007：只读观测 HTTP 服务 + 极简静态页（Control Room 只读前端）

> 可直接作为下一条 `/goal` 正文使用（整份粘贴，或：`执行 docs/goals/GOAL-007-observer-http.md`）。

---

## 一句话目标

在 **GOAL-001～006**（仿真内核、实验指标、公共品、制度旋钮、ControlRoomService API）之上，落地 **只读观测 HTTP API** 与 **极简静态观测页**（地图/Agent/粮仓/时间线/指标），并可选 **兴趣管理（边缘 Agent 降频）** 以降低长跑成本；默认 Stub、无密钥、可复现。

**非目标：** 完整精美仪表盘、写操作 Web UI（注入可仅 CLI）、实时 WebSocket 集群、分叉世界、强制 LLM。

---

## 前置依赖

- GOAL-006：`@gss/control` ControlRoomService（getWorldView / listTimeline / inject / freeze）  
- GOAL-004/005：metrics、bundle、commons-cabin  
- 架构延续：Domain-first；Agent 永不写 World；注入仍走 World 权威；TypeScript monorepo；`docs/COMMIT_CONVENTION.md`；**禁止**提交密钥  

---

## 范围（In Scope）

### P0 — 只读 HTTP 观测 API

新增 `apps/observer-api` 或 `packages/observer` + 薄 HTTP 入口（Node 内置 `http` 或轻量框架均可，**优先零重依赖**）：

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/health` | ok |
| GET | `/world` | ControlRoom `getWorldView()` |
| GET | `/agents/:id` | `getAgentView` |
| GET | `/timeline?from=&to=` | `listTimeline` |
| GET | `/metrics` | 最近一次 `RunMetrics` 或从当前 orch 现算 |
| GET | `/audit` | 注入审计（若有） |
| POST | `/run/step` | **可选** advance 1 tick（研究用；须文档标注；默认可关） |
| POST | `/inject` | **可选** 代理 ControlRoom.inject（默认可关或需 `OBSERVER_ALLOW_WRITE=1`） |

- 进程启动：加载/创建场景（默认 `commons-cabin` seed/days 可配置），内存持有一个 `TickOrchestrator` + `ControlRoomService`  
- CLI：  
  ```bash
  pnpm observer --scenario commons-cabin --seed 42 --port 8787
  # 或 pnpm sim observer --port 8787
  ```
- 启动后可 `GET /world` 返回 JSON  

### P0 — 极简静态页

`apps/observer-web` 或 `public/observer/index.html`（**无构建链优先**）：

- 轮询或按钮刷新：显示  
  - Agent 列表与 placeId（可用简单文字网格/表格代替 canvas）  
  - Granary stock / contributed / withdrawn  
  - 最近 N 条 timeline  
  - 制度参数摘要  
- 纯静态 + fetch API；可用同一端口由 observer-api 托管静态文件  

### P0 — 兴趣管理（Interest / LOD）最小实现

在 Runtime `TickOrchestrator`：

- 参数 `interest?: { focusPlaceIds?: string[]; edgeSkipChance?: number }` 或制度/实验 params：  
  - `lodEdgeSkip`：0..1，对**非焦点区域** agent 以确定性 hash(seed,tick,id) 跳过 cognitive tick（仍可 drift needs 轻量）  
- 焦点：granary place、有 pending promise 的 agent、或 `focusAgentIds`  
- 指标：`metrics.runtime.skippedCognitiveTicks` 或 RunMetrics 扩展字段  
- 测试：开启 LOD 后 skipped>0，且同 seed 可复现；关闭时与旧行为兼容  

### P1 — 与 bundle / 文档

- observer 可 `POST /export-bundle` 或 CLI 仍用 `pnpm sim export-bundle`  
- `docs/engineering/observer-http.md`：端口、路由、LOD 参数、安全（默认只读）  
- README 增加观测页启动说明  

### 明确 Out of Scope

- 复杂地图渲染引擎、动画  
- 多会话多世界租户  
- WebSocket 推送（可用短轮询）  
- 生产级鉴权（可文档提示 localhost only）  
- 完整兴趣管理千人分区  

---

## 验收标准（Acceptance Criteria）

1. **`pnpm test` 全绿**；含 LOD 与 API 处理函数单测（对 shipped handler/service，非假数据）。  
2. **启动 observer** 后 `GET /health` 与 `GET /world` 返回 200 与合法 JSON（测试可用 `http.request` 打真实监听端口，或测 request handler 注入 mock orch——**优先真实 port + 短生命周期 server**）。  
3. **静态页** 存在且能通过 API 拉取 world（结构测试：html 含 fetch 路径；可选 playwright 免做）。  
4. **LOD**：测试断言 skippedCognitiveTicks>0 且可复现。  
5. **只读默认**：未开写开关时 POST inject 返回 403/禁用（若实现了 POST）。  
6. **无密钥**；conventional commits；文档齐全。  

---

## 验证计划（Verification plan）

1. `pnpm test` → `{SCRATCH}/test.log`  
2. 启动 observer → curl `/health` `/world` → `{SCRATCH}/observer_api.log`  
3. LOD 测试输出 → `{SCRATCH}/lod.log`  
4. secrets 扫描  
5. README/工程文档存在  

---

## 建议实现顺序

1. Runtime LOD 跳过逻辑 + metrics 字段  
2. Observer HTTP handlers + ControlRoom 绑定  
3. 静态页  
4. CLI `observer` 入口  
5. 测试（server listen + LOD）  
6. 文档与 commits  

---

## 完成定义（Definition of Done）

- 验收 1–6 满足  
- 偏差表写入 engineering 文档  
- 向用户说明：如何打开观测页、LOD 如何省算力、下一 goal 建议  

---

## 给用户的 /goal 粘贴版（短）

```
执行 docs/goals/GOAL-007-observer-http.md

在 GOAL-001～006 之上落地：
- 只读观测 HTTP API（/health /world /agents/:id /timeline /metrics），绑定 ControlRoomService
- 极简静态观测页（表格/列表展示位置、粮仓、时间线）
- Runtime 兴趣管理/LOD：边缘 agent 确定性降频，metrics 记录 skippedCognitiveTicks
- 默认可只读；可选写接口需显式开关
- 无 key 可复现；测试覆盖 API handler 或真实端口 + LOD

架构延续：Domain-first，Agent 永不写 World；Stub LLM；TypeScript monorepo。
验证按该文档 Verification plan 留证；commit 遵循 docs/COMMIT_CONVENTION.md；禁止提交密钥。
```

---

## 建议再下一条（本 goal 完成后）

**GOAL-008：** Agent 提议修改制度参数的迷你「立法」环（提案→投票→生效）；或 **日级自动社会简报**（规则模板 + 可选 LLM）。  
