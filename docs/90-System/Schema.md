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
updated: 2026-09-23
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
| `demos/` | **非笔记资产**：自包含的单文件教学演示页（`<目录>/index.html`）及其校验脚手架。不收笔记，见第 1.1 节 |

目录编号只用于稳定排序。语义导航必须通过 [[00-Home]]、各层 MOC 与 Backlinks 完成。

### 1.1 非笔记资产：`demos/`

`demos/` 存放可直接在浏览器打开、不参与文档编译的交互演示页。它是**知识层的附着物**，不是第五层：

- 每个演示页以**目录**为单位组织，入口固定为 `index.html`；同目录下的 `_*.js` / `verify.*.js` 是它的校验脚手架，随页面一起纳管。
- 演示页**不写 Properties、不参与 MOC 语义网络**，因此不需要满足「每份活跃笔记必须可从 [[00-Home]] 到达」。
- 每个演示页由 `20-Knowledge/Tooling/` 下的一条 `tooling` 笔记登记（当前为 [[20-Knowledge/Tooling/教学演示页]]），该笔记负责清单、与 Concept 页的映射和校验约定。
- **演示页不承载结论**：它引用 Concept 页的结论，反过来不被 Outcomes 引用。演示页里的实现是「为了看见中间状态」而写的讲解代码，不构成引擎架构或技术栈决策。

## 2. Properties

每份活跃笔记以 YAML Properties 开头：

~~~yaml
---
title: 可读标题
aliases:
  - 检索别名
type: moc | project | specification | decision | concept | source | glossary | tooling | guide | log
status: active | implementation-baseline | confirmed | accepted | proposed | working | captured | superseded
area: project | roadmap | architecture | knowledge | sources | documentation
parent: "[[00-Home]]"
related:
  - "[[10-Outcomes/10-AlphaEngine]]"
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
- `demos/` 下的演示页是**非笔记资产**，用普通 Markdown link 指向具体入口（例：`[光栅化演示](demos/rasterization/index.html)`），**不要**写成 WikiLink —— 它不是笔记，写成 WikiLink 会制造一个永远无法解析的目标。
- 每份活跃笔记必须可从 [[00-Home]] 沿 Wiki Link 到达。
- 成果链接 Knowledge，Knowledge 链接 Sources；使用 Backlinks 查看反向影响。
- 链接到标题时使用 `\[\[笔记#标题|显示名\]\]`，避免复制同一段内容。
- 文件移动后同步显式路径链接；不依赖含糊的同名文件解析。

## 4. 唯一事实源

- 项目目标与版本边界 → [[10-Outcomes/10-AlphaEngine]]
- 术语 → [[20-Knowledge/Glossary]]
- 选择理由 → `20-Knowledge/Decisions/`
- 可复用技术解释 → `20-Knowledge/Concepts/`
- 演示资产清单与校验约定 → [[20-Knowledge/Tooling/教学演示页]]
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
- .env、凭据和个人 IDE/Obsidian 布局保存在受控且忽略的位置。
- 第三方资料进入来源层前记录来源与许可；第三方依赖在实施前完成版本锁定和安全检查。
