---
title: karpathy/llm-wiki.md
aliases:
  - karpathy/llm-wiki.md
  - Karpathy LLM Wiki
type: source
status: captured
area: sources
parent: "[[30-Sources/00-Sources-MOC]]"
related:
  - "[[90-System/LLM-Wiki-Obsidian]]"
captured: 2026-09-10
updated: 2026-09-10
tags:
  - source
  - llm-wiki
  - knowledge-management
---

# Source Record: karpathy/llm-wiki.md

- **来源**：<https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f>
- **类型**：外部知识库工作流设计
- **采集日期**：2026-09-10
- **本地状态**：来源记录；不改写原始 gist 内容

## 关键原则

1. 用持久化、可交叉链接的 Markdown Wiki 累积知识，而不是每次只对原始资料做一次性检索。
2. 将知识分为三层：不可变的 `raw/` 来源、由 LLM 维护的 `wiki/` 综合页、约束维护流程的 schema。
3. 新来源进入后，更新综合页、索引和追加式日志；查询时先读索引，再读取相关页面。
4. 定期做 Wiki 健康检查，关注失效链接、孤立页面、矛盾结论、过期事实和缺少交叉链接的主题。
5. 用户负责选择来源和方向，LLM 负责摘要、交叉引用、归档和维护。

## 在本项目中的落地

- 本项目把原始资料、综合知识和项目成果分别组织在 `docs/30-Sources/`、`docs/20-Knowledge/` 与 `docs/10-Outcomes/`。
- `docs/00-Home.md` 是统一入口；Knowledge MOC 与 Sources MOC 是分层索引。
- `docs/90-System/Log.md` 是追加式维护日志，`docs/90-System/Schema.md` 定义结构与属性约束。
- Obsidian 的 Properties、WikiLinks、Backlinks、MOC 和 Graph 作为这套 LLM Wiki 的人类交互层。
- 本文件是来源卡片，不是对外部 gist 的逐字复制；原文 URL 是核对入口。

## 在 fromzero 空基线中的采用背景

本卡在 `fromzero` 分支重建知识库时采集。该分支此前未使用此 gist；按项目约定首次建立文档体系即以本 LLM Wiki 模式为框架，并以 Obsidian 作为浏览层（见 [[90-System/LLM-Wiki-Obsidian]]）。
