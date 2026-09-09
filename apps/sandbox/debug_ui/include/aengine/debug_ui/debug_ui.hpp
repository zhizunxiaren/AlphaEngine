#pragma once

#include <aengine/core/result.hpp>
#include <aengine/graphics/graphics.hpp>
#include <aengine/platform/platform_host.hpp>
#include <aengine/render_graph/render_graph.hpp>

#include <cstdint>
#include <memory>
#include <span>
#include <string>
#include <vector>

namespace alpha::debug_ui {

struct InputCapture {
    bool mouse{};
    bool keyboard{};
};

struct DebugUiFrame {
    std::uint32_t width{};
    std::uint32_t height{};
    float delta_seconds{1.0F / 60.0F};
    float dpi_scale{1.0F};
};

struct DebugSnapshot {
    float cpu_frame_ms{};
    float submission_ms{};
    float gpu_frame_ms{};
    std::uint32_t render_items{};
    std::uint32_t visible_items{};
    std::uint32_t live_resources{};
    std::uint32_t bindless_textures{};
    std::uint32_t preview_texture_index{};
    std::string adapter_name;
    std::vector<std::string> pass_names;
    std::vector<std::string> validation_messages;
    std::string frozen_run_config;
};

struct DebugUiActions {
    bool toggle_wireframe{};
    bool freeze_culling{};
    bool request_capture{};
};

class DebugUi {
public:
    DebugUi();
    ~DebugUi();
    DebugUi(const DebugUi&) = delete;
    DebugUi& operator=(const DebugUi&) = delete;
    DebugUi(DebugUi&&) noexcept;
    DebugUi& operator=(DebugUi&&) noexcept;

    void set_enabled(bool enabled) noexcept;
    [[nodiscard]] bool enabled() const noexcept;
    [[nodiscard]] InputCapture process_events(
        std::span<const platform::PlatformEvent> events);
    void begin_frame(const DebugUiFrame& frame, const DebugSnapshot& snapshot);
    [[nodiscard]] DebugUiActions build_default_panels();
    [[nodiscard]] graphics::UiDrawData draw_data() const;
    [[nodiscard]] Result<void> add_overlay_pass(
        render_graph::RenderGraph& graph,
        render_graph::ResourceRef back_buffer);

private:
    struct Impl;
    std::unique_ptr<Impl> implementation_;
};

}  // namespace alpha::debug_ui
