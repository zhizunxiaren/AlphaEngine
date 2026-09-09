---
title: MVP 1 语言与构建基线
aliases:
  - MVP 1 语言与构建基线
type: decision
status: confirmed
area: mvp1
parent: "[[20-Knowledge/00-Knowledge-MOC]]"
related:
  - "[[10-Outcomes/20-MVP1]]"
updated: 2026-08-10
tags:
  - rendering
  - mvp1
  - cpp
  - build
  - dependencies
---

# MVP 1 语言与构建基线

## 决策

AlphaEngine MVP 1 使用 C++20、MSVC 和 CMake 建立唯一的 Windows 主构建路径。构建输入必须可版本化和可复现；本机安装位置、IDE 私有配置与浮动依赖版本不得成为构建定义的一部分。

## 工具链基线

| 项目 | 已确认要求 |
|---|---|
| C++ 标准 | C++20；使用 standards-conformance mode，不依赖编译器语言扩展 |
| 主编译器 | MSVC 19.50+，Visual Studio Build Tools 2026 |
| 辅助编译器 | `clang-cl` 仅用于后期 CI 诊断，不是 MVP 1 硬门槛 |
| Windows SDK | 使用 `10.0.26100.0` 构建；运行时最低支持 Windows 10 22H2 |
| CMake | 3.31+ |
| Generator | Ninja Multi-Config |
| 构建入口 | CMake Presets |

MSVC 19.50 对应 Visual Studio 2026 首发的 MSVC Build Tools 14.50 系列。项目固定 `/std:c++20`，不使用会随编译器升级改变含义的 `/std:c++latest`。

Windows SDK 版本定义编译时可见的 API，而目标机器的 Windows 版本决定运行时实际可用的 API。因此，使用 SDK `10.0.26100.0` 不会把运行时最低版本自动抬高到 Windows 11，但任何晚于 Windows 10 22H2 才提供的 API 都必须避免使用或进行运行时能力检查。项目目标宏和发布测试必须保持 Windows 10 兼容性。

## 构建配置

| 配置 | 用途 | MSVC Runtime |
|---|---|---|
| `Debug` | 调试、断言和开发期诊断 | `/MDd` |
| `RelWithDebInfo` | 日常开发、性能分析和带符号回归；默认配置 | `/MD` |
| `Release` | 优化发行构建 | `/MD` |

所有配置通过同一 Ninja Multi-Config 构建树生成。共享的 Configure、Build 和 Test 配置写入并提交 `CMakePresets.json`；机器私有内容只允许放在不提交的 `CMakeUserPresets.json` 中。

CMake 必须采用 target-oriented 配置：语言标准、警告、宏、Include Path、链接库和 Runtime Library 由具体 target 声明，不通过全局 flag 拼接污染第三方 target。

## 第一方编译策略

第一方 C++ target 至少启用：

- `/std:c++20`
- `/permissive-`
- `/Zc:__cplusplus`
- `/utf-8`
- `/W4`
- `/EHsc`
- `/GR`

CI 将第一方代码的编译器警告视为错误。第三方源码不继承该规则，避免把外部项目的警告升级为 AlphaEngine 构建失败。

`/permissive-` 表示启用 MSVC 的 standards-conformance mode，并不保证屏蔽所有 Microsoft-specific 构造；项目代码还必须主动避免依赖非标准语言扩展。`/Zc:__cplusplus` 必须显式启用：MSVC 官方文档说明 `/permissive-` 不会单独启用它；结合 `/std:c++20` 后，`__cplusplus` 应报告 `202002L`。

## 异常、RTTI 与 Modules

- MVP 1 以 `/EHsc` 和 `/GR` 保持标准 C++ exceptions 与 RTTI 启用。
- 异常不得穿越引擎模块或库的公开接口边界。跨边界失败使用显式结果类型、错误码或状态对象表达。
- 帧循环和高频渲染路径不得依赖异常控制流，也不得依赖 RTTI 完成常规调度。
- MVP 1 不使用 C++ Modules。源文件组织先使用传统 Header 与 Translation Unit，等工具链、依赖和模块边界稳定后再独立评估。

这里的限制是项目架构策略，不表示 MSVC 缺少 exceptions、RTTI 或 C++ Modules 支持。

## 依赖管理

通用第三方依赖使用 vcpkg Manifest Mode：

- 仓库提交 `vcpkg.json`。
- `vcpkg.json` 必须包含固定的 `builtin-baseline` commit。
- 依赖升级作为显式变更评审，不自动追随 registry 最新状态。
- 需要强制确切版本时使用合法的 version constraint 或 `overrides`，并记录原因。
- 构建产出的 `vcpkg_installed` 不进入版本库。

DirectX 组件使用其官方发行渠道，并在项目构建清单中锁定确切版本：

| 组件 | 官方发行渠道 |
|---|---|
| DirectX 12 Agility SDK | `Microsoft.Direct3D.D3D12` NuGet package |
| DirectX Shader Compiler | Microsoft DirectXShaderCompiler release / `Microsoft.Direct3D.DXC` NuGet package |
| WinPixEventRuntime | `WinPixEventRuntime` NuGet package |

不得使用 `latest`、未固定 Preview 或由开发者机器偶然提供的 DirectX DLL。采用哪个确切稳定版本是后续依赖清单的独立决策。

