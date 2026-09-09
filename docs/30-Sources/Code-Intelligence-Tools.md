---
title: Code Intelligence Tools 来源卡片
aliases:
  - Code Intelligence Tools 来源卡片
type: source
status: captured
area: sources
parent: "[[30-Sources/00-Sources-MOC]]"
captured: 2026-08-11
updated: 2026-08-11
tags:
  - source
  - tooling
  - code-intelligence
---

# Code Intelligence Tools 来源卡片

- 采集日期：2026-08-11
- 采集范围：安装方式、Codex 集成、隐私行为、许可证、运行依赖
- 上游来源：
  - CodeGraph: https://github.com/colbymchenry/codegraph
  - Understand-Anything: https://github.com/Egonex-AI/Understand-Anything
  - Codex MCP 配置: https://learn.chatgpt.com/docs/extend/mcp?surface=cli

## CodeGraph

- 审计提交：`c6aaa20358cd6adcd04b87bdef8e5803ad146f3a`
- 审计版本：`1.5.0`
- 许可证：MIT。
- 上游支持 `codegraph init` 建立项目内 `.codegraph/` 索引，并通过
  `codegraph serve --mcp` 提供本地 MCP 服务。
- 上游默认匿名遥测，并执行每日版本检查；`DO_NOT_TRACK=1` 同时关闭两者。
- Windows npm 发布物使用平台包
  `@colbymchenry/codegraph-win32-x64`，其中包含固定 Node runtime 和应用入口。

## Understand-Anything

- 审计提交：`797ce7969312411be2e125c39628854166f055d7`
- 插件版本：`2.9.4`
- 许可证：MIT。
- Codex 通过项目 skill 调用；核心分析将结构化图写到 `.ua/`，初次完整分析可能消耗大量 token。
- `understand-anything-plugin` 使用独立 `pnpm-lock.yaml`，不依赖仓库中的 homepage 工作区。
- 核心代码分析不主动上传源码；`understand-figma` 是例外，会在显式调用时使用
  `FIGMA_TOKEN` 请求 `api.figma.com`。
- Dashboard 只绑定本地回环地址，并使用随机访问 token；页面模板会从 Google Fonts 请求字体。

## 来源限制

本卡片只记录 2026-08-11 审计到的固定提交和发布物。上游后续版本、依赖漏洞和安装行为可能变化，升级前必须重新审计。
