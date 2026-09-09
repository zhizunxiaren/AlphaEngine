#pragma once

#include <aengine/core/handle.hpp>
#include <aengine/core/result.hpp>

#include <cstdint>
#include <memory>
#include <span>
#include <string>
#include <vector>

namespace alpha::platform {

struct SurfaceTag;
using SurfaceHandle = Handle<SurfaceTag>;

struct Extent2D {
    std::uint32_t width{};
    std::uint32_t height{};
};

enum class SurfaceState : std::uint8_t {
    Ready,
    Resized,
    Minimized,
    Occluded,
    Lost,
    Closing,
};

enum class EventType : std::uint8_t {
    None,
    Quit,
    SurfaceChanged,
    Key,
    Pointer,
    PointerButton,
    PointerWheel,
    Text,
};

enum class KeyCode : std::int32_t {
    Unknown,
    Tab,
    Left,
    Right,
    Up,
    Down,
    PageUp,
    PageDown,
    Home,
    End,
    Insert,
    Delete,
    Backspace,
    Space,
    Enter,
    Escape,
    A,
    C,
    V,
    X,
    Y,
    Z,
};

enum InputModifier : std::uint32_t {
    ModifierNone = 0U,
    ModifierCtrl = 1U << 0U,
    ModifierShift = 1U << 1U,
    ModifierAlt = 1U << 2U,
    ModifierSuper = 1U << 3U,
};

struct PlatformEvent {
    EventType type{EventType::None};
    std::int32_t code{};
    float x{};
    float y{};
    bool pressed{};
    std::uint32_t modifiers{};
    std::string text;
};

using EventBatch = std::vector<PlatformEvent>;

class PlatformHost {
public:
    virtual ~PlatformHost() = default;
    [[nodiscard]] virtual EventBatch poll_events() = 0;
    [[nodiscard]] virtual SurfaceHandle surface() const noexcept = 0;
    [[nodiscard]] virtual Extent2D drawable_extent() const noexcept = 0;
    [[nodiscard]] virtual SurfaceState surface_state() const noexcept = 0;
    [[nodiscard]] virtual float dpi_scale() const noexcept = 0;
    [[nodiscard]] virtual void* native_window_handle() const noexcept = 0;
};

struct WindowConfig {
    std::string title{"AlphaEngine Sandbox"};
    std::uint32_t width{1280U};
    std::uint32_t height{720U};
    bool resizable{true};
    bool high_pixel_density{true};
};

class SdlPlatformHost final : public PlatformHost {
public:
    [[nodiscard]] static Result<std::unique_ptr<SdlPlatformHost>> create(
        const WindowConfig& config);
    ~SdlPlatformHost() override;

    SdlPlatformHost(const SdlPlatformHost&) = delete;
    SdlPlatformHost& operator=(const SdlPlatformHost&) = delete;

    [[nodiscard]] EventBatch poll_events() override;
    [[nodiscard]] SurfaceHandle surface() const noexcept override;
    [[nodiscard]] Extent2D drawable_extent() const noexcept override;
    [[nodiscard]] SurfaceState surface_state() const noexcept override;
    [[nodiscard]] float dpi_scale() const noexcept override;
    [[nodiscard]] void* native_window_handle() const noexcept override;

private:
    struct Impl;
    explicit SdlPlatformHost(std::unique_ptr<Impl> implementation);
    std::unique_ptr<Impl> implementation_;
};

}  // namespace alpha::platform
