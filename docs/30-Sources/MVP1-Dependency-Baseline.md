---
title: MVP1 Dependency Baseline
aliases:
  - MVP1 依赖基线
  - MVP1 第三方依赖安全检查
type: source
status: captured
area: sources
parent: "[[30-Sources/00-Sources-MOC]]"
related:
  - "[[10-Outcomes/20-MVP1]]"
  - "[[20-Knowledge/Decisions/MVP1-Language-Build]]"
  - "[[20-Knowledge/Decisions/MVP1-Platform-Capability]]"
captured: 2026-08-20
updated: 2026-08-20
tags:
  - source
  - mvp1
  - dependencies
  - security
---

# MVP1 依赖基线与第三方安全检查

> [!summary] 结论
> MVP1 已以 vcpkg `2026.07.29` registry snapshot、`x64-windows` triplet、Agility/DXC 两个精确 NuGet 包和 vcpkg WinPixEventRuntime 完成集成。通用库与 Dear ImGui 由同一 manifest 锁定；fastgltf 只获准用于经过项目有界预检的离线 `assetc`，不作为通用不可信 GLB parser。本页是来源与安全记录，不覆盖 [[10-Outcomes/20-MVP1]] 的项目合同。

## 采集边界

- 采集日期：2026-08-20。
- 只采用维护方文档、维护方 GitHub 仓库、官方发行页、许可证、NuGet 页面和官方安全公告。
- 依赖已通过项目级 vcpkg/NuGet cache 下载、安装和编译；下表 hash 来自实际锁定的 archive 与部署文件。构建产物和 cache 不提交 Git。
- “稳定”指维护方标记的非 Preview 版本；版本选择同时服从可复现构建，未逐项追逐晚于已选 registry snapshot 的上游版本。
- `#N` 是 vcpkg port revision，不是上游版本的一部分。

## 锁定结果

