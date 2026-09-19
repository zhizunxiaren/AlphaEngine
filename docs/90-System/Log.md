---
title: Wiki Log
aliases:
  - 维护日志
type: log
status: active
area: documentation
parent: "[[90-System/LLM-Wiki-Obsidian]]"
updated: 2026-09-19
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

## [2026-09-16] knowledge | 新建着色与光照 Concept 笔记：光照模型

在知识层新建 [[20-Knowledge/Concepts/光照模型]]（第三个 `concept` 笔记），承载**着色与光照**主题。全文按**三层抽象**组织，以消除术语复用造成的混乱：L1 反射项（BRDF）、L2 光照模型（着色方程）、L3 着色频率；并指出 `Phong` 一词同时占据三层是混淆的结构性来源，据此澄清「Phong 与 Lambert 是超集而非替代」以及「`Phong shading` 与 Phong 光照模型正交」两处常见误判。

第 2 节记录朗伯余弦定律的**入射端推导**（`E = E⊥ · cosθ`，说明 `N·L` 是投影面积的几何必然而非模型假设）、漫反射 BRDF `f_d = ρ/π` 的能量守恒推导（半球余弦积分 `∫cosθ dω = π`），以及 `1/π` 在实时渲染中「保留物理量 / 折进光源强度」两种等价约定的判据与混用后果（亮度差 π 倍）。第 3～4 节记录 Phong 三项结构、反射向量 `R = 2(N·L)N - L` 的推导与方向约定、Blinn-Phong 半角向量 `H = normalize(L+V)`、夹角关系 `β = α/2`、二阶展开得出的近似指数换算 `n′ ≈ 4n`、掠射角行为差异，以及 `L + V` 退化条件的可达性论证。第 5 节给出 Flat / Gouraud / Phong shading 对比与组合合法性表。第 6 节记录 Phong 的五项物理缺陷、Cook-Torrance 结构（`D` / `G` / `F` 的职责与常用实现）与能量守恒约束 `k_d = (1 - F)(1 - metallic)`。

依据：本页数学为**图形学标准结论**，属内部推导，未设来源卡片；引用 Phong (1975)、Blinn (1977)、Cook-Torrance (1982)、Fisher-Woo (1994)、*Real-Time Rendering* 4e、*Physically Based Rendering* 4e 共 6 份外部文献，来源卡待渲染参考基线确认后补建。第 7 节工程建议（`1/π` 约定与色彩空间先行固定、Phong 系列保留为对照实现、直接进入 Cook-Torrance）属**内部推导**，未预设 Outcomes 结论，`status` 记为 `working`。[[20-Knowledge/00-Knowledge-MOC|知识 MOC]] 概念节已同步登记并扩充后续登记提示（新增颜色空间、采样与积分两个候选问题域）。**未登记 Glossary**——光照模型属通用图形学术语而非项目专有名词，与既有判断一致。

## [2026-09-16] knowledge | 光照模型扩充：补齐图示与内容缺口，修正一处文献引用

对 [[20-Knowledge/Concepts/光照模型]] 做全量扩充（约 524 → 830 行），补足首版在**图示**与**内容完整性**上的缺口，并修正一处文献引用错误。

**新增图示**（首版仅 1 张 mermaid）：朗伯余弦定律的光斑投影对比（2.2）、反射向量 `R` 的镜像关系（3.4）、`L/R/V/H` 方位角轴与 `β = α/2` 的数值对照（4.2）、Flat / Gouraud / Phong 三种着色频率的求值点对比（6.1）、微表面朝向与高光波瓣形状（7.3）、三项结构分解（3.1）、演进链（7.1）。

**补齐的内容缺口**：

