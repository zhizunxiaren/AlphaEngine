#include <aengine/renderer/forward_renderer.hpp>

#include <algorithm>
#include <array>
#include <cmath>
#include <tuple>

namespace alpha::renderer {
namespace {

[[nodiscard]] std::array<float, 16> multiply(
    const std::array<float, 16>& left,
    const std::array<float, 16>& right) noexcept {
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

[[nodiscard]] bool valid_bounds(const scene::Bounds& bounds) noexcept {
    return std::isfinite(bounds.minimum.x) && std::isfinite(bounds.minimum.y) &&
        std::isfinite(bounds.minimum.z) && std::isfinite(bounds.maximum.x) &&
        std::isfinite(bounds.maximum.y) && std::isfinite(bounds.maximum.z) &&
        bounds.minimum.x <= bounds.maximum.x &&
        bounds.minimum.y <= bounds.maximum.y &&
        bounds.minimum.z <= bounds.maximum.z;
}

[[nodiscard]] bool intersects_frustum(
    const scene::RenderItem& item,
    const scene::CameraState& camera) noexcept {
    const auto view_projection = multiply(camera.view.matrix, camera.projection.matrix);
    const auto transform = multiply(item.transform.matrix, view_projection);
    std::array<bool, 6> all_outside{true, true, true, true, true, true};
    for (std::uint32_t corner = 0U; corner < 8U; ++corner) {
        const float x = (corner & 1U) != 0U ? item.bounds.maximum.x : item.bounds.minimum.x;
        const float y = (corner & 2U) != 0U ? item.bounds.maximum.y : item.bounds.minimum.y;
        const float z = (corner & 4U) != 0U ? item.bounds.maximum.z : item.bounds.minimum.z;
        const std::array<float, 4> clip{
            x * transform[0] + y * transform[4] + z * transform[8] + transform[12],
            x * transform[1] + y * transform[5] + z * transform[9] + transform[13],
            x * transform[2] + y * transform[6] + z * transform[10] + transform[14],
            x * transform[3] + y * transform[7] + z * transform[11] + transform[15]};
        all_outside[0] = all_outside[0] && clip[0] < -clip[3];
        all_outside[1] = all_outside[1] && clip[0] > clip[3];
        all_outside[2] = all_outside[2] && clip[1] < -clip[3];
        all_outside[3] = all_outside[3] && clip[1] > clip[3];
        all_outside[4] = all_outside[4] && clip[2] < 0.0F;
        all_outside[5] = all_outside[5] && clip[2] > clip[3];
    }
    return std::ranges::none_of(all_outside, [](bool outside) { return outside; });
}

}  // namespace

Result<RenderOutput> ForwardRenderer::build_frame(
    const scene::RenderSnapshot& snapshot,
    RenderTarget target,
    render_graph::RenderGraph& graph) const {
    if (target.width == 0U || target.height == 0U) {
        return Error{ErrorCode::InvalidArgument, "render target dimensions must be non-zero"};
    }

    std::vector<DrawCommand> draw_list;
    draw_list.reserve(snapshot.items().size());
    for (const auto& item : snapshot.items()) {
        if (!item.visible) {
            continue;
        }
        if (!item.mesh.valid() || !item.material.valid() ||
            item.material.index() > snapshot.materials().size()) {
            return Error{ErrorCode::InvalidHandle, "render item references an invalid mesh or material"};
        }
        if (!valid_bounds(item.bounds)) {
            return Error{ErrorCode::InvalidArgument, "render item has invalid local bounds"};
        }
        if (!intersects_frustum(item, snapshot.camera())) {
            continue;
        }
        const auto& material = snapshot.materials()[item.material.index() - 1U];
        draw_list.push_back({
            item.id, item.mesh, item.material, item.transform, material.alpha_mode});
    }
    std::ranges::sort(draw_list, [](const DrawCommand& left, const DrawCommand& right) {
        return std::tuple{
            left.alpha_mode,
            left.material.raw(),
            left.mesh.raw(),
            left.object_id.value} <
            std::tuple{
                right.alpha_mode,
                right.material.raw(),
                right.mesh.raw(),
                right.object_id.value};
    });
    using namespace render_graph;
    const auto shadow_map = graph.create_texture(ResourceDesc::texture(
        "ShadowMap", ResourceLifetime::Persistent, 2048U, 2048U, TextureFormat::R32Typeless));
    const auto scene_depth = graph.create_texture(ResourceDesc::texture(
        "SceneDepth", ResourceLifetime::Transient, target.width, target.height, TextureFormat::D32Float));
    const auto scene_color = graph.create_texture(ResourceDesc::texture(
        "SceneColor", ResourceLifetime::Transient, target.width, target.height, TextureFormat::RGBA16Float));
    const auto back_buffer = graph.create_texture(ResourceDesc::texture(
        "BackBuffer", ResourceLifetime::Imported, target.width, target.height, TextureFormat::RGBA8Unorm));

    graph.add_pass("Shadow").write(shadow_map, ResourceUsage::DepthAttachmentWrite);
    graph.add_pass("ForwardOpaqueMask")
        .read(shadow_map, ResourceUsage::ShaderRead)
        .write(scene_depth, ResourceUsage::DepthAttachmentWrite)
        .write(scene_color, ResourceUsage::ColorAttachmentWrite);
    graph.add_pass("ToneMap")
        .read(scene_color, ResourceUsage::ShaderRead)
        .write(back_buffer, ResourceUsage::ColorAttachmentWrite);
    graph.add_pass("Present").read(back_buffer, ResourceUsage::Present);

    return RenderOutput{
        back_buffer,
        scene_color,
        scene_depth,
        shadow_map,
        std::move(draw_list)};
}

}  // namespace alpha::renderer
