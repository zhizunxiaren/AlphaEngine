---
title: AlphaEngine 渲染术语表
aliases:
  - Rendering Context
  - 项目术语表
type: glossary
status: active
area: reference
parent: "[[20-Knowledge/00-Knowledge-MOC]]"
related:
  - "[[10-Outcomes/10-AlphaEngine]]"
  - "[[10-Outcomes/20-MVP1]]"
updated: 2026-08-16
tags:
  - glossary
  - rendering
---

# AlphaEngine Rendering Context

AlphaEngine 将场景状态转化为跨图形后端可执行的实时渲染工作。本术语表定义 Renderer、Render Graph 与图形后端之间共同使用的语言。

## Frame Construction

**Render Snapshot**:
Scene 在一个渲染时刻的只读数据快照，是 Renderer 构建当前帧的输入。
_Avoid_: Live Scene, Scene Pointer

**Renderer**:
把 Render Snapshot 转化为渲染 Pass、资源需求和最终画面意图的模块。
_Avoid_: Graphics Interface, Render Backend

**Render Graph**:
描述 Pass、资源使用及其依赖关系，并产生 Execution Plan 的模块。
_Avoid_: Command List, Backend Scheduler

**Execution Plan**:
Render Graph 生成的一次性、后端无关的已排序渲染工作计划。
_Avoid_: D3D12 Command List, Vulkan Command Buffer, Frame Graph

**Frame Context**:
一次可呈现帧从取得呈现目标到提交完成之间的唯一上下文。
_Avoid_: Frame Index, Back Buffer Pointer

## Graphics Seam

**Graphics Interface**:
接收后端无关资源和 Execution Plan、并隐藏图形后端机制的模块 interface。
_Avoid_: RHI, API Wrapper, D3D12 Wrapper

**Adapter**:
在 Graphics Interface 的内部 seam 上实现某一种执行环境的后端角色；当前角色包括 D3D12、未来 Vulkan 和测试用 Trace。
_Avoid_: Renderer Backend, Graphics Interface

**Trace Adapter**:
不执行真实 GPU 工作、而是记录规范化 Graphics Interface 行为的测试 Adapter。
_Avoid_: Mock GPU, Null Renderer

**Validation Adapter**:
检查 Graphics Interface 不变量并把调用转发给另一个 Adapter 的诊断角色。
_Avoid_: Debug Layer

## Resources and Synchronization

**Resource Handle**:
CPU 侧用于标识一种 GPU 资源及其 generation 的强类型身份。
_Avoid_: Native Handle, COM Pointer, Descriptor Handle

**Bindless Index**:
Shader 侧用于访问全局 Bindless Table 条目的稳定资源索引，与 Resource Handle 是不同身份。
_Avoid_: Resource Handle, Descriptor Handle

**Baseline Bindless**:
MVP 1 中只向首个纵向切片实际 Shader 暴露的、按类型划分的持久描述符表；当前仅包括 `Texture2D` 与 `Sampler`。
_Avoid_: Full Bindless, Descriptor Heap

**Full Bindless**:
MVP 2 对 Bindless 的扩展能力，覆盖 Buffer、UAV、GPU Scene 和流送等实际需求；它不是 MVP 1 基线绑定 ABI 的同义词。
_Avoid_: Baseline Bindless

**Resource Usage**:
Pass 对资源的后端无关访问意图，是 Render Graph 依赖分析和 Adapter 同步翻译的共同输入。
_Avoid_: D3D12 Resource State, Vulkan Image Layout

**Queue Hint**:
Execution Plan 对 Graphics、Compute 或 Copy 执行域的偏好；它不保证存在独立的物理 Queue。
_Avoid_: Command Queue, Queue Family

**Submission Token**:
标识一次 Graphics 提交完成点的后端无关凭证。
_Avoid_: D3D12 Fence, Vulkan Semaphore, Frame Index
