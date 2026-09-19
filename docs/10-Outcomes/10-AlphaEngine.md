---
title: AlphaEngine 项目系统与路线
aliases:
  - AlphaEngine 路线图
  - 项目路线图
type: project
status: working
area: roadmap
parent: "[[00-Home]]"
updated: 2026-09-19
tags:
  - rendering
  - roadmap
  - alphaengine
---

# AlphaEngine 高性能实时渲染器路线

- 状态：**已有首个可运行的过渡实现（学习性基线）；引擎目标、技术栈与首版边界待确认**
- 更新日期：2026-09-19
- 文档职责：只维护项目目标、架构约束和版本边界

## 怎么读项目文档

从 [[00-Home]] 进入成果系统。当前阶段，本文档是唯一成果 owner note；版本边界确认后，每个里程碑以独立 owner note 建立并在此登记。

## 项目目标（待确认）

> [!warning] 占位
> `fromzero` 分支从空基线重启。此页在技术栈与首版边界确认前不预设内容；候选方向（如底层图形 API、语言/构建基线、首个可验证里程碑与参考硬件）讨论与决策记录在 [[20-Knowledge/Decisions/]]，采纳后再回填为唯一 owner。

AlphaEngine 的长期目标是**现代高性能实时渲染器**而非通用游戏引擎。前三个版本聚焦 Windows；硬件光线追踪、完整 Editor、Physics、Audio、Scripting、Networking 不在默认路线内。具体口径待首份基线决策确认后固化。

## 实现现状（学习性过渡基线）

> [!warning] 本节不是技术栈决策
> 这里只登记 `fromzero` 仓库中**已经存在的事实**，唯一目的是防止文档与代码真实状态脱节。它**不构成**底层图形 API、渲染架构、语言标准或首版里程碑的选择——那四项仍属本文档「当前决策状态」的待决项。首版基线确认后，本节的定位由对应里程碑 owner note 取代，本节随即失效。

- 事实截点：2026-09-19（对应提交 `bd71c56` / `b7256ec` / `9525467`）
- 变更规则：本节内容随代码变化同步更新，并在 [[90-System/Log]] 追加记录

| 维度 | 当前事实 |
|---|---|
| 语言与构建 | C++（MSVC 工具链）；`Engine/Engine.slnx` + `Engine/Engine.vcxproj`；输出目录 `build/`（已忽略） |
| 依赖与来源 | [[30-Sources/stb-图像解码库\|stb_image]]，按 [[20-Knowledge/Tooling/第三方依赖引入\|第三方依赖引入]] 约定置于 `Engine/third_party/stb/`。**当前尚未启用**：仅在 `Engine.vcxproj` 中登记为项目项，没有任何翻译单元定义 `STB_IMAGE_IMPLEMENTATION`，也无调用点 |
| 实现性质 | 跟随 *Ray Tracing in One Weekend* 的逐章实现（当前对齐 13.x），属**学习性过渡实现**，非目标架构 |
| 已具备能力 | 可定位相机（`vfov` / `lookfrom` / `lookat` / `vup`）与景深（散焦圆盘采样）；`material` 抽象（`lambertian` / `metal` / `dielectric`，含反射、折射与 Schlick 近似）；递归路径追踪与 `max_depth` 截断；像素多重采样抗锯齿；gamma 2 编码输出 PPM |
| 已知差距 | 场景无显式光源（天空是唯一光源）、无直接光采样、光线方向未归一化、无俄罗斯轮盘赌、无加速结构（BVH）、无实时窗口与 ImGui |
| 与长期目标的关系 | 长期目标是**现代高性能实时渲染器**。当前实现位于 CPU 侧，用于建立几何、材质与光传输的正确性直觉；它既非目标架构，也尚未触及图形 API、GPU 渲染管线等实时渲染的关键部分 |

相关理由与推导不在此复制：光传输与采样见 [[20-Knowledge/Concepts/路径追踪与蒙特卡洛积分]]，着色与光照见 [[20-Knowledge/Concepts/光照模型]]，求交数学见 [[20-Knowledge/Concepts/射线与几何体求交]]。

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