| 能力 | MVP1 选择 | 精确锁定 | 获取与构建通道 | 许可证 | 安全结论 |
|---|---|---|---|---|---|
| Registry / triplet | vcpkg `2026.07.29` | commit [`9e593bb18ea69cc5095e012465dcd675a822ed0d`](https://github.com/microsoft/vcpkg/commit/9e593bb18ea69cc5095e012465dcd675a822ed0d)；`x64-windows` | manifest mode | MIT | 通过；仍须保留源 hash、SBOM 与包许可证 |
| Window/Input | SDL3 | vcpkg `3.4.12`；commit [`f87239e71e42da91ca317a12eefb82cfbf3393eb`](https://github.com/libsdl-org/SDL/commit/f87239e71e42da91ca317a12eefb82cfbf3393eb) | vcpkg builtin port | `Zlib AND MIT AND Apache-2.0` | 通过；已知存在上游 `3.4.14` 版本漂移 |
| D3D12 runtime | DirectX 12 Agility SDK | NuGet `Microsoft.Direct3D.D3D12/1.619.5`；`D3D12SDKVersion=619` | Microsoft NuGet | Microsoft redistributable license | 通过；只选 stable，不选 Preview |
| Shader compiler | DXC | NuGet `Microsoft.Direct3D.DXC/1.9.2607.13`；commit [`0d3ee6b551b8fa768fbf825300ebab81047ef6a8`](https://github.com/microsoft/DirectXShaderCompiler/commit/0d3ee6b551b8fa768fbf825300ebab81047ef6a8) | Microsoft NuGet；仅离线 cook | University of Illinois/NCSA + third-party notices | 通过；archive 与部署文件 SHA-256 已固定 |
| GPU markers | WinPixEventRuntime | vcpkg `1.0.240308001` | vcpkg builtin port；动态库 | MIT | 通过；Debug/RelWithDebInfo/Profile 使用 |
| Debug UI | Dear ImGui | vcpkg `1.92.8#1`；commit [`8936b58fe26e8c3da834b8f60b06511d537b4c63`](https://github.com/ocornut/imgui/commit/8936b58fe26e8c3da834b8f60b06511d537b4c63) | vcpkg builtin port；只启用 `sdl3-binding` | MIT | 通过；已知存在上游 `v1.92.9b` 版本漂移 |
| GLB parser | fastgltf | vcpkg `0.9.0`；commit [`0d1b67a28c4950ea2deb796702006dcbe31e02b3`](https://github.com/spnda/fastgltf/commit/0d1b67a28c4950ea2deb796702006dcbe31e02b3) | vcpkg builtin；仅隔离的 `assetc` | MIT；simdjson 为 Apache-2.0 | **有条件通过**；调用前执行 container/JSON/range/count/image 边界预检，外部 URI 和通用输入不准入 |
| Texture processor | DirectXTex | vcpkg `2026-05-07`；tag `may2026`；commit [`4feb3e11a020f35b796fc769a74216a555d4f5ef`](https://github.com/microsoft/DirectXTex/commit/4feb3e11a020f35b796fc769a74216a555d4f5ef) | vcpkg；仅离线 `assetc` | MIT | 通过；当前版包含 malformed HDR header 越界读取修复 |
| JSON | nlohmann/json | vcpkg `3.12.0#2`；commit [`55f93686c01528224f448c19128836e7df245f72`](https://github.com/nlohmann/json/commit/55f93686c01528224f448c19128836e7df245f72) | vcpkg builtin port | MIT | 通过；解析必须设置项目侧资源上限 |
| Logging | spdlog | vcpkg `1.17.0#1`；commit [`79524ddd08a4ec981b7fea76afd08ee05f83755d`](https://github.com/gabime/spdlog/commit/79524ddd08a4ec981b7fea76afd08ee05f83755d) | vcpkg builtin port；compiled target | MIT；fmt 为 MIT | 通过；格式串和异步队列需要硬约束 |
| Unit test | 项目内 `ALPHA_TEST` harness | 仓库源代码 + CTest | 无第三方获取通道 | 项目许可证 | 已采用；Catch2 `3.15.3` 完成研究但未引入 manifest |

### 实际 archive 与部署文件 SHA-256

| 文件 | SHA-256 |
|---|---|
| `Microsoft.Direct3D.D3D12.1.619.5.zip` | `0E9BCF32AAC9A79343EDE9B21E4864950EE54577E3D8E19BFCDF002BB4E9BFD6` |
| `Microsoft.Direct3D.DXC.1.9.2607.13.zip` | `5D6ACD23089B2979A3C1D39B7E31227DA989A47B5D9F3DB57111AD4717EA537E` |
| `D3D12Core.dll` | `EDDF4CFF4EDA8162624B88694AD2ADF4B09BC5AEE6339191F39ADF8AE48B41E7` |
| `d3d12SDKLayers.dll` | `A78BCA22EBE6C8CCDD6EFFF630D798B27447F8922BB889DE2F50E0DD1AB10F85` |
| `dxc.exe` | `980A3A4C6E5C88F5737DDE321E548860021D58FA2349790D4E572805CB298293` |
| `dxcompiler.dll` | `9A5100511E127C6A2FC78EDF984F95074A76D35B90C90C4D342430A5AE160E9B` |
| `dxil.dll` | `FEB57253EFF0A622561E29B44CEDBE86B89FC9A5BC8DC00FA2F98FAFD712C2D8` |
| `WinPixEventRuntime.dll` | `81ADCFD8253C3489BE720DA7E30F16004DC9A1F02A8B418C6C3AEF4993032E6D` |
| `SDL3.dll` | `509A3B929F9676DB80B938F688ABF2E772080A04538A186A938133A83543D329` |
| `DirectXTex.dll` | `5B9AC1169C713EDE23F02DB508C477F44E9B5E3B84621F0714045AA753E81F74` |

## vcpkg 基线与构建策略

### Registry snapshot

选择 [vcpkg 2026.07.29 release](https://github.com/microsoft/vcpkg/releases/tag/2026.07.29) 对应的完整 commit `9e593bb18ea69cc5095e012465dcd675a822ed0d` 作为 `builtin-baseline`。该发行说明明确包含 SBOM/PURL/gitoid 改进；这使构建产物能记录更完整的组件来源，但不等于依赖已经自动通过安全审查。

使用标准 community triplet `x64-windows`：

- 架构为 x64，目标为 Windows desktop；
- 使用动态 CRT，和项目 `/MDd`（Debug）、`/MD`（其余配置）的 ABI 决策一致；
- DLL 依赖由安装/打包阶段显式部署，不混入 `x64-windows-static` 的 CRT/链接语义；
- 不用未版本化的自定义 triplet。以后若必须自定义编译开关，自定义 triplet 文件本身也要纳入 source control 和 lock review。

通道分工如下：

| 通道 | 内容 | 规则 |
|---|---|---|
| vcpkg builtin registry | SDL3、Dear ImGui、fastgltf、DirectXTex、nlohmann/json、spdlog、WinPixEventRuntime | `builtin-baseline` 固定；不写浮动 `latest`；fastgltf 受有界 cooker 安全边界约束 |
| vcpkg overlay port | 仅用于已审计且 builtin port 无法表达的补丁 | overlay 内固定 upstream full commit 和 `SHA512`；MVP1 基线当前不需要 overlay |
| Microsoft NuGet | Agility SDK、DXC | 固定 Package ID + Version + archive SHA-256；TLS 下载且每次 configure 校验 cache 内容 |

建议的 manifest 只声明直接依赖，不手写易漂移的传递依赖：

```json
{
  "builtin-baseline": "9e593bb18ea69cc5095e012465dcd675a822ed0d",
  "dependencies": [
    "sdl3",
    {
      "name": "imgui",
      "default-features": false,
      "features": [
        "sdl3-binding"
      ]
    },
    "directxtex",
    "fastgltf",
    "nlohmann-json",
    "spdlog",
    "winpixevent"
  ]
}
```

fastgltf 已在有界安全门下加入 manifest：`assetc` 在调用它之前先拒绝外部 URI/额外 GLB chunk，验证 bufferView/accessor 的 checked arithmetic、count/stride/range，限制 scene/material/texture 数量，并在 DirectXTex 解码前验证 PNG/JPEG 尺寸与 512 MiB RGBA 展开上限。若未来放宽输入子集或处理外部不可信资产，必须重新打开安全评审。配置构建保留固定 registry 和内容寻址 cache，禁止在一次构建中临时切换 registry head。

## 逐项依据与集成要求

### SDL3

所选 registry snapshot 中使用 [`sdl3` port](https://github.com/microsoft/vcpkg/blob/9e593bb18ea69cc5095e012465dcd675a822ed0d/ports/sdl3/vcpkg.json) `3.4.12`，对应上游 stable tag `release-3.4.12` 与 full commit `f87239e71e42da91ca317a12eefb82cfbf3393eb`。截至采集日，上游又发布了 [SDL `3.4.14`](https://github.com/libsdl-org/SDL/releases/tag/release-3.4.14)，tag commit 为 [`147a8ee32dbf9ac02f3794964490687b6bbda1bc`](https://github.com/libsdl-org/SDL/commit/147a8ee32dbf9ac02f3794964490687b6bbda1bc)。上游还发布了 `3.4.14` 的可核验 hash：x64 Windows archive SHA-256 `69a4e55645651af85e6ccfe40981b5a0bc2c594d0004fe7844db680e23cfbdaf`，source archive SHA-256 `30d4aa2b3037718142b32dffd4e72f917ebb6cc5227150e7bb9c45efb2153aeb`。

MVP1 选择基线内的 `3.4.12`，而不是混用一个晚于基线的手工包；后续可把 baseline 与 SDL 一起升级到 `3.4.14+`，但升级必须独立跑 Window/Input smoke、resize/minimize、DPI、keyboard/mouse 和 controller 测试。

构建使用 `find_package(SDL3 CONFIG REQUIRED)` 和 `SDL3::SDL3`。SDL3 只负责 window、input、event pump 与 ImGui platform backend，不使用 SDL GPU/rendering API。SDL 主体采用 [Zlib license](https://github.com/libsdl-org/SDL/blob/main/LICENSE.txt)；vcpkg port 因 bundled components 将许可证表达为 `Zlib AND MIT AND Apache-2.0`，打包时保留安装树中的全部 copyright/notices。

安全边界：拒绝从非官方镜像提取预编译 SDL DLL；窗口标题、drop path 与输入文本视为不可信 UTF-8；不把 SDL event 内的外部指针跨帧保存；基线升级前检查维护方 release/issues，而不能把“没有公开 advisory”解释成无漏洞。

### DirectX 12 Agility SDK

选择官方稳定包 [`Microsoft.Direct3D.D3D12 1.619.5`](https://www.nuget.org/packages/Microsoft.Direct3D.D3D12/1.619.5)，对应 `D3D12SDKVersion=619`。Microsoft 的 [Agility SDK 页面](https://devblogs.microsoft.com/directx/directx12agility/) 将其列为 2026-07-30 的当前 stable；不选择 `1.7xx` Preview 分支。

构建/部署要求：

- CMake 从锁定的 NuGet package root 导入 headers/libs，不使用机器全局“恰好存在”的版本；
- 导出 `D3D12SDKVersion=619` 与项目实际 app-local 路径对应的 `D3D12SDKPath`；
- `D3D12Core.dll` 放入约定的应用本地目录；SDK Layers 只进入诊断配置，不随 Release 分发；
- 首次授权下载后，记录 repository signature、`.nupkg` SHA-256 和最终分发 DLL SHA-256。

该包不是 MIT 开源包。NuGet 页面分别指向 runtime redistribution 与 header/code 的 Microsoft license，归档时必须保存包内 `LICENSE.txt` 和 `LICENSE-CODE.txt`，并按其中的 redistributable 条款分发。

### DirectX Shader Compiler

选择官方稳定 NuGet [`Microsoft.Direct3D.DXC 1.9.2607.13`](https://www.nuget.org/packages/Microsoft.Direct3D.DXC/1.9.2607.13)，对应维护方 [DXC `v1.9.2607` release](https://github.com/microsoft/DirectXShaderCompiler/releases/tag/v1.9.2607) 与 full commit `0d3ee6b551b8fa768fbf825300ebab81047ef6a8`。不选择同页可见的 `1.10.*-preview`。

DXC 只进入 shader cook/build：调用锁定包中的 `dxc.exe`，使用 `vs_6_0`/`ps_6_0`。Shader metadata 写入 schema/Binding ABI、row-major matrix layout、DXC version、source path、entry、profile 和输出 DXIL SHA-256；CMake dependency graph负责源/include 变更后的重编译。运行时不接受 HLSL，也不加载系统 PATH 中的另一份 `dxcompiler.dll`。

许可证为 [University of Illinois/NCSA Open Source License](https://github.com/microsoft/DirectXShaderCompiler/blob/main/LICENSE.TXT)，并必须保留仓库的 [ThirdPartyNotices](https://github.com/microsoft/DirectXShaderCompiler/blob/main/ThirdPartyNotices.txt)。安全上把 HLSL 编译视为离线构建输入；运行时不提供任意 Shader 编译入口。NuGet archive SHA-256 `5D6ACD…537E`，`dxc.exe`/`dxcompiler.dll`/`dxil.dll` 的完整 SHA-256 已记录在本页实际文件表。

### WinPixEventRuntime

选择 vcpkg builtin port `winpixevent 1.0.240308001`，其上游对应官方 [`WinPixEventRuntime 1.0.240308001`](https://www.nuget.org/packages/WinPixEventRuntime/1.0.240308001)。Microsoft 已将 [WinPixEventRuntime 开源为 MIT](https://devblogs.microsoft.com/pix/open-sourcing-the-winpixeventruntime-under-mit/)，实现仓库是 [microsoft/PixEvents](https://github.com/microsoft/PixEvents)。

按维护方建议使用 vcpkg CMake target `Microsoft::WinPixEventRuntime` 与单一 DLL，而不是把完整 runtime 静态复制进多个模块，避免多份事件运行时竞争 ETW 状态。部署 DLL SHA-256 `81ADCF…32E6D`；该包版本较旧但仍是所选 registry 中的官方稳定 port，不自行换用非官方构建。

### Dear ImGui

选择所选 snapshot 的 [`imgui` port](https://github.com/microsoft/vcpkg/blob/9e593bb18ea69cc5095e012465dcd675a822ed0d/ports/imgui/vcpkg.json) `1.92.8#1`，对应 full commit `8936b58fe26e8c3da834b8f60b06511d537b4c63`，许可证为 [MIT](https://github.com/ocornut/imgui/blob/v1.92.8/LICENSE.txt)。截至采集日，上游当前发行是 hotfix [Dear ImGui `v1.92.9b`](https://github.com/ocornut/imgui/releases/tag/v1.92.9b)；它晚于 registry snapshot，因此不单独引入第二个源码通道，也绝不使用已被 hotfix 替代的 `v1.92.9`。

manifest 只启用 `sdl3-binding` feature；构建链接 `imgui::imgui`，从而只增加 ImGui core 与 `backends/imgui_impl_sdl3.cpp`。不启用 `dx12-binding`，也不编译/链接官方 `imgui_impl_dx12.cpp`；AlphaEngine 实现自有 Graphics Encoder renderer backend，使 UI draw data 进入同一 descriptor、upload、barrier 和 render scheduling 体系。1.92 系列的 custom renderer 需要正确声明并实现 `ImGuiBackendFlags_RendererHasTextures`，否则字体/动态 texture lifecycle 不完整。

MVP1 默认关闭 docking 与 multi-viewport；ImGui 只存在于 Sandbox 调试界面，benchmark/golden 场景强制关闭。所有动态字符串用 `TextUnformatted` 或固定格式串，禁止把 asset path、shader diagnostic 当作 printf format；纹理预览限制分辨率、descriptor 数和单帧上传字节。

vcpkg port 的 source `SHA512` 与 baseline 一起提供内容完整性锁。后续升级到 `v1.92.9b+` 时必须随 registry baseline 一起升级并重新跑 font atlas、dynamic texture、resize/DPI 与 device-loss smoke，不得退化为 `GIT_TAG master` 或 `HEAD`。

### GLB parser：fastgltf

选择维护方当前稳定 [fastgltf `v0.9.0`](https://github.com/spnda/fastgltf/releases/tag/v0.9.0)，commit `0d1b67a28c4950ea2deb796702006dcbe31e02b3`，许可证为 [MIT](https://github.com/spnda/fastgltf/blob/main/LICENSE.md)。它覆盖 glTF 2.0/GLB、validation 和 DirectXMath 友好类型，适合 C++20 离线 cooker。

但该选择**尚未获得无条件安全批准**。维护方仓库 open issue [#144: read access violation in `deserializeComponent`](https://github.com/spnda/fastgltf/issues/144) 明确涉及 `0.9.0`，恶意或异常 accessor 数据可能导致越界读取/崩溃。另一个轻量候选 cgltf 也存在维护方仓库 open issue [#287: sparse accessor integer overflow / heap out-of-bounds read](https://github.com/jkuhlmann/cgltf/issues/287)，因此不能仅凭“换成 C 库”消除风险。

MVP1 的准入条件：

1. GLB 只由隔离、低权限、无网络的 `assetc` 子进程解析，runtime 永不解析原始 GLB。
2. 解析前通过官方 [Khronos glTF Validator](https://github.com/KhronosGroup/glTF-Validator)；拒绝 error、未知必需 extension、外部 URI 与 MVP1 范围外的 data URI。
3. 解析前硬限制文件、JSON/BIN chunk、bufferView、accessor/count、primitive、vertex/index、image dimension 和累计解码内存；所有乘加做 checked arithmetic。
4. 为 #144 建立最小复现与回归测试；在 ASan/Windows page heap 下跑 malformed corpus 和 fuzz smoke。
5. 只有上述测试通过且解析结果被复制到项目自有 canonical POD 后才允许写 Asset Package。

若 #144 可在准入 corpus 中触发且没有可审计的补丁，MVP1 应阻断外部 GLB 导入，而不是把风险带入 runtime。fastgltf 的 parser 选择因此是本页唯一的功能级开放安全门。

### Texture processor：DirectXTex

选择 [DirectXTex May 2026 release](https://github.com/microsoft/DirectXTex/releases/tag/may2026)，vcpkg version-date `2026-05-07`，commit `4feb3e11a020f35b796fc769a74216a555d4f5ef`；同一发行版的官方 NuGet 版本为 `2026.5.8`。许可证为 [MIT](https://github.com/microsoft/DirectXTex/blob/main/LICENSE)。

使用 vcpkg `directxtex`，由 `assetc` 直接链接 `Microsoft::DirectXTex`；不用 runtime texture loader，也不 shell out 到不受控的 `texconv`。MVP1 只接收内嵌 PNG/JPEG，通过 Windows 内置 WIC codec 解码，生成 mip 并以 canonical RGBA8 写入 Asset Package；BC 压缩延后到后续内容/显存优化。

安全核查结果：

- 官方 [GHSA-677v-7wfg-cg4f](https://github.com/microsoft/DirectXTex/security/advisories/GHSA-677v-7wfg-cg4f) 是 crafted image RCE，影响 2018-07-03 及以前版本，2018-08-05 及以后已修复；
- 官方 [GHSA-3w9w-9833-gcpv](https://github.com/microsoft/DirectXTex/security/advisories/GHSA-3w9w-9833-gcpv) 涉及 `ConvertToSinglePlane`，受支持 package 在 2023-01-31 及以后已修复；
- May 2026 release 还明确修复 malformed HDR header 的越界读取。

即使所选版本晚于已知修复，`assetc` 仍要限制像素尺寸、mip 层数、解码总字节和执行时间；MVP1 不调用 `ConvertToSinglePlane`，不启用允许超大 DDS 的 flag，不加载第三方 WIC codec。

### JSON：nlohmann/json

选择 [nlohmann/json `v3.12.0`](https://github.com/nlohmann/json/releases/tag/v3.12.0)，full commit `55f93686c01528224f448c19128836e7df245f72`，vcpkg port 为 [`3.12.0#2`](https://github.com/microsoft/vcpkg/blob/9e593bb18ea69cc5095e012465dcd675a822ed0d/ports/nlohmann-json/vcpkg.json)，许可证为 [MIT](https://github.com/nlohmann/json/blob/v3.12.0/LICENSE.MIT)。官方 release 提供：

- `json.hpp` SHA-256 `aaf127c04cb31c406e5b04a63f1ae89369fccde6d8fa7cdda1ed4f32dfc5de63`；
- `include.zip` SHA-256 `b8cb0ef2dd7f57f18933997c9934bb1fa962594f701cd5a8d3c2c80541559372`；
- `json.tar.xz` SHA-256 `42f6e95cad6ec532fd372391373363b62a14af6d771056dbfc86160e6dfff7aa`。

构建使用 `find_package(nlohmann_json 3.12.0 CONFIG REQUIRED)` 与 `nlohmann_json::nlohmann_json`。只用于设置、report、manifest 等 JSON control plane，不进入渲染热路径。输入先限文件大小，SAX callback 限制 nesting、array/object 成员与字符串长度；异常在模块边界转换成项目 Error，不跨 DLL/模块传播。格式契约需要唯一 key 时显式拒绝 duplicate key。

### Logging：spdlog

选择 [spdlog `v1.17.0`](https://github.com/gabime/spdlog/releases/tag/v1.17.0)，commit `79524ddd08a4ec981b7fea76afd08ee05f83755d`，vcpkg port revision `#1`，许可证为 [MIT](https://github.com/gabime/spdlog/blob/v1.17.0/LICENSE)。发行版 bundled fmt 为 `12.1.0`；vcpkg build 应统一使用同一 baseline 解析的外部 fmt，避免项目中出现两个 fmt ABI/宏配置。

构建选择 compiled target `spdlog::spdlog`，不用 header-only 目标。同步 console/debug sink 可用于启动阶段；JSON Lines file sink 由项目 adapter 统一 event schema。渲染内循环禁止逐 draw log；异步 logger 使用固定容量 queue，render thread 的 overflow policy 为 drop-and-count，不能阻塞 GPU submission。

所有不可信文本都作为参数传给固定格式串，例如 `log("{}", diagnostic)`，不能把 diagnostic 本身当 format。清理控制字符，限制单条消息/字段长度，开启大小与数量双重 rotation。维护方仓库未提供可作为“无漏洞证明”的公开 advisory 清单，因此升级仍需检查 release 和 issues。

### Unit test：Catch2（已评估、未采用）

选择 registry 内的 [Catch2 `v3.15.3`](https://github.com/catchorg/Catch2/releases/tag/v3.15.3)，签名 tag 对应 full commit `8b08d4d79514f45f7e4ce2a607ac9c94e920d1bb`。许可证为 [Boost Software License 1.0](https://github.com/catchorg/Catch2/blob/v3.15.3/LICENSE.txt)。该版本让 `catch_discover_tests` 按字母序确定性注册，修复 JSON reporter 的 locale dependence，并继承 `v3.15.1` 对 broken UTF-8 linebreaking 潜在越界访问的修复，符合 CTest 与可复现 report 的要求。

最终实现没有把 Catch2 加入 manifest。MVP1 的 38 个 unit/contract case 使用仓库内轻量 `ALPHA_TEST` 注册器，由一个 CTest target 执行；D3D12 WARP 和 UI smoke 作为另外两个 CTest target。这样保留统一 CTest 入口，同时减少一个非必需第三方依赖。若后续测试能力超过轻量 harness，再基于本节研究重新评估 Catch2。

## 必须执行的供应链门

后续实现可以自动下载依赖前，必须完成以下动作：

1. **来源**：只允许上述官方 registry/repository/NuGet ID；禁止论坛网盘、个人 fork binary 与未审计 mirror。
2. **身份与完整性**：vcpkg port 使用 locked `SHA512`；NuGet 包验证 repository signature；所有首次授权下载的 archive、`.nupkg`、DLL 和 tool executable 记录 SHA-256。
3. **许可证**：将 vcpkg `share/<port>/copyright`、NuGet license 和 third-party notices 汇总为分发清单；不得只记录 SPDX 名称而丢弃原文。
4. **SBOM**：保存 vcpkg 生成的 SPDX SBOM，并把三个 NuGet 包和 cooker-only 组件补入同一产品 SBOM。
5. **最小功能面**：禁用 examples/tests/tools/unused backends；GLB、image、HLSL parser/compiler 只在无网络的离线工具进程运行。
6. **可复现**：CI 只读使用已核验的内容寻址 cache；configure/build 期间禁止静默更新 registry、NuGet package 或 Git tag。
7. **升级**：任何 version、port revision、feature、triplet 或 transitive dependency 变化都重新跑许可证 diff、安全公告检查、smoke/golden/benchmark，并生成新的基线记录。

## MVP1 后续监测项

| 项目 | 缺口 | MVP1 处理 |
|---|---|---|
| fastgltf 安全边界 | `v0.9.0` 的 open issue #144 仍影响将其视为通用不可信 parser | 仅允许项目预检后的内嵌、有界 MVP1 GLB；放宽输入、支持外部 URI 或服务化导入前重新审计 |
| SDL upstream drift | registry baseline 为 `3.4.12`，上游 current 为 `3.4.14` | MVP1 先保持 registry 一致；以后连同 baseline 升级并重新审计，不手工替换 DLL |
| Dear ImGui upstream drift | registry baseline 为 `1.92.8#1`，上游 current 为 `v1.92.9b` | MVP1 先保持 registry 一致；以后连同 baseline 升级，不单独引入 source channel |

## 采用理由总览

- Microsoft 的 D3D12、DXC 与 PIX 包来自渲染平台维护方，版本和运行时部署模型明确，能避免混用 Windows SDK inbox D3D12 与浮动工具链。
- vcpkg baseline 把常规 C/C++ 库版本、port patch、feature 和源 hash 收敛到一个可审阅的 registry snapshot；`x64-windows` 与 MVP1 的 MSVC 动态 CRT 约定一致。
- SDL3 与 Dear ImGui 只承担 platform/debug tooling，渲染仍走 AlphaEngine 的自有 D3D12 adapter、Graphics Encoder 和 Render Graph，不形成第二套 renderer。
- GLB、texture 与 HLSL 都在 cook 阶段处理，使复杂 parser/compiler 不进入实时 runtime 的攻击面和性能路径。
- nlohmann/json 与 spdlog 是 control plane 组件；项目内 test harness 属于 test plane；它们都不改变 frame hot path 的数据布局、分配和同步策略。

## 官方来源索引

- [vcpkg versions / baseline concepts](https://learn.microsoft.com/en-us/vcpkg/users/versioning)
- [vcpkg 2026.07.29 release](https://github.com/microsoft/vcpkg/releases/tag/2026.07.29)
- [SDL 3.4.14 release](https://github.com/libsdl-org/SDL/releases/tag/release-3.4.14)
- [DirectX 12 Agility SDK releases](https://devblogs.microsoft.com/directx/directx12agility/)
- [DXC releases](https://github.com/microsoft/DirectXShaderCompiler/releases)
- [WinPixEventRuntime documentation](https://devblogs.microsoft.com/pix/winpixeventruntime/)
- [Dear ImGui releases](https://github.com/ocornut/imgui/releases)
- [fastgltf releases](https://github.com/spnda/fastgltf/releases)
- [Khronos glTF Validator](https://github.com/KhronosGroup/glTF-Validator)
- [DirectXTex releases and security advisories](https://github.com/microsoft/DirectXTex/releases)
- [nlohmann/json releases](https://github.com/nlohmann/json/releases)
- [spdlog releases](https://github.com/gabime/spdlog/releases)
- [Catch2 releases](https://github.com/catchorg/Catch2/releases)