- 新增 2.1「辐射度量与符号约定」（`Φ` / `E` / `I` / `L` 的定义、量纲与相互关系），并说明渲染方程求解 `L` 而非 `E` 的原因是 **radiance 沿光线在无遮挡真空中不变**——这是光线追踪得以成立的前提；
- 2.3 补 BRDF 的正式定义 `f_r = dL_o / dE_i`、量纲 `1/sr`、互易性与能量守恒两条性质，使 `1/π` 的来源从「能量守恒的结果」升级为「`sr` 量纲换算的必然」；
- 2.4 渲染方程补 `L_e` 自发光项与可见性项 `V`（即阴影项），并指出 Phong 系列不含 `V`；
- 1.4 新增 Lambert / Phong / Blinn-Phong 三者**完整着色方程并排对照表**（原先只有 L1 层级的项级形式）；
- 3.5 补多光源求和的完整式子，及「环境光不可放进光源循环」的说明；
- 4.4 补 Blinn-Phong 的完整式，消除首版只给 Phong 完整式的不对称；
- **新增第 5 章「光源类型与距离衰减」**：方向光 / 点光源 / 聚光灯的分类、`E = I/r²` 的能量守恒推导、`ε` 软化保护、聚光灯内外锥的 `smoothstep` 与幂次两种写法；
- 7.4 给出 GGX / Smith / Schlick 的具体公式与 `F0` 典型取值表（首版只列名词）；
- 7.5 新增粗糙度与 Blinn-Phong 指数的换算 `n = 2/roughness⁴ − 2`（含反解与两端失效条件）；
- 8.1 改写为**对接 `Engine/` 现有骨架**：接入点定位为 `camera.h::ray_color` 中 `world.hit` 成功后的分支（当前为 `0.5 * (rec.normal + color(1,1,1))` 法线可视化），列出已就绪的几何量（`rec.p` / `rec.normal` / `rec.front_face`）与待引入的 `material` 抽象及光源列表，并指出三个连带事项：次级光线需正下界 `t_min` 以避免自交噪点、`get_ray` 返回的方向未归一化、`sample_per_pixel` 可复用于软阴影。

**修正的文献错误**：首版将 Fisher & Woo (1994) 记为 *"R.E. versus H.V. in Specular Reflection"*，**标题与出处均有误**。核实后为 **Fisher, F., Woo, A. (1994). "R.E versus N.H Specular Highlights". Graphics Gems IV, Academic Press, 388–400**，其核心结论 `(N·H)^4r ≈ (R·E)^r` 正是 4.3 节 `n′ ≈ 4n` 的原始出处——该节据此从「内部推导」改标为「文献结论」。同时补入 Schlick (1994) *A Fast Alternative to Phong's Specular Model*（Graphics Gems IV, 385–387）与 Karis (2013) *Specular BRDF Reference*（`n = 2/α² − 2` 的 UE4 来源），依据文献由 6 份增至 8 份。

`status` 仍为 `working`。第 8 节工程建议为内部推导，未预设 Outcomes 结论。[[20-Knowledge/00-Knowledge-MOC|知识 MOC]] 概念节登记描述已同步更新；笔记边界表新增「微表面理论的完整推导与各 NDF 对比」待建项。未登记 Glossary——光照模型属通用图形学术语。

## [2026-09-17] knowledge | 新建光传输 Concept 笔记：路径追踪与蒙特卡洛积分

在知识层新建 [[20-Knowledge/Concepts/路径追踪与蒙特卡洛积分]]，承载**光传输与采样**主题（第 4 个 `concept` 笔记）。收录四组内容：第 1 节反向追踪（正向采样的效率死路、Helmholtz 互易性、`ray_color` 返回值始终是入射光量 `L_in`、球面是无状态查询函数而非被绘制对象）；第 2 节蒙特卡洛估计（Lambertian 半球积分、余弦加权采样令 `cosθ/π` 完全抵消、估计器与代码逐项对应表）；第 3 节递归形态（线性递归而非树、两个终止条件的性质差异、`albedoⁿ` 衰减与有效弹射次数、等价循环写法）；第 4 节六条边界与陷阱（"交点发光"的误解、退化方向、`t_min` 的语义、凸体自遮挡、`σ/√N` 噪声、平滑来自几何连续性）。

**归属决策**：新建独立笔记，而非并入 [[20-Knowledge/Concepts/射线与几何体求交]] 或 [[20-Knowledge/Concepts/光照模型]]。依据是这两页各自的粒度规则都把「采样与积分」列为可独立成页的问题域，且 [[90-System/Schema|Schema]] 要求「一份知识笔记只综合一个稳定问题域」——光传输、求交数学、着色模型属三个问题域。三页已在「笔记边界」表中互相登记分工。

**与既有笔记的边界**：[[20-Knowledge/Concepts/光照模型]] 第 8 节从**着色侧**列出接入点与连带事项（`t_min` 正下界、方向未归一化、`sample_per_pixel` 复用），本页从**光传输侧**解释这些事项的成因（`t_min` 是 `t` 而非距离，因方向未归一化；噪声来自 `σ/√N`）。两者互补不重复。

依据：本页数学为**通用渲染理论结论**（渲染方程、蒙特卡洛估计），属内部推导，未设来源卡片；实现形态参考 RTIOW（外部链接）。未涉及 Outcomes 变更；未登记 Glossary。第 5 节记录的当前状态（场景无独立光源、`albedo` 为标量 `0.5`、材质未抽象）与演进方向为**内部推导**，待材质系统落地后复核。