## 首层目录职责

```text
engine/       引擎库
apps/         Sandbox 和示例程序
tools/        离线资产及开发工具
tests/        单元、集成和图像测试
shaders/      Shader 源码
content/      MVP 参考场景与资产
cmake/        CMake 模块与工具链配置
third_party/  仅保存必要补丁，不保存依赖二进制
```

`third_party/` 只有在项目确实需要修补上游依赖时才使用。补丁必须可审查，并与对应的上游版本绑定。

## 当前开发机参考值

以下是确认决策时检测到的本机版本，用于证明开发机满足基线，不作为可移植构建脚本中的硬编码路径：

| 工具 | 检测版本 |
|---|---|
| MSVC | 19.51.36252 |
| CMake | 4.3.1-msvc1 |
| Ninja | 1.13.2 |
| Windows SDK | 10.0.26100.0 |

这些工具当前未全部进入普通 PowerShell 的 `PATH`。后续实现应通过 Visual Studio 官方环境发现机制（例如 `vswhere` 和开发者环境脚本）建立项目级入口，不硬编码本机 Visual Studio 安装目录。

## 验收原则

后续构建骨架至少应证明：

- 干净 checkout 只依赖已声明的工具和 manifest 即可配置。
- `Debug`、`RelWithDebInfo`、`Release` 都能从 Preset 构建。
- 默认 Preset 构建 `RelWithDebInfo`。
- 编译输出能够确认 C++20、Windows SDK、MSVC Runtime 和依赖版本。
- 第一方 warning 会使 CI 失败，第三方 warning 不会被项目策略升级。
- Windows 10 22H2 参考机能够启动构建产物。

## 尚未确定

- Agility SDK、DXC 与 WinPixEventRuntime 的首个确切锁定版本。
- 首个 `builtin-baseline` commit 和 vcpkg triplet。
- `clang-cl` 进入 CI 的阶段、版本和必须通过的 target 范围。
- exceptions 与 RTTI 是否在后续性能关键模块中局部关闭。
- 编译缓存、分布式构建和 PCH 策略。

## 官方依据

- [Microsoft C/C++ language conformance](https://learn.microsoft.com/en-us/cpp/overview/visual-cpp-language-conformance?view=msvc-170)：MSVC Build Tools 14.50 / Visual Studio 2026 映射，以及各 C++ 标准特性的实现状态。
- [`/permissive-` standards conformance](https://learn.microsoft.com/en-us/cpp/build/reference/permissive-standards-conformance?view=msvc-170)：标准一致性模式与 `/std:c++20` 的关系。
- [`/Zc:__cplusplus`](https://learn.microsoft.com/en-us/cpp/build/reference/zc-cplusplus?view=msvc-170)：MSVC 中 `__cplusplus` 的显式启用方式和 C++20 值。
- [`/MD`, `/MT`, `/LD` runtime library](https://learn.microsoft.com/en-us/cpp/build/reference/md-mt-ld-use-run-time-library?view=msvc-170)：`/MDd` 与 `/MD` 的 Runtime Library 语义。
- [Windows versions and SDK overview](https://learn.microsoft.com/en-us/windows/apps/get-started/versioning-overview)：Windows SDK 的编译时职责、运行时 OS 能力和新 SDK / 旧 OS 的关系。
- [Using the Windows Headers](https://learn.microsoft.com/en-us/windows/win32/winprog/using-the-windows-headers)：`WINVER` 与 `_WIN32_WINNT` 对最低目标 Windows API 的控制。
- [CMake Presets](https://cmake.org/cmake/help/latest/manual/cmake-presets.7.html)：项目 Preset、用户 Preset及 Configure / Build / Test Preset 定义。
- [Ninja Multi-Config](https://cmake.org/cmake/help/latest/generator/Ninja%20Multi-Config.html)：同一构建树生成多个配置的行为。
- [vcpkg Manifest Mode](https://learn.microsoft.com/en-us/vcpkg/concepts/manifest-mode)：项目依赖声明、独立安装树和版本约束能力。
- [vcpkg Versioning](https://learn.microsoft.com/en-us/vcpkg/users/versioning)：`builtin-baseline`、baseline 和 overrides 的解析规则。
- [DirectX 12 Agility SDK downloads](https://devblogs.microsoft.com/directx/directx12agility/) 与 [Getting Started](https://devblogs.microsoft.com/directx/gettingstarted-dx12agility/)：官方稳定/Preview 发行及 `Microsoft.Direct3D.D3D12` package 集成。
- [DirectXShaderCompiler](https://github.com/microsoft/DirectXShaderCompiler) 与 [official releases](https://github.com/microsoft/DirectXShaderCompiler/releases)：DXC 官方二进制与 `Microsoft.Direct3D.DXC` package 渠道。
- [WinPixEventRuntime](https://devblogs.microsoft.com/pix/winpixeventruntime/)：PIX event runtime 的官方 NuGet 发行入口。

## 相关页面

- [[10-Outcomes/10-AlphaEngine|项目系统与路线]]
- [[20-Knowledge/Decisions/MVP1-Platform-Capability|MVP 1 平台与 D3D12 能力基线]]
- [[20-Knowledge/Decisions/MVP1-Reference-Baseline|MVP 1 参考硬件与性能基线]]
