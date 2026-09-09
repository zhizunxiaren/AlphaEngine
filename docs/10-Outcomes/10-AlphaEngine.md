---
title: AlphaEngine 项目系统与路线
aliases:
  - AlphaEngine 路线图
  - 项目路线图
type: project
status: active
area: roadmap
parent: "[[00-Home]]"
related:
  - "[[10-Outcomes/20-MVP1]]"
  - "[[10-Outcomes/30-MVP2]]"
updated: 2026-08-20
tags:
  - rendering
  - roadmap
  - alphaengine
---

# AlphaEngine 高性能实时渲染器路线

- 状态：路线已确认；MVP 1 已验收，当前进入 MVP 2.1 GPU Foundation
- 更新日期：2026-08-20
- 文档职责：只维护项目目标、架构约束和版本边界

## 怎么读项目文档

从 [[00-Home]] 进入成果系统；当前阶段主要阅读：

1. 本文：了解 AlphaEngine 要做什么、三个 MVP 如何推进。
2. [[10-Outcomes/20-MVP1|MVP 1 技术设计]]：实现或评审 MVP 1 时读取。

只有规划高级能力时才进入 [[10-Outcomes/30-MVP2]]。

[[20-Knowledge/00-Knowledge-MOC|知识层]]与 [[20-Knowledge/Decisions/0001-Graphics-Interface|Graphics Interface 决策]]按需提供依据和选择理由，不是顺序阅读材料。

## 项目目标

AlphaEngine 的目标是实现一个**现代高性能实时渲染器**，而不是通用游戏引擎。

“现代”意味着使用显式图形后端、Render Snapshot、Render Graph、Bindless、GPU-driven 基础和可验证的 D3D12/Vulkan 对等架构。

“高性能”意味着 CPU、Render Submission 和 GPU 帧时间都是一等工程指标；项目以 p99、hitch、显存、资源生命周期和提交开销衡量性能，不用平均 FPS 掩盖长尾。

前三个 MVP 聚焦 Windows。硬件光线追踪、完整 Editor、Physics、Audio、Scripting 和 Networking 不在当前路线内。

## 总体架构

~~~mermaid
flowchart TD
    App["Sandbox / Benchmark"] --> Scene["Scene"]
    Scene --> Snapshot["Render Snapshot"]
    Snapshot --> Renderer["Renderer"]
    Renderer --> Graph["Render Graph"]
    Graph --> Plan["Execution Plan"]
    Plan --> Graphics["Graphics Interface"]
    Graphics --> D3D12["MVP 1–2: D3D12 Adapter"]
    Graphics --> Vulkan["MVP 3: Vulkan Adapter"]
    Graphics --> Trace["Trace / Validation Adapter"]
~~~

固定约束：

- Scene 以不可变 Render Snapshot 向 Renderer 交付一帧数据。
- Renderer 只表达画面意图；Render Graph 负责 Pass、Resource Usage、依赖和 Execution Plan。
- Graphics Interface 是真实 seam，通过 Resource Handle、Encoder、Frame Context 和 Submission Token 隐藏图形后端。
- D3D12/Vulkan 原生对象、Barrier、Descriptor Heap、Queue/Fence 和错误码只存在于 Adapter implementation。
- D3D12、Vulkan 和 Trace Adapter 使用同一套 Interface 行为测试。
- Shader 原则上共享 HLSL 源码和版本化 Binding ABI；后端产物由工具链分别生成。

## 三阶段路线

### MVP 1：D3D12 纵向切片

目标：证明“内容 → Scene → Snapshot → Renderer → Render Graph → Graphics → D3D12 → 最终画面 → 正确性/性能证据”的完整链路。

| 范围 | MVP 1 基线 |
|---|---|
| 平台 | Windows x64、Direct3D 12 |
| 内容 | GLB 离线 Cook；静态 Mesh、Texture、metallic-roughness Material |
| 画面 | Forward PBR、Directional Shadow、HDR Scene Color、SDR Tone Map |
| 基础设施 | Render Snapshot、Render Graph、Plan-driven Graphics Interface、Baseline Bindless |
| 运行时 | 单 Direct Queue、两帧在飞、三缓冲、Legacy Barrier |
| Shader | HLSL + DXC，离线 DXIL 与反射 |
| 调试 | Capability Report、Debug Layer、DRED、PIX、Dear ImGui Debug UI |
| 验收 | 参考机 1080p/60 FPS、图像回归、p99/hitch、生命周期与 Resize 测试 |

