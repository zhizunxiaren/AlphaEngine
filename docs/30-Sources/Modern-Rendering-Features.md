---
title: 现代 D3D12 与 Vulkan 高级能力
aliases:
  - 现代 D3D12 与 Vulkan 高级能力
type: source
status: captured
area: sources
parent: "[[30-Sources/00-Sources-MOC]]"
captured: 2026-08-10
updated: 2026-08-10
tags:
  - source
  - d3d12
  - vulkan
  - rendering
---

# Source Record: 现代 D3D12 与 Vulkan 高级能力

- **来源类型**：Microsoft DirectX Specs、Microsoft Learn、DirectX Developer Blog 与 Khronos Vulkan 官方资料
- **采集日期**：2026-08-10
- **范围**：GPU-driven、Mesh Shader、VRS、Sampler Feedback、Enhanced Barriers、Work Graphs、Residency/Streaming、Pipeline Cache

## 官方来源

- [D3D12 Indirect Drawing](https://microsoft.github.io/DirectX-Specs/d3d/IndirectDrawing.html)
- [D3D12 Mesh Shader](https://microsoft.github.io/DirectX-Specs/d3d/MeshShader.html)
- [D3D12 Variable Rate Shading](https://microsoft.github.io/DirectX-Specs/d3d/VariableRateShading.html)
- [D3D12 Sampler Feedback](https://microsoft.github.io/DirectX-Specs/d3d/SamplerFeedback.html)
- [D3D12 Enhanced Barriers](https://microsoft.github.io/DirectX-Specs/d3d/D3D12EnhancedBarriers.html)
- [D3D12 Work Graphs](https://microsoft.github.io/DirectX-Specs/d3d/WorkGraphs.html)
- [D3D12 Residency Starter Library](https://learn.microsoft.com/en-us/samples/microsoft/directx-graphics-samples/d3d12-residency-starter-library-win32/)
- [D3D12 Pipeline Library](https://learn.microsoft.com/en-us/windows/win32/api/d3d12/nf-d3d12-id3d12device1-createpipelinelibrary)
- [Vulkan Device-Generated Commands](https://docs.vulkan.org/spec/latest/chapters/device_generated_commands/generatedcommands.html)
- [Vulkan Mesh Shader](https://docs.vulkan.org/refpages/latest/refpages/source/VK_EXT_mesh_shader.html)
- [Vulkan Fragment Shading Rate](https://docs.vulkan.org/features/latest/features/proposals/VK_KHR_fragment_shading_rate.html)
- [Vulkan Sparse Resources](https://docs.vulkan.org/guide/latest/sparse_resources.html)
- [Vulkan Synchronization2](https://docs.vulkan.org/guide/latest/extensions/VK_KHR_synchronization2.html)
- [Vulkan Graphics Pipeline Library](https://docs.vulkan.org/features/latest/features/proposals/VK_EXT_graphics_pipeline_library.html)

## 已抽取事实

- D3D12 的多数高级能力需要逐项查询 Feature/Tier，不能只用 Feature Level 或 GPU 型号推断支持情况。
- ExecuteIndirect、Mesh Shader、VRS、Sampler Feedback、Work Graphs 是不同层次的 GPU 工作生成、几何处理、着色率、纹理需求反馈和动态调度能力。
- Enhanced Barriers 将同步、访问和纹理布局分开表达；支持情况必须查询，并保留 Legacy Resource Barrier fallback。
- Residency、显存预算、资源流送与 Pipeline Cache 属于生产级实时渲染器基础能力，不只是可选画质效果。
- Vulkan 对 Mesh Shader、VRS、Synchronization2、Sparse Resource 和 Pipeline Cache 有官方路径，但 Sampler Feedback 与 Work Graphs 没有一一对应的标准对象模型。
- 跨后端对等应以渲染结果、资源意图和生命周期为准，不追求 D3D12/Vulkan 调用逐函数映射。
