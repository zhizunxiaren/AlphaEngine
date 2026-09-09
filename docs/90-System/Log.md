---
title: Wiki Log
aliases:
  - 维护日志
type: log
status: active
area: documentation
parent: "[[90-System/LLM-Wiki-Obsidian]]"
updated: 2026-08-20
tags:
  - maintenance
  - history
---

# Wiki Log

> 从 [[00-Home]] 或 [[90-System/LLM-Wiki-Obsidian|工作模式]] 进入。此页只记录知识库结构与结论的实质性变化；专题事实和理由保留在各自笔记中，并以 Backlinks 关联。

## [2026-08-20] outcome | MVP 1 实现与验收完成

完成 AlphaEngine 的 D3D12 MVP 1 纵向切片，并把实现状态、模块技术、冻结 ABI/schema、第三方安全边界、参考内容 hash、图像与性能证据合并回唯一 owner note [[10-Outcomes/20-MVP1]]。最终链路覆盖 GLB/HLSL 离线 Cook、Content Runtime、Scene/immutable Snapshot、CPU frustum culling、Forward metallic-roughness PBR、Directional Shadow、HDR/ACES Tone Map、Render Graph、Plan-driven Graphics Interface、D3D12/Trace Adapter、DRED/PIX/GPU timestamp 与 Dear ImGui 调试界面。Debug CTest 3/3 通过，其中 unit/contract case 为 38/38；真机 GTX 1080 Ti 1080p 验收 CPU p99 `5.3959 ms`、GPU p99 `4.950016 ms`，full-frame golden 与 validation 均通过。Home 和项目路线转入 MVP 2.1；没有新增平行成果文档。

## [2026-08-20] source | 锁定 MVP 1 依赖与有界 cooker 安全门

更新 [[30-Sources/MVP1-Dependency-Baseline]] 为实际集成记录：vcpkg baseline、Agility/DXC archive、运行 DLL/tool 的 SHA-256 已固定；WinPixEventRuntime 的通道修正为 vcpkg；Catch2 记录为已评估但未采用。fastgltf `0.9.0` 只在离线 `assetc` 中有条件准入，调用前执行单 BIN GLB、JSON、bufferView/accessor checked arithmetic、数量上限以及 PNG/JPEG 解码展开上限检查；外部 URI 和通用不可信导入仍不在 MVP 1 准入范围。

## [2026-08-16] maintenance | 融合 LLM Wiki 与 Obsidian

将知识库统一为 Sources → Knowledge → Outcomes 的生产链和 Home → Outcomes → Knowledge → Sources 的查询链。原 `llm-wiki/` 子系统中的来源、综合与日志迁入 Vault 的正式分层，建立独立 Sources MOC、Knowledge MOC 和 System 规则；Obsidian 的 Properties、WikiLinks、Backlinks、MOC 与 Graph 贯穿所有层。MVP 1 继续由 [[10-Outcomes/20-MVP1]] 单独拥有，已手动删除的重复合同不恢复。

## [2026-08-16] maintenance | 建立统一 Obsidian 成果系统

将 `docs/` 设为完整 Vault，以 [[00-Home]] 为唯一入口；项目、MVP 1、MVP 2、ADR 和参考层分别归入编号成果节点。主笔记统一 YAML Properties、owner note 和 Wiki Link，旧 `design/`、`adr/` 与 Wiki MOC 路径完成迁移；已手动删除的重复 MVP 1 Contract 不再恢复，其残留链接改指 [[10-Outcomes/20-MVP1]] 对应章节。

## [2026-08-16] maintenance | 转为 Obsidian 知识库

将 `wiki/` 内的相对 Markdown 内部链接转换为 Wikilink，并把 `index.md` 升级为可浏览的
MOC。`README.md` 与 `schema.md` 现在明确 Obsidian Vault、Properties、双链、Backlinks 和
孤立笔记检查规则；Vault 外的路线图、技术设计、ADR 与网页链接保持普通 Markdown 链接。

## [2026-08-16] maintenance | 收敛人类文档入口

将人类阅读路径收敛为“项目路线图 + MVP 1 技术设计”两份主文档：路线图删除重复实现参数和历史流水，MVP 1 技术设计明确为唯一实施合同并加入按角色阅读路径。LLM Wiki 降为 Agent 按需查询的依据层，重写索引与维护规则，明确主文档权威顺序和优先深化现有页面的原则。

