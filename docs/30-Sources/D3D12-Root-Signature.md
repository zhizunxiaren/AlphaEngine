---
title: D3D12 Root Signature 研究笔记
aliases:
  - D3D12 Root Signature 研究笔记
type: source
status: captured
area: sources
parent: "[[30-Sources/00-Sources-MOC]]"
captured: 2026-08-11
updated: 2026-08-11
tags:
  - source
  - d3d12
  - root-signature
---

# D3D12 Root Signature 研究笔记

- 采集日期：2026-08-11
- 范围：仅 Direct3D 12（D3D12）Root Signature；资料均为 Microsoft Learn 官方文档。

## 结论摘要

Root Signature（根签名）是应用定义的 **GPU 资源绑定布局契约**：它把 Command List（命令列表）与 shader 所需的资源类型及其绑定位置关联起来。它规定 shader 预期的参数槽位和布局，但不保存资源本身；在运行时写入各槽位的实际值称为 Root Arguments（根参数实参）。

可以把它理解为：Root Signature 是函数签名，Root Parameter 是形参槽位，Root Argument 是每次 Draw/Dispatch 前或期间设置的实参。Graphics Command List 分别维护 graphics 与 compute 两份独立的 root signature；Compute Command List 只有 compute root signature。

## 三类 Root Parameter

| 类型 | Root Argument 中的内容 | HLSL 中的呈现 | 成本与适用边界 |
| --- | --- | --- | --- |
| Root constants（根常量） | 内联的 32-bit 值 | 一个 `ConstantBuffer` | 无额外间接寻址，适合少量、频繁变动的标量数据，例如 object/material/draw ID。每个 32-bit 值占 1 DWORD；不能把含数组或需要动态索引的 constant-buffer 布局映射为 root constants。越界访问为未定义行为。 |
| Root descriptors（根描述符） | 内联的 64-bit GPU virtual address | 单个 CBV，或符合限制的 SRV/UAV buffer | 一层间接寻址，每项占 2 DWORD。仅支持 CBV，以及不要求格式转换的 raw/structured buffer SRV/UAV；不能直接绑定 `Texture2D` SRV、typed buffer 或 root descriptor array。根 UAV 不能带 counter。适合极少量且常变的 buffer，例如 per-draw CBV。 |
| Descriptor tables（描述符表） | 指向 descriptor heap 中一个连续范围的 GPU descriptor handle | 由 register range 映射的 CBV/SRV/UAV/Sampler | 两层间接寻址，表本身占 1 DWORD。适合纹理、sampler、大量 buffer 或动态索引资源。表是 heap 的 offset/length 视图，不是独立内存分配；Sampler 不能与 CBV/SRV/UAV 放在同一张表中。 |

Root descriptors 不包含资源大小信息，因此不像 descriptor heap 内的 descriptor 一样能提供越界检查。由此可见，root descriptor 是减少间接寻址和 per-draw heap 操作的专用手段，不是通用资源绑定替代品。

## Root Signature 与 Root Arguments 的关系

Root Signature 只定义布局：例如第 0 槽是 `b0` 的 root CBV，第 1 槽是覆盖 `t0-t7` 的 SRV descriptor table，第 2 槽是 4 个 32-bit constants。Root Arguments 则是 Command List 在运行时为这些槽设置的具体 GPU 地址、descriptor table 起点和常量值。

设置 root signature 后，可以分别更新各个 root argument，其余槽位保持原值；因此如果两个 draw 之间只改变一个常量，应用只需重设该常量槽。反之，切换为不同 root signature 会使此前全部 root bindings 失效，新的布局所要求的绑定必须在 Draw/Dispatch 前重新设置；否则行为未定义。设置 PSO 不会自动切换 root signature，且 Draw/Dispatch 时当前 PSO 与 root signature 必须兼容。

驱动会在 root argument 的任一部分于 Draw/Dispatch 间变化时，对完整 root-signature state 进行版本化。因此 root signature 不只是“声明”；频繁修改的 root arguments 也有状态复制成本。

## 与 Shader Registers / HLSL 的关系

Root Signature 中每个资源声明用 shader register 和 register space 描述它映射到的 HLSL 绑定命名空间：CBV 使用 `b#`，SRV 使用 `t#`，UAV 使用 `u#`，sampler 使用 `s#`。Descriptor range 的 `RangeType`、`NumDescriptors`、`BaseShaderRegister` 与 `RegisterSpace` 决定该 table 覆盖的 HLSL register 范围。

