# 项目约定

## 项目目标

AlphaEngine 的目标是实现一个现代高性能实时渲染器。当前 `fromzero` 分支是空基线的重启：代码骨架与渲染技术栈尚未落定，任何实现目标与版本边界须先在成果层确认，再进入代码。

## 文档路由

- **文档任务入口**：先读取 [AlphaEngine Home](docs/00-Home.md)，按成果地图进入 owner note。
- **项目目标、总体架构或版本边界**：读取 [项目系统与路线](docs/10-Outcomes/10-AlphaEngine.md)。
- **选择理由、专题背景或术语**：从 [知识 MOC](docs/20-Knowledge/00-Knowledge-MOC.md) 按需读取。
- **查证外部依据或采集新资料**：从 [资料源 MOC](docs/30-Sources/00-Sources-MOC.md) 开始。
- **修改文档结构或维护规则**：先读取 [融合工作模式](docs/90-System/LLM-Wiki-Obsidian.md) 和 [Schema](docs/90-System/Schema.md)。

权威顺序：Outcomes 拥有当前项目合同；Knowledge 保存综合、决策和概念；Sources 保存外部依据。后两层不得增加与 Outcomes 冲突的实现义务。

## 文档维护

`docs/` 是 LLM Wiki 与 Obsidian 共用的知识库。新资料按 Sources → Knowledge → Outcomes 传播，查询按 Home → Outcomes → Knowledge → Sources 追溯。Vault 内使用 WikiLinks 和 YAML `parent` / `related`；优先深化现有页面，只有独立版本成果、长期决策、可复用概念或新来源才新增笔记。每次实质变更同步 [Wiki Log](docs/90-System/Log.md)，并检查 Properties、孤立页、失效链接、旧路径和重复结论。

## 协作约定

- 先在成果页对齐方案并得到明确认可，再改动代码或创建新笔记，避免擅自动手造成反复返工。
- 文档层面每份活跃笔记必须有 YAML Properties（title/type/status/area/updated），并能从 [[00-Home]] 沿 Wiki Link 到达。
- 密钥、口令与个人隐私不进入 Vault；第三方依赖在实施前完成来源记录、版本锁定与安全检查。
