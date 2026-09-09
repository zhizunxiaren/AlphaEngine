#pragma once

#include <aengine/core/handle.hpp>
#include <aengine/core/result.hpp>

#include <array>
#include <compare>
#include <cstdint>
#include <span>
#include <vector>

namespace alpha::scene {

struct StableId {
    std::uint64_t value{};
    friend constexpr auto operator<=>(StableId, StableId) = default;
};

struct MeshTag;
struct MaterialTag;
using MeshHandle = Handle<MeshTag>;
using MaterialHandle = Handle<MaterialTag>;

struct CanonicalVertex {
    std::array<float, 3> position{};
    std::array<float, 3> normal{};
    std::array<float, 4> tangent{};
    std::array<float, 2> uv{};
};
static_assert(sizeof(CanonicalVertex) == 48U);

enum class AlphaMode : std::uint32_t { Opaque, Mask };

struct Vec3 {
    float x{};
    float y{};
    float z{};
};

struct MaterialGpu {
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
static_assert(sizeof(MaterialGpu) == 80U);

struct Material {
    StableId id{};
    AlphaMode alpha_mode{AlphaMode::Opaque};
    MaterialGpu gpu{};
};

struct Transform {
    std::array<float, 16> matrix{};

    [[nodiscard]] static Transform identity() noexcept;
    [[nodiscard]] static Transform translation(float x, float y, float z) noexcept;
};

struct Bounds {
    Vec3 minimum{-1.0F, -1.0F, -1.0F};
    Vec3 maximum{1.0F, 1.0F, 1.0F};
};

struct CameraState {
    Transform view{Transform::identity()};
    Transform projection{Transform::identity()};
    Vec3 position{0.0F, 0.0F, 3.0F};
    float near_plane{0.1F};
    float far_plane{1'000.0F};
    float exposure{1.0F};
};

enum class LightType : std::uint8_t { Directional, Point };

struct Light {
    StableId id{};
    LightType type{LightType::Point};
    Vec3 color{1.0F, 1.0F, 1.0F};
    float intensity{1.0F};
    Vec3 direction{0.0F, -1.0F, 0.0F};
    Vec3 position{};
    bool casts_shadow{false};

    [[nodiscard]] static Light directional(
        StableId id,
        Vec3 direction,
        bool casts_shadow) noexcept;
    [[nodiscard]] static Light point(
        StableId id,
        Vec3 position,
        float intensity) noexcept;
};

struct FrameSettings {
    std::uint32_t viewport_width{1280U};
    std::uint32_t viewport_height{720U};
    float render_scale{1.0F};
    std::uint32_t debug_view{};
    std::uint32_t feature_flags{};
};

struct RenderItem {
    StableId id{};
    Transform transform{Transform::identity()};
    MeshHandle mesh{};
    MaterialHandle material{};
    bool visible{true};
    Bounds bounds{};
};

class RenderSnapshot {
public:
    RenderSnapshot() = default;
    RenderSnapshot(
        std::vector<Material> materials,
        std::vector<RenderItem> items,
        CameraState camera,
        std::vector<Light> lights,
        FrameSettings settings);

    [[nodiscard]] std::span<const Material> materials() const noexcept { return materials_; }
    [[nodiscard]] std::span<const RenderItem> items() const noexcept { return items_; }
    [[nodiscard]] const CameraState& camera() const noexcept { return camera_; }
    [[nodiscard]] std::span<const Light> lights() const noexcept { return lights_; }
    [[nodiscard]] const FrameSettings& settings() const noexcept { return settings_; }

private:
    std::vector<Material> materials_;
    std::vector<RenderItem> items_;
    CameraState camera_;
    std::vector<Light> lights_;
    FrameSettings settings_;
};

class Scene {
public:
    [[nodiscard]] MaterialHandle add_material(Material material);
    void add_render_item(RenderItem item);
    [[nodiscard]] Result<void> add_light(Light light);
    void set_camera(CameraState camera) noexcept;
    void set_frame_settings(FrameSettings settings) noexcept;
    bool set_visible(StableId id, bool visible) noexcept;
    [[nodiscard]] RenderSnapshot freeze() const;

private:
    std::vector<Material> materials_;
    std::vector<RenderItem> items_;
    CameraState camera_;
    std::vector<Light> lights_;
    FrameSettings settings_;
};

}  // namespace alpha::scene
