---
title: Graphics Interface 使用 Execution Plan
aliases:
  - ADR-0001
  - Plan-driven Graphics Interface
type: decision
status: accepted
area: architecture
parent: "[[20-Knowledge/00-Knowledge-MOC]]"
related:
  - "[[10-Outcomes/10-AlphaEngine]]"
  - "[[10-Outcomes/20-MVP1]]"
date: 2026-08-11
updated: 2026-08-16
tags:
  - adr
  - graphics-interface
  - rendering
---

# 在 Graphics Interface seam 使用 Execution Plan

AlphaEngine 采用“Execution Plan + 短生命周期 Encoder + 显式资源控制面”的 Graphics Interface。Render Graph 生成后端无关 Execution Plan，Graphics Interface 将 Resource Usage、Queue Hint 和 Pass 工作翻译给 D3D12、未来 Vulkan 或 Trace Adapter；它不向 Renderer 暴露 Queue、Fence、Command Pool、D3D12 Resource State、Vulkan Stage/Access/Layout 或原生 Handle。这样既避免极小 Transaction 发展成第二套 GPU 语言，也避免 Device/Queue/CommandList 的显式对象模型退化成底层 API 的浅包装。

## Considered Options

- **极小 Transaction interface**：入口最少、depth 高，但 Transaction 和自定义命令 IR 会承担过多职责，调试与扩展成本集中在一个巨大协议中。
- **显式对象 interface**：Device、Queue、Fence、Command Pool 和 Encoder 与底层 API 对应直观，但 interface 面积大，Renderer 容易依赖后端机制。
- **Plan-driven hybrid**：保留显式 Resource Handle 和创建/退役控制面，帧执行则批量提交 Execution Plan；Pass 内只使用线程独占的短生命周期 Encoder。此方案被接受。

## Consequences

Render Graph 保持独立模块并拥有 Pass DAG 与依赖分析；Graphics Interface 负责后端 lowering、Descriptor、Barrier、Queue/Fence、Swapchain、延迟销毁和设备错误规范化。D3D12、Vulkan 和 Trace Adapter 必须通过同一组 interface 行为测试。若未来功能只能通过公开原生对象实现，应先重新评估 seam，而不是增加通用 `get_native_handle()` 逃生口。
