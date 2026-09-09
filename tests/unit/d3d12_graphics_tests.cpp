#include "test_support.hpp"

#include <aengine/graphics/d3d12/d3d12_graphics.hpp>
#include <aengine/renderer/forward_renderer.hpp>

#include <chrono>
#include <cstddef>

namespace {

ALPHA_TEST("D3D12 WARP executes the MVP1 frame contract headlessly") {
    alpha::graphics::d3d12::D3D12Config config;
    config.use_warp = true;
    config.width = 64U;
    config.height = 64U;
    config.debug_layer = false;

    auto created = alpha::graphics::d3d12::D3D12Graphics::create(config);
    ALPHA_REQUIRE(created.has_value());
    auto graphics = std::move(created).value();
    ALPHA_REQUIRE(graphics->capabilities().is_software);

    alpha::render_graph::RenderGraph graph;
    alpha::renderer::ForwardRenderer renderer;
    const alpha::scene::Scene scene;
    const auto output = renderer.build_frame(
        scene.freeze(),
        alpha::renderer::RenderTarget{64U, 64U},
        graph);
    auto plan = graph.compile();
    auto frame = graphics->begin_frame(graphics->default_swapchain());

    ALPHA_REQUIRE(output.has_value());
    ALPHA_REQUIRE(plan.has_value());
    ALPHA_REQUIRE(frame.has_value());

    auto submission = graphics->execute(
        std::move(frame).value(),
        std::move(plan).value());
    ALPHA_REQUIRE(submission.has_value());
    ALPHA_REQUIRE(graphics->wait(
        submission.value().token,
        std::chrono::seconds{5}).has_value());

    const auto image = graphics->capture_rgba8();
    ALPHA_REQUIRE(image.has_value());
    ALPHA_REQUIRE_EQ(image.value().size(), 64U * 64U * 4U);
    ALPHA_REQUIRE_EQ(std::to_integer<std::uint32_t>(image.value()[0]), 14U);
    ALPHA_REQUIRE_EQ(std::to_integer<std::uint32_t>(image.value()[1]), 31U);
    ALPHA_REQUIRE_EQ(std::to_integer<std::uint32_t>(image.value()[2]), 56U);
    ALPHA_REQUIRE_EQ(std::to_integer<std::uint32_t>(image.value()[3]), 255U);
}

ALPHA_TEST("D3D12 WARP survives one hundred output resizes") {
    alpha::graphics::d3d12::D3D12Config config;
    config.use_warp = true;
    config.width = 64U;
    config.height = 64U;
    config.debug_layer = false;
    auto created = alpha::graphics::d3d12::D3D12Graphics::create(config);
    ALPHA_REQUIRE(created.has_value());
    auto graphics = std::move(created).value();

    for (std::uint32_t iteration = 0U; iteration < 100U; ++iteration) {
        ALPHA_REQUIRE(graphics->resize(
            64U + (iteration % 3U),
            64U + (iteration % 5U)).has_value());
    }
}

ALPHA_TEST("D3D12 reports GPU timestamp timings after the two-frame latency") {
    alpha::graphics::d3d12::D3D12Config config;
    config.use_warp = true;
    config.width = 64U;
    config.height = 64U;
    config.debug_layer = false;
    auto created = alpha::graphics::d3d12::D3D12Graphics::create(config);
    ALPHA_REQUIRE(created.has_value());
    auto graphics = std::move(created).value();
    alpha::renderer::ForwardRenderer renderer;

    for (std::uint32_t index = 0U; index < 3U; ++index) {
        alpha::render_graph::RenderGraph graph;
        ALPHA_REQUIRE(renderer.build_frame(
            alpha::scene::Scene{}.freeze(), {64U, 64U}, graph).has_value());
        auto frame = graphics->begin_frame(graphics->default_swapchain());
        auto plan = graph.compile();
        ALPHA_REQUIRE(frame.has_value());
        ALPHA_REQUIRE(plan.has_value());
        ALPHA_REQUIRE(graphics->execute(
            std::move(frame).value(), std::move(plan).value()).has_value());
    }
    const auto timing = graphics->latest_timing();
    ALPHA_REQUIRE(timing.valid);
    ALPHA_REQUIRE(timing.gpu_frame_ms >= 0.0);
    ALPHA_REQUIRE_EQ(timing.passes.size(), 4U);
    ALPHA_REQUIRE_EQ(timing.passes[0].name, std::string{"Shadow"});
}

}  // namespace
