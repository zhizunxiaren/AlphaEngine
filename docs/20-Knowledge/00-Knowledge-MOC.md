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
  - "[[10-Outcomes/20-MVP1]]"
  - "[[10-Outcomes/30-MVP2]]"
updated: 2026-08-16
tags:
  - moc
  - reference
  - knowledge-base
---

# AlphaEngine 知识 MOC

> [!info] 使用方式
> 从 [[00-Home]] 进入成果页；需要理解设计理由、已确认基线或概念关系时再进入本页。本层是 LLM 综合后的可维护知识，不是原始资料堆。

## 决策与基线

- **Graphics Interface 为什么使用 Execution Plan** → [[20-Knowledge/Decisions/0001-Graphics-Interface|ADR-0001]]
- **MVP 1 参考硬件与性能** → [[20-Knowledge/Decisions/MVP1-Reference-Baseline]]
- **MVP 1 平台能力** → [[20-Knowledge/Decisions/MVP1-Platform-Capability]]
- **MVP 1 语言与构建** → [[20-Knowledge/Decisions/MVP1-Language-Build]]
- **项目术语** → [[20-Knowledge/Glossary]]

## 概念

- **Descriptor 与 Bindless** → [[20-Knowledge/Concepts/Bindless-and-Descriptor-Tables]]
- **Root Signature** → [[20-Knowledge/Concepts/Root-Signatures]]
- **代码智能工具链** → [[20-Knowledge/Tooling/Code-Intelligence]]

## 上下游

- **追溯原始依据** → [[30-Sources/00-Sources-MOC|资料源 MOC]]
- **查看项目成果** → [[10-Outcomes/10-AlphaEngine|项目系统与路线]]、[[10-Outcomes/20-MVP1|MVP 1 技术设计]]、[[10-Outcomes/30-MVP2|MVP 2 能力矩阵]]
- **维护融合系统** → [[90-System/LLM-Wiki-Obsidian|LLM Wiki × Obsidian 工作模式]]
- **查看维护历史** → [[90-System/Log]]

## 知识层规则

1. 一份知识笔记只综合一个稳定问题域，并链接其来源与受影响成果。
2. 被成果采用的选择写为 Decision；可复用技术解释写为 Concept；名词统一进入 Glossary。
3. 结论变化时先更新知识笔记，再同步对应 Outcomes owner note，并在 [[90-System/Log]] 记录实质变化。
4. 不在本层复制 [[10-Outcomes/20-MVP1|MVP 1 实施合同]]；用章节链接指向唯一结论。
