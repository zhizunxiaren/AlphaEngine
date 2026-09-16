---
title: AlphaEngine 资料源 MOC
aliases:
  - Sources MOC
  - 资料源地图
type: moc
status: active
area: sources
parent: "[[00-Home]]"
related:
  - "[[20-Knowledge/00-Knowledge-MOC]]"
  - "[[90-System/LLM-Wiki-Obsidian]]"
updated: 2026-09-15
tags:
  - moc
  - sources
  - knowledge-base
---

# AlphaEngine 资料源 MOC

> [!info] 本层回答“依据来自哪里”
> 来源卡片忠实记录外部资料、采集范围与原始判断依据，不承担项目实施合同。结论必须先进入 [[20-Knowledge/00-Knowledge-MOC|知识层]]，再进入成果 owner note。

## 知识系统方法

- [[30-Sources/Karpathy-LLM-Wiki|Karpathy LLM Wiki]]（本项目文档模式的原始方法来源）
- [[90-System/LLM-Wiki-Obsidian|本项目的融合工作模式]]

## 语言与工具链

- [[30-Sources/C++-标准与cppreference|C++ 标准与 cppreference]]（语言规范与 Core Guidelines，支撑 [[20-Knowledge/Concepts/C++-语言特性实践|C++ 语言特性实践]]）

## 第三方库与资产

- [[30-Sources/stb-图像解码库|stb_image 图像解码库]]（单头文件图像解码库 v2.30；引入约定见 [[20-Knowledge/Tooling/第三方依赖引入]]）

## 图形与渲染技术（待采集）

> [!note] 空状态
> 首个渲染技术栈方向确认后，相关官方文档、论文与规范在此建卡登记（如 D3D12 / Vulkan 资源绑定、Shader、渲染管线等）。

## 采集规则

1. 先检索是否已有同一来源卡片，避免重复采集。
2. 记录 URL、采集日期、抽取范围和适用边界；不得把推测写成来源事实。
3. 来源卡片至少被一份知识笔记引用，禁止形成孤立资料。
4. 来源变化时保留历史上下文并标记更新时间；影响项目结论时继续更新知识层和成果层。
