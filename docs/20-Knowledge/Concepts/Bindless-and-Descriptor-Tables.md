---
title: Bindless 与 Descriptor Table
aliases:
  - Bindless 与 Descriptor Table
type: concept
status: working
area: resource-binding
parent: "[[20-Knowledge/00-Knowledge-MOC]]"
related:
  - "[[10-Outcomes/20-MVP1]]"
  - "[[10-Outcomes/30-MVP2]]"
updated: 2026-08-12
tags:
  - rendering
  - resource-binding
  - d3d12
  - vulkan
  - bindless
---

# Bindless 与 Descriptor Table

## 一句话结论

**Descriptor Table 是资源描述符的组织和绑定机制；Bindless 是 Shader 通过索引访问大量描述符的使用方式。**

Bindless 通常通过“大型 Descriptor Table/Descriptor Set + 动态索引”实现，但 Descriptor Table 本身不一定是 Bindless。

## 术语层级

```text
Resource
  └── Texture / Buffer / Sampler 等真实 GPU 对象

Descriptor
  └── 描述如何访问 Resource 的 View 或状态

Descriptor Heap / Pool
  └── 存放 Descriptor 的空间

Descriptor Table / Descriptor Set
  └── 向 Shader 暴露的一段 Descriptor 集合

Bindless
  └── Shader 通过索引从大型 Descriptor 集合中自行选择资源
```

可以用图书馆类比：Resource 是书，Descriptor 是目录卡，Descriptor Heap 是图书馆，Descriptor Table 是一排书架，Bindless 是 Shader 根据目录卡编号自行查书。

## Descriptor 是什么

GPU Shader 通常不能直接使用 CPU 指针或资源对象句柄。它使用 Descriptor 来描述资源访问方式。

Descriptor 可能包含或间接表示：

- GPU 资源地址
- 资源类型和维度
- 像素格式
- Mipmap 范围
- Array Slice
- Buffer 的元素数量和 stride
- 读写权限

D3D12 中常见类型如下：

| 类型 | 含义 |
| --- | --- |
| CBV | Constant Buffer View |
| SRV | Shader Resource View，只读资源 |
| UAV | Unordered Access View，可读写资源 |
| Sampler | 采样器状态 |
| RTV | Render Target View |
| DSV | Depth Stencil View |

Descriptor 不是 Resource 本身。同一个 Texture 可以有多个 Descriptor，例如完整 Mipmap 的 SRV、单个 Mipmap 的 SRV，以及某个 Mipmap 的 UAV。

## Descriptor Table 是什么

在 D3D12 中，[[20-Knowledge/Concepts/Root-Signatures|Root Signature（根签名）]] 可以包含三类主要参数：

```text
Root Constants
Root Descriptors
Descriptor Tables
```

Descriptor Table 是 Descriptor Heap 中的一段范围。Root Signature 描述这段范围的布局，Command List 绑定这段范围的 GPU Descriptor Handle，Shader 用 `t#`、`u#`、`b#` 或 `s#` 访问其中的 Descriptor。

例如：

```text
Descriptor Heap
  slot 100: SRV - Albedo
  slot 101: SRV - Normal
  slot 102: SRV - Roughness
  slot 103: CBV - Material Constants

Descriptor Table 从 slot 100 开始
  t0 -> slot 100
  t1 -> slot 101
  t2 -> slot 102
  b0 -> slot 103
```

这里的 `t0` 是 Shader 侧的逻辑绑定名，不等于 Descriptor Heap 的绝对 slot。Table 的起始 GPU Handle 决定了两者如何映射。

### D3D12 的重要边界

- CBV、SRV、UAV 通常放在 CBV/SRV/UAV Descriptor Heap。
- Sampler 放在独立的 Sampler Descriptor Heap。
- Sampler 不能与 CBV/SRV/UAV 放进同一个 Descriptor Table。
- Descriptor Table 不是独立的内存分配对象，而是 Heap 中的一段范围。
- Table 可以由多个 Descriptor Range 组成。
- 无界或超大数组不会自动提供越界安全；应用必须保证索引有效。

