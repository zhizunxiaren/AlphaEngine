#pragma once

#include <aengine/graphics/graphics.hpp>

#include <cstdint>
#include <string>
#include <vector>

namespace alpha::graphics {

struct TraceEvent {
    std::string name;
    SubmissionToken submission;
};

class TraceGraphics final : public Graphics {
public:
    TraceGraphics();

    [[nodiscard]] const Capabilities& capabilities() const noexcept override;
    [[nodiscard]] Result<ResourceHandle> create(
        const ResourceDesc& description) override;
    [[nodiscard]] Result<void> upload(
        ResourceHandle resource,
        std::span<const std::byte> bytes) override;
    [[nodiscard]] Result<void> upload_texture(
        ResourceHandle resource,
        const TextureUpload& upload,
        std::uint32_t bindless_index) override;
    void retire(ResourceHandle resource) override;
    [[nodiscard]] Result<FrameContext> begin_frame(
        SwapchainHandle swapchain) override;
    [[nodiscard]] Result<Submission> execute(
        FrameContext&& frame,
        render_graph::ExecutionPlan&& plan,
        FramePacket packet = {}) override;
    [[nodiscard]] CompletionStatus poll(
        SubmissionToken token) const noexcept override;
    [[nodiscard]] Result<void> wait(
        SubmissionToken token,
        std::chrono::milliseconds timeout) override;
    [[nodiscard]] FrameTiming latest_timing() const override;
    [[nodiscard]] DiagnosticSnapshot diagnostics() const override;

    [[nodiscard]] SwapchainHandle default_swapchain() const noexcept;
    [[nodiscard]] const std::vector<TraceEvent>& events() const noexcept;
    [[nodiscard]] const std::vector<Error>& validation_errors() const noexcept;

    void complete_until(SubmissionToken token);
    void clear_events();

private:
    struct ResourceSlot {
        std::uint32_t generation{1U};
        bool live{false};
        bool pending_retire{false};
        bool buffer{false};
        bool uploaded{false};
        std::uint64_t capacity{};
        std::uint32_t width{};
        std::uint32_t height{};
        std::uint16_t mip_levels{};
        SubmissionToken last_use;
    };

    [[nodiscard]] ResourceSlot* find_live(ResourceHandle resource) noexcept;
    void reclaim(std::uint32_t index);
    void collect_completed();
    void validation_error(ErrorCode code, std::string message);

    Capabilities capabilities_;
    SwapchainHandle swapchain_;
    std::vector<ResourceSlot> resources_;
    std::vector<std::uint32_t> free_resource_indices_;
    std::vector<TraceEvent> events_;
    std::vector<Error> validation_errors_;
    SubmissionToken last_submitted_;
    SubmissionToken completed_;
    std::uint64_t next_frame_id_{1U};
};

}  // namespace alpha::graphics
