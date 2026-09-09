---
title: MVP 1 参考硬件与性能基线
aliases:
  - MVP 1 参考硬件与性能基线
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
  - performance
  - hardware
---

# MVP 1 参考硬件与性能基线

## 决策

AlphaEngine MVP 1 使用当前开发工作站作为参考机，以 1920×1080、稳定 60 FPS 为性能目标。该工作站用于开发和回归测量，不代表未来发行版本的最低配置。

## 参考机

| 项目 | 检测结果 |
|---|---|
| 操作系统 | Windows 10 Pro x64，版本 10.0.19045 |
| CPU | 两颗 `Genuine Intel(R) CPU 0000 @ 2.90GHz` |
| CPU 拓扑 | 每颗 12 核 24 线程；合计 24 核 48 线程 |
| GPU | NVIDIA GeForce GTX 1080 Ti |
| 显存 | 11264 MiB |
| GPU 驱动 | 582.66 |
| 系统内存 | 约 111.9 GB 可见内存 |

CPU 的具体 SKU 被固件或识别信息隐藏。后续记录核心/线程拓扑、时钟和实测时间，不根据型号名称估计性能。

## 性能目标

- 输出分辨率：1920×1080。
- 目标帧率：稳定 60 FPS。
- 单帧总预算：16.67 ms。
- 正式性能测量关闭 VSync，避免显示同步掩盖真实耗时。
- 分别记录 CPU Frame、Render Thread、GPU Frame 和各 Render Pass 时间。
- 同一参考场景、画质、窗口状态和驱动配置下进行回归比较。

## 尚未确定

- 参考场景及其可见三角形数量。
- Render Object、材质、纹理和动态灯光规模。
- CPU Frame 与 GPU Frame 各自的子预算。
- 帧时间稳定性阈值已在 [[10-Outcomes/20-MVP1#8. 性能设计与验收|MVP 1 性能合同]] 中提出 p99 与 hitch 口径，仍待统一确认。
- 最低发行硬件、最低 Windows 版本和最低 D3D12 能力。

## 相关页面

- [[10-Outcomes/10-AlphaEngine|项目系统与路线]]
- [[10-Outcomes/20-MVP1#8. 性能设计与验收|MVP 1 性能设计与验收]]
- [[10-Outcomes/30-MVP2|现代渲染器高级能力矩阵]]