MVP 1 是架构和纵向链路基线，不代表最终渲染能力上限。Module Interface、数据/Shader ABI、资源生命周期、错误模型、精确数值和完成定义只在 [[10-Outcomes/20-MVP1]] 维护。

### MVP 2：D3D12 现代能力

MVP 2 在稳定纵向切片上扩展现代实时渲染能力，按六个内部里程碑推进：

1. **GPU Foundation**：Full Bindless、GPU Scene、Transient/Aliasing、多 Queue、PSO Cache 和显存基础。
2. **GPU-driven Geometry**：GPU Culling、Hi-Z、Indirect、Meshlet、LOD/HLOD、Mesh Shader 与 fallback。
3. **Lighting and Materials**：高级材质、Clustered Lighting、阴影、Reflection 和非光追 GI。
4. **Temporal and Atmosphere**：TAA/TAAU、动态分辨率、屏幕空间效果、天空、体积效果和后处理。
5. **World Rendering**：Terrain、Foliage、Water、Particles、Animation、Streaming 和虚拟化资源。
6. **Production Hardening**：VRS、Sampler Feedback、DirectStorage、HDR、Crash diagnostics、图像与性能回归。

硬件专有能力必须有正确性 fallback。硬件光线追踪仍不在已确认范围。逐项能力、验收和 D3D12/Vulkan 对等策略见 [[10-Outcomes/30-MVP2]]。

### MVP 3：Vulkan 功能对等

MVP 3 不新增画面功能，而是用 Vulkan Adapter 对齐 MVP 2 已完成能力：

- 复用相同 Scene、Asset、Shader source、Renderer、Render Graph 和 Graphics Interface。
- 与 D3D12 使用相同参考场景、行为测试、图像容差和性能报告。
- Vulkan 特有 Handle、Stage/Access/Layout、Descriptor 和 Queue 规则限制在 Adapter 内。
- 若移植必须大范围修改 Renderer 或 Scene，先修正 Graphics Interface seam，而不是增加后端条件分支。

## 当前决策状态

### 已确认

- 项目目标是现代高性能实时渲染器。
- 路线顺序为 D3D12 纵向切片 → D3D12 现代能力 → Vulkan 对等。
- MVP 1 使用 Windows、D3D12、C++20 构建基线和 Plan-driven Graphics Interface。
- Binding 方向是 Frame/Pass Table + Baseline Bindless + 少量 Root Constants。
- Sandbox 调试界面使用 Dear ImGui，并从 benchmark/golden 输出中排除。

### MVP 1 已完成的实施基线

- SDL3 Platform Host、HLSL/DXC、GLB Cook、Forward PBR。
- 单 Direct Queue、两帧在飞/三缓冲、Legacy Barrier。
- Texture2D/Sampler Baseline Bindless、运行宿主、测试和性能细则。

### MVP 1 已闭合项目

- vcpkg baseline、第三方版本、NuGet/运行文件 hash、许可证和离线 parser 安全边界已经锁定。
- 程序化参考场景、CC0 许可证、content hash、10 秒相机路径与 full-frame golden 已提交。
- Runtime content schema v2、Shader Binding ABI v2、RGBA8+mip cook 和 Descriptor 容量已锁定。
- [[10-Outcomes/20-MVP1|MVP 1 技术设计]] 已转为接受合同，并记录 Debug/CTest/真机 benchmark 证据。

完整实现与验收记录只在 [[10-Outcomes/20-MVP1]] 维护。

## 架构原则

- **小 Interface，深 implementation**：后端机制集中在 Graphics/Adapter，调用方不学习原生图形对象。
- **显式数据与生命周期**：Snapshot 不可变；Resource、Descriptor、Frame Context 由 Submission Token 约束。
- **正确性优先于隐藏优化**：Barrier、错误和 fallback 可观测；优化必须保留 Trace/Validation 语义。
- **帧时间优先于平均值**：热路径不逐 Draw 分配、不获取全局锁；回归报告关注 p99 和 hitch。
- **能力逐版本扩展**：MVP 1 不为未来功能预留无实际使用的 ABI；首次引入时显式升级合同。
- **工具与产品隔离**：Dear ImGui、PIX 和调试数据服务开发，不污染 reference image 或正式性能样本。

## 按需参考

- [[10-Outcomes/20-MVP1]]：当前实现主文档。
- [[10-Outcomes/30-MVP2]]：MVP 2 能力范围。
- [[20-Knowledge/Decisions/0001-Graphics-Interface|ADR-0001]]：关键 seam 的选择理由。
- [[20-Knowledge/00-Knowledge-MOC|知识 MOC]]：专题综合、决策和术语。
