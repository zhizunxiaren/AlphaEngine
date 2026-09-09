#pragma once

#include <exception>
#include <functional>
#include <iostream>
#include <sstream>
#include <string>
#include <string_view>
#include <utility>
#include <vector>

namespace alpha::test {

using TestFunction = void (*)();

struct Case {
    std::string_view name;
    TestFunction function;
};

inline std::vector<Case>& registry() {
    static std::vector<Case> cases;
    return cases;
}

struct Registration {
    Registration(std::string_view name, TestFunction function) {
        registry().push_back(Case{name, function});
    }
};

class Failure final : public std::exception {
public:
    explicit Failure(std::string message) : message_(std::move(message)) {}
    [[nodiscard]] const char* what() const noexcept override { return message_.c_str(); }

private:
    std::string message_;
};

template <typename Actual, typename Expected>
void require_equal(
    const Actual& actual,
    const Expected& expected,
    std::string_view actual_expression,
    std::string_view expected_expression,
    std::string_view file,
    int line) {
    if (!(actual == expected)) {
        std::ostringstream message;
        message << file << ':' << line << ": expected " << actual_expression
                << " == " << expected_expression;
        throw Failure(message.str());
    }
}

inline void require(
    bool condition,
    std::string_view expression,
    std::string_view file,
    int line) {
    if (!condition) {
        std::ostringstream message;
        message << file << ':' << line << ": expected " << expression;
        throw Failure(message.str());
    }
}

}  // namespace alpha::test

#define ALPHA_TEST_CONCAT_IMPL(a, b) a##b
#define ALPHA_TEST_CONCAT(a, b) ALPHA_TEST_CONCAT_IMPL(a, b)
#define ALPHA_TEST(name)                                                        \
    static void ALPHA_TEST_CONCAT(alpha_test_case_, __LINE__)();                \
    static ::alpha::test::Registration                                          \
        ALPHA_TEST_CONCAT(alpha_test_registration_, __LINE__){                  \
            name, &ALPHA_TEST_CONCAT(alpha_test_case_, __LINE__)};              \
    static void ALPHA_TEST_CONCAT(alpha_test_case_, __LINE__)()

#define ALPHA_REQUIRE(expression)                                               \
    ::alpha::test::require(                                                     \
        static_cast<bool>(expression), #expression, __FILE__, __LINE__)

#define ALPHA_REQUIRE_EQ(actual, expected)                                      \
    ::alpha::test::require_equal(                                               \
        (actual), (expected), #actual, #expected, __FILE__, __LINE__)