## 传统 Bindful Descriptor Table

传统方式通常为每个 Material 准备固定的 Table：

```text
Material A Table
  t0 -> Albedo A
  t1 -> Normal A
  t2 -> Roughness A

Material B Table
  t0 -> Albedo B
  t1 -> Normal B
  t2 -> Roughness B
```

渲染时：

```text
绑定 Material A Table
Draw A

绑定 Material B Table
Draw B
```

Shader 的访问方式固定：

```hlsl
Texture2D albedo : register(t0);
Texture2D normal : register(t1);
```

优点是简单、可预测、Shader 容易编写。缺点是 Draw 越多，Descriptor Table 切换和 Descriptor 管理越多。

## Bindless 是什么

Bindless 的核心变化是：不再要求 CPU 在每个 Draw 前绑定具体的纹理，而是让 Shader 通过索引从全局资源表中选择纹理。

传统方式：

```text
CPU 绑定 Texture A
Draw
CPU 绑定 Texture B
Draw
```

Bindless 方式：

```text
全局绑定一个大型资源表

Material A: albedoIndex = 17, normalIndex = 42
Material B: albedoIndex =  5, normalIndex = 91

每个 Draw 只传 Material ID
Shader 根据 Material ID 查找 Texture Index
```

因此，Bindless 不是“完全不绑定”，而是把资源选择从 CPU Command List 阶段推迟到 Shader 执行阶段。

## Bindless HLSL 示例

```hlsl
struct MaterialGPU
{
    uint albedoTextureIndex;
    uint normalTextureIndex;
    uint roughnessTextureIndex;
    uint samplerIndex;
};

StructuredBuffer<MaterialGPU> gMaterials : register(t0, space0);

Texture2D<float4> gTextures[] : register(t0, space1);
SamplerState gSamplers[] : register(s0, space2);

ConstantBuffer<DrawConstants> gDraw : register(b0);

float4 MainPS(VSOutput input) : SV_Target
{
    MaterialGPU material = gMaterials[gDraw.materialId];

    uint textureIndex =
        NonUniformResourceIndex(material.albedoTextureIndex);

    uint samplerIndex =
        NonUniformResourceIndex(material.samplerIndex);

    return gTextures[textureIndex].Sample(
        gSamplers[samplerIndex],
        input.uv
    );
}
```

关键点：

- `gTextures[]` 是大型或无界纹理 Descriptor 数组。
- Material 保存的是 Descriptor Index，而不是 CPU 指针。
- Draw 只需要提供 `materialId` 或类似的 GPU 可读句柄。
- `NonUniformResourceIndex` 用于明确告诉编译器：不同线程可能使用不同的资源索引。

## 为什么需要 Non-Uniform Index

GPU 通常按 Wave/Warp 执行。编译器可能默认一个 Wave 中的资源索引相同，但实际情况可能是：

```text
Thread 0 -> Texture 17
Thread 1 -> Texture 42
Thread 2 -> Texture  5
Thread 3 -> Texture 17
```

这就是非一致资源索引。如果没有对应的 Non-Uniform 语义，编译器可能进行不适用的 uniform 假设。

Vulkan/GLSL 中常见写法是：

```glsl
#extension GL_EXT_nonuniform_qualifier : require

layout(set = 0, binding = 0) uniform texture2D Textures[];

vec4 color = texture(
    sampler2D(Textures[nonuniformEXT(textureIndex)], ImmutableSampler),
    uv
);
```

实际可用能力要由目标 GPU、Shader Model、Vulkan Descriptor Indexing 特性和管线配置共同决定。

## Bindless 与 Descriptor Table 的关系

```text
Descriptor Heap
  └── Texture 0
  └── Texture 1
  └── Texture 2
  └── ...
  └── Texture N

Root Signature
  └── 一个覆盖大型资源范围的 Descriptor Table

Shader
  └── gTextures[index]
```

