---
title: AlphaEngine 项目系统与路线
aliases:
  - AlphaEngine 路线图
  - 项目路线图
type: project
status: working
area: roadmap
parent: "[[00-Home]]"
updated: 2026-09-10
tags:
  - rendering
  - roadmap
  - alphaengine
---

# AlphaEngine 高性能实时渲染器路线

- 状态：**框架初始化；引擎目标待确认**
- 更新日期：2026-09-10
- 文档职责：只维护项目目标、架构约束和版本边界

## 怎么读项目文档

从 [[00-Home]] 进入成果系统。当前阶段，本文档是唯一成果 owner note；版本边界确认后，每个里程碑以独立 owner note 建立并在此登记。

## 项目目标（待确认）

> [!warning] 占位
> `fromzero` 分支从空基线重启。此页在技术栈与首版边界确认前不预设内容；候选方向（如底层图形 API、语言/构建基线、首个可验证里程碑与参考硬件）讨论与决策记录在 [[20-Knowledge/Decisions/]]，采纳后再回填为唯一 owner。

AlphaEngine 的长期目标是**现代高性能实时渲染器**而非通用游戏引擎。前三个版本聚焦 Windows；硬件光线追踪、完整 Editor、Physics、Audio、Scripting、Networking 不在默认路线内。具体口径待首份基线决策确认后固化。

## 版本与边界（待建立）

尚无已确认的版本 owner。首个里程碑建立时，应在此登记：

- 里程碑名称、范围与验收（内容 → Scene → 渲染 → 画面 → 正确性/性能证据）
- 参考平台、语言与构建基线
- 渲染技术栈与能力范围
- 唯一 owner note 的 WikiLink

## 当前决策状态

### 待决（首版基线）

- 底层图形 API（D3D12 / Vulkan / 双后端对等）与 Shader 方案
- 语言标准、构建系统、依赖管理与参考硬件
- 首个里程碑的纵向切片与可验证画面合同
- 资源绑定方向（Bindless / Descriptor Table 等）

上述选择一旦确认，作为 Decision 进入知识层，并同步为本文档或对应里程碑 owner note 的确认基线。

## 按需参考

- [[20-Knowledge/00-Knowledge-MOC|知识 MOC]]：专题综合、决策和术语。
- [[30-Sources/00-Sources-MOC|资料源 MOC]]：外部依据（含 [[30-Sources/Karpathy-LLM-Wiki|Karpathy LLM Wiki]] 方法源）。
- [[90-System/LLM-Wiki-Obsidian|工作模式]] 与 [[90-System/Schema]]：如何维护本 Vault。
