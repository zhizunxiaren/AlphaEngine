#include <aengine/platform/platform_host.hpp>

#include <SDL3/SDL.h>
#include <SDL3/SDL_properties.h>

#include <algorithm>
#include <cstdint>
#include <memory>
#include <utility>

namespace alpha::platform {
namespace {

[[nodiscard]] KeyCode key_code(SDL_Scancode code) noexcept {
    switch (code) {
    case SDL_SCANCODE_TAB: return KeyCode::Tab;
    case SDL_SCANCODE_LEFT: return KeyCode::Left;
    case SDL_SCANCODE_RIGHT: return KeyCode::Right;
    case SDL_SCANCODE_UP: return KeyCode::Up;
    case SDL_SCANCODE_DOWN: return KeyCode::Down;
    case SDL_SCANCODE_PAGEUP: return KeyCode::PageUp;
    case SDL_SCANCODE_PAGEDOWN: return KeyCode::PageDown;
    case SDL_SCANCODE_HOME: return KeyCode::Home;
    case SDL_SCANCODE_END: return KeyCode::End;
    case SDL_SCANCODE_INSERT: return KeyCode::Insert;
    case SDL_SCANCODE_DELETE: return KeyCode::Delete;
    case SDL_SCANCODE_BACKSPACE: return KeyCode::Backspace;
    case SDL_SCANCODE_SPACE: return KeyCode::Space;
    case SDL_SCANCODE_RETURN: return KeyCode::Enter;
    case SDL_SCANCODE_ESCAPE: return KeyCode::Escape;
    case SDL_SCANCODE_A: return KeyCode::A;
    case SDL_SCANCODE_C: return KeyCode::C;
    case SDL_SCANCODE_V: return KeyCode::V;
    case SDL_SCANCODE_X: return KeyCode::X;
    case SDL_SCANCODE_Y: return KeyCode::Y;
    case SDL_SCANCODE_Z: return KeyCode::Z;
    default: return KeyCode::Unknown;
    }
}

[[nodiscard]] std::uint32_t modifiers(SDL_Keymod value) noexcept {
    std::uint32_t result = ModifierNone;
    if ((value & SDL_KMOD_CTRL) != 0U) result |= ModifierCtrl;
    if ((value & SDL_KMOD_SHIFT) != 0U) result |= ModifierShift;
    if ((value & SDL_KMOD_ALT) != 0U) result |= ModifierAlt;
    if ((value & SDL_KMOD_GUI) != 0U) result |= ModifierSuper;
    return result;
}

}  // namespace

struct SdlPlatformHost::Impl {
    SDL_Window* window{};
    SurfaceHandle surface{SurfaceHandle::from_parts(1U, 1U)};
    Extent2D extent{};
    SurfaceState state{SurfaceState::Ready};
};

Result<std::unique_ptr<SdlPlatformHost>> SdlPlatformHost::create(
    const WindowConfig& config) {
    if (config.width == 0U || config.height == 0U || config.title.empty()) {
        return Error{ErrorCode::InvalidArgument, "window title and extent must be valid"};
    }
    if (!SDL_Init(SDL_INIT_VIDEO)) {
        return Error{ErrorCode::BackendFailure, SDL_GetError()};
    }

    SDL_WindowFlags flags = 0U;
    if (config.resizable) {
        flags |= SDL_WINDOW_RESIZABLE;
    }
    if (config.high_pixel_density) {
        flags |= SDL_WINDOW_HIGH_PIXEL_DENSITY;
    }
    SDL_Window* window = SDL_CreateWindow(
        config.title.c_str(),
        static_cast<int>(config.width),
        static_cast<int>(config.height),
        flags);
    if (window == nullptr) {
        const std::string message = SDL_GetError();
        SDL_QuitSubSystem(SDL_INIT_VIDEO);
        return Error{ErrorCode::BackendFailure, message};
    }

    auto implementation = std::make_unique<Impl>();
    implementation->window = window;
    int width = 0;
    int height = 0;
    SDL_GetWindowSizeInPixels(window, &width, &height);
    implementation->extent = {
        static_cast<std::uint32_t>(std::max(width, 0)),
        static_cast<std::uint32_t>(std::max(height, 0))};
    return std::unique_ptr<SdlPlatformHost>{
        new SdlPlatformHost{std::move(implementation)}};
}

SdlPlatformHost::SdlPlatformHost(std::unique_ptr<Impl> implementation)
    : implementation_(std::move(implementation)) {}

SdlPlatformHost::~SdlPlatformHost() {
    if (implementation_ && implementation_->window != nullptr) {
        SDL_DestroyWindow(implementation_->window);
    }
    SDL_QuitSubSystem(SDL_INIT_VIDEO);
}

EventBatch SdlPlatformHost::poll_events() {
    EventBatch events;
    implementation_->state = implementation_->state == SurfaceState::Resized
        ? SurfaceState::Ready
        : implementation_->state;

    SDL_Event event{};
    while (SDL_PollEvent(&event)) {
        switch (event.type) {
        case SDL_EVENT_QUIT:
        case SDL_EVENT_WINDOW_CLOSE_REQUESTED:
            implementation_->state = SurfaceState::Closing;
            events.push_back({EventType::Quit});
            break;
        case SDL_EVENT_WINDOW_PIXEL_SIZE_CHANGED:
        case SDL_EVENT_WINDOW_RESIZED: {
            int width = 0;
            int height = 0;
            SDL_GetWindowSizeInPixels(implementation_->window, &width, &height);
            implementation_->extent = {
                static_cast<std::uint32_t>(std::max(width, 0)),
                static_cast<std::uint32_t>(std::max(height, 0))};
            implementation_->state = SurfaceState::Resized;
            events.push_back({EventType::SurfaceChanged});
            break;
        }
        case SDL_EVENT_WINDOW_MINIMIZED:
            implementation_->state = SurfaceState::Minimized;
            events.push_back({EventType::SurfaceChanged});
            break;
        case SDL_EVENT_WINDOW_OCCLUDED:
            implementation_->state = SurfaceState::Occluded;
            events.push_back({EventType::SurfaceChanged});
            break;
        case SDL_EVENT_WINDOW_RESTORED:
        case SDL_EVENT_WINDOW_EXPOSED:
            implementation_->state = SurfaceState::Ready;
            events.push_back({EventType::SurfaceChanged});
            break;
        case SDL_EVENT_KEY_DOWN:
        case SDL_EVENT_KEY_UP: {
            PlatformEvent translated;
            translated.type = EventType::Key;
            translated.code = static_cast<std::int32_t>(key_code(event.key.scancode));
            translated.pressed = event.type == SDL_EVENT_KEY_DOWN;
            translated.modifiers = modifiers(event.key.mod);
            events.push_back(std::move(translated));
            break;
        }
        case SDL_EVENT_MOUSE_MOTION:
            events.push_back({EventType::Pointer, 0, event.motion.x, event.motion.y});
            break;
        case SDL_EVENT_MOUSE_BUTTON_DOWN:
        case SDL_EVENT_MOUSE_BUTTON_UP: {
            PlatformEvent translated;
            translated.type = EventType::PointerButton;
            translated.code = std::max(0, static_cast<int>(event.button.button) - 1);
            translated.x = event.button.x;
            translated.y = event.button.y;
            translated.pressed = event.type == SDL_EVENT_MOUSE_BUTTON_DOWN;
            events.push_back(std::move(translated));
            break;
        }
        case SDL_EVENT_MOUSE_WHEEL: {
            PlatformEvent translated;
            translated.type = EventType::PointerWheel;
            translated.x = event.wheel.x;
            translated.y = event.wheel.y;
            events.push_back(std::move(translated));
            break;
        }
        case SDL_EVENT_TEXT_INPUT: {
            PlatformEvent translated;
            translated.type = EventType::Text;
            translated.text = event.text.text;
            events.push_back(std::move(translated));
            break;
        }
        default:
            break;
        }
    }
    return events;
}

SurfaceHandle SdlPlatformHost::surface() const noexcept { return implementation_->surface; }
Extent2D SdlPlatformHost::drawable_extent() const noexcept { return implementation_->extent; }
SurfaceState SdlPlatformHost::surface_state() const noexcept { return implementation_->state; }
float SdlPlatformHost::dpi_scale() const noexcept {
    return std::max(SDL_GetWindowDisplayScale(implementation_->window), 0.1F);
}

void* SdlPlatformHost::native_window_handle() const noexcept {
    return SDL_GetPointerProperty(
        SDL_GetWindowProperties(implementation_->window),
        SDL_PROP_WINDOW_WIN32_HWND_POINTER,
        nullptr);
}

}  // namespace alpha::platform
