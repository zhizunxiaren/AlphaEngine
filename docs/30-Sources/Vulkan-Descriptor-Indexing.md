---
title: Vulkan Descriptor Indexing
aliases:
  - Vulkan Descriptor Indexing
type: source
status: captured
area: sources
parent: "[[30-Sources/00-Sources-MOC]]"
captured: 2026-08-08
updated: 2026-08-08
tags:
  - source
  - vulkan
  - descriptor-indexing
---

# Source Record: Vulkan Descriptor Indexing

- **来源类型**：Vulkan Documentation Project 官方示例文档
- **采集日期**：2026-08-08
- **来源**：[Descriptor indexing](https://docs.vulkan.org/samples/latest/samples/extensions/descriptor_indexing/README.html)

## 已抽取事实

- Descriptor Indexing 可以把 Descriptor 当作大型数组，并在 Shader 中通过索引访问资源。
- 典型模式是一次绑定大型 Descriptor Set，然后根据资源索引选择 Texture。
- 当索引不是动态一致索引时，需要使用对应的非一致索引语义，例如 GLSL 的 `nonuniformEXT`。
- Vulkan 的 Bindless 能力依赖 Descriptor Indexing 相关特性；具体可用特性要在设备创建和管线配置阶段检查。
