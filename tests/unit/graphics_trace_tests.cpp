#include "test_support.hpp"

#include <aengine/graphics/trace_graphics.hpp>
#include <aengine/render_graph/render_graph.hpp>

#include <chrono>
#include <array>
#include <cstddef>
#include <string>
#include <utility>

namespace {

using alpha::ErrorCode;
using alpha::graphics::BufferDesc;
using alpha::graphics::CompletionStatus;
using alpha::graphics::TraceGraphics;
using alpha::render_graph::RenderGraph;
using alpha::render_graph::ResourceDesc;
using alpha::render_graph::ResourceUsage;

alpha::render_graph::ExecutionPlan make_plan() {
    RenderGraph graph;
    const auto color = graph.create_texture(ResourceDesc::texture("color"));
    graph.add_pass("Forward")
        .write(color, ResourceUsage::ColorAttachmentWrite);
    graph.add_pass("Present")
        .read(color, ResourceUsage::Present);
    auto result = graph.compile();
    ALPHA_REQUIRE(result.has_value());
    return std::move(result).value();
}

ALPHA_TEST("trace adapter executes the public graphics seam") {
    TraceGraphics graphics;
    auto frame = graphics.begin_frame(graphics.default_swapchain());
    ALPHA_REQUIRE(frame.has_value());

    auto submission = graphics.execute(
        std::move(frame).value(),
        make_plan());

    ALPHA_REQUIRE(submission.has_value());
    ALPHA_REQUIRE_EQ(graphics.events().size(), 4U);
    ALPHA_REQUIRE_EQ(graphics.events()[0].name, std::string{"begin-frame"});
    ALPHA_REQUIRE_EQ(graphics.events()[1].name, std::string{"Forward"});
    ALPHA_REQUIRE_EQ(graphics.events()[2].name, std::string{"Present"});
    ALPHA_REQUIRE_EQ(graphics.events()[3].name, std::string{"submit"});
    ALPHA_REQUIRE_EQ(
        graphics.poll(submission.value().token),
        CompletionStatus::Pending);
}

ALPHA_TEST("graphics seam uploads persistent mesh data and validates draw packets") {
    TraceGraphics graphics;
    const auto vertices = graphics.create(BufferDesc::device_local("vertices", 3U * 48U));
    const auto indices = graphics.create(BufferDesc::device_local("indices", 3U * 4U));
    ALPHA_REQUIRE(vertices.has_value());
    ALPHA_REQUIRE(indices.has_value());
    const std::array<std::byte, 3U * 48U> vertex_bytes{};
    const std::array<std::byte, 3U * 4U> index_bytes{};
    ALPHA_REQUIRE(graphics.upload(vertices.value(), vertex_bytes).has_value());
    ALPHA_REQUIRE(graphics.upload(indices.value(), index_bytes).has_value());
    graphics.clear_events();

    alpha::graphics::FramePacket packet;
    alpha::graphics::RenderDraw draw;
    draw.vertex_buffer = vertices.value();
    draw.index_buffer = indices.value();
    draw.index_count = 3U;
    packet.draws.push_back(draw);
    auto frame = graphics.begin_frame(graphics.default_swapchain());
    ALPHA_REQUIRE(frame.has_value());
    const auto submission = graphics.execute(
        std::move(frame).value(), make_plan(), std::move(packet));
    ALPHA_REQUIRE(submission.has_value());
    ALPHA_REQUIRE_EQ(graphics.events()[3].name, std::string{"draw-indexed:3"});

    const std::array<std::byte, 145U> too_large{};
    const auto overflow = graphics.upload(vertices.value(), too_large);
    ALPHA_REQUIRE(!overflow.has_value());
    ALPHA_REQUIRE_EQ(overflow.error().code, ErrorCode::InvalidArgument);
}

ALPHA_TEST("graphics seam publishes sampled textures to explicit bindless slots") {
    TraceGraphics graphics;
    alpha::graphics::TextureDesc description;
    description.name = "base-color";
    description.width = 2U;
    description.height = 2U;
    description.mip_levels = 1U;
    description.srgb = true;
    const auto texture = graphics.create(description);
    ALPHA_REQUIRE(texture.has_value());
    const std::array<std::uint32_t, 1> offsets{0U};
    const std::array<std::byte, 16> pixels{};
    const alpha::graphics::TextureUpload upload{
        2U, 2U, offsets, pixels};
    ALPHA_REQUIRE(graphics.upload_texture(texture.value(), upload, 1U).has_value());
    ALPHA_REQUIRE(!graphics.upload_texture(texture.value(), upload, 0U).has_value());
}

ALPHA_TEST("frame context can be consumed only once") {
    TraceGraphics graphics;
    auto frame_result = graphics.begin_frame(graphics.default_swapchain());
    ALPHA_REQUIRE(frame_result.has_value());
    auto frame = std::move(frame_result).value();

    auto first = graphics.execute(std::move(frame), make_plan());
    auto second = graphics.execute(std::move(frame), make_plan());

    ALPHA_REQUIRE(first.has_value());
    ALPHA_REQUIRE(!second.has_value());
    ALPHA_REQUIRE_EQ(second.error().code, ErrorCode::InvalidState);
}

ALPHA_TEST("resource slot is reused only after its last submission completes") {
    TraceGraphics graphics;
    const auto first = graphics.create(BufferDesc::upload("vertices", 4096U));
    ALPHA_REQUIRE(first.has_value());

    auto frame = graphics.begin_frame(graphics.default_swapchain());
    ALPHA_REQUIRE(frame.has_value());
    auto submission = graphics.execute(
        std::move(frame).value(),
        make_plan());
    ALPHA_REQUIRE(submission.has_value());

    graphics.retire(first.value());
    const auto before_completion =
        graphics.create(BufferDesc::upload("other", 1024U));
    ALPHA_REQUIRE(before_completion.has_value());
    ALPHA_REQUIRE(first.value().index() != before_completion.value().index());

    graphics.complete_until(submission.value().token);
    const auto after_completion =
        graphics.create(BufferDesc::upload("replacement", 2048U));

    ALPHA_REQUIRE(after_completion.has_value());
    ALPHA_REQUIRE_EQ(after_completion.value().index(), first.value().index());
    ALPHA_REQUIRE(
        after_completion.value().generation() > first.value().generation());
}

ALPHA_TEST("invalid and double retire become validation errors") {
    TraceGraphics graphics;
    const auto resource = graphics.create(BufferDesc::upload("vertices", 256U));
    ALPHA_REQUIRE(resource.has_value());

    graphics.retire(resource.value());
    graphics.retire(resource.value());
    graphics.retire(alpha::graphics::ResourceHandle::from_parts(999U, 1U));

    ALPHA_REQUIRE_EQ(graphics.validation_errors().size(), 2U);
    ALPHA_REQUIRE_EQ(
        graphics.validation_errors()[0].code,
        ErrorCode::InvalidHandle);
}

ALPHA_TEST("wait completes a trace submission deterministically") {
    TraceGraphics graphics;
    auto frame = graphics.begin_frame(graphics.default_swapchain());
    ALPHA_REQUIRE(frame.has_value());
    auto submission = graphics.execute(
        std::move(frame).value(),
        make_plan());
    ALPHA_REQUIRE(submission.has_value());

    const auto waited = graphics.wait(
        submission.value().token,
        std::chrono::milliseconds{100});

    ALPHA_REQUIRE(waited.has_value());
    ALPHA_REQUIRE_EQ(
        graphics.poll(submission.value().token),
        CompletionStatus::Complete);
}

ALPHA_TEST("trace adapter completes ten thousand frame lifecycles") {
    TraceGraphics graphics;
    for (std::uint32_t frame_index = 0U; frame_index < 10'000U; ++frame_index) {
        auto frame = graphics.begin_frame(graphics.default_swapchain());
        ALPHA_REQUIRE(frame.has_value());
        auto submission = graphics.execute(std::move(frame).value(), make_plan());
        ALPHA_REQUIRE(submission.has_value());
        graphics.complete_until(submission.value().token);
    }
    ALPHA_REQUIRE(graphics.validation_errors().empty());
}

}  // namespace
