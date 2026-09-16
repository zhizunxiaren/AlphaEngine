---
title: stb_image 图像解码库
aliases:
  - stb_image
  - stb
  - stb 图像解码
type: source
status: captured
area: sources
parent: "[[30-Sources/00-Sources-MOC]]"
related:
  - "[[20-Knowledge/Tooling/第三方依赖引入]]"
captured: 2026-09-15
updated: 2026-09-15
tags:
  - source
  - third-party
  - cpp
  - asset
---

# Source Record: stb_image 图像解码库

- **来源**：
  - nothings/stb 仓库 — <https://github.com/nothings/stb>
  - 单头文件本体 — `stb_image.h`
- **类型**：第三方开源库（单头文件、C 语言）
- **版本**：**v2.30（2024-05-31）**，以文件顶部注释为准
- **许可**：双许可，择一适用 —— MIT（Copyright (c) 2017 Sean Barrett）或 Public Domain（Unlicense）
- **采集日期**：2026-09-15
- **本地位置**：`Engine/third_party/stb/stb_image.h`（`third_party` 统一目录约定见 [[20-Knowledge/Tooling/第三方依赖引入]]；文件保持原样，不修改）
- **本地状态**：来源记录；不复制原文，仅登记范围、抽取事实与适用边界

## 采集范围

| 主题 | 内容 |
|---|---|
| 解码格式 | JPEG（baseline / progressive）、PNG（1/2/4/8/16 bit-per-channel）、TGA、BMP、PSD（composited view）、GIF、HDR（Radiance rgbE）、PIC、PNM（PPM / PGM）；调色板格式自动去调色板化 |
| 输出精度 | 8-bit 字节（`stbi_load`）、16-bit 无符号（`stbi_load_16`）、32-bit 浮点线性值（`stbi_loadf`） |
| 数据来源 | 文件名 / `FILE*` / 内存块 / 自定义 I/O 回调，四种变体齐全 |
| 元信息探测 | `stbi_info`、`stbi_is_hdr`、`stbi_is_16_bit`（只读头部，不解码） |
| 行为控制 | 垂直翻转、去预乘 alpha、iPhone PNG 处理、失败原因串、HDR ↔ LDR 的 gamma 与 scale |
| 编译期配置 | 按格式裁剪（`STBI_NO_*` / `STBI_ONLY_*`）、`STBI_MAX_DIMENSIONS`、`STBI_NO_STDIO`、`STBI_MALLOC` / `STBI_REALLOC` / `STBI_FREE`、`STBI_ASSERT`、`STBI_NO_SIMD`、`STBI_WINDOWS_UTF8` |

## 抽取事实

1. 库为单头文件形态：声明区（`STBI_INCLUDE_STB_IMAGE_H`，约 129–545 行）始终参与编译；实现区（`STB_IMAGE_IMPLEMENTATION`，约 547–7762 行）仅在定义该宏的翻译单元中编译。因此该宏全工程**只能定义一次**。
2. 语言链接已做保护：声明区以 `extern "C"` 包裹，实现区通过 `STBI_EXTERN`（C++ 下展开为 `extern "C"`）保持一致。因此实现编译为 C 或 C++ 均可正确链接，使用方无需额外处理。
3. 文件中的 `STBI_VERSION` 恒为 `1`，**不代表发布版本**。版本识别应以顶部注释（当前 v2.30 / 2024-05-31）或文件哈希为准。
4. 公开 API 统一以 `int` 表示尺寸与缓冲区长度，单张图像存在约 1GB～2GB 的解码上限。
5. `STBI_MAX_DIMENSIONS` 默认为 `1 << 24`（16777216），任一边超过该值的图像会被直接拒绝，用于缓解恶意构造的巨尺寸图像造成的资源耗尽。
6. 解码结果由 `STBI_MALLOC` 分配，必须用 `stbi_image_free` 归还；失败返回 `nullptr`，原因由 `stbi_failure_reason()` 提供，不使用异常。
7. 解码过程**不做色彩管理**：不解析或应用 ICC Profile，sRGB 与线性空间之间的转换、gamma 处理需调用方自行完成。
8. 仅提供解码，不提供编码（编码为配套的 `stb_image_write.h`）；也不支持 BCn / ASTC 压缩纹理以及 DDS / KTX 容器格式。
9. 设计优先级为「易用 > 易维护 > 性能」，定位是零依赖、可移植、小体积，而非极致性能。
10. 上游由单一作者维护，长期处于低活跃状态；`stb_image` 历史上出现过多处越界读写类问题，v2.28（2023-01-29）为集中修复版本。

## 适用边界

- 本卡是**第三方依赖的来源记录**，不构成项目基线；依赖选取方式与构建系统归属仍属 [[10-Outcomes/10-AlphaEngine]] 首版基线待决项。
- 图像解码器直接解析**不可信输入**，是稳定的攻击面。需额外评估：输入来源是否可信、是否设更严格的尺寸与格式白名单、以及上游停更后的替代方案。
- 该库无正式发布机制（无 release、无 tag 语义），升级只能依靠人工比对顶部注释与文件哈希，因此必须保持文件原样。
- 双许可为「MIT **或** Public Domain」，商用无碍，但需在项目第三方声明中择一列明。
- 已知能力缺口：色彩管理、mipmap 生成、压缩纹理格式、DDS / KTX 容器，均需其他方案补足。
