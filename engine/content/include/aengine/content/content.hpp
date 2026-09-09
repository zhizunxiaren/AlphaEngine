#pragma once

#include <aengine/core/result.hpp>
#include <aengine/core/handle.hpp>

#include <array>
#include <chrono>
#include <cstddef>
#include <cstdint>
#include <span>
#include <filesystem>
#include <memory>
#include <vector>

namespace alpha::content {

inline constexpr std::uint32_t package_schema_version = 2U;
inline constexpr std::uint32_t canonical_vertex_stride = 48U;
inline constexpr std::uint32_t canonical_index_stride = 4U;

using ContentHash = std::array<std::byte, 32>;

struct PackageMetadata {
    std::uint32_t mesh_count{};
    std::uint32_t instance_count{};
    std::uint32_t material_count{};
    std::uint32_t texture_count{};
    ContentHash source_hash{};
    ContentHash content_hash{};
};

struct ContentPackage {
    PackageMetadata metadata;
    std::vector<std::byte> payload;
};

struct CookedVertex {
    std::array<float, 3> position{};
    std::array<float, 3> normal{};
    std::array<float, 4> tangent{};
    std::array<float, 2> uv{};
};
static_assert(sizeof(CookedVertex) == canonical_vertex_stride);

enum class CookedAlphaMode : std::uint32_t {
    Opaque,
    Mask,
};

struct CookedMaterial {
    std::array<float, 4> base_color{1.0F, 1.0F, 1.0F, 1.0F};
    std::array<float, 3> emissive{};
    float metallic{};
    float roughness{1.0F};
    float normal_scale{1.0F};
    float occlusion_strength{1.0F};
    float alpha_cutoff{0.5F};
    std::array<std::uint32_t, 5> texture_indices{};
    std::uint32_t sampler_index{};
    CookedAlphaMode alpha_mode{CookedAlphaMode::Opaque};
    std::uint32_t flags{};
};
static_assert(sizeof(CookedMaterial) == 80U);

struct CookedMesh {
    std::vector<CookedVertex> vertices;
    std::vector<std::uint32_t> indices;
    std::uint32_t material_index{};
    std::array<float, 3> bounds_min{};
    std::array<float, 3> bounds_max{};
};

struct CookedInstance {
    std::uint32_t mesh_index{};
    std::array<float, 16> transform{
        1.0F, 0.0F, 0.0F, 0.0F,
        0.0F, 1.0F, 0.0F, 0.0F,
        0.0F, 0.0F, 1.0F, 0.0F,
        0.0F, 0.0F, 0.0F, 1.0F};
};

enum class TextureColorSpace : std::uint32_t {
    Linear,
    Srgb,
};

struct CookedTexture {
    std::uint32_t width{};
    std::uint32_t height{};
    TextureColorSpace color_space{TextureColorSpace::Linear};
    std::vector<std::uint32_t> mip_offsets;
    std::vector<std::byte> rgba8;
};

struct CookedScene {
    std::vector<CookedMesh> meshes;
    std::vector<CookedInstance> instances;
    std::vector<CookedMaterial> materials;
    std::vector<CookedTexture> textures;
};

[[nodiscard]] Result<std::vector<std::byte>> encode_cooked_scene(
    const CookedScene& scene);
[[nodiscard]] Result<CookedScene> decode_cooked_scene(
    std::span<const std::byte> payload);

[[nodiscard]] Result<ContentHash> sha256(std::span<const std::byte> bytes);
[[nodiscard]] Result<std::vector<std::byte>> encode_package(
    std::span<const std::byte> payload,
    PackageMetadata metadata);
[[nodiscard]] Result<ContentPackage> decode_package(
    std::span<const std::byte> package_bytes);

// Security boundary used before fastgltf sees untrusted bytes.
[[nodiscard]] Result<void> prevalidate_glb(std::span<const std::byte> bytes);

class BindlessAllocator {
public:
    explicit BindlessAllocator(std::uint32_t capacity);

    [[nodiscard]] Result<std::uint32_t> allocate();
    [[nodiscard]] Result<void> retire(std::uint32_t index, std::uint64_t last_use_token);
    void collect(std::uint64_t completed_token);

    [[nodiscard]] std::uint32_t capacity() const noexcept { return capacity_; }
    [[nodiscard]] std::uint32_t live_count() const noexcept { return live_count_; }
    [[nodiscard]] std::uint32_t pending_retire_count() const noexcept;

private:
    struct PendingRetire {
        std::uint32_t index{};
        std::uint64_t token{};
    };

    std::uint32_t capacity_{};
    std::uint32_t next_index_{1U};
    std::uint32_t live_count_{};
    std::vector<bool> live_;
    std::vector<std::uint32_t> free_indices_;
    std::vector<PendingRetire> pending_retire_;
};

struct AssetTag;
using AssetHandle = Handle<AssetTag>;

enum class AssetState : std::uint8_t {
    Unloaded,
    Loading,
    CpuReady,
    Uploading,
    Resident,
    Retiring,
    Failed,
};

class ContentRuntime {
public:
    ContentRuntime();
    ~ContentRuntime();
    ContentRuntime(const ContentRuntime&) = delete;
    ContentRuntime& operator=(const ContentRuntime&) = delete;

    [[nodiscard]] Result<AssetHandle> request(const std::filesystem::path& package_path);
    [[nodiscard]] Result<void> wait_cpu_ready(
        AssetHandle asset,
        std::chrono::milliseconds timeout);
    [[nodiscard]] Result<std::shared_ptr<const ContentPackage>> begin_upload(
        AssetHandle asset);
    [[nodiscard]] Result<void> publish(
        AssetHandle asset,
        std::uint32_t bindless_index,
        std::uint64_t submission_token);
    [[nodiscard]] Result<void> retire(
        AssetHandle asset,
        std::uint64_t last_use_token);
    void collect(std::uint64_t completed_token);
    [[nodiscard]] AssetState state(AssetHandle asset) const noexcept;

private:
    struct Impl;
    std::unique_ptr<Impl> implementation_;
};

}  // namespace alpha::content
