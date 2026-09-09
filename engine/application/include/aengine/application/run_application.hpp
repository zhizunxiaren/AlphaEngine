#pragma once

#include <aengine/application/run_config.hpp>

namespace alpha::application {

[[nodiscard]] int run_application(RunMode required_mode, int argc, char** argv);

}  // namespace alpha::application
