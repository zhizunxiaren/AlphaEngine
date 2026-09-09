#include <aengine/graphics/trace_graphics.hpp>

#include <algorithm>
#include <chrono>
#include <cstddef>
#include <cstdint>
#include <string>
#include <span>
#include <utility>

namespace alpha::graphics {

TraceGraphics::TraceGraphics()
    : swapchain_(SwapchainHandle::from_parts(1U, 1U)) {}

const Capabilities& TraceGraphics::capabilities() const noexcept {
    return capabilities_;
}

Result<ResourceHandle> TraceGraphics::create(const ResourceDesc& description) {
    const bool valid = std::visit(
        [](const auto& value) {
            if constexpr (requires { value.size; }) {
                return !value.name.empty() && value.size > 0U;
            } else {
                return !value.name.empty() &&
                       value.width > 0U &&
                       value.height > 0U &&
                       value.mip_levels > 0U;
            }
        },
        description);
    if (!valid) {
        return Error{
            ErrorCode::InvalidArgument,
            "resource description has an empty name or zero extent"};
    }

    std::uint32_t index = 0U;
    if (!free_resource_indices_.empty()) {
        index = free_resource_indices_.back();
        free_resource_indices_.pop_back();
    } else {
        resources_.push_back(ResourceSlot{});
        index = static_cast<std::uint32_t>(resources_.size());
    }

    ResourceSlot& slot = resources_[index - 1U];
    slot.live = true;
    slot.pending_retire = false;
    slot.buffer = std::holds_alternative<BufferDesc>(description);
    slot.capacity = slot.buffer ? std::get<BufferDesc>(description).size : 0U;
    if (!slot.buffer) {
        const auto& texture = std::get<TextureDesc>(description);
        slot.width = texture.width;
        slot.height = texture.height;
        slot.mip_levels = texture.mip_levels;
    }
    slot.uploaded = false;
    slot.last_use = completed_;
    return ResourceHandle::from_parts(index, slot.generation);
}

Result<void> TraceGraphics::upload_texture(
    ResourceHandle resource,
    const TextureUpload& upload,
    std::uint32_t bindless_index) {
    ResourceSlot* slot = find_live(resource);
    if (slot == nullptr) {
        return Error{ErrorCode::InvalidHandle, "texture upload received an invalid resource"};
    }
    if (slot->buffer || bindless_index == 0U ||
        bindless_index >= capabilities_.texture2d_descriptors ||
        upload.width != slot->width || upload.height != slot->height ||
        upload.mip_offsets.size() != slot->mip_levels ||
        upload.rgba8.empty() || upload.mip_offsets.empty() ||
        upload.mip_offsets.front() != 0U) {
        return Error{ErrorCode::InvalidArgument, "texture upload metadata or bindless slot is invalid"};
    }
    slot->uploaded = true;
    events_.push_back(TraceEvent{
        "upload-texture:" + std::to_string(bindless_index), last_submitted_});
    return {};
}

Result<void> TraceGraphics::upload(
    ResourceHandle resource,
    std::span<const std::byte> bytes) {
    ResourceSlot* slot = find_live(resource);
    if (slot == nullptr) {
        return Error{ErrorCode::InvalidHandle, "upload received an invalid or stale resource"};
    }
    if (!slot->buffer || bytes.empty() || bytes.size() > slot->capacity) {
        return Error{ErrorCode::InvalidArgument, "buffer upload is empty or exceeds resource capacity"};
    }
    slot->uploaded = true;
    events_.push_back(TraceEvent{"upload:" + std::to_string(bytes.size()), last_submitted_});
    return {};
}

void TraceGraphics::retire(ResourceHandle resource) {
    ResourceSlot* slot = find_live(resource);
    if (slot == nullptr) {
        validation_error(
            ErrorCode::InvalidHandle,
            "retire received an invalid, stale, or already retired resource");
        return;
    }

    slot->live = false;
    slot->pending_retire = true;
    if (slot->last_use.value <= completed_.value) {
        reclaim(resource.index());
    }
}

Result<FrameContext> TraceGraphics::begin_frame(SwapchainHandle swapchain) {
    if (swapchain != swapchain_) {
        return Error{
            ErrorCode::InvalidHandle,
            "begin_frame received an unknown swapchain"};
    }
    if (last_submitted_.value - completed_.value >= 2U) {
        return Error{
            ErrorCode::InvalidState,
            "two frame contexts are already in flight"};
    }

    events_.push_back(TraceEvent{"begin-frame", last_submitted_});
    return FrameContext::from_parts(next_frame_id_++, swapchain);
}

Result<Submission> TraceGraphics::execute(
    FrameContext&& frame,
    render_graph::ExecutionPlan&& plan,
    FramePacket packet) {
    if (!frame.valid() || frame.swapchain() != swapchain_) {
        return Error{
            ErrorCode::InvalidState,
            "frame context is invalid or was already consumed"};
    }

    frame.consume();
    const SubmissionToken token{last_submitted_.value + 1U};

    for (const auto& pass : plan.passes()) {
        events_.push_back(TraceEvent{pass.name, token});
    }
    for (const auto& draw : packet.draws) {
        const auto* vertex = find_live(draw.vertex_buffer);
        const auto* index = find_live(draw.index_buffer);
        if (vertex == nullptr || index == nullptr || !vertex->buffer || !index->buffer ||
            !vertex->uploaded || !index->uploaded || draw.index_count == 0U) {
            return Error{ErrorCode::InvalidState, "draw packet references missing or uninitialized mesh buffers"};
        }
        events_.push_back(TraceEvent{
            "draw-indexed:" + std::to_string(draw.index_count), token});
    }
    events_.push_back(TraceEvent{"submit", token});

    for (ResourceSlot& slot : resources_) {
        if (slot.live) {
            slot.last_use = token;
        }
    }

    last_submitted_ = token;
    return Submission{token};
}

FrameTiming TraceGraphics::latest_timing() const { return {}; }
DiagnosticSnapshot TraceGraphics::diagnostics() const { return {}; }

CompletionStatus TraceGraphics::poll(SubmissionToken token) const noexcept {
    if (token.value == 0U || token.value > last_submitted_.value) {
        return CompletionStatus::Unknown;
    }
    return token.value <= completed_.value
        ? CompletionStatus::Complete
        : CompletionStatus::Pending;
}

Result<void> TraceGraphics::wait(
    SubmissionToken token,
    std::chrono::milliseconds timeout) {
    if (token.value == 0U || token.value > last_submitted_.value) {
        return Error{ErrorCode::InvalidArgument, "unknown submission token"};
    }
    if (timeout.count() <= 0 && poll(token) != CompletionStatus::Complete) {
        return Error{ErrorCode::Timeout, "submission wait timed out"};
    }

    complete_until(token);
    return {};
}

SwapchainHandle TraceGraphics::default_swapchain() const noexcept {
    return swapchain_;
}

const std::vector<TraceEvent>& TraceGraphics::events() const noexcept {
    return events_;
}

const std::vector<Error>& TraceGraphics::validation_errors() const noexcept {
    return validation_errors_;
}

void TraceGraphics::complete_until(SubmissionToken token) {
    if (token.value > last_submitted_.value) {
        validation_error(
            ErrorCode::InvalidArgument,
            "cannot complete an unknown submission token");
        return;
    }
    completed_.value = std::max(completed_.value, token.value);
    collect_completed();
}

void TraceGraphics::clear_events() {
    events_.clear();
    validation_errors_.clear();
}

TraceGraphics::ResourceSlot* TraceGraphics::find_live(
    ResourceHandle resource) noexcept {
    if (!resource.valid() ||
        resource.index() == 0U ||
        resource.index() > resources_.size()) {
        return nullptr;
    }

    ResourceSlot& slot = resources_[resource.index() - 1U];
    if (!slot.live || slot.generation != resource.generation()) {
        return nullptr;
    }
    return &slot;
}

void TraceGraphics::reclaim(std::uint32_t index) {
    ResourceSlot& slot = resources_[index - 1U];
    slot.pending_retire = false;
    slot.buffer = false;
    slot.uploaded = false;
    slot.capacity = 0U;
    slot.width = 0U;
    slot.height = 0U;
    slot.mip_levels = 0U;
    slot.last_use = {};
    ++slot.generation;
    if (slot.generation == 0U) {
        slot.generation = 1U;
    }
    free_resource_indices_.push_back(index);
}

void TraceGraphics::collect_completed() {
    for (std::size_t index = 0; index < resources_.size(); ++index) {
        ResourceSlot& slot = resources_[index];
        if (slot.pending_retire &&
            slot.last_use.value <= completed_.value) {
            reclaim(static_cast<std::uint32_t>(index + 1U));
        }
    }
}

void TraceGraphics::validation_error(
    ErrorCode code,
    std::string message) {
    validation_errors_.push_back(Error{code, std::move(message)});
}

}  // namespace alpha::graphics
