#pragma once

#include <aengine/graphics/graphics.hpp>

#include <cstdint>
#include <cstddef>
#include <memory>
#include <string>
#include <vector>

namespace alpha::graphics::d3d12 {

struct D3D12Config {
    void* window_handle{};
    std::uint32_t width{1280U};
    std::uint32_t height{720U};
    bool use_warp{false};
    bool debug_layer{true};
    bool gpu_validation{false};
    bool dred{true};
    bool vsync{true};
    bool allow_tearing{false};
    std::string shader_root;
};

class D3D12Graphics final : public Graphics {
public:
    [[nodiscard]] static Result<std::unique_ptr<D3D12Graphics>> create(
        const D3D12Config& config);
    ~D3D12Graphics() override;

    D3D12Graphics(const D3D12Graphics&) = delete;
    D3D12Graphics& operator=(const D3D12Graphics&) = delete;

    [[nodiscard]] const Capabilities& capabilities() const noexcept override;
    [[nodiscard]] Result<ResourceHandle> create(const ResourceDesc& description) override;
    [[nodiscard]] Result<void> upload(
        ResourceHandle resource,
        std::span<const std::byte> bytes) override;
    [[nodiscard]] Result<void> upload_texture(
        ResourceHandle resource,
        const TextureUpload& upload,
        std::uint32_t bindless_index) override;
    void retire(ResourceHandle resource) override;
    [[nodiscard]] Result<FrameContext> begin_frame(SwapchainHandle swapchain) override;
    [[nodiscard]] Result<Submission> execute(
        FrameContext&& frame,
        render_graph::ExecutionPlan&& plan,
        FramePacket packet = {}) override;
    [[nodiscard]] CompletionStatus poll(SubmissionToken token) const noexcept override;
    [[nodiscard]] Result<void> wait(
        SubmissionToken token,
        std::chrono::milliseconds timeout) override;
    [[nodiscard]] FrameTiming latest_timing() const override;
    [[nodiscard]] DiagnosticSnapshot diagnostics() const override;

    [[nodiscard]] SwapchainHandle default_swapchain() const noexcept;
    [[nodiscard]] Result<void> resize(std::uint32_t width, std::uint32_t height);
    [[nodiscard]] Result<std::vector<std::byte>> capture_rgba8();

private:
    struct Impl;
    explicit D3D12Graphics(std::unique_ptr<Impl> implementation);
    std::unique_ptr<Impl> implementation_;
};

}  // namespace alpha::graphics::d3d12