## [2026-08-16] decision | 确认 Dear ImGui 调试界面

确认 MVP 1 Sandbox 使用 Dear ImGui 构建开发调试界面。当时以独立决策页定义只读 DebugSnapshot、SDL3 input capture、默认 profiler/graph/resource/capability/log panel、Tone Map 后的 Render Graph Overlay Pass、标准 Graphics Encoder 绘制、动态 Buffer/Bindless 生命周期、失败降级和测试合同；相关内容随后已合并进唯一 [[10-Outcomes/20-MVP1|MVP 1 技术设计]]。benchmark、reference capture 与 golden generation 强制关闭 UI。Dear ImGui 的确切版本、hash、许可证和安全检查仍是实现前闭合项。

## [2026-08-16] synthesis | 建立 MVP 1 技术设计总览

将四份 MVP 1 Contract、Graphics Interface 与平台/构建/性能决策综合为规范性的技术总览，明确 Application、Platform、Content、Scene/Snapshot、Renderer、Render Graph、Graphics、Shader/Pipeline、D3D12 Runtime、Trace/Validation、Diagnostics 和 Verification Module 的 Interface、技术、生命周期、性能门禁与完成定义；同步把项目总目标明确为现代高性能实时渲染器，并收敛路线图中过时的分散待讨论清单。该页面是内部综合，既有 confirmed 决策与 proposed 实施基线保持分离。

## [2026-08-11] decision | 安装项目级代码智能工具链

完成 CodeGraph `1.5.0` 与 Understand-Anything `2.9.4` 的安装前安全检查，并固定到项目 `.codex`。CodeGraph 使用项目级 MCP、禁用遥测/更新检查/运行时下载并初始化本地索引；Understand-Anything 只安装独立插件工作区和 9 个 skills，修正项目 runtime 发现路径和递归清理指令。新增来源卡片、工具链决策页并更新索引。

## [2026-08-07] initialize | 建立项目 LLM Wiki

创建原始资料、Wiki、索引和日志目录；后续维护按 `schema.md` 执行。

## [2026-08-08] ingest | Bindless 与 Descriptor Table

根据本次技术讨论建立渲染资源绑定概念页，记录 Descriptor、Descriptor Heap、Descriptor Table、Bindless、Non-Uniform Index、D3D12/Vulkan 术语映射、资源生命周期和 Alpha Engine 的待决设计问题；同步加入 D3D12、Vulkan 与 Karpathy LLM Wiki 来源卡片，并更新索引。

## [2026-08-10] decision | 确认 MVP 2 现代渲染能力矩阵

确认 MVP 2 覆盖现代实时渲染器完整能力域，并拆分为 MVP 2.1–2.6。建立高级能力矩阵和 Microsoft/Khronos 官方来源卡片，记录 GPU-driven、Mesh Shader、VRS、Sampler Feedback、Enhanced Barriers、Work Graphs、Residency/Streaming 与 Pipeline Cache 的 D3D12 路径、Vulkan 等价策略、验收标准和 fallback；硬件光追继续排除。

## [2026-08-10] decision | 确认 MVP 1 参考硬件与性能基线

只读检测当前开发工作站为双路 Intel 24 核 48 线程、GTX 1080 Ti 11264 MiB、约 111.9 GB 可见内存和 Windows 10 Pro Build 19045。确认它为 MVP 1 参考机，并确认 1920×1080、稳定 60 FPS、16.67 ms 总帧时间为性能基线；最低发行配置仍待决定。

## [2026-08-10] decision | 确认 MVP 1 平台与 D3D12 能力基线

确认 Windows 10 22H2 / Build 19045 x64、稳定版 DirectX 12 Agility SDK、Feature Level 12_0、Shader Model 6.0、Root Signature 1.1 和 Resource Binding Tier 3 为 MVP 1 硬门槛；采用大型 Descriptor Table Bindless，SM 6.6 Direct Heap Indexing 与 DX12 Ultimate 特性仅为可选路径。引擎启动时必须生成 GPU Capability Report。

## [2026-08-10] decision | 确认 MVP 1 语言与构建基线

