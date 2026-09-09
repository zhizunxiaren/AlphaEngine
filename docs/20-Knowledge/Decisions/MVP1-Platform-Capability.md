---
title: MVP 1 平台与 D3D12 能力基线
aliases:
  - MVP 1 平台与 D3D12 能力基线
type: decision
status: confirmed
area: mvp1
parent: "[[20-Knowledge/00-Knowledge-MOC]]"
related:
  - "[[10-Outcomes/20-MVP1]]"
updated: 2026-08-13
tags:
  - rendering
  - mvp1
  - windows
  - d3d12
  - bindless
---

# MVP 1 平台与 D3D12 能力基线

## 决策

AlphaEngine MVP 1 以 Windows 10 22H2 x64 和 D3D12 为唯一运行平台。基础实现必须在 GTX 1080 Ti 参考机上运行；较新的 Shader Model 和 DirectX 12 Ultimate 能力只能作为运行时检测后启用的可选路径。

## 硬门槛

| 能力 | 最低要求 |
|---|---|
| Windows | Windows 10 22H2，Build 19045，x64 |
| D3D12 运行时 | DirectX 12 Agility SDK 的稳定发行版；具体版本写入并锁定在构建清单中 |
| D3D Feature Level | `D3D_FEATURE_LEVEL_12_0` |
| Shader Model | Shader Model 6.0 |
| Root Signature | Version 1.1 |
| Resource Binding | Resource Binding Tier 3 |

设备不满足任一硬门槛时，引擎应在创建设备阶段停止并报告缺失能力，而不是在渲染过程中以未定义行为失败。

## MVP 1 资源绑定路径

MVP 1 采用大型 Descriptor Table 形式的 Bindless，而不要求 Shader Model 6.6 Direct Heap Indexing：

- 固定的 Frame/Pass Descriptor Table 保存每帧和每个 Pass 的少量稳定资源。
- 全局大型 Bindless Descriptor Table 在 MVP 1 只保存材质 Texture2D；Sampler 使用独立的全局 Sampler Table。Buffer/UAV 等类别只在 MVP 2 Full Bindless 中扩展。
- 少量 Root Constants 传递对象、材质或绘制索引。
- 材质和场景数据保存稳定的逻辑资源索引，不直接保存短生命周期 CPU Descriptor Handle。

该布局能够在 GTX 1080 Ti 参考机上建立 MVP 1，同时为 MVP 2 的 GPU Scene 和 MVP 3 的 Vulkan Descriptor Indexing 保留迁移路径。

## 可选能力

以下能力可在硬件和驱动支持时启用，但不得成为 MVP 1 的功能正确性前提：

- Shader Model 6.6 Direct Heap Indexing。
- Mesh Shader。
- Variable Rate Shading。
- Sampler Feedback。
- Work Graphs。
- 其他 DirectX 12 Ultimate 能力。

每个可选路径必须有基础 D3D12 或传统光栅路径作为 fallback。GTX 1080 Ti 负责基础光栅与 fallback 验收，不负责 DX12 Ultimate 路径验收。

## 启动能力报告

引擎启动时必须调用 `ID3D12Device::CheckFeatureSupport`，并输出可保存、可比较的 GPU Capability Report。至少包含：

- Adapter 名称、Vendor ID、Device ID、显存和驱动版本。
- 实际创建的 Feature Level。
- 最高 Shader Model。
- 最高 Root Signature 版本。
- Resource Binding Tier。
- CBV/SRV/UAV 与 Sampler Descriptor Heap 上限。
- Mesh Shader、VRS、Sampler Feedback、Enhanced Barriers、Work Graphs 等可选 Feature 的支持级别。

能力报告既用于启动诊断，也作为后续功能选择、测试分组和性能报告的输入。

## 尚未确定

- Agility SDK 与 DXC 的首个锁定版本。
- 最低发行 GPU；GTX 1080 Ti 当前只是 MVP 1 参考机。
- Capability Report 的持久化格式和兼容性策略。
- 可选 Feature 的运行时开关、测试矩阵和强制 fallback 测试方式。

## 官方依据

- [Checking hardware feature support](https://learn.microsoft.com/en-us/windows/win32/direct3d12/hardware-feature-levels)
- [ID3D12Device::CheckFeatureSupport](https://learn.microsoft.com/en-us/windows/win32/api/d3d12/nf-d3d12-id3d12device-checkfeaturesupport)
- [D3D12 Resource Binding](https://microsoft.github.io/DirectX-Specs/d3d/ResourceBinding.html)
- [HLSL Shader Model 6.6](https://devblogs.microsoft.com/directx/hlsl-shader-model-6-6/)

## 相关页面

- [[10-Outcomes/10-AlphaEngine|项目系统与路线]]
- [[20-Knowledge/Decisions/MVP1-Reference-Baseline|MVP 1 参考硬件与性能基线]]
- [[20-Knowledge/Concepts/Bindless-and-Descriptor-Tables|Bindless 与 Descriptor Table]]
- [[10-Outcomes/30-MVP2|现代渲染器高级能力矩阵]]
