#pragma once

#include <aengine/core/result.hpp>
#include <aengine/render_graph/render_graph.hpp>
#include <aengine/scene/scene.hpp>

#include <cstdint>
#include <vector>

namespace alpha::renderer {

struct RenderTarget {
    std::uint32_t width{};
    std::uint32_t height{};
};

struct DrawCommand {
    scene::StableId object_id{};
    scene::MeshHandle mesh{};
    scene::MaterialHandle material{};
    scene::Transform world{scene::Transform::identity()};
    scene::AlphaMode alpha_mode{scene::AlphaMode::Opaque};
};

struct RenderOutput {
    render_graph::ResourceRef back_buffer{};
    render_graph::ResourceRef scene_color{};
    render_graph::ResourceRef scene_depth{};
    render_graph::ResourceRef shadow_map{};
    std::vector<DrawCommand> draw_list;
};

class ForwardRenderer {
public:
    [[nodiscard]] Result<RenderOutput> build_frame(
        const scene::RenderSnapshot& snapshot,
        RenderTarget target,
        render_graph::RenderGraph& graph) const;
};

}  // namespace alpha::renderer
