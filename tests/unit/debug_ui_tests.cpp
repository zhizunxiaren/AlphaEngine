#include "test_support.hpp"

#include <aengine/debug_ui/debug_ui.hpp>
#include <aengine/renderer/forward_renderer.hpp>

#include <algorithm>
#include <string>

namespace {

ALPHA_TEST("debug UI is an explicit overlay between tone map and present") {
    alpha::render_graph::RenderGraph graph;
    alpha::renderer::ForwardRenderer renderer;
    const alpha::scene::Scene scene;
    const auto output = renderer.build_frame(scene.freeze(), {1280U, 720U}, graph);
    ALPHA_REQUIRE(output.has_value());

    alpha::debug_ui::DebugUi ui;
    ALPHA_REQUIRE(ui.add_overlay_pass(graph, output.value().back_buffer).has_value());
    const auto plan = graph.compile();

    ALPHA_REQUIRE(plan.has_value());
    ALPHA_REQUIRE_EQ(plan.value().passes().size(), 5U);
    ALPHA_REQUIRE_EQ(plan.value().passes()[2].name, std::string{"ToneMap"});
    ALPHA_REQUIRE_EQ(plan.value().passes()[3].name, std::string{"DearImGui"});
    ALPHA_REQUIRE_EQ(plan.value().passes()[4].name, std::string{"Present"});
}

ALPHA_TEST("disabled debug UI cannot alter the graph") {
    alpha::debug_ui::DebugUi ui;
    ui.set_enabled(false);
    alpha::render_graph::RenderGraph graph;

    ALPHA_REQUIRE(ui.add_overlay_pass(graph, {}).has_value());
    ALPHA_REQUIRE_EQ(graph.compile().value().passes().size(), 0U);
}

ALPHA_TEST("debug UI exports backend-neutral indexed draw data") {
    alpha::debug_ui::DebugUi ui;
    alpha::debug_ui::DebugSnapshot snapshot;
    snapshot.preview_texture_index = 7U;
    ui.begin_frame({640U, 480U, 1.0F / 60.0F, 1.0F}, snapshot);
    (void)ui.build_default_panels();
    const auto draw_data = ui.draw_data();

    ALPHA_REQUIRE(draw_data.font_width > 0U);
    ALPHA_REQUIRE(draw_data.font_height > 0U);
    ALPHA_REQUIRE(!draw_data.font_rgba8.empty());
    ALPHA_REQUIRE(!draw_data.vertices.empty());
    ALPHA_REQUIRE(!draw_data.indices.empty());
    ALPHA_REQUIRE(!draw_data.batches.empty());
    ALPHA_REQUIRE(std::ranges::any_of(draw_data.batches, [](const auto& batch) {
        return batch.texture_index == 7U;
    }));
}

}  // namespace
