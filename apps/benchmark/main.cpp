#include <aengine/application/run_application.hpp>

int main(int argc, char** argv) {
    return alpha::application::run_application(
        alpha::application::RunMode::Benchmark, argc, argv);
}
