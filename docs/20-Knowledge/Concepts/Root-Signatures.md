---
title: Root Signature（根签名）
aliases:
  - Root Signature（根签名）
type: concept
status: working
area: resource-binding
parent: "[[20-Knowledge/00-Knowledge-MOC]]"
related:
  - "[[10-Outcomes/20-MVP1]]"
  - "[[20-Knowledge/Decisions/0001-Graphics-Interface]]"
updated: 2026-08-13
tags:
  - rendering
  - resource-binding
  - d3d12
  - root-signature
---

# Root Signature（根签名）

## 一句话结论

**Root Signature 是 D3D12 中 Pipeline 的资源绑定 ABI（应用二进制接口）：它规定 Shader 期待哪些绑定槽、每个槽的类型和 HLSL register 映射；每次 Draw 或 Dispatch 再填入实际资源地址、Descriptor Table 起点或常量。**

它不是资源仓库，不保存 Texture、Buffer 或 Descriptor 本身；它是这些资源如何进入 Shader 的布局契约。

## 与函数调用的类比

```text
Root Signature  = 函数签名
Root Parameter  = 形参槽位
Root Argument   = 某次 Draw/Dispatch 的实参
```

例如 Root Signature 可以规定：

```text
[0] 4 个 32-bit Root Constants，映射到 b0
[1] Per-pass Descriptor Table，映射到 b1 与 t0-t7
[2] 全局 Bindless SRV Table，映射到 t0, space1 起的大型数组
[3] Sampler Table，映射到 s0 起的数组
```

而某次 Draw 实际填入的 Root Arguments 可能是：

```text
[0] objectId = 51, materialId = 17, flags = 3, padding = 0
[1] 当前 Pass 的 Descriptor Heap 起点
[2] 全局 Texture Heap 起点
[3] 全局 Sampler Heap 起点
```

Root Signature 定义“需要什么”，Root Argument 提供“这一次实际用什么”。

## Root Signature、PSO 与 Command List

```text
Shader 的 b#/t#/u#/s# 声明
             ↓
Root Signature 定义绑定布局
             ↓
PSO 使用兼容的 Root Signature
             ↓
Command List 设置 Root Arguments
             ↓
Draw / Dispatch 执行 Shader
```

所有纳入同一个 PSO 的 Shader 都必须与该 PSO 使用的 Root Signature 兼容。设置 PSO 不会自动设置或切换 Root Signature；切换到不同的 Root Signature 后，此前的 root bindings 失效，新的布局要求的参数必须在 Draw/Dispatch 前重新设置。

Graphics Command List 分别维护 Graphics 和 Compute Root Signature；Compute Command List 只维护 Compute Root Signature。

## 三类 Root Parameter

| 类型 | Command List 填入的 Root Argument | 典型 Shader 映射 | 适合用途 |
| --- | --- | --- | --- |
| Root Constants（根常量） | 内联 32-bit 值 | `cbuffer` / `ConstantBuffer` | object/material/draw ID、flag、小型控制参数 |
| Root Descriptor（根描述符） | 64-bit GPU Virtual Address | 单个 CBV，或受限的 raw/structured SRV/UAV Buffer | 少量高频变化的 Buffer |
| Descriptor Table（描述符表） | 指向 Descriptor Heap 某一范围的 GPU Descriptor Handle | `b#`、`t#`、`u#`、`s#` 对应的 Descriptor Range | Texture、Sampler、常规资源集合、Bindless 数组 |

### Root Constants

Root Constants 直接嵌入 Root Argument，不需要额外间接寻址。它们适合非常小且经常变化的数据：

```hlsl
struct DrawConstants
{
    uint objectId;
    uint materialId;
    uint flags;
    uint padding;
};

ConstantBuffer<DrawConstants> gDraw : register(b0);
```

它不适合大块数据、数组或需要动态索引的 Constant Buffer 布局。MVP 1 将它用于 object、material 和 draw 索引。

### Root Descriptor

Root Descriptor 直接携带一个 GPU Virtual Address，少一层 Descriptor Table 间接访问。它只能用于：

- CBV。
- 不要求格式转换的 raw/structured Buffer SRV/UAV。

它不能直接表示 `Texture2D` SRV、typed Buffer 或 root descriptor array，也不携带资源大小信息。因此它是少量高频 Buffer 的专用优化，不是 Texture 或 Bindless 资源的通用绑定方式。

### Descriptor Table

Descriptor Table 指向 Descriptor Heap 中的一段连续 Descriptor。它是 Texture、Sampler 和大量资源的通用路径，也是本项目大型 Bindless Table 的基础。

```cpp
commandList->SetDescriptorHeaps(...);
commandList->SetGraphicsRootDescriptorTable(
    bindlessRootSlot,
    bindlessTableGpuStart);
```

Descriptor Table 可以有多个 Descriptor Range，但 Sampler 必须在独立的 Sampler Heap/Table 中，不能与 CBV/SRV/UAV 共用同一张 Table。

## HLSL Register 如何映射

Root Signature 使用 Shader Register 与 Register Space 描述资源命名空间：

| Register | 资源类型 |
| --- | --- |
| `b#` | CBV |
| `t#` | SRV |
| `u#` | UAV |
| `s#` | Sampler |

例如：

```hlsl
ConstantBuffer<FrameConstants> gFrame : register(b0, space0);
Texture2D<float4> gTextures[] : register(t0, space1);
SamplerState gSamplers[] : register(s0, space2);
```

