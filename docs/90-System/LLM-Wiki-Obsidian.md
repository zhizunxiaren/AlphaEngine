---
title: LLM Wiki × Obsidian 工作模式
aliases:
  - LLM Wiki
  - Obsidian Wiki
  - 知识系统工作流
type: guide
status: active
area: documentation
parent: "[[00-Home]]"
related:
  - "[[20-Knowledge/00-Knowledge-MOC]]"
  - "[[30-Sources/00-Sources-MOC]]"
  - "[[90-System/Schema]]"
updated: 2026-09-10
tags:
  - knowledge-base
  - obsidian
  - workflow
---

# LLM Wiki × Obsidian 工作模式

这是一套融合模式，不是两个并列系统：

- **LLM Wiki 是知识生产机制**：采集资料、提炼事实、综合专题、交叉引用、检查冲突并持续维护。
- **Obsidian 是知识操作界面**：用 Properties、WikiLinks、Backlinks、MOC 与 Graph 组织、检索和人工浏览。
- **成果系统是出口**：把已确认、可执行的结论收敛到少数 owner notes，而不是继续增加平行文档。

## 四层结构

| 层 | 目录 | 职责 | 内容约束 |
|---|---|---|---|
| Home | `00-Home.md` | 单一入口与全局路由 | 只导航，不复制技术合同 |
| Outcomes | `10-Outcomes/` | 项目路线、版本成果 | 回答“现在做什么”，一个结论一个 owner |
| Knowledge | `20-Knowledge/` | 综合、决策、概念、术语、工具 | 回答“为什么”，必须连接来源与成果 |
| Sources | `30-Sources/` | 外部资料与采集卡片 | 回答“依据在哪”，不直接规定实现 |
| System | `90-System/` | Schema、工作流与追加式日志 | 只维护知识系统本身 |

## 写入流程：Sources → Knowledge → Outcomes

1. **Ingest（采集）**：将新资料写入或合并到 [[30-Sources/00-Sources-MOC|Sources]]；记录出处、时间、范围和边界。
2. **Distill（提炼）**：抽取与 AlphaEngine 有关的事实，区分来源陈述、项目推断和待验证问题。
3. **Synthesize（综合）**：更新 [[20-Knowledge/00-Knowledge-MOC|Knowledge]] 下已有专题；只有问题域独立时才新建笔记。
4. **Decide（决策）**：跨版本、长期有效或存在明显取舍的选择写为 Decision，并链接受影响成果。
5. **Publish（成果化）**：只有已采纳且改变实施合同的结论，才同步到对应 Outcomes owner note。
6. **Maintain（维护）**：更新 Properties、双向链接和 [[90-System/Log|Log]]，检查孤立页、失效链接、冲突与过期状态。

## 查询流程：Home → Outcomes → Knowledge → Sources

- 了解项目或开始实现：从 [[00-Home]] 进入 Outcomes，不要求顺序阅读知识库。
- 质疑设计理由：从成果页的链接进入 Knowledge。
- 审核事实或外部依据：从 Knowledge 继续进入 Sources。
- 搜索优先使用 MOC、Backlinks 和 Obsidian Graph；不要靠目录遍历猜测文档关系。

## 成果 Owner

- 项目目标、架构与版本边界 → [[10-Outcomes/10-AlphaEngine]]
- 术语 → [[20-Knowledge/Glossary]]
- 文档结构与属性约束 → [[90-System/Schema]]

后续每个版本里程碑以独立 owner note 建立，并在项目路线页登记。

## 何时新建笔记

只有满足以下任一条件才新建：

- 新的版本成果需要独立 owner note；
- 一项长期架构取舍需要 Decision；
- 一个可复用技术问题域需要 Concept；
- 一个此前未采集的外部来源需要 Source。

否则深化现有页面。讨论记录、临时计划、同一合同的拆分副本不进入长期 Wiki。

## 一次更新的完成条件

- 结论有唯一 owner，未在多页平行维护；
- Knowledge 同时链接至少一个依据或明确标注“内部推导”，并链接受影响成果；
- Source 至少被一个 Knowledge 页面引用；
- 活跃笔记能从 [[00-Home]] 到达；
- Properties、WikiLinks、状态和 [[90-System/Log|维护日志]] 已同步；
- 没有密钥、个人隐私或未经检查的第三方依赖信息进入仓库。
