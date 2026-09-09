---
title: AlphaEngine 知识 MOC
aliases:
  - Knowledge MOC
  - 知识地图
type: moc
status: active
area: knowledge
parent: "[[00-Home]]"
related:
  - "[[10-Outcomes/10-AlphaEngine]]"
  - "[[90-System/LLM-Wiki-Obsidian]]"
updated: 2026-09-10
tags:
  - moc
  - reference
  - knowledge-base
---

# AlphaEngine 知识 MOC

> [!info] 使用方式
> 从 [[00-Home]] 进入成果页；需要理解设计理由、已确认基线或概念关系时再进入本页。本层是 LLM 综合后的可维护知识，不是原始资料堆。

## 决策与基线

> [!note] 空状态
> fromzero 重启尚未确认任何长期决策。首版技术栈与里程碑基线一旦确认，作为 `decision` 笔记写入 [[20-Knowledge/Decisions/]] 并在本节登记。

- **项目术语** → [[20-Knowledge/Glossary]]

## 概念

> [!note] 空状态
> 首个里程碑方向确认后，可复用技术问题域在此新建 `concept` 笔记（如资源绑定、Barrier、Render Graph 等）并登记。

## 上游与下游

- **追溯原始依据** → [[30-Sources/00-Sources-MOC|资料源 MOC]]
- **查看项目成果** → [[10-Outcomes/10-AlphaEngine|项目系统与路线]]
- **维护融合系统** → [[90-System/LLM-Wiki-Obsidian|LLM Wiki × Obsidian 工作模式]]
- **查看维护历史** → [[90-System/Log]]

## 知识层规则

1. 一份知识笔记只综合一个稳定问题域，并链接其来源与受影响成果。
2. 被成果采用的选择写为 Decision；可复用技术解释写为 Concept；名词统一进入 Glossary。
3. 结论变化时先更新知识笔记，再同步对应 Outcomes owner note，并在 [[90-System/Log]] 记录实质变化。
4. 不在本层复制 [[10-Outcomes/10-AlphaEngine|项目路线]]；用章节链接指向唯一结论。
