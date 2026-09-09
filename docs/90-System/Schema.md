---
title: AlphaEngine 知识系统 Schema
aliases:
  - LLM Wiki Schema
  - Vault Schema
  - Obsidian Schema
type: guide
status: active
area: documentation
parent: "[[00-Home]]"
related:
  - "[[90-System/LLM-Wiki-Obsidian]]"
  - "[[20-Knowledge/00-Knowledge-MOC]]"
  - "[[30-Sources/00-Sources-MOC]]"
updated: 2026-08-16
tags:
  - obsidian
  - documentation
  - knowledge-base
---

# AlphaEngine 知识系统 Schema

## 1. Vault 模型

`docs/` 同时是 LLM Wiki 的持久知识库与 Obsidian Vault。物理目录表达信息生命周期，WikiLinks 表达语义关系。

| 路径 | 允许内容 |
|---|---|
| `00-Home.md` | 唯一入口、全局 MOC |
| `10-Outcomes/` | `project`、`specification` 等成果 owner notes |
| `20-Knowledge/` | `moc`、`decision`、`concept`、`glossary`、`tooling` |
| `30-Sources/` | `source` 与 Sources MOC |
| `90-System/` | `guide`、`log` 等系统维护文档 |

目录编号只用于稳定排序。语义导航必须通过 [[00-Home]]、各层 MOC 与 Backlinks 完成。

## 2. Properties

每份活跃笔记以 YAML Properties 开头：

~~~yaml
---
title: 可读标题
aliases:
  - 检索别名
type: moc | project | specification | decision | concept | source | glossary | tooling | guide | log
status: active | implementation-baseline | confirmed | accepted | proposed | working | captured | superseded
area: project | roadmap | mvp1 | mvp2 | architecture | knowledge | sources | documentation
parent: "[[00-Home]]"
related:
  - "[[10-Outcomes/20-MVP1]]"
updated: YYYY-MM-DD
tags:
  - rendering
---
~~~

- title、type、status、area、updated 为必填属性。
- parent 指向上一级 MOC；related 只列强关系，不复制正文链接清单。
- tags 使用小写 kebab-case；aliases 提供自然语言检索名。
- Source 记录 URL、采集日期、抽取范围和适用边界；Decision 记录状态与影响成果。

## 3. 链接与可达性

- Vault 内笔记统一使用 `\[\[Wiki Link\]\]`；需要别名时使用 `\[\[目标|显示名\]\]`。
- 外部网页和 Vault 外文件使用普通 Markdown link。
- 每份活跃笔记必须可从 [[00-Home]] 沿 Wiki Link 到达。
- 成果链接 Knowledge，Knowledge 链接 Sources；使用 Backlinks 查看反向影响。
- 链接到标题时使用 `\[\[笔记#标题|显示名\]\]`，避免复制同一段内容。
- 文件移动后同步显式路径链接；不依赖含糊的同名文件解析。

## 4. 唯一事实源

- 项目目标与版本边界 → [[10-Outcomes/10-AlphaEngine]]
- MVP 1 实施合同 → [[10-Outcomes/20-MVP1]]
- MVP 2 能力范围 → [[10-Outcomes/30-MVP2]]
- 术语 → [[20-Knowledge/Glossary]]
- 选择理由 → `20-Knowledge/Decisions/`
- 可复用技术解释 → `20-Knowledge/Concepts/`
- 外部事实 → [[30-Sources/00-Sources-MOC|Sources]] 下的来源卡片

同一结论只在 owner note 定义一次。其他笔记用 Wiki Link 引用，并只补充本页面独有的理由、推导或证据。

## 5. LLM Wiki 操作

1. **Query**：从 [[00-Home]] 进入 Outcomes，需要理由时进入 Knowledge，需要原证据时进入 Sources。
2. **Ingest**：来源进入 `30-Sources/`，避免混入项目结论。
3. **Distill**：把相关事实综合进现有 Knowledge 页面，标清事实、推导和未决项。
4. **Publish**：采纳后的实施变化同步到唯一 Outcomes owner note。
5. **Log**：在 [[90-System/Log]] 追加实质性知识或结构变更，不记录无意义排版操作。
6. **Lint**：检查 Properties、孤立笔记、失效 WikiLinks、旧路径、重复结论、冲突和过期状态。

新增笔记前先搜索现有 owner note。只有独立决策、独立资料域或新的版本成果无法由现有页面容纳时才新建。

## 6. 状态规则

- `captured`：资料已采集，尚不代表项目采纳。
- `working` / `proposed`：知识或方案仍在综合、评审。
- `confirmed` / `accepted`：基线或决策已确认。
- `implementation-baseline`：当前实现合同，变更必须同步影响页与 Log。
- `superseded`：保留历史但不再有效，必须链接替代笔记。

## 7. 隐私与安全

- 密钥、密码、访问令牌和个人敏感信息不进入 Vault。
- .env、凭据和个人 Dear ImGui/Obsidian 布局保存在受控且忽略的位置。
- 第三方资料进入来源层前记录来源与许可；第三方依赖在实施前完成版本锁定和安全检查。
