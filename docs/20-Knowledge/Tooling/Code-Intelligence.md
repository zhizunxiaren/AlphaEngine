---
title: 项目代码智能工具链
aliases:
  - 项目代码智能工具链
type: tooling
status: confirmed
area: tooling
parent: "[[20-Knowledge/00-Knowledge-MOC]]"
updated: 2026-08-11
tags:
  - tooling
  - code-intelligence
  - agent
---

# 项目代码智能工具链

更新时间：2026-08-11

本页记录 AlphaEngine 的项目级 CodeGraph 与 Understand-Anything 集成。事实来源见
[[30-Sources/Code-Intelligence-Tools|Code Intelligence Tools 来源卡片]]，安装审计细节见
[项目内安装记录](../../../.codex/third_party/INSTALLATION.md)。

## 已确认事实

- CodeGraph `1.5.0` 安装在 `.codex/tools/codegraph/`，Codex 通过
  `.codex/config.toml` 中的项目级 STDIO MCP 启动固定 Windows x64 bundle。
- CodeGraph 已在项目根初始化 `.codegraph/`。当前仓库尚无受支持的引擎源码文件，初始索引为
  0 files / 0 nodes / 0 edges；新增 C/C++/Rust 等源码后由 MCP watcher 自动同步。
- `codegraph.json` 排除 `.codex/`、`.tmp/`、`.ua/` 和 legacy
  `.understand-anything/`，防止第三方工具或生成物污染引擎代码图。
- Understand-Anything `2.9.4` runtime 安装在
  `.codex/third_party/understand-anything/`，9 个项目 skills 安装在
  `.codex/skills/understand*/`；core 已构建。
- 两个实际安装依赖树在安装时均报告 0 个已知生产漏洞。

## 项目决策

- 只做项目级安装，不修改用户 `PATH`、用户主目录 skills 或全局 Codex 配置。
- CodeGraph MCP 固定设置 `DO_NOT_TRACK=1`、`CODEGRAPH_NO_UPDATE_CHECK=1` 和
  `CODEGRAPH_NO_DOWNLOAD=1`，运行时不遥测、不检查更新、不自行下载 bundle。
- 不执行上游 `install`、`uninstall`、`uninit` 或批量清理命令；这些路径与项目禁止递归删除的规则冲突。
- Understand-Anything 的本地 skill 文档已改为发现项目内 runtime，并把递归清理替换为移动到
  `.ua/.trash-*` 后由用户手动处理；9 个 skill 在执行前统一加载
  `.codex/third_party/understand-anything/AENGINE-RUNTIME.md`，把上游 Bash 示例转换为原生 PowerShell。
- 不安装 Understand-Anything 的 homepage 工作区；它不属于 Codex skill 运行时，且审计时其依赖树存在已知漏洞。

## 使用入口

- CodeGraph CLI：`& .\.codex\tools\codegraph\codegraph.ps1 status`
- CodeGraph MCP：重启 Codex task 后自动加载 `codegraph_explore`。
- Understand-Anything：新 task 中使用 `$understand`、`$understand-chat`、
  `$understand-dashboard`、`$understand-diff`、`$understand-domain`、
  `$understand-explain`、`$understand-figma`、`$understand-knowledge`、
  `$understand-onboard`。

## 待决定

- 等引擎源码进入仓库后，是否把 CodeGraph status 检查加入本地开发验证流程。
- 是否立即运行 `$understand --language zh` 生成首版 `.ua/knowledge-graph.json`；完整初始化会消耗较多 token，应该单独明确授权。
- 是否允许 Dashboard 加载 Google Fonts，或改为完全离线字体栈。
