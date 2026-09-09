#include "test_support.hpp"

#include <aengine/content/content.hpp>

#include <array>
#include <chrono>
#include <cstddef>
#include <filesystem>
#include <fstream>
#include <vector>

namespace {

using alpha::content::BindlessAllocator;
using alpha::content::PackageMetadata;

ALPHA_TEST("runtime content package round trips and detects corruption") {
    const std::vector<std::byte> payload{
        std::byte{0x10}, std::byte{0x20}, std::byte{0x30}};
    PackageMetadata metadata;
    metadata.mesh_count = 1U;
    metadata.material_count = 2U;

    auto encoded = alpha::content::encode_package(payload, metadata);
    ALPHA_REQUIRE(encoded.has_value());
    auto decoded = alpha::content::decode_package(encoded.value());
    ALPHA_REQUIRE(decoded.has_value());
    ALPHA_REQUIRE_EQ(decoded.value().metadata.mesh_count, 1U);
    ALPHA_REQUIRE_EQ(decoded.value().payload.size(), payload.size());

    encoded.value()[0] = std::byte{0};
    const auto corrupted = alpha::content::decode_package(encoded.value());
    ALPHA_REQUIRE(!corrupted.has_value());
    ALPHA_REQUIRE_EQ(corrupted.error().code, alpha::ErrorCode::AssetCookFailure);
}

ALPHA_TEST("cooked scene payload preserves canonical mesh and PBR material") {
    alpha::content::CookedScene source;
    alpha::content::CookedMesh mesh;
    mesh.vertices = {
        {{-1.0F, -1.0F, 0.0F}, {0.0F, 0.0F, 1.0F}, {1.0F, 0.0F, 0.0F, 1.0F}, {0.0F, 1.0F}},
        {{1.0F, -1.0F, 0.0F}, {0.0F, 0.0F, 1.0F}, {1.0F, 0.0F, 0.0F, 1.0F}, {1.0F, 1.0F}},
        {{0.0F, 1.0F, 0.0F}, {0.0F, 0.0F, 1.0F}, {1.0F, 0.0F, 0.0F, 1.0F}, {0.5F, 0.0F}},
    };
    mesh.indices = {0U, 1U, 2U};
    mesh.material_index = 0U;
    mesh.bounds_min = {-1.0F, -1.0F, 0.0F};
    mesh.bounds_max = {1.0F, 1.0F, 0.0F};
    source.meshes.push_back(mesh);
    alpha::content::CookedInstance instance;
    instance.mesh_index = 0U;
    instance.transform[12] = 2.0F;
    source.instances.push_back(instance);
    alpha::content::CookedMaterial material;
    material.base_color = {0.8F, 0.24F, 0.08F, 1.0F};
    material.metallic = 0.15F;
    material.roughness = 0.42F;
    source.materials.push_back(material);

    const auto encoded = alpha::content::encode_cooked_scene(source);
    ALPHA_REQUIRE(encoded.has_value());
    const auto decoded = alpha::content::decode_cooked_scene(encoded.value());
    ALPHA_REQUIRE(decoded.has_value());
    ALPHA_REQUIRE_EQ(decoded.value().meshes.size(), 1U);
    ALPHA_REQUIRE_EQ(decoded.value().meshes[0].vertices.size(), 3U);
    ALPHA_REQUIRE_EQ(decoded.value().meshes[0].indices[2], 2U);
    ALPHA_REQUIRE_EQ(decoded.value().meshes[0].bounds_min[0], -1.0F);
    ALPHA_REQUIRE_EQ(decoded.value().instances.size(), 1U);
    ALPHA_REQUIRE_EQ(decoded.value().instances[0].mesh_index, 0U);
    ALPHA_REQUIRE_EQ(decoded.value().instances[0].transform[12], 2.0F);
    ALPHA_REQUIRE_EQ(decoded.value().materials.size(), 1U);
    ALPHA_REQUIRE_EQ(decoded.value().materials[0].base_color[0], 0.8F);
    ALPHA_REQUIRE_EQ(decoded.value().materials[0].roughness, 0.42F);

    auto truncated = encoded.value();
    truncated.pop_back();
    ALPHA_REQUIRE(!alpha::content::decode_cooked_scene(truncated).has_value());
}

ALPHA_TEST("bindless slot zero is permanent fallback and reuse waits for GPU") {
    BindlessAllocator allocator{3U};
    const auto one = allocator.allocate();
    const auto two = allocator.allocate();
    const auto exhausted = allocator.allocate();

    ALPHA_REQUIRE(one.has_value());
    ALPHA_REQUIRE(two.has_value());
    ALPHA_REQUIRE_EQ(one.value(), 1U);
    ALPHA_REQUIRE_EQ(two.value(), 2U);
    ALPHA_REQUIRE(!exhausted.has_value());
    ALPHA_REQUIRE_EQ(exhausted.error().code, alpha::ErrorCode::OutOfDescriptors);

    ALPHA_REQUIRE(allocator.retire(one.value(), 7U).has_value());
    allocator.collect(6U);
    ALPHA_REQUIRE(!allocator.allocate().has_value());
    allocator.collect(7U);
    ALPHA_REQUIRE_EQ(allocator.allocate().value(), one.value());
}

ALPHA_TEST("GLB boundary validation rejects mismatched container length") {
    std::array<std::byte, 12> header{};
    header[0] = std::byte{'g'};
    header[1] = std::byte{'l'};
    header[2] = std::byte{'T'};
    header[3] = std::byte{'F'};
    header[4] = std::byte{2};
    header[8] = std::byte{64};

    const auto result = alpha::content::prevalidate_glb(header);
    ALPHA_REQUIRE(!result.has_value());
    ALPHA_REQUIRE_EQ(result.error().code, alpha::ErrorCode::AssetCookFailure);
}

ALPHA_TEST("content runtime publishes only after CPU package readiness") {
    const std::vector<std::byte> payload{std::byte{1}, std::byte{2}};
    const auto encoded = alpha::content::encode_package(payload, {});
    ALPHA_REQUIRE(encoded.has_value());
    const auto path = std::filesystem::current_path() / "content-runtime-test.acontent";
    {
        std::ofstream stream(path, std::ios::binary | std::ios::trunc);
        stream.write(
            reinterpret_cast<const char*>(encoded.value().data()),
            static_cast<std::streamsize>(encoded.value().size()));
    }

    alpha::content::ContentRuntime runtime;
    const auto handle = runtime.request(path);
    ALPHA_REQUIRE(handle.has_value());
    ALPHA_REQUIRE(runtime.wait_cpu_ready(handle.value(), std::chrono::seconds{2}).has_value());
    const auto upload = runtime.begin_upload(handle.value());
    ALPHA_REQUIRE(upload.has_value());
    ALPHA_REQUIRE(runtime.publish(handle.value(), 1U, 3U).has_value());
    ALPHA_REQUIRE_EQ(runtime.state(handle.value()), alpha::content::AssetState::Resident);
    ALPHA_REQUIRE(runtime.retire(handle.value(), 3U).has_value());
    runtime.collect(2U);
    ALPHA_REQUIRE_EQ(runtime.state(handle.value()), alpha::content::AssetState::Retiring);
    runtime.collect(3U);
    ALPHA_REQUIRE_EQ(runtime.state(handle.value()), alpha::content::AssetState::Unloaded);

    std::filesystem::remove(path);
}

}  // namespace