因此：

| 概念 | 解决的问题 |
| --- | --- |
| Descriptor | 如何访问一个 Resource |
| Descriptor Heap | Descriptor 存在哪里 |
| Descriptor Table | 哪一段 Descriptor 暴露给 Shader |
| Bindless | Shader 如何从这段 Descriptor 中动态选择资源 |

最常见的关系是：

```text
Bindless ≈ 大型 Descriptor Table/Set + 动态索引
```

但固定大小、固定寄存器访问的 Descriptor Table 仍然是 Bindful。

## 现代引擎中的混合布局

推荐把绑定按更新频率分层：

```text
Root Constants
  └── objectId / materialId / drawId

Per-Frame Table
  └── Camera / Time / Frame Constants

Per-Pass Table
  └── GBuffer / Shadow Map / Light Buffer

Global Bindless Table
  └── 所有 Texture / Buffer / UAV / Sampler
```

一个典型 Draw 的数据流：

```text
DrawConstants.materialId
  ↓
MaterialBuffer[materialId]
  ↓
Material.albedoIndex / normalIndex
  ↓
GlobalTextureTable[index]
  ↓
Texture Sample
```

这样可以把稳定的 Frame/Pass 资源用普通 Table 绑定，把数量庞大且变化频繁的材质资源放到 Bindless Table。

## 典型资源生命周期

```text
加载 Texture
  ↓
创建 SRV
  ↓
分配 Bindless Descriptor Slot
  ↓
返回 Texture Index
  ↓
Material 保存 Texture Index
  ↓
GPU 根据 Material ID 读取资源
  ↓
等待 GPU Fence 后回收 Slot
```

必须同时保证以下对象的生命周期覆盖 GPU 使用期：

- Resource
- Descriptor
- Descriptor Heap
- Material Index
- 记录了该 Draw 的 Command List

不能因为 CPU 已经删除资源，就立即复用它的 Descriptor Slot；GPU 可能仍在执行之前提交的 Frame。

常见处理方式：

- 延迟回收 Descriptor Slot
- 使用 Frame Fence 或 Timeline Semaphore
- 使用持久化 Slot，避免频繁移动索引
- 使用 Null Descriptor 处理未加载或缺失资源
- 用 Generation ID 检查过期 Handle

## 性能特征

Bindless 的主要收益：

- 降低每个 Draw 的 Descriptor 绑定次数
- 适合大量材质和纹理
- 适合 GPU Culling、Indirect Draw 和 GPU Driven Rendering
- 让 GPU 直接读取 Material ID、Mesh ID、Texture ID

Bindless 的主要代价：

- 资源索引和 Descriptor Slot 管理复杂
- 需要处理 GPU 尚未完成时的资源释放
- 非一致索引可能增加 Wave 分歧
- 纹理缓存局部性可能变差
- 需要检查 Descriptor 数量、Binding Tier 和 API 特性
- Shader 访问路径多了一层间接寻址

因此 Bindless 并不保证每个场景都更快。它主要减少 CPU 侧绑定开销；是否更快还取决于资源局部性、Wave 分歧、Shader 访问模式和 Draw 数量。

## D3D12 与 Vulkan 的术语映射

| D3D12 | Vulkan | 说明 |
| --- | --- | --- |
| Descriptor Heap | Descriptor Pool/Descriptor Storage | Descriptor 的存储和分配空间，具体语义不完全相同 |
| Root Signature | Pipeline Layout（连同 Descriptor Set Layout/Push Constant Range） | 描述管线资源布局；不是一一等同的对象 |
| Descriptor Table | Descriptor Set 的近似概念 | D3D12 是 Heap 子范围，Vulkan Set 是显式对象，不能完全等同 |
| Descriptor Range | Descriptor Binding | Table/Set 内的资源绑定范围 |
| Bindless Table | Descriptor Indexing Descriptor Set | 通过大型数组和动态索引访问资源 |
| `NonUniformResourceIndex` | `nonuniformEXT` | 非一致资源索引语义 |

