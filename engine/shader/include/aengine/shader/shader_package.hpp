#pragma once

#include <aengine/content/content.hpp>
#include <aengine/core/result.hpp>

#include <cstddef>
#include <cstdint>
#include <span>
#include <string>
#include <string_view>
#include <vector>

namespace alpha::shader {

class ShaderPackage {
public:
    [[nodiscard]] static Result<ShaderPackage> load(
        std::span<const std::byte> dxil,
        std::string_view metadata_json);

    [[nodiscard]] std::span<const std::byte> dxil() const noexcept { return dxil_; }
    [[nodiscard]] const std::string& entry() const noexcept { return entry_; }
    [[nodiscard]] const std::string& profile() const noexcept { return profile_; }
    [[nodiscard]] const content::ContentHash& content_hash() const noexcept { return content_hash_; }

private:
    std::vector<std::byte> dxil_;
    std::string entry_;
    std::string profile_;
    content::ContentHash content_hash_{};
};

struct PipelineKey {
    std::uint64_t vertex_shader_hash{};
    std::uint64_t pixel_shader_hash{};
    std::uint64_t binding_layout_hash{};
    std::uint32_t vertex_layout{};
    std::uint32_t topology{3U};
    std::uint32_t render_target_format{};
    std::uint32_t depth_format{};
    std::uint32_t sample_count{1U};
    std::uint32_t raster_state{};
    std::uint32_t blend_state{};
    std::uint32_t depth_state{};

    [[nodiscard]] std::uint64_t stable_hash() const noexcept;
};

}  // namespace alpha::shader
