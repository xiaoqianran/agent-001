# 迷你立法环与社会简报（GOAL-008）

## 快速开始

```bash
pnpm install && pnpm test

pnpm sim run --scenario assembly-cabin --days 5 --seed 42 --brief-out ./brief.md
pnpm sim brief --scenario assembly-cabin --days 3 --seed 42
```

## 流程

1. `propose_policy`（须在 cabin）→ `PolicyBoard.propose`  
2. `vote_policy`（同地、一人一票）  
3. `yeas >= 2` 且 `yeas > nays` → `passed`  
4. Runtime **`applyInstitution(patch)`** 写入 World + Cognition  

认知默认仅在 `assembly-cabin` 启用立法选项（`enableLegislature`），避免干扰 commons 对照。

## 行动

| verb | args |
|------|------|
| propose_policy | `patch`, `assemblyPlaceId` |
| vote_policy | `proposalId`, `vote` (yea/nay/abstain) |

## 简报

`renderDailyBrief`：day、food、granary、institution、提案计数（纯模板）。

## Checkpoint

`social.policy` 随 SocialGraph 快照保存。