Metal 中的相近机制通常是 Argument Buffer 及其资源数组，但具体限制和生命周期模型需要单独核对 Metal 文档。

## 事实、已确认决策与未决问题

### 已确认事实

- D3D12 Root Signature 包含 Root Constants、Root Descriptors 和 Descriptor Tables。
- D3D12 Descriptor Table 是 Descriptor Heap 的一个子范围，不是独立的内存分配对象。
- D3D12 的 Sampler Heap 与 CBV/SRV/UAV Heap 分离。
- 大型 Descriptor Table 可以结合 Shader 动态索引实现 Bindless 风格资源访问。
- Vulkan Descriptor Indexing 支持把 Descriptor 当作可索引数组使用。
- 非一致资源索引需要使用对应 API 的 Non-Uniform 语义。

### 本项目的已确认决策

- MVP 1 后端是 D3D12；MVP 3 实现 Vulkan 功能对等 Adapter。
- MVP 1 采用“固定 Frame/Pass Table + 全局大型 Bindless Table + 少量 Root Constants”的混合布局。
- Shader Model 6.0 + Resource Binding Tier 3 是主路径；Shader Model 6.6 Direct Heap Indexing 仅为可选路径。
- CPU Resource Handle 与 Shader Bindless Index 是不同身份；Material GPU 数据保存 Bindless Index，不保存原生指针或 Resource Handle。
- Resource Handle 使用 generation 检测过期身份。
- Resource、Descriptor 与 Bindless Slot 的实际回收必须等待最后一次 GPU 使用完成。
- Graphics Interface 隐藏 Descriptor Heap、Root Signature、Pipeline Layout 和后端同步；实施约束见 [[10-Outcomes/20-MVP1#5.7 Graphics Interface|MVP 1 Graphics Interface]]。

### MVP 1 具体设计提案

MVP 1 由 D3D12 Adapter 内部 BindingRuntime 管理资源类别分区、typed Index、Null Slot、copy-on-write 更新和基于 Submission Token 的延迟回收；当前合同统一维护在 [[10-Outcomes/20-MVP1#5.9 D3D12 Adapter 内部 Module|MVP 1 D3D12 Adapter]]。

### 待决定问题

- MVP 1 Baseline Bindless 已在 Shader Contract 中收敛为 Texture2D 与 Sampler；TextureCube、Buffer、UAV 等类别在 MVP 2 Full Bindless 中按首次实际需求拆分。
- Bindless Index 的位布局，以及是否增加一层 GPU 侧间接 Handle Table。
- Descriptor Slot 分配器采用自由链表、分段池还是其他策略。
- Frames-in-flight 数量以及 Descriptor 更新/回收的 Fence 策略。
- 资源更新是 in-place、copy-on-write，还是为每帧保留版本。
- Null Descriptor、缺失资源和 streaming 中资源的统一语义。
- D3D12 Table 分区如何映射到 MVP 3 的 Vulkan Descriptor Set/Descriptor Indexing。

## 相关页面与来源

- [[30-Sources/D3D12-Descriptor-Bindings|D3D12 Descriptor Binding 来源卡片]]
- [[30-Sources/D3D12-Root-Signature|D3D12 Root Signature 来源卡片]]
- [[30-Sources/Vulkan-Descriptor-Indexing|Vulkan Descriptor Indexing 来源卡片]]
- [[20-Knowledge/Concepts/Root-Signatures|Root Signature（根签名）]]
- [[10-Outcomes/20-MVP1#5.9 D3D12 Adapter 内部 Module|MVP 1 BindingRuntime]]
- [[30-Sources/Karpathy-LLM-Wiki|LLM Wiki 工作流来源卡片]]
- [[10-Outcomes/10-AlphaEngine|项目系统与路线]]
