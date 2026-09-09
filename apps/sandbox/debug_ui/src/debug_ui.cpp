#include <aengine/debug_ui/debug_ui.hpp>

#include <imgui.h>

#include <algorithm>
#include <cstddef>
#include <cstdint>
#include <memory>
#include <limits>
#include <utility>

namespace alpha::debug_ui {
namespace {

[[nodiscard]] ImGuiKey imgui_key(platform::KeyCode key) noexcept {
    using platform::KeyCode;
    switch (key) {
    case KeyCode::Tab: return ImGuiKey_Tab;
    case KeyCode::Left: return ImGuiKey_LeftArrow;
    case KeyCode::Right: return ImGuiKey_RightArrow;
    case KeyCode::Up: return ImGuiKey_UpArrow;
    case KeyCode::Down: return ImGuiKey_DownArrow;
    case KeyCode::PageUp: return ImGuiKey_PageUp;
    case KeyCode::PageDown: return ImGuiKey_PageDown;
    case KeyCode::Home: return ImGuiKey_Home;
    case KeyCode::End: return ImGuiKey_End;
    case KeyCode::Insert: return ImGuiKey_Insert;
    case KeyCode::Delete: return ImGuiKey_Delete;
    case KeyCode::Backspace: return ImGuiKey_Backspace;
    case KeyCode::Space: return ImGuiKey_Space;
    case KeyCode::Enter: return ImGuiKey_Enter;
    case KeyCode::Escape: return ImGuiKey_Escape;
    case KeyCode::A: return ImGuiKey_A;
    case KeyCode::C: return ImGuiKey_C;
    case KeyCode::V: return ImGuiKey_V;
    case KeyCode::X: return ImGuiKey_X;
    case KeyCode::Y: return ImGuiKey_Y;
    case KeyCode::Z: return ImGuiKey_Z;
    case KeyCode::Unknown:
    default: return ImGuiKey_None;
    }
}

}  // namespace

struct DebugUi::Impl {
    ImGuiContext* context{};
    bool enabled{true};
    DebugSnapshot snapshot;
};

DebugUi::DebugUi() : implementation_(std::make_unique<Impl>()) {
    IMGUI_CHECKVERSION();
    implementation_->context = ImGui::CreateContext();
    ImGui::SetCurrentContext(implementation_->context);
    ImGui::StyleColorsDark();
    ImGuiIO& io = ImGui::GetIO();
    io.BackendFlags |= ImGuiBackendFlags_RendererHasVtxOffset;
    io.IniFilename = nullptr;
    io.LogFilename = nullptr;
    unsigned char* pixels = nullptr;
    int width = 0;
    int height = 0;
    io.Fonts->GetTexDataAsRGBA32(&pixels, &width, &height);
    io.Fonts->SetTexID(static_cast<ImTextureID>(1U));
    (void)pixels;
    (void)width;
    (void)height;
}

DebugUi::~DebugUi() {
    if (implementation_ && implementation_->context != nullptr) {
        ImGui::DestroyContext(implementation_->context);
    }
}

DebugUi::DebugUi(DebugUi&&) noexcept = default;
DebugUi& DebugUi::operator=(DebugUi&&) noexcept = default;

void DebugUi::set_enabled(bool enabled) noexcept { implementation_->enabled = enabled; }
bool DebugUi::enabled() const noexcept { return implementation_->enabled; }

InputCapture DebugUi::process_events(
    std::span<const platform::PlatformEvent> events) {
    if (!implementation_->enabled) {
        return {};
    }
    ImGui::SetCurrentContext(implementation_->context);
    ImGuiIO& io = ImGui::GetIO();
    for (const auto& event : events) {
        if (event.type == platform::EventType::Pointer) {
            io.AddMousePosEvent(event.x, event.y);
        } else if (event.type == platform::EventType::PointerButton &&
            event.code >= 0 && event.code < 5) {
            io.AddMousePosEvent(event.x, event.y);
            io.AddMouseButtonEvent(event.code, event.pressed);
        } else if (event.type == platform::EventType::PointerWheel) {
            io.AddMouseWheelEvent(event.x, event.y);
        } else if (event.type == platform::EventType::Key) {
            io.AddKeyEvent(
                ImGuiMod_Ctrl,
                (event.modifiers & platform::ModifierCtrl) != 0U);
            io.AddKeyEvent(
                ImGuiMod_Shift,
                (event.modifiers & platform::ModifierShift) != 0U);
            io.AddKeyEvent(
                ImGuiMod_Alt,
                (event.modifiers & platform::ModifierAlt) != 0U);
            io.AddKeyEvent(
                ImGuiMod_Super,
                (event.modifiers & platform::ModifierSuper) != 0U);
            const ImGuiKey key = imgui_key(
                static_cast<platform::KeyCode>(event.code));
            if (key != ImGuiKey_None) io.AddKeyEvent(key, event.pressed);
        } else if (event.type == platform::EventType::Text && !event.text.empty()) {
            io.AddInputCharactersUTF8(event.text.c_str());
        }
    }
    return {io.WantCaptureMouse, io.WantCaptureKeyboard};
}

void DebugUi::begin_frame(
    const DebugUiFrame& frame,
    const DebugSnapshot& snapshot) {
    if (!implementation_->enabled) {
        return;
    }
    ImGui::SetCurrentContext(implementation_->context);
    ImGuiIO& io = ImGui::GetIO();
    io.DisplaySize = ImVec2(
        static_cast<float>(frame.width), static_cast<float>(frame.height));
    io.DisplayFramebufferScale = ImVec2(frame.dpi_scale, frame.dpi_scale);
    io.DeltaTime = std::max(frame.delta_seconds, 0.0001F);
    implementation_->snapshot = snapshot;
    ImGui::NewFrame();
}

DebugUiActions DebugUi::build_default_panels() {
    DebugUiActions actions;
    if (!implementation_->enabled) {
        return actions;
    }
    ImGui::SetCurrentContext(implementation_->context);
    const auto& snapshot = implementation_->snapshot;

    if (ImGui::Begin("Frame Profiler")) {
        ImGui::Text("CPU %.3f ms", snapshot.cpu_frame_ms);
        ImGui::Text("Submission %.3f ms", snapshot.submission_ms);
        ImGui::Text("GPU %.3f ms", snapshot.gpu_frame_ms);
    }
    ImGui::End();
    if (ImGui::Begin("Render Graph")) {
        for (const auto& pass : snapshot.pass_names) ImGui::BulletText("%s", pass.c_str());
    }
    ImGui::End();
    if (ImGui::Begin("Scene Stats")) {
        ImGui::Text("Render items %u / visible %u", snapshot.render_items, snapshot.visible_items);
    }
    ImGui::End();
    if (ImGui::Begin("GPU Resources / Bindless")) {
        ImGui::Text("Resources %u", snapshot.live_resources);
        ImGui::Text("Texture2D descriptors %u", snapshot.bindless_textures);
        if (snapshot.preview_texture_index > 0U) {
            ImGui::Text("Texture preview #%u", snapshot.preview_texture_index);
            ImGui::Image(
                ImTextureRef{static_cast<ImTextureID>(snapshot.preview_texture_index + 1U)},
                ImVec2{128.0F, 128.0F});
        }
    }
    ImGui::End();
    if (ImGui::Begin("Capabilities")) ImGui::TextUnformatted(snapshot.adapter_name.c_str());
    ImGui::End();
    if (ImGui::Begin("Logs & Validation")) {
        for (const auto& message : snapshot.validation_messages) ImGui::TextWrapped("%s", message.c_str());
    }
    ImGui::End();
    if (ImGui::Begin("Render Debug")) {
        ImGui::Checkbox("Wireframe", &actions.toggle_wireframe);
        ImGui::Checkbox("Freeze culling", &actions.freeze_culling);
        actions.request_capture = ImGui::Button("Capture frame");
    }
    ImGui::End();
    if (ImGui::Begin("Run Configuration")) ImGui::TextWrapped("%s", snapshot.frozen_run_config.c_str());
    ImGui::End();
    ImGui::GetForegroundDrawList()->AddRectFilled(
        ImVec2{8.0F, 8.0F},
        ImVec2{18.0F, 18.0F},
        IM_COL32(80, 220, 140, 220),
        3.0F);
    if (snapshot.preview_texture_index > 0U) {
        const float right = ImGui::GetIO().DisplaySize.x - 12.0F;
        ImGui::GetForegroundDrawList()->AddImage(
            ImTextureRef{static_cast<ImTextureID>(snapshot.preview_texture_index + 1U)},
            ImVec2{right - 64.0F, 12.0F},
            ImVec2{right, 76.0F});
    }
    ImGui::Render();
    return actions;
}

graphics::UiDrawData DebugUi::draw_data() const {
    graphics::UiDrawData output;
    if (!implementation_->enabled) return output;
    ImGui::SetCurrentContext(implementation_->context);
    const ImDrawData* source = ImGui::GetDrawData();
    if (source == nullptr || !source->Valid) return output;

    output.display_position = {source->DisplayPos.x, source->DisplayPos.y};
    output.display_size = {source->DisplaySize.x, source->DisplaySize.y};
    output.framebuffer_scale = {
        source->FramebufferScale.x, source->FramebufferScale.y};
    output.vertices.reserve(static_cast<std::size_t>(source->TotalVtxCount));
    output.indices.reserve(static_cast<std::size_t>(source->TotalIdxCount));

    unsigned char* font_pixels = nullptr;
    int font_width = 0;
    int font_height = 0;
    ImGui::GetIO().Fonts->GetTexDataAsRGBA32(
        &font_pixels, &font_width, &font_height);
    if (font_pixels != nullptr && font_width > 0 && font_height > 0) {
        output.font_width = static_cast<std::uint32_t>(font_width);
        output.font_height = static_cast<std::uint32_t>(font_height);
        const std::size_t byte_count =
            static_cast<std::size_t>(font_width) * font_height * 4U;
        const auto* begin = reinterpret_cast<const std::byte*>(font_pixels);
        output.font_rgba8.assign(begin, begin + byte_count);
    }

    std::uint32_t global_vertex_offset = 0U;
    std::uint32_t global_index_offset = 0U;
    for (const ImDrawList* list : source->CmdLists) {
        for (const auto& vertex : list->VtxBuffer) {
            output.vertices.push_back({
                {vertex.pos.x, vertex.pos.y},
                {vertex.uv.x, vertex.uv.y},
                vertex.col});
        }
        for (const ImDrawIdx index : list->IdxBuffer) {
            output.indices.push_back(static_cast<std::uint32_t>(index));
        }
        for (const auto& command : list->CmdBuffer) {
            if (command.UserCallback != nullptr || command.ElemCount == 0U) continue;
            const ImTextureID texture_id = command.GetTexID();
            const std::uint32_t texture_index = texture_id <= 1U
                ? 0U
                : texture_id - 1U > std::numeric_limits<std::uint32_t>::max()
                    ? std::numeric_limits<std::uint32_t>::max()
                    : static_cast<std::uint32_t>(texture_id - 1U);
            output.batches.push_back({
                {
                    command.ClipRect.x,
                    command.ClipRect.y,
                    command.ClipRect.z,
                    command.ClipRect.w},
                command.ElemCount,
                global_index_offset + command.IdxOffset,
                static_cast<std::int32_t>(global_vertex_offset + command.VtxOffset),
                texture_index});
        }
        global_vertex_offset += static_cast<std::uint32_t>(list->VtxBuffer.Size);
        global_index_offset += static_cast<std::uint32_t>(list->IdxBuffer.Size);
    }
    return output;
}

Result<void> DebugUi::add_overlay_pass(
    render_graph::RenderGraph& graph,
    render_graph::ResourceRef back_buffer) {
    if (!implementation_->enabled) {
        return {};
    }
    if (!back_buffer.valid()) {
        return Error{ErrorCode::InvalidHandle, "debug UI requires a valid back buffer"};
    }
    auto insertion = graph.insert_pass_before("Present", "DearImGui");
    if (!insertion) {
        return Error{ErrorCode::InvalidState, insertion.error().message};
    }
    insertion.value().write(
        back_buffer, render_graph::ResourceUsage::ColorAttachmentWrite);
    return {};
}

}  // namespace alpha::debug_ui
