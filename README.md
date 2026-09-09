# AlphaEngine

AlphaEngine 的目标是实现一个**现代高性能实时渲染器**。

MVP 1 D3D12 纵向切片已经完成并通过参考机验收；下一阶段是在这条稳定链路上推进 MVP 2 现代 GPU 渲染能力，最终以 Vulkan Adapter 验证功能对等。

MVP 1 已打通 `GLB/HLSL → 离线 Cook → Scene/Snapshot → Forward Renderer → Render Graph → Graphics Interface → D3D12 → Present/证据`。Sandbox 使用 Dear ImGui 调试界面，benchmark 与 golden 强制关闭 UI。

## 文档入口

将 `docs/` 作为 Obsidian Vault 打开，从 [AlphaEngine Home](docs/00-Home.md) 进入完整成果系统。

文档采用 **LLM Wiki × Obsidian** 融合模式：LLM Wiki 负责资料采集、综合和维护，Obsidian 负责 Properties、WikiLinks、Backlinks、MOC 与 Graph。

- [项目系统与路线](docs/10-Outcomes/10-AlphaEngine.md)：目标、总体架构、MVP 1–3 边界。
- [MVP 1 技术设计与验收](docs/10-Outcomes/20-MVP1.md)：MVP 1 唯一实现合同与完成证据。
- [MVP 2 能力矩阵](docs/10-Outcomes/30-MVP2.md)：现代渲染能力与跨后端策略。
- [知识 MOC](docs/20-Knowledge/00-Knowledge-MOC.md)：决策、概念、基线与术语。
- [资料源 MOC](docs/30-Sources/00-Sources-MOC.md)：外部依据与采集卡片。
- [融合工作模式](docs/90-System/LLM-Wiki-Obsidian.md)：写入、查询和维护规则。

## 构建与运行

在 Visual Studio x64 Developer PowerShell 中执行：

```powershell
cmake --preset windows-runtime
cmake --build --preset runtime-debug
ctest --preset runtime-debug

.\.build\msvc-runtime\Debug\alpha_sandbox.exe config\sandbox.json
.\.build\msvc-runtime\RelWithDebInfo\alpha_benchmark.exe config\benchmark.json --frames 1500 --output runs
```

依赖由项目级 `vcpkg.json` 与 `cmake/DirectXPackages.cmake` 锁定；vcpkg toolchain 位于 `.cache/vcpkg`。正式验收配置、参考内容和 golden 均已纳入仓库，运行证据写入被忽略的 `runs/`。
