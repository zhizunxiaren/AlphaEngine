---
title: C++ 标准与 cppreference
aliases:
  - cppreference
  - ISO C++ 标准
  - C++ Core Guidelines
type: source
status: captured
area: sources
parent: "[[30-Sources/00-Sources-MOC]]"
related:
  - "[[20-Knowledge/Concepts/C++-语言特性实践]]"
captured: 2026-09-11
updated: 2026-09-11
tags:
  - source
  - cpp
  - language
---

# Source Record: C++ 标准与 cppreference

- **来源**：
  - cppreference.com — <https://en.cppreference.com/w/>
  - ISO C++ 标准（C++11 / 14 / 17 / 20 / 23）
  - C++ Core Guidelines — <https://isocpp.github.io/CppCoreGuidelines/CppCoreGuidelines>
- **类型**：语言规范与权威参考
- **采集日期**：2026-09-11
- **本地状态**：来源记录；不复制原文，仅登记范围、抽取事实与适用边界

## 采集范围

| 主题 | 标准演进 |
|---|---|
| 编译期求值 | `constexpr` 变量与函数（C++11）、放宽为多语句/循环（C++14）、`if constexpr`（C++17）、`consteval` 与 `constinit`（C++20）、`std::is_constant_evaluated`（C++20） |
| 异常契约 | `noexcept` 说明符与运算符（C++11）、成为函数类型的一部分（C++17） |
| 翻译单元与链接 | `inline` 函数可跨 TU 定义并由链接器合并、`constexpr` 函数隐含 `inline`（C++11）、`inline` 变量（C++17）、命名空间作用域 `const` 变量默认内部链接、ADL 参数依赖查找 |

## 抽取事实

用于 [[20-Knowledge/Concepts/C++-语言特性实践]]：

1. `constexpr` 变量隐含 `const`；`const` 变量**不**隐含 `constexpr`。
2. `constexpr` 静态数据成员自 C++17 起隐含 `inline`；命名空间作用域的 `constexpr` 变量因 `const` 而具有内部链接。
3. `constexpr` 函数是否在编译期求值，完全由调用处实参能否构成常量表达式决定；`consteval` 强制编译期，不满足即编译失败。
4. `constinit` 只约束静态初始化时机，不要求变量为 `const`。
5. 常量求值过程中出现未定义行为，会使该表达式不是常量表达式，从而编译失败。
6. `noexcept` 是编译期契约；函数违反该契约时调用 `std::terminate`，不保证栈展开。
7. 自 C++17 起 `noexcept` 属于函数类型的一部分，影响函数指针类型与模板推导。
8. 标准库扩容路径依赖 `std::move_if_noexcept`：仅当移动构造为 `noexcept`（或类型不可复制）时才移动元素。
9. 编译器一次只处理一个翻译单元（预处理后的单个源文件）；头文件被文本复制进每个包含它的 TU，因此同一函数体可能在各 TU 中各有一份定义。
10. `inline` 函数允许在多个 TU 中定义，由链接器保留一份；类内定义的成员函数隐含 `inline`；`constexpr` 函数隐含 `inline`。
11. 命名空间作用域的 `const` 变量默认具有内部链接（等价于 `static`）；加 `inline` 后恢复外部链接与全局唯一。
12. ADL（参数依赖查找）使函数调用的候选集合包含实参类型所属的命名空间，因此非成员运算符必须与类型定义在同一命名空间才能被调用点找到。

## 适用边界

- 本卡是通用语言依据，**不代表 fromzero 已选定语言标准**；标准基线与工具链属 [[10-Outcomes/10-AlphaEngine]] 待决项，决策落位后本文档的可用特性范围才被约束。
- 标准库的异常安全保证在标准中有规定，但具体实现（如扩容策略、`std::terminate` 的栈展开行为）以实现与平台为准，关键结论需在当前工具链实测。
- 语言标准文本为付费获取；本卡以 cppreference 与 Core Guidelines 作为可公开核对的入口。
