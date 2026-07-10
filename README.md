# agent-001 — Generative Social Simulator

多 Agent 持续运行的**生成式社会模拟系统（Generative Social Simulator）** 设计与实现仓库。

目标不是 demo 小镇，而是可长期运转、可注入变量、可观测涌现、可复现实验的社会实验平台。

## 文档

- [总体设计蓝图](docs/design/generative-social-simulator-blueprint.md)

## 核心目标

1. 长期一致性  
2. 社会涌现  
3. 可实验性  
4. 可观测性  
5. 可持续运行  
6. 可介入性  

## 近程建设（阶段 A–F）

从认知个体完备 → 小群体社会 → 共享世界与资源 → 组织与制度 → 经济与信息生态 → 实验科学平台化。

实现入口见蓝图中的 **PR Plan（PR-01…）** 与 **附录 E Contract Catalog**。

## 本地配置（可选）

LLM 调用请使用本地环境变量，**不要**把密钥提交进 Git：

```bash
export NEWAPI_BASE_URL="https://your-newapi-host"
export NEWAPI_API_KEY="sk-..."
export NEWAPI_MODEL="openai/gpt-oss-120b"
```
