#pragma once

#include <aengine/core/result.hpp>

#include <nlohmann/json.hpp>

#include <cstdint>
#include <exception>
#include <string>
#include <string_view>

namespace alpha::application {

enum class RunMode : std::uint8_t { Sandbox, Benchmark };

struct RunConfig {
    std::uint32_t schema_version{1U};
    RunMode mode{RunMode::Sandbox};
    std::string content_manifest{"content/reference/reference.acontent"};
    std::string camera_path{"content/reference/camera-path.json"};
    std::string adapter{"auto"};
    std::string shader_root{"shaders/packages"};
    std::string output_root{"runs"};
    std::uint32_t width{1280U};
    std::uint32_t height{720U};
    std::uint32_t frames_in_flight{2U};
    bool vsync{true};
    bool allow_tearing{false};
    bool debug_layer{true};
    bool gpu_validation{false};
    bool dred{true};
    bool debug_ui{true};
    bool require_debug_ui{false};
    std::uint32_t texture2d_descriptors{4096U};
    std::uint32_t sampler_descriptors{64U};
    std::uint32_t frame_descriptors{1024U};

    [[nodiscard]] static Result<RunConfig> from_json(std::string_view text) {
        try {
            const auto json = nlohmann::json::parse(text);
            RunConfig result;
            result.schema_version = json.value("schema_version", result.schema_version);
            const std::string mode = json.value("mode", std::string{"sandbox"});
            if (mode == "sandbox") {
                result.mode = RunMode::Sandbox;
            } else if (mode == "benchmark") {
                result.mode = RunMode::Benchmark;
            } else {
                return Error{ErrorCode::InvalidArgument, "mode must be sandbox or benchmark"};
            }

            result.content_manifest = json.value("content_manifest", result.content_manifest);
            result.camera_path = json.value("camera_path", result.camera_path);
            result.adapter = json.value("adapter", result.adapter);
            result.shader_root = json.value("shader_root", result.shader_root);
            result.output_root = json.value("output_root", result.output_root);
            result.width = json.value("width", result.width);
            result.height = json.value("height", result.height);
            result.frames_in_flight = json.value("frames_in_flight", result.frames_in_flight);
            result.vsync = json.value("vsync", result.vsync);
            result.allow_tearing = json.value("allow_tearing", result.allow_tearing);
            result.debug_layer = json.value("debug_layer", result.debug_layer);
            result.gpu_validation = json.value("gpu_validation", result.gpu_validation);
            result.dred = json.value("dred", result.dred);
            result.debug_ui = json.value("debug_ui", result.debug_ui);
            result.require_debug_ui = json.value("require_debug_ui", result.require_debug_ui);
            result.texture2d_descriptors = json.value(
                "texture2d_descriptors", result.texture2d_descriptors);
            result.sampler_descriptors = json.value(
                "sampler_descriptors", result.sampler_descriptors);
            result.frame_descriptors = json.value(
                "frame_descriptors", result.frame_descriptors);

            if (result.mode == RunMode::Benchmark) {
                result.debug_ui = false;
                result.vsync = false;
            }
            if (const auto validation = result.validate(); !validation) {
                return validation.error();
            }
            return result;
        } catch (const std::exception& exception) {
            return Error{ErrorCode::InvalidArgument, std::string{"invalid run configuration: "} + exception.what()};
        }
    }

    [[nodiscard]] Result<void> validate() const {
        if (schema_version != 1U) {
            return Error{ErrorCode::InvalidArgument, "unsupported run configuration schema"};
        }
        if (width == 0U || height == 0U) {
            return Error{ErrorCode::InvalidArgument, "render extent must be non-zero"};
        }
        if (frames_in_flight != 2U) {
            return Error{ErrorCode::InvalidArgument, "MVP1 requires exactly two frames in flight"};
        }
        if (vsync && allow_tearing) {
            return Error{ErrorCode::InvalidArgument, "vsync and tearing are mutually exclusive"};
        }
        if (texture2d_descriptors != 4096U || sampler_descriptors != 64U ||
            frame_descriptors != 1024U) {
            return Error{ErrorCode::InvalidArgument, "MVP1 descriptor capacities are fixed at Texture2D=4096, Sampler=64, Frame=1024"};
        }
        return {};
    }

    [[nodiscard]] std::string to_json() const {
        const nlohmann::json json{
            {"schema_version", schema_version},
            {"mode", mode == RunMode::Benchmark ? "benchmark" : "sandbox"},
            {"content_manifest", content_manifest},
            {"camera_path", camera_path},
            {"adapter", adapter},
            {"shader_root", shader_root},
            {"output_root", output_root},
            {"width", width},
            {"height", height},
            {"frames_in_flight", frames_in_flight},
            {"vsync", vsync},
            {"allow_tearing", allow_tearing},
            {"debug_layer", debug_layer},
            {"gpu_validation", gpu_validation},
            {"dred", dred},
            {"debug_ui", debug_ui},
            {"require_debug_ui", require_debug_ui},
            {"texture2d_descriptors", texture2d_descriptors},
            {"sampler_descriptors", sampler_descriptors},
            {"frame_descriptors", frame_descriptors},
        };
        return json.dump(2);
    }
};

}  // namespace alpha::application
