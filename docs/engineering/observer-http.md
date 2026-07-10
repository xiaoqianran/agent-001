# 只读观测 HTTP 与 LOD（GOAL-007）

## 启动

```bash
pnpm install && pnpm test

# 默认端口 8787；可先跑几天再观测
pnpm observer --scenario commons-cabin --seed 42 --days 1 --port 8787

# 开启边缘降频
pnpm observer --scenario commons-cabin --seed 42 --days 2 --lodEdgeSkip 0.8 --port 8787
```

浏览器打开 `http://127.0.0.1:8787/`。

## API

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/health` | 健康检查 |
| GET | `/world` | ControlRoom 世界视图 |
| GET | `/agents/:id` | Agent 视图 |
| GET | `/timeline` | 时间线 |
| GET | `/metrics` | 含 `runtime.skippedCognitiveTicks` |
| GET | `/audit` | 注入审计 |
| POST | `/run/step` | 需 `OBSERVER_ALLOW_WRITE=1` |
| POST | `/inject` | 需写开关 |

默认**只读**；写操作：

```bash
OBSERVER_ALLOW_WRITE=1 pnpm observer --port 8787 --allow-write
```

## LOD

- `lodEdgeSkip` / `InterestConfig.edgeSkipChance`：0..1  
- `focusPlaceIds` 默认观测焦点 `cabin`（粮仓）  
- 有 pending promise 的 agent 不跳过  
- 跳过仍执行 needs drift；确定性 `hash32(seed|tick|id|lod)`  

## 静态页

`packages/observer/public/index.html` — 表格展示 agents / 粮仓 / metrics / timeline。