确认 C++20、MSVC 19.50+、Windows SDK 10.0.26100.0、CMake 3.31+、CMake Presets、Ninja Multi-Config、`Debug`/`RelWithDebInfo`/`Release`、动态 MSVC Runtime 和 vcpkg Manifest Mode。第一方代码采用严格警告策略；MVP 1 保持 exceptions 与 RTTI 启用但限制其使用，不使用 C++ Modules。

## [2026-08-11] decision | 确认 MVP 1 Graphics Interface

比较极小 Transaction、显式对象和 Plan-driven 三种 interface 后，确认采用 Execution Plan + 短生命周期 Encoder + 显式资源控制面。新增项目术语表、ADR-0001 和完整 Wiki 决策页；明确 Render Graph/Graphics/Adapter seam、Resource Handle 与 Bindless Index 分离、后端无关 Resource Usage、延迟回收、错误和测试约束。

## [2026-08-11] query | Root Signature（根签名）

根据 D3D12 官方资料新增 Root Signature 概念页和来源卡片，说明它是 Shader 资源绑定布局契约，区分 Root Constants、Root Descriptors 与 Descriptor Tables，并记录 64 DWORD 预算、PSO 兼容性、HLSL register 映射及 AlphaEngine MVP 1 的混合绑定布局。

## [2026-08-12] proposal | MVP 1 Bindless 资源绑定设计

补齐此前仅有方向、尚缺具体协议的 Bindless 设计：提议由 D3D12 Adapter 内部的 `BindlessRegistry` 管理分类型 Descriptor 区、typed Bindless Index、永久 Null Slot、copy-on-write Descriptor 更新、Submission Token 延迟回收和可诊断的容量耗尽；该页保持 proposed，等待项目确认后转为正式决策。

## [2026-08-12] audit | MVP 1 架构完整性

修正将 Bindless 单独推进的范围错误。建立全盘 MVP 1 审计，确认当前还缺 MVP 边界/参考场景、渲染路径/画面合同、Frame/Presentation、Render Graph、GPU Resource、Shader/Pipeline、Scene/Asset Runtime、诊断与测试等相互依赖的设计；Bindless 候选页改为 deferred，作为 GPU Resource Module 的设计输入，待 P0 依赖明确后再评审。

## [2026-08-12] proposal | 补齐 MVP 1 全量 Contract

按全盘审计补齐四份互相链接的 MVP 1 提案：D3D12 Runtime、渲染与数据、Shader 与 GPU 资源、运行宿主与验证。它们共同覆盖 Adapter/Device、Frame/Swapchain、Queue/Fence、资源上传/读回、Legacy Barrier、Forward 画面合同、Scene Snapshot、Render Graph、glTF Cook、HLSL/DXC/PSO、Bindless、SDL3 Host、RunConfig、线程、日志、DRED/PIX、图像/性能回归与 CI；所有新选择保持 proposed，等待统一评审确认。

## [2026-08-13] proposal | 收敛 MVP 1 Contract 参数

将四份 MVP 1 Contract 收敛为同一套实施提案：Main Thread 兼任唯一 Render Submission Thread、两帧在飞/三缓冲 SDR Swapchain、单 Direct Queue 与 Legacy Barrier、Forward PBR + 单 2048² Directional Shadow Map + 预烘焙 IBL、GLB Cook 内容链、`Texture2D`/`TextureCube`/Sampler Bindless。Buffer/UAV Bindless、并行录制、多 Queue、Enhanced Barrier、streaming 与 GPU-driven 仍明确延后。

## [2026-08-13] proposal | MVP 1 审查后 ABI 收敛

对当前 MVP 1 文档做整体审查后，修正上一条提案中 IBL 和资源绑定过早扩张的问题。MVP 1 改为无 IBL 的 Forward PBR，Bindless 仅包含 `Texture2D` 与 `Sampler`；TextureCube、Buffer/UAV、Compute Shader 与 Full Bindless 延至 MVP 2。补齐 canonical vertex、Depth/Shadow 格式、Frame/Pass Table、alpha-mask/shadow、唯一 sRGB 编码位置和稳定 60 FPS 的 p99 验收口径。依赖版本、vcpkg baseline、SDL3 配置、参考内容许可证与 golden 记录保留为实施前闭合条件。