例如 root constants 若声明为 `b1, space0`、数量为 4，HLSL 可将其写为：

```hlsl
struct DrawConstants
{
    uint objectId;
    uint materialId;
    float lodBias;
    uint flags;
};

ConstantBuffer<DrawConstants> gDraw : register(b1, space0);
```

这只建立 layout 对应关系；HLSL 不必内嵌 Root Signature。Root Signature 可以在 API 侧创建，也可写进 shader；PSO 创建时，各 shader 必须与该 PSO 使用的 root layout 兼容。具有共同 `D3D12_SHADER_VISIBILITY` 的声明不得覆盖或冲突相同的 register namespace。针对 Graphics，可以用 stage-specific visibility 让顶点与像素 shader 分别使用相同 register 名称的不同槽位；Compute 只能使用 `ALL`。

## 成本、大小与绑定频率

Root Signature 最大为 64 DWORD：descriptor table 各占 1 DWORD；每个 32-bit root constant 占 1 DWORD；每个 64-bit root descriptor 占 2 DWORD；static sampler 不计入此上限。间接寻址层数为 root constant 0、root descriptor 1、descriptor table 2。部分硬件上，如果 root arguments 超出原生快速存储空间，末尾参数还可能增加一层成本。

设计上应让 Root Signature 尽可能小，并把可能频繁改变或对低访问延迟敏感的参数放在更靠前的位置。较大的 root signature 在任一 argument 改变时可能需要驱动复制更多状态，且这种开销会随状态变更次数累积。官方示例还建议：若大部分布局长期共用，保持同一 root signature 通常优于频繁切换；把频繁变动的项排在前面。

但“小”不等于把一切塞进 root arguments。Root Signature 的 64 DWORD 上限就是为了防止它成为批量数据存储。大量数据应留在应用管理的 buffer、descriptor heap 及由 descriptor table 指向的资源中；root constants/root descriptors 应服务于少量高频或低延迟绑定。

## 适用边界与建议

- 使用 root constants：少量 per-draw 标量，例如 ID、flag、索引和小型控制参数；避免数组和大块结构数据。
- 使用 root descriptors：少数高频变动的 CBV 或 raw/structured buffer SRV/UAV；不要用于 `Texture2D`、typed buffer 或可索引的资源数组。
- 使用 descriptor tables：纹理、sampler、常规资源集合，以及 large/bindless descriptor range；这是通用的资源绑定路径。
- 使用 static samplers：状态完全不可变时，可避免 sampler descriptor heap 绑定及 root-signature DWORD 消耗；若 sampler 需要动态选择或索引，则仍应在 sampler heap 中。
- 以 pass/PSO 共享的 Root Signature 为主，减少 root-signature 切换；只更新确实变动的 root arguments。

## 官方来源

1. Microsoft Learn, [Root Signatures Overview](https://learn.microsoft.com/en-us/windows/win32/direct3d12/root-signatures-overview) — Root Signature/Parameter/Argument 的定义，三类参数、资源限制和 driver versioning。
2. Microsoft Learn, [Root Signature Limits](https://learn.microsoft.com/en-us/windows/win32/direct3d12/root-signature-limits) — 64 DWORD 上限、各参数大小成本、间接寻址成本和排序建议。
3. Microsoft Learn, [Creating a Root Signature](https://learn.microsoft.com/en-us/windows/win32/direct3d12/creating-a-root-signature) — descriptor range/register space、shader visibility、PSO 兼容性和设置 API。
4. Microsoft Learn, [Using a Root Signature](https://learn.microsoft.com/en-us/windows/win32/direct3d12/using-a-root-signature) — Command List 语义、binding 失效条件、PSO 与 root signature 的关系。
5. Microsoft Learn, [Using Constants Directly in the Root Signature](https://learn.microsoft.com/en-us/windows/win32/direct3d12/using-constants-directly-in-the-root-signature) — root constants 的 HLSL 映射、数组限制和部分更新。
6. Microsoft Learn, [Using Descriptors Directly in the Root Signature](https://learn.microsoft.com/en-us/windows/win32/direct3d12/using-descriptors-directly-in-the-root-signature) — root descriptor 的资源类型边界、数组限制与典型用法。
