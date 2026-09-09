#include <aengine/scene/scene.hpp>

#include <algorithm>
#include <ranges>
#include <utility>

namespace alpha::scene {

Transform Transform::identity() noexcept {
    Transform result;
    result.matrix = {
        1.0F, 0.0F, 0.0F, 0.0F,
        0.0F, 1.0F, 0.0F, 0.0F,
        0.0F, 0.0F, 1.0F, 0.0F,
        0.0F, 0.0F, 0.0F, 1.0F};
    return result;
}

Transform Transform::translation(float x, float y, float z) noexcept {
    Transform result = identity();
    result.matrix[12] = x;
    result.matrix[13] = y;
    result.matrix[14] = z;
    return result;
}

Light Light::directional(
    StableId id,
    Vec3 direction,
    bool casts_shadow) noexcept {
    Light light;
    light.id = id;
    light.type = LightType::Directional;
    light.direction = direction;
    light.casts_shadow = casts_shadow;
    return light;
}

Light Light::point(
    StableId id,
    Vec3 position,
    float intensity) noexcept {
    Light light;
    light.id = id;
    light.type = LightType::Point;
    light.position = position;
    light.intensity = intensity;
    return light;
}

RenderSnapshot::RenderSnapshot(
    std::vector<Material> materials,
    std::vector<RenderItem> items,
    CameraState camera,
    std::vector<Light> lights,
    FrameSettings settings)
    : materials_(std::move(materials)),
      items_(std::move(items)),
      camera_(camera),
      lights_(std::move(lights)),
      settings_(settings) {}

MaterialHandle Scene::add_material(Material material) {
    const auto index = static_cast<std::uint32_t>(materials_.size() + 1U);
    materials_.push_back(std::move(material));
    return MaterialHandle::from_parts(index, 1U);
}

void Scene::add_render_item(RenderItem item) {
    items_.push_back(std::move(item));
}

Result<void> Scene::add_light(Light light) {
    const auto point_count = std::ranges::count(lights_, LightType::Point, &Light::type);
    const auto shadow_directional_count = std::ranges::count_if(lights_, [](const Light& existing) {
        return existing.type == LightType::Directional && existing.casts_shadow;
    });
    if (light.type == LightType::Point && point_count >= 4) {
        return Error{ErrorCode::UnsupportedAssetFeature, "MVP1 supports at most four point lights"};
    }
    if (light.type == LightType::Directional && light.casts_shadow &&
        shadow_directional_count >= 1) {
        return Error{ErrorCode::UnsupportedAssetFeature, "MVP1 supports one shadow-casting directional light"};
    }
    lights_.push_back(std::move(light));
    return {};
}

void Scene::set_camera(CameraState camera) noexcept { camera_ = camera; }
void Scene::set_frame_settings(FrameSettings settings) noexcept { settings_ = settings; }

bool Scene::set_visible(StableId id, bool visible) noexcept {
    const auto found = std::ranges::find(items_, id, &RenderItem::id);
    if (found == items_.end()) {
        return false;
    }
    found->visible = visible;
    return true;
}

RenderSnapshot Scene::freeze() const {
    auto materials = materials_;
    auto items = items_;
    auto lights = lights_;
    std::ranges::sort(items, {}, &RenderItem::id);
    std::ranges::sort(lights, {}, &Light::id);
    return RenderSnapshot{
        std::move(materials),
        std::move(items),
        camera_,
        std::move(lights),
        settings_};
}

}  // namespace alpha::scene
