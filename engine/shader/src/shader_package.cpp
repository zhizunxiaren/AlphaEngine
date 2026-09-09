#include <aengine/shader/shader_package.hpp>

#include <nlohmann/json.hpp>

#include <array>
#include <cstddef>
#include <cstdint>
#include <exception>
#include <string>
#include <utility>

namespace alpha::shader {
namespace {

[[nodiscard]] std::string hash_hex(const content::ContentHash& hash) {
    constexpr char digits[] = "0123456789abcdef";
    std::string result;
    result.reserve(hash.size() * 2U);
    for (const std::byte value : hash) {
        const auto number = std::to_integer<unsigned int>(value);
        result.push_back(digits[number >> 4U]);
        result.push_back(digits[number & 0xFU]);
    }
    return result;
}

void hash_value(std::uint64_t& hash, std::uint64_t value) noexcept {
    constexpr std::uint64_t prime = 1'099'511'628'211ULL;
    for (std::uint32_t byte = 0U; byte < 8U; ++byte) {
        hash ^= (value >> (byte * 8U)) & 0xFFU;
        hash *= prime;
    }
}

}  // namespace

Result<ShaderPackage> ShaderPackage::load(
    std::span<const std::byte> dxil,
    std::string_view metadata_json) {
    try {
        const auto metadata = nlohmann::json::parse(metadata_json);
        if (metadata.value("schema_version", 0U) != 1U ||
            metadata.value("binding_layout_version", 0U) != 2U ||
            metadata.value("matrix_layout", std::string{}) != "row_major") {
            return Error{ErrorCode::ShaderCompileFailure, "unsupported shader package or binding ABI"};
        }
        const std::string entry = metadata.value("entry", std::string{});
        const std::string profile = metadata.value("profile", std::string{});
        const std::string declared_hash = metadata.value("dxil_sha256", std::string{});
        if (entry.empty() || profile.empty() || declared_hash.size() != 64U) {
            return Error{ErrorCode::ShaderCompileFailure, "shader package metadata is incomplete"};
        }
        auto actual_hash = content::sha256(dxil);
        if (!actual_hash) {
            return actual_hash.error();
        }
        if (hash_hex(actual_hash.value()) != declared_hash) {
            return Error{ErrorCode::ShaderCompileFailure, "DXIL content hash does not match metadata"};
        }
        ShaderPackage package;
        package.dxil_.assign(dxil.begin(), dxil.end());
        package.entry_ = entry;
        package.profile_ = profile;
        package.content_hash_ = actual_hash.value();
        return package;
    } catch (const std::exception& exception) {
        return Error{
            ErrorCode::ShaderCompileFailure,
            std::string{"invalid shader package metadata: "} + exception.what()};
    }
}

std::uint64_t PipelineKey::stable_hash() const noexcept {
    std::uint64_t hash = 14'695'981'039'346'656'037ULL;
    hash_value(hash, vertex_shader_hash);
    hash_value(hash, pixel_shader_hash);
    hash_value(hash, binding_layout_hash);
    hash_value(hash, vertex_layout);
    hash_value(hash, topology);
    hash_value(hash, render_target_format);
    hash_value(hash, depth_format);
    hash_value(hash, sample_count);
    hash_value(hash, raster_state);
    hash_value(hash, blend_state);
    hash_value(hash, depth_state);
    return hash;
}

}  // namespace alpha::shader
