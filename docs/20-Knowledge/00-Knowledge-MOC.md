---
title: AlphaEngine 知识 MOC
aliases:
  - Knowledge MOC
  - 知识地图
type: moc
status: active
area: knowledge
parent: "[[00-Home]]"
related:
  - "[[10-Outcomes/10-AlphaEngine]]"
  - "[[90-System/LLM-Wiki-Obsidian]]"
updated: 2026-10-28
tags:
  - moc
  - reference
  - knowledge-base
---

# AlphaEngine 知识 MOC

> [!info] 使用方式
> 从 [[00-Home]] 进入成果页；需要理解设计理由、已确认基线或概念关系时再进入本页。本层是 LLM 综合后的可维护知识，不是原始资料堆。

## 决策与基线

> [!note] 空状态
> fromzero 重启尚未确认任何长期决策。首版技术栈与里程碑基线一旦确认，作为 `decision` 笔记写入 [[20-Knowledge/Decisions/]] 并在本节登记。

- **项目术语** → [[20-Knowledge/Glossary]]

## 概念

- [[20-Knowledge/Concepts/图形学基础与渲染流程|图形学基础与渲染流程]] —— 初学者入口，12 章、66 个概念、交互流程与 78 张复习卡；现代图形学仅列 TODO。已有求交、光传输、光照专题继续持有深入推导。

- [[20-Knowledge/Concepts/C++-语言特性实践|C++ 语言特性实践]] —— C++ 语言层小知识点聚合页（`constexpr` 家族与编译期求值、`noexcept` 与异常契约、翻译单元与链接性）。**同类知识点在本页追加章节，不新建文档。**
- [[20-Knowledge/Concepts/射线与几何体求交|射线与几何体求交]] —— 渲染数学聚合页（球体求交的推导、两根含义与范围筛选、法线朝向；**平面与有限四边形求交**：`t` 只定位到无限大平面、等式解 `t` 与不等式判 `(α, β)` 的两步结构及其代数必然性、算例与陷阱）。**同类数学知识点在本页追加章节。**
- [[20-Knowledge/Concepts/对偶基与平面坐标|对偶基与平面坐标]] —— 坐标系与基专题（对偶基的四条约束与唯一性、Cramer 法则到点积的改写、`u* = ∇α` 与长度 `1/h_u` 的「格数不是距离」、三维叉积形式与 `B⁻¹` 语言、**四个工程落点与可手算示例**：`quad.h` 的 UV 反解 / 三角形重心坐标 / 平面求交 / mip 导数，7.1 另含**叉积形式 `w = n/(n·n)` 与预算对偶基的等价性**及两种写法的取舍，以及退化判据 `sin²θ` 与五个常见误解）。**同类「基与坐标」知识点在本页追加章节。**
- [[20-Knowledge/Concepts/路径追踪与蒙特卡洛积分|路径追踪与蒙特卡洛积分]] —— 光传输与采样聚合页（反向追踪与光路可逆、蒙特卡洛估计与余弦加权、递归形态、噪声与陷阱）。**同类主题在本页追加章节。**
- [[20-Knowledge/Concepts/光照模型|光照模型]] —— 着色与光照聚合页（BRDF / 光照模型 / 着色频率三层分离与三者完整式对照、辐射度量符号约定与朗伯余弦定律、`1/π` 的两种工程约定、Phong 与 Blinn-Phong 的向量推导、方向光 / 点光源 / 聚光灯的衰减模型、Flat / Gouraud / Phong shading 对比、Cook-Torrance 的 `D`/`F`/`G` 具体形式与粗糙度换算）。**同类着色知识点在本页追加章节。**

> [!note] 后续登记
> 形成独立、可复用的技术问题域时（资源绑定、GPU Barrier、Render Graph、颜色空间、采样与积分等）才新建 `concept` 笔记并登记于此。

## 工具与约定

- [[20-Knowledge/Tooling/第三方依赖引入|第三方依赖引入约定]] —— 依赖引入三步流程、`third_party` 目录与修改约定、单头文件库接入方式、风险登记。
- [[20-Knowledge/Tooling/教学演示页|教学演示页]] —— `docs/demos/` 两页（光线追踪 / 光栅化）的清单、与三个 Concept 页的映射、四层校验约定（静态 / 独立 / 负向 / 冒烟）与「每条断言都要有能触发它的缺陷」规则。**演示资产，不构成 Outcomes 结论。**

## 上游与下游

- **追溯原始依据** → [[30-Sources/00-Sources-MOC|资料源 MOC]]
- **查看项目成果** → [[10-Outcomes/10-AlphaEngine|项目系统与路线]]
- **维护融合系统** → [[90-System/LLM-Wiki-Obsidian|LLM Wiki × Obsidian 工作模式]]
- **查看维护历史** → [[90-System/Log]]

## 知识层规则

1. 一份知识笔记只综合一个稳定问题域，并链接其来源与受影响成果。
2. 被成果采用的选择写为 Decision；可复用技术解释写为 Concept；名词统一进入 Glossary。
3. 结论变化时先更新知识笔记，再同步对应 Outcomes owner note，并在 [[90-System/Log]] 记录实质变化。
4. 不在本层复制 [[10-Outcomes/10-AlphaEngine|项目路线]]；用章节链接指向唯一结论。
