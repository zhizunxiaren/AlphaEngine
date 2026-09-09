#include "test_support.hpp"

int main() {
    int failures = 0;

    for (const auto& test : alpha::test::registry()) {
        try {
            test.function();
            std::cout << "[PASS] " << test.name << '\n';
        } catch (const std::exception& error) {
            ++failures;
            std::cerr << "[FAIL] " << test.name << ": " << error.what() << '\n';
        } catch (...) {
            ++failures;
            std::cerr << "[FAIL] " << test.name << ": unknown exception\n";
        }
    }

    std::cout << alpha::test::registry().size() - static_cast<std::size_t>(failures)
              << '/' << alpha::test::registry().size() << " tests passed\n";
    return failures == 0 ? 0 : 1;
}
