#include "test_support.hpp"

#include <aengine/render_graph/render_graph.hpp>

#include <string>

namespace {

using alpha::render_graph::GraphErrorCode;
using alpha::render_graph::RenderGraph;
using alpha::render_graph::ResourceDesc;
using alpha::render_graph::ResourceUsage;

ALPHA_TEST("render graph compiles deterministic pass order and transitions") {
    RenderGraph graph;
    const auto shadow = graph.create_texture(ResourceDesc::texture("shadow"));
    const auto color = graph.create_texture(ResourceDesc::texture("scene-color"));

    graph.add_pass("Shadow")
        .write(shadow, ResourceUsage::DepthAttachmentWrite);
    graph.add_pass("Forward")
        .read(shadow, ResourceUsage::ShaderRead)
        .write(color, ResourceUsage::ColorAttachmentWrite);
    graph.add_pass("ToneMap")
        .read(color, ResourceUsage::ShaderRead);

    const auto result = graph.compile();

    ALPHA_REQUIRE(result.has_value());
    const auto& plan = result.value();
    ALPHA_REQUIRE_EQ(plan.passes().size(), 3U);
    ALPHA_REQUIRE_EQ(plan.passes()[0].name, std::string{"Shadow"});
    ALPHA_REQUIRE_EQ(plan.passes()[1].name, std::string{"Forward"});
    ALPHA_REQUIRE_EQ(plan.passes()[2].name, std::string{"ToneMap"});
    ALPHA_REQUIRE_EQ(plan.passes()[1].transitions.size(), 2U);
}

ALPHA_TEST("render graph rejects transient read before write") {
    RenderGraph graph;
    const auto color = graph.create_texture(ResourceDesc::texture("scene-color"));
    graph.add_pass("ToneMap").read(color, ResourceUsage::ShaderRead);

    const auto result = graph.compile();

    ALPHA_REQUIRE(!result.has_value());
    ALPHA_REQUIRE_EQ(result.error().code, GraphErrorCode::ReadBeforeWrite);
}

ALPHA_TEST("render graph rejects incompatible use in one pass") {
    RenderGraph graph;
    const auto color = graph.create_texture(ResourceDesc::texture("scene-color"));
    graph.add_pass("Broken")
        .write(color, ResourceUsage::ColorAttachmentWrite)
        .read(color, ResourceUsage::ShaderRead);

    const auto result = graph.compile();

    ALPHA_REQUIRE(!result.has_value());
    ALPHA_REQUIRE_EQ(result.error().code, GraphErrorCode::IncompatibleUsage);
}

ALPHA_TEST("same graph input yields the same execution plan") {
    auto make_plan = [] {
        RenderGraph graph;
        const auto depth = graph.create_texture(ResourceDesc::texture("depth"));
        graph.add_pass("Depth").write(depth, ResourceUsage::DepthAttachmentWrite);
        graph.add_pass("Read").read(depth, ResourceUsage::ShaderRead);
        return graph.compile();
    };

    const auto first = make_plan();
    const auto second = make_plan();

    ALPHA_REQUIRE(first.has_value());
    ALPHA_REQUIRE(second.has_value());
    ALPHA_REQUIRE_EQ(first.value().stable_hash(), second.value().stable_hash());
}

}  // namespace
