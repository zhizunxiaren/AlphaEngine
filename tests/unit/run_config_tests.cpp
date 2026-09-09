#include "test_support.hpp"

#include <aengine/application/run_config.hpp>

#include <string>

namespace {

using alpha::application::RunConfig;
using alpha::application::RunMode;

ALPHA_TEST("benchmark configuration is deterministic and cannot enable debug UI") {
    const auto parsed = RunConfig::from_json(R"({
        "schema_version": 1,
        "mode": "benchmark",
        "width": 1920,
        "height": 1080,
        "frames_in_flight": 2,
        "vsync": false,
        "allow_tearing": true,
        "debug_ui": true
    })");

    ALPHA_REQUIRE(parsed.has_value());
    ALPHA_REQUIRE_EQ(parsed.value().mode, RunMode::Benchmark);
    ALPHA_REQUIRE(!parsed.value().debug_ui);
    ALPHA_REQUIRE_EQ(parsed.value().texture2d_descriptors, 4096U);
    ALPHA_REQUIRE_EQ(parsed.value().sampler_descriptors, 64U);
    ALPHA_REQUIRE_EQ(parsed.value().frame_descriptors, 1024U);
}

ALPHA_TEST("configuration rejects unsupported frame count and present conflicts") {
    const auto frame_count = RunConfig::from_json(R"({
        "schema_version": 1,
        "frames_in_flight": 3
    })");
    const auto present_conflict = RunConfig::from_json(R"({
        "schema_version": 1,
        "vsync": true,
        "allow_tearing": true
    })");
    const auto descriptor_mismatch = RunConfig::from_json(R"({
        "schema_version": 1,
        "texture2d_descriptors": 2048
    })");

    ALPHA_REQUIRE(!frame_count.has_value());
    ALPHA_REQUIRE_EQ(frame_count.error().code, alpha::ErrorCode::InvalidArgument);
    ALPHA_REQUIRE(!present_conflict.has_value());
    ALPHA_REQUIRE(!descriptor_mismatch.has_value());
}

ALPHA_TEST("frozen configuration serializes without environment data") {
    const auto parsed = RunConfig::from_json(R"({"schema_version":1})");

    ALPHA_REQUIRE(parsed.has_value());
    const std::string frozen = parsed.value().to_json();
    ALPHA_REQUIRE(frozen.find("schema_version") != std::string::npos);
    ALPHA_REQUIRE(frozen.find("environment") == std::string::npos);
}

}  // namespace
