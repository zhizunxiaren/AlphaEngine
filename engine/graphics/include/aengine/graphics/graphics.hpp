#pragma once

#include <aengine/core/handle.hpp>
#include <aengine/core/result.hpp>
#include <aengine/render_graph/render_graph.hpp>

#include <array>
#include <chrono>
#include <compare>
#include <cstdint>
#include <string>
#include <span>
#include <utility>
#include <variant>
#include <vector>

namespace alpha::graphics {

struct ResourceTag;
struct SwapchainTag;
using ResourceHandle = Handle<ResourceTag>;
using SwapchainHandle = Handle<SwapchainTag>;

enum class MemoryClass : std::uint8_t {
    DeviceLocal,
    Upload,
    Readback,
};

struct BufferDesc {
    std::string name;
    std::uint64_t size{0U};
    MemoryClass memory{MemoryClass::DeviceLocal};

    [[nodiscard]] static BufferDesc upload(
        std::string name,
        std::uint64_t size) {
        return BufferDesc{std::move(name), size, MemoryClass::Upload};
    }
    [[nodiscard]] static BufferDesc device_local(
        std::string name,
        std::uint64_t size) {
        return BufferDesc{std::move(name), size, MemoryClass::DeviceLocal};
    }
};

struct TextureDesc {
    std::string name;
    std::uint32_t width{1U};
    std::uint32_t height{1U};
    std::uint16_t mip_levels{1U};
    bool srgb{false};
};

struct TextureUpload {
    std::uint32_t width{};
    std::uint32_t height{};
    std::span<const std::uint32_t> mip_offsets;
    std::span<const std::byte> rgba8;
};

using ResourceDesc = std::variant<BufferDesc, TextureDesc>;

struct Capabilities {
    std::string adapter_name{"Trace Adapter"};
    std::uint32_t feature_level_major{12U};
    std::uint32_t feature_level_minor{0U};
    std::uint32_t shader_model_major{6U};
    std::uint32_t shader_model_minor{0U};
    std::uint32_t resource_binding_tier{3U};
    std::uint32_t texture2d_descriptors{4096U};
    std::uint32_t sampler_descriptors{64U};
    bool is_software{true};
};

struct SubmissionToken {
    std::uint64_t value{0U};
    auto operator<=>(const SubmissionToken&) const = default;
};

enum class CompletionStatus : std::uint8_t {
    Unknown,
    Pending,
    Complete,
};

struct Submission {
    SubmissionToken token;
};

inline constexpr std::array<float, 16> identity_matrix{
    1.0F, 0.0F, 0.0F, 0.0F,
    0.0F, 1.0F, 0.0F, 0.0F,
    0.0F, 0.0F, 1.0F, 0.0F,
    0.0F, 0.0F, 0.0F, 1.0F};

struct PbrMaterialData {
    std::array<float, 4> base_color{1.0F, 1.0F, 1.0F, 1.0F};
    std::array<float, 3> emissive{};
    float metallic{};
    float roughness{1.0F};
    float normal_scale{1.0F};
    float occlusion_strength{1.0F};
    float alpha_cutoff{0.5F};
    std::array<std::uint32_t, 5> texture_indices{};
    std::uint32_t sampler_index{};
    std::uint32_t alpha_mode{};
    std::uint32_t flags{};
};
static_assert(sizeof(PbrMaterialData) == 80U);

struct RenderDraw {
    ResourceHandle vertex_buffer;
    ResourceHandle index_buffer;
    std::uint32_t index_count{};
    std::uint32_t first_index{};
    std::int32_t vertex_offset{};
    std::array<float, 16> world{identity_matrix};
    PbrMaterialData material;
};

struct DirectionalLightData {
    std::array<float, 3> direction{-0.35F, -0.65F, -0.8F};
    float intensity{5.0F};
    std::array<float, 3> color{1.0F, 0.94F, 0.86F};
    float padding{};
};

struct PointLightData {
    std::array<float, 3> position{};
    float intensity{};
    std::array<float, 3> color{1.0F, 1.0F, 1.0F};
    float padding{};
};

struct UiVertex {
    std::array<float, 2> position{};
    std::array<float, 2> uv{};
    std::uint32_t color{};
};
static_assert(sizeof(UiVertex) == 20U);

struct UiDrawBatch {
    std::array<float, 4> clip_rect{};
    std::uint32_t index_count{};
    std::uint32_t first_index{};
    std::int32_t vertex_offset{};
    std::uint32_t texture_index{};
};

struct UiDrawData {
    std::array<float, 2> display_position{};
    std::array<float, 2> display_size{};
    std::array<float, 2> framebuffer_scale{1.0F, 1.0F};
    std::uint32_t font_width{};
    std::uint32_t font_height{};
    std::vector<std::byte> font_rgba8;
    std::vector<UiVertex> vertices;
    std::vector<std::uint32_t> indices;
    std::vector<UiDrawBatch> batches;
};

struct FramePacket {
    std::array<float, 16> view_projection{identity_matrix};
    std::array<float, 3> camera_position{0.0F, 0.0F, 3.0F};
    float exposure{1.0F};
    std::array<float, 16> light_view_projection{identity_matrix};
    DirectionalLightData directional_light;
    std::array<PointLightData, 4> point_lights{};
    std::uint32_t point_light_count{};
    std::vector<RenderDraw> draws;
    UiDrawData ui;
};

struct PassTiming {
    std::string name;
    double milliseconds{};
};

struct FrameTiming {
    bool valid{};
    double gpu_frame_ms{};
    std::vector<PassTiming> passes;
};

struct DiagnosticSnapshot {
    bool device_lost{};
    std::int64_t native_reason{};
    std::uint64_t page_fault_address{};
    std::string last_pass;
    std::vector<std::string> validation_errors;
    std::vector<std::string> dred_breadcrumbs;
};

class FrameContext {
public:
    FrameContext() = default;
    FrameContext(const FrameContext&) = delete;
    FrameContext& operator=(const FrameContext&) = delete;
    FrameContext(FrameContext&& other) noexcept
        : id_(std::exchange(other.id_, 0U)),
          swapchain_(std::exchange(other.swapchain_, {})) {}
    FrameContext& operator=(FrameContext&& other) noexcept {
        if (this != &other) {
            id_ = std::exchange(other.id_, 0U);
            swapchain_ = std::exchange(other.swapchain_, {});
        }
        return *this;
    }

