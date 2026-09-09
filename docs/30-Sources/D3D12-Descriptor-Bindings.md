---
title: D3D12 Descriptor Binding
aliases:
  - D3D12 Descriptor Binding
type: source
status: captured
area: sources
parent: "[[30-Sources/00-Sources-MOC]]"
captured: 2026-08-08
updated: 2026-08-08
tags:
  - source
  - d3d12
  - descriptor-binding
---

# Source Record: D3D12 Descriptor Binding

- **来源类型**：Microsoft Learn 官方文档
- **采集日期**：2026-08-08
- **范围**：Root Signature、Descriptor Heap、Descriptor Table、动态索引

## 官方来源

- [Root Signatures Overview](https://learn.microsoft.com/en-us/windows/win32/direct3d12/root-signatures-overview)
- [Using a Root Signature](https://learn.microsoft.com/en-us/windows/win32/direct3d12/using-a-root-signature)
- [Descriptor Tables Overview](https://learn.microsoft.com/en-us/windows/win32/direct3d12/descriptor-tables-overview)
- [Creating a Root Signature](https://learn.microsoft.com/en-us/windows/win32/direct3d12/creating-a-root-signature)
- [Advanced use of Descriptor Tables](https://learn.microsoft.com/en-us/windows/win32/direct3d12/advanced-use-of-descriptor-tables)

## 已抽取事实

- Root Signature 可以包含 Root Constants、Root Descriptors 和 Descriptor Tables。
- D3D12 Descriptor Table 是 Descriptor Heap 中的一段范围；它本身不是独立的内存分配对象。
- Descriptor Table 可以由多个 Descriptor Range 组成。
- CBV、SRV、UAV 使用 CBV/SRV/UAV Heap；Sampler 使用独立的 Sampler Heap，不能和前三者放入同一个 Descriptor Table。
- 大型或无界 SRV Table 可以配合 Shader 动态索引，允许 Shader 根据 Material 数据选择资源。
- Descriptor Table 的越界访问必须由应用程序避免；不能把“无界数组”理解成自动安全的无限内存。
- 非一致的纹理索引会影响纹理采样和导数计算性能。