## [2026-09-19] outcomes + knowledge | 登记首个可运行实现现状，闭合代码与文档的追溯缺口

**缺口**：本页最后一条记录停在 2026-09-17 的知识笔记，其后 `fromzero` 上的三次实现提交——`9525467`（光追骨架首版）、`b7256ec`（材质抽象与多重采样路径追踪）、`bd71c56`（可定位相机与景深）——均未登记。结果是 [[10-Outcomes/10-AlphaEngine]] 仍显示「引擎目标待确认、尚无任何实现」，而仓库中已存在可运行的路径追踪实现，追溯链在成果层断裂。本次一并闭合。

**新增**：在 [[10-Outcomes/10-AlphaEngine]] 新增「实现现状（学习性过渡基线）」一节，作为**事实登记的收口位置**，登记语言与构建基线（C++ / MSVC / `Engine.slnx` + `Engine.vcxproj`，输出目录 `build/`）、第三方依赖（[[30-Sources/stb-图像解码库|stb_image]]，按 [[20-Knowledge/Tooling/第三方依赖引入|第三方依赖引入]] 约定置于 `Engine/third_party/stb/`；**核对发现其尚未启用**——只在工程文件中登记为项目项，无翻译单元定义 `STB_IMAGE_IMPLEMENTATION`，也无调用点）、已具备能力（可定位相机与景深、`material` 抽象、递归路径追踪、像素多重采样、gamma 2 编码）、已知差距（无显式光源、无直接光采样、方向未归一化、无俄罗斯轮盘赌、无 BVH、无实时窗口）以及与长期目标的关系。

该节**显式声明不构成技术栈决策**：底层图形 API、渲染架构、语言标准与首版里程碑四项仍属 [[10-Outcomes/10-AlphaEngine]] 待决项，本节只防止文档与代码真实状态脱节，首版基线确认后由对应里程碑 owner note 取代。这与本页既有取向一致——不把过渡实现升格为项目合同。

**复核的两处现状描述**（知识点本身未变，只更新对仓库的观测）：

- [[20-Knowledge/Concepts/路径追踪与蒙特卡洛积分]] 第 5 节原按 RTIOW 第九章阶段描述「当前状态」（`albedo` 硬编码标量 `0.5`、材质未抽象），已将原三点改标为**起点状态**，并补登当前状态（反射率由材质携带、显式光源仍未引入）与演进方向表的落地情况。
- [[20-Knowledge/Concepts/光照模型]] 第 8.1 节原称「尚无材质抽象、着色停在法线可视化」，已改为反映 `material` 抽象（`lambertian` / `metal` / `dielectric`，含反射、折射与 Schlick 近似）与递归累积路径已落地，着色入口仍缺直接光采样；并标注 §8.3 第 5 条建议（`material` 抽象宜早不宜晚）已执行。
- [[20-Knowledge/Tooling/第三方依赖引入]] 第 3 节新增「接入状态」列。核对代码时发现该表原先只登记了依赖已引入，**未反映其实际尚未启用**：`Engine/third_party/stb/stb_image.h` 已就位并在 `Engine.vcxproj` 中登记为项目项，但 §4 第 1 条要求的实现翻译单元（定义 `STB_IMAGE_IMPLEMENTATION` 的独立 TU）尚不存在，也未有任何调用点——即当前编译产物中不含该库。这是"约定已立法、执行未落地"的典型偏差，已如实登记，不代表约定本身需要修改。

**同步**：[[00-Home]] 的「当前焦点」由「框架初始化完成，下一步定义目标」改为反映「框架已建立、仓库已有可运行过渡实现、下一动作仍是固化首版基线」；[[10-Outcomes/10-AlphaEngine]] 的状态行与更新日期同步；[[90-System/Schema]] 第 7 节修正一处误植（「个人 Dear ImGui/Obsidian 布局」→「个人 IDE/Obsidian 布局」），该词与上下文无关，属笔误。

**历史完整性**：`bd71c56` 即原 `e7dd89a`。原提交信息为 CP936/UTF-8 双重编码产生的乱码（`瀹屾垚鍙畾浣嶇浉鏈?`），在推送前以 `git commit --amend` 重写为「完成可定位相机与景深，对齐官方 InOneWeekend 13.x」；tree hash `4bf8182` 未变，内容零改动。**后续任何引用该提交的旧哈希需改用 `bd71c56`。**