    [[nodiscard]] static FrameContext from_parts(
        std::uint64_t id,
        SwapchainHandle swapchain) noexcept {
        return FrameContext{id, swapchain};
    }

    [[nodiscard]] bool valid() const noexcept {
        return id_ != 0U && swapchain_.valid();
    }
    [[nodiscard]] std::uint64_t id() const noexcept { return id_; }
    [[nodiscard]] SwapchainHandle swapchain() const noexcept { return swapchain_; }
    void consume() noexcept {
        id_ = 0U;
        swapchain_ = {};
    }

private:
    FrameContext(std::uint64_t id, SwapchainHandle swapchain) noexcept
        : id_(id), swapchain_(swapchain) {}

    std::uint64_t id_{0U};
    SwapchainHandle swapchain_;
};

class Graphics {
public:
    virtual ~Graphics() = default;

    [[nodiscard]] virtual const Capabilities& capabilities() const noexcept = 0;
    [[nodiscard]] virtual Result<ResourceHandle> create(
        const ResourceDesc& description) = 0;
    [[nodiscard]] virtual Result<void> upload(
        ResourceHandle resource,
        std::span<const std::byte> bytes) = 0;
    [[nodiscard]] virtual Result<void> upload_texture(
        ResourceHandle resource,
        const TextureUpload& upload,
        std::uint32_t bindless_index) = 0;
    virtual void retire(ResourceHandle resource) = 0;
    [[nodiscard]] virtual Result<FrameContext> begin_frame(
        SwapchainHandle swapchain) = 0;
    [[nodiscard]] virtual Result<Submission> execute(
        FrameContext&& frame,
        render_graph::ExecutionPlan&& plan,
        FramePacket packet = {}) = 0;
    [[nodiscard]] virtual CompletionStatus poll(
        SubmissionToken token) const noexcept = 0;
    [[nodiscard]] virtual Result<void> wait(
        SubmissionToken token,
        std::chrono::milliseconds timeout) = 0;
    [[nodiscard]] virtual FrameTiming latest_timing() const = 0;
    [[nodiscard]] virtual DiagnosticSnapshot diagnostics() const = 0;
};

}  // namespace alpha::graphics
