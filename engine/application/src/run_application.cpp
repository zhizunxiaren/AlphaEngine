#include <aengine/application/run_application.hpp>

#include <aengine/content/content.hpp>
#include <aengine/debug_ui/debug_ui.hpp>
#include <aengine/graphics/d3d12/d3d12_graphics.hpp>
#include <aengine/platform/platform_host.hpp>
#include <aengine/renderer/forward_renderer.hpp>
#include <aengine/scene/scene.hpp>

#include <nlohmann/json.hpp>
#include <spdlog/spdlog.h>

#include <algorithm>
#include <array>
#include <chrono>
#include <cstddef>
#include <cstdint>
#include <filesystem>
#include <fstream>
#include <cmath>
#include <iomanip>
#include <iostream>
#include <memory>
#include <map>
#include <numeric>
#include <sstream>
#include <string>
#include <string_view>
#include <thread>
#include <vector>

namespace alpha::application {
namespace {

using Clock = std::chrono::steady_clock;

struct CommandLine {
    std::filesystem::path config_path;
    std::filesystem::path output_root;
    std::uint32_t frame_limit{};
    bool warp{};
    bool headless{};
};

struct CameraKeyframe {
    double time{};
    scene::Vec3 position{};
    scene::Vec3 target{};
};

struct CameraPath {
    double duration_seconds{};
    bool loop{};
    std::vector<CameraKeyframe> keyframes;
};

[[nodiscard]] CommandLine parse_command_line(
    RunMode mode,
    int argc,
    char** argv) {
    CommandLine result;
    result.config_path = mode == RunMode::Benchmark
        ? "config/benchmark.json"
        : "config/sandbox.json";
    result.headless = mode == RunMode::Benchmark;
    for (int index = 1; index < argc; ++index) {
        const std::string_view argument = argv[index];
        if (argument == "--warp") result.warp = true;
        else if (argument == "--headless") result.headless = true;
        else if (argument == "--frames" && index + 1 < argc) {
            result.frame_limit = static_cast<std::uint32_t>(std::stoul(argv[++index]));
        } else if (argument == "--output" && index + 1 < argc) {
            result.output_root = argv[++index];
        } else if (!argument.starts_with("--")) {
            result.config_path = argument;
        }
    }
    return result;
}

[[nodiscard]] std::string read_text(const std::filesystem::path& path) {
    std::ifstream stream(path, std::ios::binary);
    return stream
        ? std::string{std::istreambuf_iterator<char>{stream}, {}}
        : std::string{};
}

[[nodiscard]] std::vector<std::byte> read_binary(const std::filesystem::path& path) {
    std::ifstream stream(path, std::ios::binary | std::ios::ate);
    if (!stream) return {};
    const auto size = stream.tellg();
    if (size <= 0) return {};
    std::vector<std::byte> result(static_cast<std::size_t>(size));
    stream.seekg(0);
    stream.read(reinterpret_cast<char*>(result.data()), size);
    return stream ? result : std::vector<std::byte>{};
}

[[nodiscard]] Result<CameraPath> load_camera_path(const std::filesystem::path& path) {
    try {
        const std::string text = read_text(path);
        if (text.empty()) {
            return Error{ErrorCode::InvalidArgument, "camera path does not exist"};
        }
        const auto json = nlohmann::json::parse(text);
        if (json.value("schema_version", 0U) != 1U) {
            return Error{ErrorCode::InvalidArgument, "unsupported camera path schema"};
        }
        CameraPath result;
        result.duration_seconds = json.at("duration_seconds").get<double>();
        result.loop = json.value("loop", false);
        for (const auto& source : json.at("keyframes")) {
            const auto position = source.at("position").get<std::array<float, 3>>();
            const auto target = source.at("target").get<std::array<float, 3>>();
            result.keyframes.push_back({
                source.at("time").get<double>(),
                {position[0], position[1], position[2]},
                {target[0], target[1], target[2]}});
        }
        if (!std::isfinite(result.duration_seconds) || result.duration_seconds <= 0.0 ||
            result.keyframes.size() < 2U || result.keyframes.front().time != 0.0 ||
            std::abs(result.keyframes.back().time - result.duration_seconds) > 1.0e-6) {
            return Error{ErrorCode::InvalidArgument, "camera path duration/keyframe endpoints are invalid"};
        }
        for (std::size_t index = 0U; index < result.keyframes.size(); ++index) {
            const auto& key = result.keyframes[index];
            const std::array<float, 6> values{
                key.position.x, key.position.y, key.position.z,
                key.target.x, key.target.y, key.target.z};
            if (!std::isfinite(key.time) ||
                (index > 0U && key.time <= result.keyframes[index - 1U].time) ||
                std::ranges::any_of(values, [](float value) { return !std::isfinite(value); })) {
                return Error{ErrorCode::InvalidArgument, "camera path keyframes are not finite and strictly ordered"};
            }
        }
        return result;
    } catch (const std::exception& exception) {
        return Error{ErrorCode::InvalidArgument, std::string{"invalid camera path: "} + exception.what()};
    }
}

[[nodiscard]] scene::Vec3 subtract(scene::Vec3 left, scene::Vec3 right) noexcept {
    return {left.x - right.x, left.y - right.y, left.z - right.z};
}

[[nodiscard]] scene::Vec3 normalize(scene::Vec3 value) noexcept {
    const float length = std::sqrt(value.x * value.x + value.y * value.y + value.z * value.z);
    return length > 1.0e-6F
        ? scene::Vec3{value.x / length, value.y / length, value.z / length}
        : scene::Vec3{};
}

[[nodiscard]] scene::Vec3 cross(scene::Vec3 left, scene::Vec3 right) noexcept {
    return {
        left.y * right.z - left.z * right.y,
        left.z * right.x - left.x * right.z,
        left.x * right.y - left.y * right.x};
}

[[nodiscard]] float dot(scene::Vec3 left, scene::Vec3 right) noexcept {
    return left.x * right.x + left.y * right.y + left.z * right.z;
}

[[nodiscard]] scene::CameraState camera_at(
    const CameraPath& path,
    double time,
    float aspect) noexcept {
    if (path.loop) time = std::fmod(time, path.duration_seconds);
    time = std::clamp(time, 0.0, path.duration_seconds);
    auto upper = std::ranges::upper_bound(path.keyframes, time, {}, &CameraKeyframe::time);
    if (upper == path.keyframes.begin()) ++upper;
    if (upper == path.keyframes.end()) upper = path.keyframes.end() - 1;
    const auto& right = *upper;
    const auto& left = *(upper - 1);
    const float blend = static_cast<float>((time - left.time) / (right.time - left.time));
    const auto lerp = [blend](scene::Vec3 a, scene::Vec3 b) {
        return scene::Vec3{
            std::lerp(a.x, b.x, blend),
            std::lerp(a.y, b.y, blend),
            std::lerp(a.z, b.z, blend)};
    };
    const scene::Vec3 eye = lerp(left.position, right.position);
    const scene::Vec3 target = lerp(left.target, right.target);
    const scene::Vec3 backward = normalize(subtract(eye, target));
    const scene::Vec3 right_axis = normalize(cross({0.0F, 1.0F, 0.0F}, backward));
    const scene::Vec3 up_axis = cross(backward, right_axis);

    scene::CameraState camera;
    camera.position = eye;
    camera.near_plane = 0.1F;
    camera.far_plane = 100.0F;
    camera.view.matrix = {
        right_axis.x, up_axis.x, backward.x, 0.0F,
        right_axis.y, up_axis.y, backward.y, 0.0F,
        right_axis.z, up_axis.z, backward.z, 0.0F,
        -dot(right_axis, eye), -dot(up_axis, eye), -dot(backward, eye), 1.0F};
    constexpr float fov_y = 1.0471975512F;
    const float y_scale = 1.0F / std::tan(fov_y * 0.5F);
    const float x_scale = y_scale / std::max(aspect, 0.001F);
    const float depth = camera.far_plane / (camera.near_plane - camera.far_plane);
    camera.projection.matrix = {
        x_scale, 0.0F, 0.0F, 0.0F,
        0.0F, y_scale, 0.0F, 0.0F,
        0.0F, 0.0F, depth, -1.0F,
        0.0F, 0.0F, depth * camera.near_plane, 0.0F};
    return camera;
}

[[nodiscard]] std::string hash_prefix(const content::ContentHash& hash) {
    constexpr char digits[] = "0123456789abcdef";
    std::string result;
    result.reserve(12U);
    for (std::size_t index = 0U; index < 6U; ++index) {
        const auto value = std::to_integer<unsigned int>(hash[index]);
        result.push_back(digits[value >> 4U]);
        result.push_back(digits[value & 0xFU]);
    }
    return result;
}

[[nodiscard]] std::string utc_stamp() {
    const auto now = std::chrono::system_clock::now();
    const std::time_t time = std::chrono::system_clock::to_time_t(now);
    std::tm utc{};
    gmtime_s(&utc, &time);
    std::ostringstream output;
    output << std::put_time(&utc, "%Y%m%dT%H%M%SZ");
    return output.str();
}

[[nodiscard]] double milliseconds(Clock::duration duration) {
    return std::chrono::duration<double, std::milli>{duration}.count();
}

[[nodiscard]] double percentile(std::vector<double> values, double fraction) {
    if (values.empty()) return 0.0;
    std::ranges::sort(values);
    const double last = static_cast<double>(values.size() - 1U);
    const auto index = static_cast<std::size_t>(
        std::min(last, last * fraction));
    return values[index];
}

[[nodiscard]] double srgb_to_linear(std::byte value) {
    const double encoded = static_cast<double>(std::to_integer<unsigned int>(value)) / 255.0;
    return encoded <= 0.04045
        ? encoded / 12.92
        : std::pow((encoded + 0.055) / 1.055, 2.4);
}

void write_json(const std::filesystem::path& path, const nlohmann::json& json) {
    std::ofstream stream(path, std::ios::trunc);
    stream << json.dump(2);
}

void write_error_report(
    const std::filesystem::path& directory,
    std::string_view stage,
    const Error& error) {
    std::filesystem::create_directories(directory);
    write_json(directory / "startup-error.json", {
        {"schema_version", 1},
        {"stage", stage},
        {"error_code", static_cast<std::uint32_t>(error.code)},
        {"message", error.message},
        {"native_code", error.native_code},
    });
}

[[nodiscard]] std::array<float, 16> multiply_matrix(
    const std::array<float, 16>& left,
    const std::array<float, 16>& right) {
    std::array<float, 16> result{};
    for (std::size_t row = 0U; row < 4U; ++row) {
        for (std::size_t column = 0U; column < 4U; ++column) {
            for (std::size_t inner = 0U; inner < 4U; ++inner) {
                result[row * 4U + column] +=
                    left[row * 4U + inner] * right[inner * 4U + column];
            }
        }
    }
    return result;
}

[[nodiscard]] scene::Scene make_reference_scene(
    const content::CookedScene& cooked_scene) {
    scene::Scene scene;
    std::vector<scene::MaterialHandle> materials;
    materials.reserve(cooked_scene.materials.size());
    for (std::size_t index = 0U; index < cooked_scene.materials.size(); ++index) {
        const auto& source = cooked_scene.materials[index];
        scene::Material material;
        material.id = scene::StableId{index + 1U};
        material.alpha_mode = source.alpha_mode == content::CookedAlphaMode::Mask
            ? scene::AlphaMode::Mask
            : scene::AlphaMode::Opaque;
        material.gpu.base_color = source.base_color;
        material.gpu.emissive = source.emissive;
        material.gpu.metallic = source.metallic;
        material.gpu.roughness = source.roughness;
        material.gpu.normal_scale = source.normal_scale;
        material.gpu.occlusion_strength = source.occlusion_strength;
        material.gpu.alpha_cutoff = source.alpha_cutoff;
        material.gpu.texture_indices = source.texture_indices;
        material.gpu.sampler_index = source.sampler_index;
        material.gpu.alpha_mode = static_cast<std::uint32_t>(material.alpha_mode);
        material.gpu.flags = source.flags;
        materials.push_back(scene.add_material(material));
    }
    for (std::size_t index = 0U; index < cooked_scene.instances.size(); ++index) {
        const auto& instance = cooked_scene.instances[index];
        const auto& mesh = cooked_scene.meshes[instance.mesh_index];
        scene::RenderItem item;
        item.id = scene::StableId{index + 1U};
        item.transform.matrix = instance.transform;
        item.mesh = scene::MeshHandle::from_parts(instance.mesh_index + 1U, 1U);
        item.material = materials[mesh.material_index];
        item.bounds = {
            {mesh.bounds_min[0], mesh.bounds_min[1], mesh.bounds_min[2]},
            {mesh.bounds_max[0], mesh.bounds_max[1], mesh.bounds_max[2]}};
        scene.add_render_item(item);
    }
    (void)scene.add_light(scene::Light::directional(
        scene::StableId{1'000U}, scene::Vec3{-0.35F, -0.65F, -0.8F}, true));
    (void)scene.add_light(scene::Light::point(
        scene::StableId{1'001U}, scene::Vec3{1.5F, 0.5F, 1.5F}, 2.0F));
    return scene;
}

}  // namespace

int run_application(RunMode required_mode, int argc, char** argv) {
    try {
        const CommandLine command_line = parse_command_line(required_mode, argc, argv);
        const std::string config_text = read_text(command_line.config_path);
        if (config_text.empty()) {
            spdlog::error("configuration does not exist: {}", command_line.config_path.string());
            return 2;
        }
        auto parsed_config = RunConfig::from_json(config_text);
        if (!parsed_config) {
            spdlog::error("invalid configuration: {}", parsed_config.error().message);
            return 3;
        }
        RunConfig config = std::move(parsed_config).value();
        if (config.mode != required_mode) {
            spdlog::error("application and configuration modes do not match");
            return 4;
        }
        if (!command_line.output_root.empty()) config.output_root = command_line.output_root.string();
        auto camera_path = load_camera_path(config.camera_path);
        if (!camera_path) {
            spdlog::error("camera path failed: {}", camera_path.error().message);
            return 4;
        }

        const std::filesystem::path startup_failure_directory =
            std::filesystem::path{config.output_root} /
            (utc_stamp() + "-startup-failure");
        const auto write_startup_failure = [&](std::string_view stage, const Error& error) {
            write_error_report(startup_failure_directory, stage, error);
            std::ofstream frozen(
                startup_failure_directory / "run-config.json", std::ios::trunc);
            frozen << config.to_json();
        };
        content::ContentRuntime content_runtime;
        auto asset = content_runtime.request(config.content_manifest);
        if (!asset) {
            write_startup_failure("content-request", asset.error());
            spdlog::error("content request failed: {}", asset.error().message);
            return 5;
        }
        auto cpu_ready = content_runtime.wait_cpu_ready(
            asset.value(), std::chrono::seconds{5});
        if (!cpu_ready) {
            write_startup_failure("content-load", cpu_ready.error());
            spdlog::error("content package failed to reach CPU-ready state: {}", cpu_ready.error().message);
            return 5;
        }
        auto package = content_runtime.begin_upload(asset.value());
        if (!package) {
            write_startup_failure("content-begin-upload", package.error());
            spdlog::error("content package upload failed: {}", package.error().message);
            return 5;
        }
        auto published = content_runtime.publish(asset.value(), 0U, 0U);
        if (!published) {
            write_startup_failure("content-publish", published.error());
            spdlog::error("content package failed to publish fallback-safe residency: {}", published.error().message);
            return 5;
        }
        auto cooked_scene = content::decode_cooked_scene(package.value()->payload);
        if (!cooked_scene || cooked_scene.value().meshes.empty() ||
            cooked_scene.value().instances.empty() ||
            cooked_scene.value().materials.empty()) {
            const Error error = cooked_scene
                ? Error{ErrorCode::AssetCookFailure, "content package contains no renderable cooked scene"}
                : cooked_scene.error();
            write_startup_failure("content-decode", error);
            spdlog::error("content package does not contain a valid cooked scene");
            return 5;
        }
        const std::filesystem::path run_directory = std::filesystem::path{config.output_root} /
            (utc_stamp() + "-" + hash_prefix(package.value()->metadata.content_hash));
        std::filesystem::create_directories(run_directory);
        {
            std::ofstream frozen(run_directory / "run-config.json", std::ios::trunc);
            frozen << config.to_json();
        }
        std::ofstream events(run_directory / "events.jsonl", std::ios::trunc);

        std::unique_ptr<platform::SdlPlatformHost> host;
        if (!command_line.headless) {
            auto created_host = platform::SdlPlatformHost::create({
                "AlphaEngine MVP1 Sandbox", config.width, config.height, true, true});
            if (!created_host) {
                spdlog::error("platform host failed: {}", created_host.error().message);
                return 6;
            }
            host = std::move(created_host).value();
        }

        graphics::d3d12::D3D12Config graphics_config;
        graphics_config.window_handle = host ? host->native_window_handle() : nullptr;
        graphics_config.width = config.width;
        graphics_config.height = config.height;
        graphics_config.use_warp = command_line.warp || config.adapter == "warp";
        graphics_config.debug_layer = config.debug_layer;
        graphics_config.gpu_validation = config.gpu_validation;
        graphics_config.dred = config.dred;
        graphics_config.vsync = config.vsync;
        graphics_config.allow_tearing = config.allow_tearing;
        graphics_config.shader_root = config.shader_root;
        if (!std::filesystem::exists(graphics_config.shader_root)) {
            graphics_config.shader_root = AENGINE_DEFAULT_SHADER_ROOT;
        }
        auto created_graphics = graphics::d3d12::D3D12Graphics::create(graphics_config);
        if (!created_graphics) {
            write_error_report(run_directory, "graphics-session", created_graphics.error());
            spdlog::error("D3D12 session failed: {}", created_graphics.error().message);
            return 7;
        }
        auto graphics = std::move(created_graphics).value();
        std::uint32_t output_width = config.width;
        std::uint32_t output_height = config.height;

        struct GpuMesh {
            alpha::graphics::ResourceHandle vertices;
            alpha::graphics::ResourceHandle indices;
            std::uint32_t index_count{};
        };
        std::vector<GpuMesh> gpu_meshes;
        gpu_meshes.reserve(cooked_scene.value().meshes.size());
        for (std::size_t index = 0U; index < cooked_scene.value().meshes.size(); ++index) {
            const auto& mesh = cooked_scene.value().meshes[index];
            auto vertices = graphics->create(alpha::graphics::BufferDesc::device_local(
                "mesh-vertices-" + std::to_string(index),
                mesh.vertices.size() * sizeof(content::CookedVertex)));
            auto indices = graphics->create(alpha::graphics::BufferDesc::device_local(
                "mesh-indices-" + std::to_string(index),
                mesh.indices.size() * sizeof(std::uint32_t)));
            if (!vertices || !indices ||
                !graphics->upload(
                    vertices.value(), std::as_bytes(std::span{mesh.vertices})) ||
                !graphics->upload(
                    indices.value(), std::as_bytes(std::span{mesh.indices}))) {
                spdlog::error("GPU mesh upload failed for cooked mesh {}", index);
                return 7;
            }
            gpu_meshes.push_back({
                vertices.value(),
                indices.value(),
                static_cast<std::uint32_t>(mesh.indices.size())});
        }
        std::vector<alpha::graphics::ResourceHandle> gpu_textures;
        gpu_textures.reserve(cooked_scene.value().textures.size());
        for (std::size_t index = 0U; index < cooked_scene.value().textures.size(); ++index) {
            const auto& texture = cooked_scene.value().textures[index];
            alpha::graphics::TextureDesc description;
            description.name = "texture-" + std::to_string(index);
            description.width = texture.width;
            description.height = texture.height;
            description.mip_levels = static_cast<std::uint16_t>(texture.mip_offsets.size());
            description.srgb = texture.color_space == content::TextureColorSpace::Srgb;
            auto resource = graphics->create(description);
            if (!resource || !graphics->upload_texture(
                    resource.value(),
                    alpha::graphics::TextureUpload{
                        texture.width,
                        texture.height,
                        texture.mip_offsets,
                        texture.rgba8},
                    static_cast<std::uint32_t>(index + 1U))) {
                spdlog::error("GPU texture upload failed for cooked texture {}", index);
                return 7;
            }
            gpu_textures.push_back(resource.value());
        }

        const auto& capabilities = graphics->capabilities();
        write_json(run_directory / "capability-report.json", {
            {"schema_version", 1},
            {"adapter", capabilities.adapter_name},
            {"software", capabilities.is_software},
            {"feature_level", "12_0"},
            {"shader_model", "6_0"},
            {"root_signature", "1.1"},
            {"resource_binding_tier", capabilities.resource_binding_tier},
            {"agility_sdk", 619},
            {"frames_in_flight", 2},
            {"swapchain_buffers", 3},
        });
        const auto write_graphics_diagnostics = [&] {
            const auto diagnostic = graphics->diagnostics();
            write_json(run_directory / "diagnostics-report.json", {
                {"schema_version", 1},
                {"device_lost", diagnostic.device_lost},
                {"native_reason", diagnostic.native_reason},
                {"last_pass", diagnostic.last_pass},
                {"page_fault_address", diagnostic.page_fault_address},
                {"validation_errors", diagnostic.validation_errors},
                {"dred_breadcrumbs", diagnostic.dred_breadcrumbs},
            });
            return !diagnostic.device_lost && diagnostic.validation_errors.empty();
        };

        debug_ui::DebugUi debug_ui;
        debug_ui.set_enabled(config.debug_ui && required_mode == RunMode::Sandbox);
        renderer::ForwardRenderer renderer;
        scene::Scene scene = make_reference_scene(cooked_scene.value());
        scene.set_camera(camera_at(
            camera_path.value(), 0.0,
            static_cast<float>(output_width) / static_cast<float>(output_height)));
        std::vector<double> cpu_samples;
        std::vector<double> submission_samples;
        std::vector<double> gpu_samples;
        std::map<std::string, std::vector<double>, std::less<>> pass_gpu_samples;
        const std::uint32_t default_frames = required_mode == RunMode::Benchmark ? 1'500U : 0U;
        const std::uint32_t frame_limit = command_line.frame_limit != 0U
            ? command_line.frame_limit
            : default_frames;
        bool running = true;
        std::uint32_t frame_number = 0U;
        graphics::SubmissionToken last_submission{};

        while (running && (frame_limit == 0U || frame_number < frame_limit)) {
            const auto frame_start = Clock::now();
            platform::EventBatch platform_events;
            if (host) {
                platform_events = host->poll_events();
                const auto capture = debug_ui.process_events(platform_events);
                (void)capture;
                if (host->surface_state() == platform::SurfaceState::Closing) running = false;
                if (host->surface_state() == platform::SurfaceState::Resized) {
                    const auto extent = host->drawable_extent();
                    if (extent.width != 0U && extent.height != 0U &&
                        (extent.width != output_width || extent.height != output_height)) {
                        if (auto resized = graphics->resize(extent.width, extent.height); !resized) {
                            (void)write_graphics_diagnostics();
                            spdlog::error("surface resize failed: {}", resized.error().message);
                            return 8;
                        }
                        output_width = extent.width;
                        output_height = extent.height;
                    }
                }
                if (host->surface_state() == platform::SurfaceState::Minimized ||
                    host->surface_state() == platform::SurfaceState::Occluded) {
                    std::this_thread::sleep_for(std::chrono::milliseconds{16});
                    continue;
                }
            }

            render_graph::RenderGraph graph;
            if (required_mode == RunMode::Benchmark) {
                const double path_time = frame_limit > 1U
                    ? camera_path.value().duration_seconds *
                        static_cast<double>(frame_number) /
                        static_cast<double>(frame_limit - 1U)
                    : 0.0;
                scene.set_camera(camera_at(
                    camera_path.value(), path_time,
                    static_cast<float>(output_width) / static_cast<float>(output_height)));
            }
            const auto snapshot = scene.freeze();
            auto frame = graphics->begin_frame(graphics->default_swapchain());
            auto output = renderer.build_frame(
                snapshot, renderer::RenderTarget{output_width, output_height}, graph);
            if (!frame || !output) {
                spdlog::error("frame construction failed");
                return 8;
            }

            alpha::graphics::UiDrawData ui_draw_data;
            if (debug_ui.enabled()) {
                debug_ui::DebugSnapshot ui_snapshot;
                ui_snapshot.render_items = static_cast<std::uint32_t>(snapshot.items().size());
                ui_snapshot.visible_items = ui_snapshot.render_items;
                ui_snapshot.live_resources = static_cast<std::uint32_t>(
                    gpu_meshes.size() * 2U + gpu_textures.size());
                ui_snapshot.bindless_textures = static_cast<std::uint32_t>(gpu_textures.size());
                ui_snapshot.preview_texture_index = gpu_textures.empty() ? 0U : 1U;
                ui_snapshot.adapter_name = capabilities.adapter_name;
                ui_snapshot.pass_names = {"Shadow", "ForwardOpaqueMask", "ToneMap", "DearImGui", "Present"};
                ui_snapshot.frozen_run_config = config.to_json();
                const float dpi_scale = host ? host->dpi_scale() : 1.0F;
                debug_ui.begin_frame({
                    static_cast<std::uint32_t>(output_width / dpi_scale),
                    static_cast<std::uint32_t>(output_height / dpi_scale),
                    1.0F / 60.0F,
                    dpi_scale}, ui_snapshot);
                (void)debug_ui.build_default_panels();
                ui_draw_data = debug_ui.draw_data();
                if (auto overlay = debug_ui.add_overlay_pass(graph, output.value().back_buffer); !overlay) {
                    spdlog::error("debug UI failed: {}", overlay.error().message);
                    return 9;
                }
            }

            auto plan = graph.compile();
            if (!plan) {
                spdlog::error("render graph failed: {}", plan.error().message);
                return 10;
            }
            alpha::graphics::FramePacket frame_packet;
            frame_packet.ui = std::move(ui_draw_data);
            frame_packet.view_projection = multiply_matrix(
                snapshot.camera().view.matrix,
                snapshot.camera().projection.matrix);
            frame_packet.camera_position = {
                snapshot.camera().position.x,
                snapshot.camera().position.y,
                snapshot.camera().position.z};
            frame_packet.exposure = snapshot.camera().exposure;
            std::uint32_t point_light_index = 0U;
            for (const auto& light : snapshot.lights()) {
                if (light.type == scene::LightType::Directional) {
                    frame_packet.directional_light.direction = {
                        light.direction.x, light.direction.y, light.direction.z};
                    frame_packet.directional_light.color = {
                        light.color.x, light.color.y, light.color.z};
                    frame_packet.directional_light.intensity = light.intensity;
                } else if (point_light_index < frame_packet.point_lights.size()) {
                    auto& target = frame_packet.point_lights[point_light_index++];
                    target.position = {
                        light.position.x, light.position.y, light.position.z};
                    target.color = {light.color.x, light.color.y, light.color.z};
                    target.intensity = light.intensity;
                }
            }
            frame_packet.point_light_count = point_light_index;
            frame_packet.draws.reserve(output.value().draw_list.size());
            for (const auto& command : output.value().draw_list) {
                if (command.mesh.index() == 0U || command.mesh.index() > gpu_meshes.size() ||
                    command.material.index() == 0U ||
                    command.material.index() > snapshot.materials().size()) {
                    spdlog::error("renderer emitted an invalid persistent mesh/material handle");
                    return 10;
                }
                const auto& mesh = gpu_meshes[command.mesh.index() - 1U];
                const auto& material = snapshot.materials()[command.material.index() - 1U].gpu;
                alpha::graphics::RenderDraw draw;
                draw.vertex_buffer = mesh.vertices;
                draw.index_buffer = mesh.indices;
                draw.index_count = mesh.index_count;
                draw.world = command.world.matrix;
                draw.material.base_color = material.base_color;
                draw.material.emissive = material.emissive;
                draw.material.metallic = material.metallic;
                draw.material.roughness = material.roughness;
                draw.material.normal_scale = material.normal_scale;
                draw.material.occlusion_strength = material.occlusion_strength;
                draw.material.alpha_cutoff = material.alpha_cutoff;
                draw.material.texture_indices = material.texture_indices;
                draw.material.sampler_index = material.sampler_index;
                draw.material.alpha_mode = material.alpha_mode;
                draw.material.flags = material.flags;
                frame_packet.draws.push_back(draw);
            }
            const auto submission_start = Clock::now();
            auto submission = graphics->execute(
                std::move(frame).value(),
                std::move(plan).value(),
                std::move(frame_packet));
            const auto submission_end = Clock::now();
            if (!submission) {
                (void)write_graphics_diagnostics();
                spdlog::error("D3D12 execute failed: {}", submission.error().message);
                return 11;
            }
            last_submission = submission.value().token;
            const auto gpu_timing = graphics->latest_timing();
            const auto frame_end = Clock::now();

            const double cpu_ms = milliseconds(frame_end - frame_start);
            const double submission_ms = milliseconds(submission_end - submission_start);
            const double gpu_ms = gpu_timing.valid ? gpu_timing.gpu_frame_ms : 0.0;
            const bool short_smoke = frame_limit != 0U && frame_limit <= 300U;
            if (required_mode != RunMode::Benchmark || short_smoke || frame_number >= 300U) {
                cpu_samples.push_back(cpu_ms);
                submission_samples.push_back(submission_ms);
                if (gpu_timing.valid) {
                    gpu_samples.push_back(gpu_ms);
                    for (const auto& pass : gpu_timing.passes) {
                        pass_gpu_samples[pass.name].push_back(pass.milliseconds);
                    }
                }
            }
            nlohmann::json frame_event{
                {"event", "frame"},
                {"frame", frame_number},
                {"cpu_ms", cpu_ms},
                {"submission_ms", submission_ms},
                {"gpu_ms", gpu_ms},
                {"gpu_timing_valid", gpu_timing.valid},
            };
            frame_event["passes"] = nlohmann::json::array();
            for (const auto& pass : gpu_timing.passes) {
                frame_event["passes"].push_back({
                    {"name", pass.name}, {"gpu_ms", pass.milliseconds}});
            }
            events << frame_event.dump() << '\n';
            ++frame_number;
        }

        bool image_passed = false;
        bool geometry_probe_passed = false;
        bool ui_probe_passed = !debug_ui.enabled();
        std::size_t ui_changed_channels = 0U;
        std::array<unsigned int, 4> center_rgba{};
        double image_max_error = 1.0;
        double image_99_9_fraction = 0.0;
        const auto golden = read_binary("content/reference/golden.rgba8");
        bool golden_used = false;
        auto capture = graphics->capture_rgba8();
        if (capture) {
            std::ofstream raw_image(run_directory / "capture.rgba8", std::ios::binary | std::ios::trunc);
            raw_image.write(
                reinterpret_cast<const char*>(capture.value().data()),
                static_cast<std::streamsize>(capture.value().size()));
            const std::array<std::byte, 4> expected{
                std::byte{15}, std::byte{33}, std::byte{59}, std::byte{255}};
            golden_used = required_mode == RunMode::Benchmark &&
                output_width == 1920U && output_height == 1080U &&
                golden.size() == capture.value().size();
            const std::size_t center_pixel =
                (static_cast<std::size_t>(output_height / 2U) * output_width +
                    output_width / 2U) * 4U;
            if (center_pixel + 3U < capture.value().size()) {
                for (std::size_t channel = 0U; channel < 4U; ++channel) {
                    center_rgba[channel] = std::to_integer<unsigned int>(
                        capture.value()[center_pixel + channel]);
                }
                geometry_probe_passed =
                    std::abs(static_cast<int>(center_rgba[0]) - 15) +
                    std::abs(static_cast<int>(center_rgba[1]) - 33) +
                    std::abs(static_cast<int>(center_rgba[2]) - 59) > 20;
            }
            if (debug_ui.enabled() && output_width > 14U && output_height > 14U) {
                const std::size_t ui_pixel =
                    (static_cast<std::size_t>(13U) * output_width + 13U) * 4U;
                ui_probe_passed = ui_pixel + 3U < capture.value().size() &&
                    (std::to_integer<unsigned int>(capture.value()[ui_pixel]) != 15U ||
                        std::to_integer<unsigned int>(capture.value()[ui_pixel + 1U]) != 33U ||
                        std::to_integer<unsigned int>(capture.value()[ui_pixel + 2U]) != 59U);
            }
            std::size_t within_threshold = 0U;
            std::size_t compared_channels = 0U;
            image_max_error = 0.0;
            for (std::size_t index = 0U; index < capture.value().size(); ++index) {
                const std::size_t pixel = index / 4U;
                const std::size_t x = pixel % output_width;
                const std::size_t y = pixel / output_width;
                const bool geometry_mask =
                    x > static_cast<std::size_t>(output_width * 0.1F) &&
                    x < static_cast<std::size_t>(output_width * 0.9F) &&
                    y > static_cast<std::size_t>(output_height * 0.1F) &&
                    y < static_cast<std::size_t>(output_height * 0.9F);
                if (!golden_used && geometry_mask) continue;
                const std::size_t channel = index & 3U;
                const std::byte reference = golden_used ? golden[index] : expected[channel];
                const double error = channel == 3U
                    ? std::abs(
                        static_cast<double>(std::to_integer<unsigned int>(capture.value()[index])) -
                        static_cast<double>(std::to_integer<unsigned int>(reference))) / 255.0
                    : std::abs(
                        srgb_to_linear(capture.value()[index]) -
                        srgb_to_linear(reference));
                image_max_error = std::max(image_max_error, error);
                if (debug_ui.enabled() && channel < 3U && error > 8.0 / 255.0) {
                    ++ui_changed_channels;
                }
                if (error <= 3.0 / 255.0) ++within_threshold;
                ++compared_channels;
            }
            image_99_9_fraction = compared_channels == 0U
                ? 0.0
                : static_cast<double>(within_threshold) /
                    static_cast<double>(compared_channels);
            image_passed = geometry_probe_passed &&
                (required_mode != RunMode::Benchmark || golden_used) &&
                image_99_9_fraction >= 0.999 && image_max_error <= 8.0 / 255.0;
            if (debug_ui.enabled()) ui_probe_passed = ui_changed_channels >= 100U;
        }

        const double cpu_p99 = percentile(cpu_samples, 0.99);
        const double gpu_p99 = percentile(gpu_samples, 0.99);
        const double submission_p99 = percentile(submission_samples, 0.99);
        const double maximum = cpu_samples.empty()
            ? 0.0
            : *std::ranges::max_element(cpu_samples);
        const double gpu_maximum = gpu_samples.empty()
            ? 0.0
            : *std::ranges::max_element(gpu_samples);
        nlohmann::json pass_p99 = nlohmann::json::object();
        for (const auto& [name, samples] : pass_gpu_samples) {
            pass_p99[name] = percentile(samples, 0.99);
        }
        const bool full_benchmark = required_mode == RunMode::Benchmark && frame_number >= 1'500U;
        const bool diagnostics_passed = write_graphics_diagnostics();
        const bool passed = required_mode == RunMode::Sandbox
            ? ui_probe_passed && diagnostics_passed
            : image_passed && (!full_benchmark ||
                (cpu_p99 <= 16.67 && gpu_p99 <= 16.67 &&
                    maximum <= 22.0 && gpu_maximum <= 22.0)) &&
                diagnostics_passed;
        if (std::max(maximum, gpu_maximum) > 16.67) {
            write_json(run_directory / "hitch-report.json", {
                {"schema_version", 1},
                {"cpu_max_ms", maximum},
                {"gpu_max_ms", gpu_maximum},
                {"budget_ms", 16.67},
                {"failure_ms", 22.0},
                {"failed", std::max(maximum, gpu_maximum) > 22.0},
            });
        }
        write_json(run_directory / "performance-report.json", {
            {"schema_version", 1},
            {"warmup_frames", full_benchmark ? 300 : 0},
            {"sample_frames", cpu_samples.size()},
            {"gpu_sample_frames", gpu_samples.size()},
            {"cpu_frame_p99_ms", cpu_p99},
            {"submission_p99_ms", submission_p99},
            {"gpu_frame_p99_ms", gpu_p99},
            {"pass_gpu_p99_ms", pass_p99},
            {"max_frame_ms", maximum},
            {"gpu_max_frame_ms", gpu_maximum},
            {"budget_ms", 16.67},
            {"hitch_failure_ms", 22.0},
            {"diagnostics_passed", diagnostics_passed},
            {"passed", passed},
        });
        write_json(run_directory / "image-report.json", {
            {"schema_version", 1},
            {"capture", capture ? "capture.rgba8" : "failed"},
            {"golden", "content/reference/golden.rgba8"},
            {"golden_used", golden_used},
            {"comparison_space", "linearized-sdr"},
            {"pixel_99_9_threshold", 3.0 / 255.0},
            {"maximum_threshold", 8.0 / 255.0},
            {"fraction_within_threshold", image_99_9_fraction},
            {"maximum_error", image_max_error},
            {"expected_rgba8", {15, 33, 59, 255}},
            {"center_rgba8", center_rgba},
            {"geometry_probe_passed", geometry_probe_passed},
            {"debug_ui_enabled", debug_ui.enabled()},
            {"debug_ui_probe_passed", ui_probe_passed},
            {"debug_ui_changed_channels", ui_changed_channels},
            {"gated", required_mode == RunMode::Benchmark},
            {"passed", image_passed},
        });
        for (const auto& mesh : gpu_meshes) {
            graphics->retire(mesh.vertices);
            graphics->retire(mesh.indices);
        }
        for (const auto texture : gpu_textures) graphics->retire(texture);
        if (auto retiring = content_runtime.retire(asset.value(), last_submission.value); retiring) {
            content_runtime.collect(last_submission.value);
        }
        spdlog::info("run artifacts: {}", run_directory.string());
        return passed ? 0 : 13;
    } catch (const std::exception& exception) {
        spdlog::error("unhandled startup/runtime error: {}", exception.what());
        return 100;
    }
}

}  // namespace alpha::application
