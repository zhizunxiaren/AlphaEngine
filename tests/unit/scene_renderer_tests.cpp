#include "test_support.hpp"

#include <aengine/renderer/forward_renderer.hpp>
#include <aengine/scene/scene.hpp>

#include <string>

namespace {

using alpha::renderer::ForwardRenderer;
using alpha::renderer::RenderTarget;
using alpha::scene::AlphaMode;
using alpha::scene::Material;
using alpha::scene::MeshHandle;
using alpha::scene::RenderItem;
using alpha::scene::Scene;
using alpha::scene::StableId;
using alpha::scene::Transform;

ALPHA_TEST("scene freezes a deterministic immutable render snapshot") {
    Scene scene;
    const auto material = scene.add_material(Material{
        StableId{2U},
        AlphaMode::Opaque});

    scene.add_render_item(RenderItem{
        StableId{20U},
        Transform::translation(2.0F, 0.0F, 0.0F),
        MeshHandle::from_parts(2U, 1U),
        material,
        true});
    scene.add_render_item(RenderItem{
        StableId{10U},
        Transform::identity(),
        MeshHandle::from_parts(1U, 1U),
        material,
        true});

    const auto snapshot = scene.freeze();
    scene.set_visible(StableId{10U}, false);

    ALPHA_REQUIRE_EQ(snapshot.items().size(), 2U);
    ALPHA_REQUIRE_EQ(snapshot.items()[0].id.value, 10U);
    ALPHA_REQUIRE_EQ(snapshot.items()[1].id.value, 20U);
    ALPHA_REQUIRE(snapshot.items()[0].visible);
}

ALPHA_TEST("canonical CPU GPU data contracts keep their fixed size") {
    ALPHA_REQUIRE_EQ(sizeof(alpha::scene::CanonicalVertex), 48U);
    ALPHA_REQUIRE_EQ(sizeof(alpha::scene::MaterialGpu), 80U);
}

ALPHA_TEST("forward renderer emits the fixed MVP1 pass chain") {
    Scene scene;
    const auto snapshot = scene.freeze();
    alpha::render_graph::RenderGraph graph;
    ForwardRenderer renderer;

    const auto output = renderer.build_frame(
        snapshot,
        RenderTarget{1920U, 1080U},
        graph);
    const auto plan = graph.compile();

    ALPHA_REQUIRE(output.has_value());
    ALPHA_REQUIRE(plan.has_value());
    ALPHA_REQUIRE_EQ(plan.value().passes().size(), 4U);
    ALPHA_REQUIRE_EQ(
        plan.value().passes()[0].name,
        std::string{"Shadow"});
    ALPHA_REQUIRE_EQ(
        plan.value().passes()[1].name,
        std::string{"ForwardOpaqueMask"});
    ALPHA_REQUIRE_EQ(
        plan.value().passes()[2].name,
        std::string{"ToneMap"});
    ALPHA_REQUIRE_EQ(
        plan.value().passes()[3].name,
        std::string{"Present"});
}

ALPHA_TEST("forward renderer rejects a zero-sized output") {
    Scene scene;
    alpha::render_graph::RenderGraph graph;
    ForwardRenderer renderer;

    const auto result = renderer.build_frame(
        scene.freeze(),
        RenderTarget{0U, 1080U},
        graph);

    ALPHA_REQUIRE(!result.has_value());
    ALPHA_REQUIRE_EQ(result.error().code, alpha::ErrorCode::InvalidArgument);
}

ALPHA_TEST("scene snapshot carries one shadow sun and at most four point lights") {
    Scene scene;
    ALPHA_REQUIRE(scene.add_light(alpha::scene::Light::directional(
        StableId{1U}, {0.0F, -1.0F, 0.0F}, true)).has_value());
    for (std::uint64_t id = 2U; id < 6U; ++id) {
        ALPHA_REQUIRE(scene.add_light(alpha::scene::Light::point(
            StableId{id}, {0.0F, 1.0F, 0.0F}, 10.0F)).has_value());
    }
    const auto rejected = scene.add_light(alpha::scene::Light::point(
        StableId{6U}, {0.0F, 1.0F, 0.0F}, 10.0F));

    ALPHA_REQUIRE(!rejected.has_value());
    ALPHA_REQUIRE_EQ(rejected.error().code, alpha::ErrorCode::UnsupportedAssetFeature);
    ALPHA_REQUIRE_EQ(scene.freeze().lights().size(), 5U);
}

ALPHA_TEST("forward draw list filters visibility and sorts deterministically") {
    Scene scene;
    const auto opaque = scene.add_material(Material{StableId{1U}, AlphaMode::Opaque});
    const auto mask = scene.add_material(Material{StableId{2U}, AlphaMode::Mask});
    scene.add_render_item({StableId{30U}, Transform::identity(), MeshHandle::from_parts(2U, 1U), mask, true});
    scene.add_render_item({StableId{20U}, Transform::identity(), MeshHandle::from_parts(1U, 1U), opaque, false});
    scene.add_render_item({StableId{10U}, Transform::identity(), MeshHandle::from_parts(1U, 1U), opaque, true});
    alpha::render_graph::RenderGraph graph;
    ForwardRenderer renderer;

    const auto output = renderer.build_frame(scene.freeze(), {1280U, 720U}, graph);
    ALPHA_REQUIRE(output.has_value());
    ALPHA_REQUIRE_EQ(output.value().draw_list.size(), 2U);
    ALPHA_REQUIRE_EQ(output.value().draw_list[0].object_id.value, 10U);
    ALPHA_REQUIRE_EQ(output.value().draw_list[1].object_id.value, 30U);
}

ALPHA_TEST("forward renderer culls bounds outside the D3D clip frustum") {
    Scene scene;
    const auto material = scene.add_material(Material{StableId{1U}, AlphaMode::Opaque});
    RenderItem inside{
        StableId{1U}, Transform::identity(), MeshHandle::from_parts(1U, 1U), material, true};
    inside.bounds = {{-0.5F, -0.5F, 0.1F}, {0.5F, 0.5F, 0.9F}};
    RenderItem outside{
        StableId{2U}, Transform::translation(3.0F, 0.0F, 0.0F),
        MeshHandle::from_parts(1U, 1U), material, true};
    outside.bounds = inside.bounds;
    scene.add_render_item(inside);
    scene.add_render_item(outside);
    alpha::render_graph::RenderGraph graph;
    ForwardRenderer renderer;

    const auto output = renderer.build_frame(scene.freeze(), {1280U, 720U}, graph);

    ALPHA_REQUIRE(output.has_value());
    ALPHA_REQUIRE_EQ(output.value().draw_list.size(), 1U);
    ALPHA_REQUIRE_EQ(output.value().draw_list[0].object_id.value, 1U);
}

ALPHA_TEST("forward renderer keeps reference bounds in a RH zero-to-one perspective") {
    Scene scene;
    const auto material = scene.add_material(Material{StableId{1U}, AlphaMode::Opaque});
    RenderItem item{
        StableId{1U}, Transform::identity(), MeshHandle::from_parts(1U, 1U), material, true};
    item.bounds = {{-0.72F, -0.72F, 0.2F}, {0.72F, 0.72F, 0.2F}};
    scene.add_render_item(item);
    alpha::scene::CameraState camera;
    camera.position = {0.0F, 0.0F, 3.0F};
    camera.view.matrix = {
        1.0F, 0.0F, 0.0F, 0.0F,
        0.0F, 1.0F, 0.0F, 0.0F,
        0.0F, 0.0F, 1.0F, 0.0F,
        0.0F, 0.0F, -3.0F, 1.0F};
    camera.projection.matrix = {
        0.9742786F, 0.0F, 0.0F, 0.0F,
        0.0F, 1.7320508F, 0.0F, 0.0F,
        0.0F, 0.0F, -1.001001F, -1.0F,
        0.0F, 0.0F, -0.1001001F, 0.0F};
    scene.set_camera(camera);
    alpha::render_graph::RenderGraph graph;
    ForwardRenderer renderer;

    const auto output = renderer.build_frame(scene.freeze(), {1920U, 1080U}, graph);

    ALPHA_REQUIRE(output.has_value());
    ALPHA_REQUIRE_EQ(output.value().draw_list.size(), 1U);
}

}  // namespace
