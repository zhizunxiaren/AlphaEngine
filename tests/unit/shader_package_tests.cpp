#include "test_support.hpp"

#include <aengine/content/content.hpp>
#include <aengine/shader/shader_package.hpp>

#include <cstddef>
#include <string>
#include <vector>

namespace {

[[nodiscard]] std::string hex(const alpha::content::ContentHash& hash) {
    constexpr char digits[] = "0123456789abcdef";
    std::string result;
    for (const std::byte value : hash) {
        const auto number = std::to_integer<unsigned int>(value);
        result.push_back(digits[number >> 4U]);
        result.push_back(digits[number & 15U]);
    }
    return result;
}

ALPHA_TEST("shader package verifies DXIL content and binding ABI") {
    const std::vector<std::byte> dxil{std::byte{1}, std::byte{2}, std::byte{3}};
    const auto hash = alpha::content::sha256(dxil);
    ALPHA_REQUIRE(hash.has_value());
    const std::string metadata = std::string{R"({
        "schema_version":1,
        "binding_layout_version":2,
        "matrix_layout":"row_major",
        "entry":"ForwardPS",
        "profile":"ps_6_0",
        "dxil_sha256":")"} + hex(hash.value()) + R"("
    })";

    const auto package = alpha::shader::ShaderPackage::load(dxil, metadata);
    ALPHA_REQUIRE(package.has_value());
    ALPHA_REQUIRE_EQ(package.value().entry(), std::string{"ForwardPS"});

    auto tampered = dxil;
    tampered[0] = std::byte{9};
    const auto rejected = alpha::shader::ShaderPackage::load(tampered, metadata);
    ALPHA_REQUIRE(!rejected.has_value());
    ALPHA_REQUIRE_EQ(rejected.error().code, alpha::ErrorCode::ShaderCompileFailure);
}

ALPHA_TEST("pipeline key hash is deterministic and state complete") {
    alpha::shader::PipelineKey key;
    key.vertex_shader_hash = 11U;
    key.pixel_shader_hash = 12U;
    key.binding_layout_hash = 13U;
    key.vertex_layout = 48U;
    key.render_target_format = 10U;
    key.depth_format = 40U;
    key.raster_state = 2U;
    key.blend_state = 0U;
    key.depth_state = 1U;

    ALPHA_REQUIRE_EQ(key.stable_hash(), key.stable_hash());
    auto changed = key;
    ++changed.depth_state;
    ALPHA_REQUIRE(key.stable_hash() != changed.stable_hash());
}

}  // namespace
