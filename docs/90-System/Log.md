---
title: Wiki Log
aliases:
  - 维护日志
type: log
status: active
area: documentation
parent: "[[90-System/LLM-Wiki-Obsidian]]"
updated: 2026-09-15
tags:
  - maintenance
  - history
---

# Wiki Log

> 从 [[00-Home]] 或 [[90-System/LLM-Wiki-Obsidian|工作模式]] 进入。此页只记录知识库结构与结论的实质性变化；专题事实和理由保留在各自笔记中，并以 Backlinks 关联。

## [2026-09-10] initialize | 空基线建立 LLM Wiki × Obsidian 框架

在 `fromzero` 空基线分支上初始化完整知识库框架：根目录 [AGENTS.md](../../AGENTS.md) 建立文档路由与维护规则；`docs/` 确立 Home / Outcomes / Knowledge / Sources / System 五层，含 [[00-Home]] 唯一入口、[[10-Outcomes/10-AlphaEngine|项目路线 owner]]、[[20-Knowledge/00-Knowledge-MOC|知识 MOC]] 与 [[20-Knowledge/Glossary|术语表]]、[[30-Sources/00-Sources-MOC|资料源 MOC]]，以及 [[90-System/Schema|Schema]] 与 [[90-System/LLM-Wiki-Obsidian|工作模式]]。本页是唯一初始化记录。引擎目标、技术栈与首版里程碑尚未确认，作为占位保留在项目路线 owner，待成果层决策后点亮。

## [2026-09-11] knowledge | 建立首个 Concept 笔记：C++ 语言特性实践

在知识层建立首个 `concept` 笔记 [[20-Knowledge/Concepts/C++-语言特性实践]]，聚合 C++ 语言层的小粒度知识点：第 1 节为 `const` / `constexpr` / `consteval` / `constinit` / `if constexpr` 与编译期求值，第 2 节为 `noexcept` 与异常契约。笔记内确立粒度规则——单个关键字与单条语言规则并入本页新章节，只有形成独立技术问题域（资源绑定、GPU Barrier、Render Graph 等）才新建 Concept 笔记，并在第 3 节登记待补章节清单。

同时采集依据 [[30-Sources/C++-标准与cppreference]]（cppreference / ISO C++ 标准 / C++ Core Guidelines），使知识层首次形成 Sources → Knowledge 链路。[[20-Knowledge/00-Knowledge-MOC|知识 MOC]] 概念节与 [[30-Sources/00-Sources-MOC|资料源 MOC]] 已同步登记。

笔记中 1.4 / 2.3 / 2.5 的渲染器落点属**内部推导**，语言标准基线未定，相关结论待 [[10-Outcomes/10-AlphaEngine]] 决策与实测后提升为项目约定；未登记 Glossary，因二者属语言通用术语而非项目专有术语。

## [2026-09-11] knowledge | C++ 语言特性实践 追加「翻译单元与链接性」章节

在 [[20-Knowledge/Concepts/C++-语言特性实践]] 追加第 3 节「翻译单元与链接性」，按该页粒度规则并入现有 Concept 笔记而非新建：覆盖翻译单元（TU）与 ODR、`inline` / `static` / `constexpr` / `const` 的链接性对照、`static` 在头文件中的副本陷阱、类内成员函数与 `#pragma once` 的职责边界、ADL 与非成员运算符的命名空间约束。原第 3～6 节顺延为第 4～7 节，目录、笔记边界归属表与待核验清单已同步。

依据仍为 [[30-Sources/C++-标准与cppreference]]，该卡采集范围新增「翻译单元与链接」行、抽取事实新增第 9～12 条，Sources → Knowledge 链路保持有效。本次仍**未登记 Glossary**：TU / ODR / ADL 属语言通用术语而非项目专有名词，与既有判断一致。

第 3.6 节的渲染器落点与类型命名空间划分属**内部推导**，语言标准基线未定，待 [[10-Outcomes/10-AlphaEngine]] 决策后复核是否升级为项目约定。

## [2026-09-15] sources + knowledge | 首次登记第三方依赖：stb_image

采集首个第三方依赖来源 [[30-Sources/stb-图像解码库]]（stb_image v2.30 / 2024-05-31，双许可 MIT 或 Public Domain），登记解码格式、输出精度、编译期配置、语言链接保护、`STBI_VERSION` 不代表发布版本、无色彩管理、上游低活跃与历史越界问题等事实与边界。

为满足 Schema「Source 至少被一份知识笔记引用」的非孤立要求，同时新建 `tooling` 笔记 [[20-Knowledge/Tooling/第三方依赖引入]]（首个 `type: tooling` 笔记），承载**来源记录 → 版本锁定 → 安全检查**三步流程、`Engine/third_party/<库名>/` 目录与「永不修改第三方源码」约定、单头文件库的接入规则，以及风险登记。语言层面的 ODR 与链接性推导不在此复制，以标题链接指向 [[20-Knowledge/Concepts/C++-语言特性实践#3. 翻译单元与链接性|C++ 语言特性实践 · 3. 翻译单元与链接性]]。

[[30-Sources/00-Sources-MOC|资料源 MOC]] 新增「第三方库与资产」分组，[[20-Knowledge/00-Knowledge-MOC|知识 MOC]] 新增「工具与约定」分组。**未新建 Decision**：依赖获取方式与构建系统归属仍属 [[10-Outcomes/10-AlphaEngine]] 首版基线待决项，本页只记录约定不预设结论；`status` 记为 `working`。

## [2026-09-15] knowledge | 新建渲染数学 Concept 笔记：射线与几何体求交

在知识层新建 [[20-Knowledge/Concepts/射线与几何体求交]]（第二个 `concept` 笔记），承载**渲染数学**主题。首节「射线与球体求交」记录：由 `|O + tD - C|² = r²` 化为一元二次方程的完整推导，半 b 形式的系数含义（`a = D·D`、`h = D·oc`、`c = |oc|² - r²`），判别式与两条根对应穿入 / 穿出点的几何解释（含起点位于球内时 `c < 0` 的各情形表），开区间 `(t_min, t_max)` 下"先近根、不在范围内则回退远根"的筛选逻辑，以及外法线 `(P - C) / r` 与朝向规范化（`front_face`）。

按该页粒度规则，单个求交对象并入本页新章节而不新建文档；候选待补主题（平面、三角形、AABB、BVH、参数区间语义、数值鲁棒性）已登记。

依据：本页数学为**通用解析几何结论**，属内部推导，未设来源卡片；实现形态参考 *Ray Tracing in One Weekend*（外部链接，来源卡待渲染基线确认后补建）。[[20-Knowledge/00-Knowledge-MOC|知识 MOC]] 概念节已同步登记。未涉及 Outcomes 变更；未登记 Glossary——球体求交属通用图形学术语。本次仅记录原理，代码评审中发现的实现缺陷按代码缺陷处理，不进入知识层。