Root Signature 不必写在 HLSL 中；它可以在 API 侧创建，也可以嵌入 Shader。关键要求是最终 PSO 使用的 Root Signature 必须与这些 HLSL 绑定声明兼容。

`space` 是独立的 register 命名空间。因此 `t0, space0` 与 `t0, space1` 可以表达不同用途的 SRV 范围，例如固定 Per-pass SRV 与全局 Bindless SRV。

## 成本与布局原则

Root Signature 的大小上限是 64 DWORD：

| 参数 | Root Signature 占用 | 间接访问层数 |
| --- | ---: | ---: |
| Root Constant | 每个 32-bit 值 1 DWORD | 0 |
| Root Descriptor | 每项 2 DWORD | 1 |
| Descriptor Table | 每张 Table 1 DWORD | 2 |

Static Sampler 不计入该 DWORD 上限。

这不是让所有数据都进入 Root Signature 的理由。驱动会在 Draw/Dispatch 之间 Root Argument 发生变化时版本化 Root Signature State；过大的布局和高频修改会累积状态成本。

实用规则：

- 保持 Root Signature 小，只放少量高频、低延迟绑定。
- 让大数据留在 Buffer 和 Descriptor Heap 中。
- 尽量让同一批 PSO 共享 Root Signature，避免频繁切换布局。
- 将高频变化的 Root Parameter 排在前面。
- 只更新真正变动的 Root Argument，而不是每个 Draw 重设全部槽位。

## AlphaEngine MVP 1 的使用方式

MVP 1 已确认采用以下混合布局：

```text
Root Constants
  └── objectId / materialId / drawId 等少量索引

Frame / Pass Descriptor Table
  └── Camera、Object/Material/Light 表、Shadow Map 与 Pass 常量等稳定资源

Global Bindless Descriptor Table
  └── MVP 1 仅为可索引的 Texture2D；Buffer/UAV 等扩展到 MVP 2

Sampler Descriptor Table 或 Static Samplers
  └── 动态可索引 Sampler 或完全固定的 Sampler 状态
```

Graphics Interface 会根据 Shader Reflection 和统一绑定元数据在内部生成 D3D12 Root Signature；Renderer、Render Graph 和 Scene 不直接看到 Root Signature、Descriptor Heap 或后端原生 Handle。

这让 MVP 3 的 Vulkan Adapter 可以把同一份高层绑定元数据映射为 Pipeline Layout、Descriptor Set Layout 和 Push Constant Range。两种 API 的对象并非一一等同，但高层的“Frame/Pass 数据、全局 Bindless、少量 Draw 常量”意图可以保持一致。

## 常见误解

| 误解 | 正确理解 |
| --- | --- |
| Root Signature 就是 Descriptor Heap | Heap 存 Descriptor；Root Signature 只定义哪些 Table/参数可被绑定。 |
| Root Signature 就是 Descriptor Table | Descriptor Table 只是三类 Root Parameter 之一。 |
| Bindless 不需要 Root Signature | D3D12 的大型 Bindless Descriptor Table 仍需由 Root Signature 声明并绑定。 |
| Root Descriptor 能替代所有 Descriptor | 它不支持 Texture2D 等复杂 View，且功能受 Buffer 类型限制。 |
| Root Constants 可以传任意 Constant Buffer | 它适合少量标量；受 64 DWORD Root Signature 总预算和布局限制。 |
| 每个 Draw 都重新设置全部 Root 参数最稳妥 | 正确但通常不必要；应只更新变化的槽位。 |

## 已确认事实、项目决策与待决定项

### 已确认事实

- Root Signature 规定 Shader 预期的绑定布局，Root Argument 是运行时绑定的实际值。
- Root Constants、Root Descriptors 和 Descriptor Tables 是三类 Root Parameter。
- Root Signature 与当前 PSO 必须兼容；切换 Root Signature 后需要重新设置新布局要求的绑定。
- Root Signature 最大为 64 DWORD；Static Sampler 不占这个预算。
- Descriptor Table 是实现 Texture 和 Bindless 资源访问的通用路径。

### 本项目的已确认决策

- MVP 1 以 Root Signature 1.1 为硬门槛。
- 少量 Root Constants 承载 Draw 级索引；大型资源走固定 Table 与全局 Bindless Table。
- Root Signature 是 Graphics Adapter 的内部实现细节，不进入跨后端 Graphics Interface。

### 待决定项

- MVP 1 的 Root Parameter 顺序、Register Space 划分与 Root Signature 序列化格式由 [[10-Outcomes/20-MVP1#5.8 Shader + Pipeline|Shader 与 Pipeline 合同]] 的 binding-layout version 固定。
- 哪些 Sampler 可声明为 Static Sampler，哪些必须进入可索引的 Sampler Table。
- Root Signature 与 Shader 反射、Pipeline Cache Key 的精确生成和版本化策略。

## 相关页面与来源

- [[30-Sources/D3D12-Root-Signature|D3D12 Root Signature 来源卡片]]
- [[20-Knowledge/Concepts/Bindless-and-Descriptor-Tables|Bindless 与 Descriptor Table]]
- [[20-Knowledge/Decisions/MVP1-Platform-Capability|MVP 1 平台与 D3D12 能力基线]]
- [[20-Knowledge/Decisions/0001-Graphics-Interface|Graphics Interface ADR]]
