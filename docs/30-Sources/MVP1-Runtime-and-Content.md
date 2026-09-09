---
title: MVP 1 Runtime、内容与验证依据
aliases:
  - MVP 1 Runtime、内容与验证依据
type: source
status: captured
area: sources
parent: "[[30-Sources/00-Sources-MOC]]"
captured: 2026-08-12
updated: 2026-08-12
tags:
  - source
  - mvp1
  - d3d12
  - gltf
  - verification
---

# Source Record: MVP 1 Runtime、内容与验证依据

- **来源类型**：Microsoft Learn、Khronos glTF 2.0 官方规范
- **采集日期**：2026-08-12
- **用途**：约束 MVP 1 D3D12 Runtime Contract 的已确认 API 事实；本文件不把项目提案写成官方结论。

## Direct3D 12 Runtime

- [Swap Chains](https://learn.microsoft.com/en-us/windows/win32/direct3d12/swap-chains)：Present 前 Back Buffer 必须处于 `D3D12_RESOURCE_STATE_PRESENT`；运行时应使用 fence 限制飞行帧，避免 CPU 无界排队增加输入延迟；tearing 必须运行时查询；创建 D3D12 swapchain 时传入的是 Direct Queue 而非 Device。
- [Recording Command Lists and Bundles](https://learn.microsoft.com/en-us/windows/win32/direct3d12/recording-command-lists-and-bundles)：Command Allocator 在 GPU 完成其关联工作前不得重置；Command List 与 Allocator 类型必须匹配。
- [D3D12 Heap Types](https://learn.microsoft.com/en-us/windows/win32/api/d3d12/ne-d3d12-d3d12_heap_type)：大多数 GPU Resource 位于 DEFAULT heap，由 UPLOAD heap 填充；Texture 不能位于 UPLOAD 或 READBACK heap。
- [Uploading Texture Data Through Buffers](https://learn.microsoft.com/en-us/windows/win32/direct3d12/upload-and-readback-of-texture-data)：Texture upload 使用 buffer copy footprint；row pitch 与 placement 有对齐要求。
- [Read Back Data via a Buffer](https://learn.microsoft.com/en-us/windows/win32/direct3d12/readback-data-using-heaps)：READBACK heap 只承载 buffer；`Map` 不会等待 GPU，需要 fence 确认写入完成。
- [Using Resource Barriers](https://learn.microsoft.com/en-us/windows/win32/direct3d12/using-resource-barriers-to-synchronize-resource-states-in-direct3d-12)：应用负责 Resource State 追踪及必要的 transition/UAV/aliasing barrier。
- [Managing Graphics Pipeline State](https://learn.microsoft.com/en-us/windows/win32/direct3d12/managing-graphics-pipeline-state-in-direct3d-12)：PSO 汇集 shader、rasterizer、blend、depth/stencil、RT/DS format、MSAA 等管线状态；资源绑定、viewport/scissor 等仍由 Command List 设置。
- [Creating a Root Signature](https://learn.microsoft.com/en-us/windows/win32/direct3d12/creating-a-root-signature)：PSO 与 Root Signature 必须兼容；设置 PSO 不会自动设置 Root Signature。
- [GPU-based Validation](https://learn.microsoft.com/en-us/windows/win32/direct3d12/using-d3d12-debug-layer-gpu-based-validation)：可检测未初始化/越界 Descriptor、已释放 Resource、资源状态和 Sampler 错误；GBV 有显著开销，适合作为受控验证路径。
- [DRED](https://learn.microsoft.com/en-us/windows/win32/direct3d12/use-dred)：设备移除后可提供 breadcrumb 与 page-fault 诊断，必须在 Device 创建前配置自动 breadcrumb/page-fault 选项。
- [Capability Querying](https://learn.microsoft.com/en-us/windows/win32/direct3d12/capability-querying)：`ID3D12Device::CheckFeatureSupport` 是按 feature data structure 查询运行时能力的入口；启动 Capability Profile 不能由 GPU 名称或 Feature Level 代替。

## 内容格式

- [glTF 2.0 Specification](https://registry.khronos.org/glTF/specs/2.0/glTF-2.0.html)：定义 PBR metallic-roughness Material、base color、metallic-roughness、normal、occlusion 与 emissive Texture 的语义。

## Window、输入与 Shader 工具链

- [SDL_CreateWindow](https://wiki.libsdl.org/SDL3/SDL_CreateWindow)：窗口创建和 SDL 事件主线程规则；窗口逻辑大小与 drawable 像素大小可能不同，收到 pixel-size change 后应重新查询。
- [SDL3 High DPI](https://wiki.libsdl.org/SDL3/README-highdpi)：window size、pixel size、pixel density 与 display scale 是不同概念，图形输出应以 pixel size 处理 Resize。
- [DirectX Shader Compiler](https://github.com/microsoft/DirectXShaderCompiler)：官方 DXC 可将 HLSL 编译为 DirectX 的 DXIL 和 Vulkan 的 SPIR-V；`dxc.exe` 支持 Shader Model 6.0 及以上。

## 本项目推断的使用规则

- 单 Direct Queue、Legacy Barrier、离线 DXIL 和预烘焙内容是为了收束首个 D3D12 纵向切片，并非 D3D12 对所有项目的强制要求。
- 参考场景规模、容量和性能阈值属于 AlphaEngine 的提案，需由项目负责人确认。
- SDL3、HLSL/DXC、GLB Cook、Forward Renderer 与具体 Artifact 文件格式属于 AlphaEngine 的提案；外部资料只支持它们可用的能力和格式语义。
