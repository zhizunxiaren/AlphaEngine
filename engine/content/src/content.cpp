#define NOMINMAX
#include <aengine/content/content.hpp>

#include <Windows.h>
#include <bcrypt.h>

#include <algorithm>
#include <array>
#include <condition_variable>
#include <cmath>
#include <cstring>
#include <deque>
#include <filesystem>
#include <fstream>
#include <limits>
#include <memory>
#include <mutex>
#include <string>
#include <thread>
#include <type_traits>
#include <utility>

namespace alpha::content {
namespace {

constexpr std::array<std::byte, 8> package_magic{
    std::byte{'A'}, std::byte{'E'}, std::byte{'N'}, std::byte{'G'},
    std::byte{'C'}, std::byte{'N'}, std::byte{'T'}, std::byte{0}};
constexpr std::uint32_t package_header_size = 76U;
constexpr std::uint32_t glb_magic = 0x46546C67U;
constexpr std::uint32_t json_chunk = 0x4E4F534AU;
constexpr std::size_t max_glb_size = 256U * 1024U * 1024U;
constexpr std::uint32_t max_json_size = 32U * 1024U * 1024U;
constexpr std::uint32_t max_chunk_count = 64U;
constexpr std::array<std::byte, 8> cooked_scene_magic{
    std::byte{'A'}, std::byte{'E'}, std::byte{'S'}, std::byte{'C'},
    std::byte{'E'}, std::byte{'N'}, std::byte{'E'}, std::byte{0}};
constexpr std::uint32_t cooked_scene_version = 2U;
constexpr std::uint32_t max_cooked_items = 1'000'000U;
constexpr std::uint64_t max_cooked_data_size = 512ULL * 1024ULL * 1024ULL;

[[nodiscard]] std::uint32_t read_u32(
    std::span<const std::byte> bytes,
    std::size_t offset) noexcept {
    return std::to_integer<std::uint32_t>(bytes[offset]) |
        (std::to_integer<std::uint32_t>(bytes[offset + 1U]) << 8U) |
        (std::to_integer<std::uint32_t>(bytes[offset + 2U]) << 16U) |
        (std::to_integer<std::uint32_t>(bytes[offset + 3U]) << 24U);
}

void append_u32(std::vector<std::byte>& bytes, std::uint32_t value) {
    for (std::uint32_t shift = 0U; shift < 32U; shift += 8U) {
        bytes.push_back(static_cast<std::byte>((value >> shift) & 0xFFU));
    }
}

template <typename Type>
void append_trivial(std::vector<std::byte>& bytes, const Type& value) {
    static_assert(std::is_trivially_copyable_v<Type>);
    const auto* first = reinterpret_cast<const std::byte*>(&value);
    bytes.insert(bytes.end(), first, first + sizeof(Type));
}

class PayloadReader {
public:
    explicit PayloadReader(std::span<const std::byte> bytes) : bytes_(bytes) {}

    [[nodiscard]] bool read_u32_value(std::uint32_t& value) noexcept {
        if (remaining() < sizeof(std::uint32_t)) return false;
        value = read_u32(bytes_, offset_);
        offset_ += sizeof(std::uint32_t);
        return true;
    }

    template <typename Type>
    [[nodiscard]] bool read_trivial(Type& value) noexcept {
        static_assert(std::is_trivially_copyable_v<Type>);
        if (remaining() < sizeof(Type)) return false;
        std::memcpy(&value, bytes_.data() + offset_, sizeof(Type));
        offset_ += sizeof(Type);
        return true;
    }

    [[nodiscard]] bool read_bytes(std::span<std::byte> destination) noexcept {
        if (remaining() < destination.size()) return false;
        std::memcpy(destination.data(), bytes_.data() + offset_, destination.size());
        offset_ += destination.size();
        return true;
    }

    [[nodiscard]] bool finished() const noexcept { return offset_ == bytes_.size(); }

private:
    [[nodiscard]] std::size_t remaining() const noexcept {
        return bytes_.size() - offset_;
    }

    std::span<const std::byte> bytes_;
    std::size_t offset_{};
};

[[nodiscard]] bool sane_count(std::uint32_t count, std::size_t stride) noexcept {
    return count <= max_cooked_items &&
        static_cast<std::uint64_t>(count) * stride <= max_cooked_data_size;
}

[[nodiscard]] bool all_zero(const ContentHash& hash) noexcept {
    return std::ranges::all_of(hash, [](std::byte value) { return value == std::byte{0}; });
}

}  // namespace

Result<ContentHash> sha256(std::span<const std::byte> bytes) {
    if (bytes.size() > std::numeric_limits<ULONG>::max()) {
        return Error{ErrorCode::InvalidArgument, "SHA-256 input exceeds BCrypt limit"};
    }
    BCRYPT_ALG_HANDLE algorithm{};
    BCRYPT_HASH_HANDLE hash_handle{};
    DWORD object_size = 0U;
    DWORD result_size = 0U;
    NTSTATUS status = BCryptOpenAlgorithmProvider(
        &algorithm, BCRYPT_SHA256_ALGORITHM, nullptr, 0U);
    if (!BCRYPT_SUCCESS(status)) {
        return Error{ErrorCode::BackendFailure, "BCrypt SHA-256 provider unavailable", status};
    }
    status = BCryptGetProperty(
        algorithm,
        BCRYPT_OBJECT_LENGTH,
        reinterpret_cast<PUCHAR>(&object_size),
        sizeof(object_size),
        &result_size,
        0U);
    std::vector<UCHAR> object(object_size);
    if (BCRYPT_SUCCESS(status)) {
        status = BCryptCreateHash(
            algorithm, &hash_handle, object.data(), object_size, nullptr, 0U, 0U);
    }
    if (BCRYPT_SUCCESS(status) && !bytes.empty()) {
        status = BCryptHashData(
            hash_handle,
            reinterpret_cast<PUCHAR>(const_cast<std::byte*>(bytes.data())),
            static_cast<ULONG>(bytes.size()),
            0U);
    }
    ContentHash output{};
    if (BCRYPT_SUCCESS(status)) {
        status = BCryptFinishHash(
            hash_handle,
            reinterpret_cast<PUCHAR>(output.data()),
            static_cast<ULONG>(output.size()),
            0U);
    }
    if (hash_handle != nullptr) {
        BCryptDestroyHash(hash_handle);
    }
    BCryptCloseAlgorithmProvider(algorithm, 0U);
    if (!BCRYPT_SUCCESS(status)) {
        return Error{ErrorCode::BackendFailure, "BCrypt SHA-256 failed", status};
    }
    return output;
}

Result<std::vector<std::byte>> encode_package(
    std::span<const std::byte> payload,
    PackageMetadata metadata) {
    if (payload.size() > std::numeric_limits<std::uint32_t>::max()) {
        return Error{ErrorCode::AssetCookFailure, "content payload exceeds schema limit"};
    }
    auto content_hash = sha256(payload);
    if (!content_hash) {
        return content_hash.error();
    }
    metadata.content_hash = content_hash.value();
    if (all_zero(metadata.source_hash)) {
        metadata.source_hash = metadata.content_hash;
    }

    std::vector<std::byte> output;
    output.reserve(package_header_size + payload.size());
    output.insert(output.end(), package_magic.begin(), package_magic.end());
    append_u32(output, package_schema_version);
    append_u32(output, package_header_size);
    append_u32(output, static_cast<std::uint32_t>(payload.size()));
    append_u32(output, metadata.mesh_count);
    append_u32(output, metadata.instance_count);
    append_u32(output, metadata.material_count);
    append_u32(output, metadata.texture_count);
    append_u32(output, canonical_vertex_stride);
    append_u32(output, canonical_index_stride);
    output.insert(output.end(), metadata.source_hash.begin(), metadata.source_hash.end());
    output.insert(output.end(), payload.begin(), payload.end());
    return output;
}

Result<ContentPackage> decode_package(std::span<const std::byte> package_bytes) {
    if (package_bytes.size() < package_header_size ||
        !std::equal(package_magic.begin(), package_magic.end(), package_bytes.begin())) {
        return Error{ErrorCode::AssetCookFailure, "invalid AlphaEngine content package magic"};
    }
    if (read_u32(package_bytes, 8U) != package_schema_version ||
        read_u32(package_bytes, 12U) != package_header_size) {
        return Error{ErrorCode::AssetCookFailure, "unsupported content package schema"};
    }
    const std::uint32_t payload_size = read_u32(package_bytes, 16U);
    if (package_header_size + static_cast<std::size_t>(payload_size) != package_bytes.size()) {
        return Error{ErrorCode::AssetCookFailure, "content package length mismatch"};
    }
    if (read_u32(package_bytes, 36U) != canonical_vertex_stride ||
        read_u32(package_bytes, 40U) != canonical_index_stride) {
        return Error{ErrorCode::AssetCookFailure, "content package ABI mismatch"};
    }

    ContentPackage result;
    result.metadata.mesh_count = read_u32(package_bytes, 20U);
    result.metadata.instance_count = read_u32(package_bytes, 24U);
    result.metadata.material_count = read_u32(package_bytes, 28U);
    result.metadata.texture_count = read_u32(package_bytes, 32U);
    std::copy_n(package_bytes.begin() + 44, 32U, result.metadata.source_hash.begin());
    result.payload.assign(package_bytes.begin() + package_header_size, package_bytes.end());
    auto content_hash = sha256(result.payload);
    if (!content_hash) {
        return content_hash.error();
    }
    result.metadata.content_hash = content_hash.value();
    return result;
}

Result<std::vector<std::byte>> encode_cooked_scene(const CookedScene& scene) {
    if (scene.meshes.size() > max_cooked_items ||
        scene.instances.size() > max_cooked_items ||
        scene.materials.size() > max_cooked_items ||
        scene.textures.size() > max_cooked_items) {
        return Error{ErrorCode::AssetCookFailure, "cooked scene item count exceeds schema limit"};
    }

    std::vector<std::byte> output;
    output.insert(output.end(), cooked_scene_magic.begin(), cooked_scene_magic.end());
    append_u32(output, cooked_scene_version);
    append_u32(output, static_cast<std::uint32_t>(scene.meshes.size()));
    append_u32(output, static_cast<std::uint32_t>(scene.instances.size()));
    append_u32(output, static_cast<std::uint32_t>(scene.materials.size()));
    append_u32(output, static_cast<std::uint32_t>(scene.textures.size()));

    for (const auto& mesh : scene.meshes) {
        if (mesh.vertices.empty() || mesh.indices.empty() ||
            mesh.vertices.size() > max_cooked_items ||
            mesh.indices.size() > max_cooked_items ||
            mesh.material_index >= scene.materials.size()) {
            return Error{ErrorCode::AssetCookFailure, "cooked mesh is empty or references an invalid material"};
        }
        for (std::size_t axis = 0U; axis < 3U; ++axis) {
            if (!std::isfinite(mesh.bounds_min[axis]) ||
                !std::isfinite(mesh.bounds_max[axis]) ||
                mesh.bounds_min[axis] > mesh.bounds_max[axis]) {
                return Error{ErrorCode::AssetCookFailure, "cooked mesh bounds are invalid"};
            }
        }
        append_u32(output, static_cast<std::uint32_t>(mesh.vertices.size()));
        append_u32(output, static_cast<std::uint32_t>(mesh.indices.size()));
        append_u32(output, mesh.material_index);
        append_trivial(output, mesh.bounds_min);
        append_trivial(output, mesh.bounds_max);
        const auto* vertex_bytes = reinterpret_cast<const std::byte*>(mesh.vertices.data());
        output.insert(
            output.end(), vertex_bytes, vertex_bytes + mesh.vertices.size() * sizeof(CookedVertex));
        for (const auto index : mesh.indices) append_u32(output, index);
    }
    for (const auto& instance : scene.instances) {
        if (instance.mesh_index >= scene.meshes.size() ||
            std::ranges::any_of(instance.transform, [](float value) {
                return !std::isfinite(value);
            })) {
            return Error{ErrorCode::AssetCookFailure, "cooked instance is invalid"};
        }
        append_u32(output, instance.mesh_index);
        append_trivial(output, instance.transform);
    }
    for (const auto& material : scene.materials) append_trivial(output, material);
    for (const auto& texture : scene.textures) {
        if (texture.width == 0U || texture.height == 0U ||
            texture.mip_offsets.empty() || texture.rgba8.empty() ||
            texture.mip_offsets.front() != 0U ||
            texture.rgba8.size() > max_cooked_data_size) {
            return Error{ErrorCode::AssetCookFailure, "cooked texture metadata is invalid"};
        }
        append_u32(output, texture.width);
        append_u32(output, texture.height);
        append_u32(output, static_cast<std::uint32_t>(texture.color_space));
        append_u32(output, static_cast<std::uint32_t>(texture.mip_offsets.size()));
        append_u32(output, static_cast<std::uint32_t>(texture.rgba8.size()));
        for (const auto offset : texture.mip_offsets) {
            if (offset >= texture.rgba8.size()) {
                return Error{ErrorCode::AssetCookFailure, "cooked texture mip offset is invalid"};
            }
            append_u32(output, offset);
        }
        output.insert(output.end(), texture.rgba8.begin(), texture.rgba8.end());
    }
    if (output.size() > max_cooked_data_size) {
        return Error{ErrorCode::AssetCookFailure, "cooked scene exceeds schema size limit"};
    }
    return output;
}

Result<CookedScene> decode_cooked_scene(std::span<const std::byte> payload) {
    if (payload.size() < cooked_scene_magic.size() + 5U * sizeof(std::uint32_t) ||
        payload.size() > max_cooked_data_size ||
        !std::equal(cooked_scene_magic.begin(), cooked_scene_magic.end(), payload.begin())) {
        return Error{ErrorCode::AssetCookFailure, "invalid cooked scene payload"};
    }
    PayloadReader reader{payload.subspan(cooked_scene_magic.size())};
    std::uint32_t version = 0U;
    std::uint32_t mesh_count = 0U;
    std::uint32_t instance_count = 0U;
    std::uint32_t material_count = 0U;
    std::uint32_t texture_count = 0U;
    if (!reader.read_u32_value(version) || version != cooked_scene_version ||
        !reader.read_u32_value(mesh_count) || !reader.read_u32_value(instance_count) ||
        !reader.read_u32_value(material_count) ||
        !reader.read_u32_value(texture_count) ||
        !sane_count(mesh_count, sizeof(CookedMesh)) ||
        !sane_count(instance_count, sizeof(CookedInstance)) ||
        !sane_count(material_count, sizeof(CookedMaterial)) ||
        !sane_count(texture_count, sizeof(CookedTexture))) {
        return Error{ErrorCode::AssetCookFailure, "unsupported or malformed cooked scene header"};
    }

    CookedScene scene;
    scene.meshes.resize(mesh_count);
    for (auto& mesh : scene.meshes) {
        std::uint32_t vertex_count = 0U;
        std::uint32_t index_count = 0U;
        if (!reader.read_u32_value(vertex_count) || !reader.read_u32_value(index_count) ||
            !reader.read_u32_value(mesh.material_index) ||
            !reader.read_trivial(mesh.bounds_min) ||
            !reader.read_trivial(mesh.bounds_max) ||
            !sane_count(vertex_count, sizeof(CookedVertex)) ||
            !sane_count(index_count, sizeof(std::uint32_t)) ||
            vertex_count == 0U || index_count == 0U) {
            return Error{ErrorCode::AssetCookFailure, "malformed cooked mesh header"};
        }
        for (std::size_t axis = 0U; axis < 3U; ++axis) {
            if (!std::isfinite(mesh.bounds_min[axis]) ||
                !std::isfinite(mesh.bounds_max[axis]) ||
                mesh.bounds_min[axis] > mesh.bounds_max[axis]) {
                return Error{ErrorCode::AssetCookFailure, "malformed cooked mesh bounds"};
            }
        }
        mesh.vertices.resize(vertex_count);
        mesh.indices.resize(index_count);
        if (!reader.read_bytes(std::as_writable_bytes(std::span{mesh.vertices})) ||
            !reader.read_bytes(std::as_writable_bytes(std::span{mesh.indices}))) {
            return Error{ErrorCode::AssetCookFailure, "truncated cooked mesh data"};
        }
        if (std::ranges::any_of(mesh.indices, [vertex_count](std::uint32_t index) {
                return index >= vertex_count;
            })) {
            return Error{ErrorCode::AssetCookFailure, "cooked mesh index is out of range"};
        }
    }

    scene.instances.resize(instance_count);
    for (auto& instance : scene.instances) {
        if (!reader.read_u32_value(instance.mesh_index) ||
            !reader.read_trivial(instance.transform) ||
            instance.mesh_index >= scene.meshes.size() ||
            std::ranges::any_of(instance.transform, [](float value) {
                return !std::isfinite(value);
            })) {
            return Error{ErrorCode::AssetCookFailure, "malformed cooked instance data"};
        }
    }

    scene.materials.resize(material_count);
    for (auto& material : scene.materials) {
        if (!reader.read_trivial(material) ||
            static_cast<std::uint32_t>(material.alpha_mode) >
                static_cast<std::uint32_t>(CookedAlphaMode::Mask)) {
            return Error{ErrorCode::AssetCookFailure, "malformed cooked material data"};
        }
    }
    for (const auto& mesh : scene.meshes) {
        if (mesh.material_index >= scene.materials.size()) {
            return Error{ErrorCode::AssetCookFailure, "cooked mesh material is out of range"};
        }
    }

    scene.textures.resize(texture_count);
    for (auto& texture : scene.textures) {
        std::uint32_t color_space = 0U;
        std::uint32_t mip_count = 0U;
        std::uint32_t data_size = 0U;
        if (!reader.read_u32_value(texture.width) || !reader.read_u32_value(texture.height) ||
            !reader.read_u32_value(color_space) || !reader.read_u32_value(mip_count) ||
            !reader.read_u32_value(data_size) || texture.width == 0U || texture.height == 0U ||
            color_space > static_cast<std::uint32_t>(TextureColorSpace::Srgb) ||
            mip_count == 0U || !sane_count(mip_count, sizeof(std::uint32_t)) ||
            data_size == 0U || data_size > max_cooked_data_size) {
            return Error{ErrorCode::AssetCookFailure, "malformed cooked texture header"};
        }
        texture.color_space = static_cast<TextureColorSpace>(color_space);
        texture.mip_offsets.resize(mip_count);
        for (auto& offset : texture.mip_offsets) {
            if (!reader.read_u32_value(offset) || offset >= data_size) {
                return Error{ErrorCode::AssetCookFailure, "malformed cooked texture mip table"};
            }
        }
        if (texture.mip_offsets.front() != 0U ||
            !std::ranges::is_sorted(texture.mip_offsets)) {
            return Error{ErrorCode::AssetCookFailure, "cooked texture mip table is not canonical"};
        }
        texture.rgba8.resize(data_size);
        if (!reader.read_bytes(texture.rgba8)) {
            return Error{ErrorCode::AssetCookFailure, "truncated cooked texture data"};
        }
    }
    if (!reader.finished()) {
        return Error{ErrorCode::AssetCookFailure, "cooked scene has trailing data"};
    }
    return scene;
}

Result<void> prevalidate_glb(std::span<const std::byte> bytes) {
    if (bytes.size() < 20U || bytes.size() > max_glb_size) {
        return Error{ErrorCode::AssetCookFailure, "GLB size is outside the supported security boundary"};
    }
    if (read_u32(bytes, 0U) != glb_magic || read_u32(bytes, 4U) != 2U) {
        return Error{ErrorCode::AssetCookFailure, "GLB magic or version is invalid"};
    }
    if (read_u32(bytes, 8U) != bytes.size()) {
        return Error{ErrorCode::AssetCookFailure, "GLB declared length does not match the file"};
    }

    std::size_t offset = 12U;
    std::uint32_t chunk_count = 0U;
    while (offset < bytes.size()) {
        if (bytes.size() - offset < 8U || ++chunk_count > max_chunk_count) {
            return Error{ErrorCode::AssetCookFailure, "GLB chunk table is malformed or excessive"};
        }
        const std::uint32_t chunk_size = read_u32(bytes, offset);
        const std::uint32_t chunk_type = read_u32(bytes, offset + 4U);
        if ((chunk_size & 3U) != 0U || chunk_size > bytes.size() - offset - 8U) {
            return Error{ErrorCode::AssetCookFailure, "GLB chunk length is invalid"};
        }
        if (chunk_count == 1U && (chunk_type != json_chunk || chunk_size > max_json_size)) {
            return Error{ErrorCode::AssetCookFailure, "GLB first chunk must be bounded JSON"};
        }
        offset += 8U + chunk_size;
    }
    if (offset != bytes.size() || chunk_count == 0U) {
        return Error{ErrorCode::AssetCookFailure, "GLB chunk table does not terminate at file length"};
    }
    return {};
}

BindlessAllocator::BindlessAllocator(std::uint32_t capacity)
    : capacity_(capacity), live_(capacity, false) {
    if (!live_.empty()) {
        live_[0] = true;
    }
}

Result<std::uint32_t> BindlessAllocator::allocate() {
    std::uint32_t index = 0U;
    if (!free_indices_.empty()) {
        index = free_indices_.back();
        free_indices_.pop_back();
    } else if (next_index_ < capacity_) {
        index = next_index_++;
    } else {
        return Error{
            ErrorCode::OutOfDescriptors,
            "bindless descriptor capacity exhausted: capacity=" + std::to_string(capacity_) +
                " live=" + std::to_string(live_count_) +
                " pending-retire=" + std::to_string(pending_retire_.size())};
    }
    live_[index] = true;
    ++live_count_;
    return index;
}

Result<void> BindlessAllocator::retire(
    std::uint32_t index,
    std::uint64_t last_use_token) {
    if (index == 0U || index >= capacity_ || !live_[index]) {
        return Error{ErrorCode::InvalidHandle, "invalid or already retired bindless index"};
    }
    live_[index] = false;
    --live_count_;
    pending_retire_.push_back({index, last_use_token});
    return {};
}

void BindlessAllocator::collect(std::uint64_t completed_token) {
    auto current = pending_retire_.begin();
    while (current != pending_retire_.end()) {
        if (current->token <= completed_token) {
            free_indices_.push_back(current->index);
            current = pending_retire_.erase(current);
        } else {
            ++current;
        }
    }
}

std::uint32_t BindlessAllocator::pending_retire_count() const noexcept {
    return static_cast<std::uint32_t>(pending_retire_.size());
}

struct ContentRuntime::Impl {
    struct Slot {
        std::uint32_t generation{1U};
        AssetState state{AssetState::Unloaded};
        std::filesystem::path path;
        std::shared_ptr<ContentPackage> package;
        std::string failure;
        std::uint32_t bindless_index{};
        std::uint64_t last_use_token{};
    };

    mutable std::mutex mutex;
    std::condition_variable condition;
    std::vector<Slot> slots;
    std::deque<std::uint32_t> requests;
    bool stopping{false};
    std::thread worker;

    Impl() : worker([this] { run(); }) {}

    ~Impl() {
        {
            const std::lock_guard lock{mutex};
            stopping = true;
        }
        condition.notify_all();
        if (worker.joinable()) worker.join();
    }

    void run() {
        for (;;) {
            std::uint32_t index = 0U;
            std::filesystem::path path;
            {
                std::unique_lock lock{mutex};
                condition.wait(lock, [this] { return stopping || !requests.empty(); });
                if (stopping && requests.empty()) return;
                index = requests.front();
                requests.pop_front();
                path = slots[index].path;
            }

            std::ifstream stream(path, std::ios::binary | std::ios::ate);
            std::vector<std::byte> bytes;
            if (stream) {
                const auto size = stream.tellg();
                if (size > 0) {
                    bytes.resize(static_cast<std::size_t>(size));
                    stream.seekg(0);
                    stream.read(reinterpret_cast<char*>(bytes.data()), size);
                    if (!stream) bytes.clear();
                }
            }
            auto decoded = decode_package(bytes);
            {
                const std::lock_guard lock{mutex};
                Slot& slot = slots[index];
                if (decoded) {
                    slot.package = std::make_shared<ContentPackage>(
                        std::move(decoded).value());
                    slot.state = AssetState::CpuReady;
                } else {
                    slot.failure = decoded.error().message;
                    slot.state = AssetState::Failed;
                }
            }
            condition.notify_all();
        }
    }
};

ContentRuntime::ContentRuntime() : implementation_(std::make_unique<Impl>()) {}
ContentRuntime::~ContentRuntime() = default;

Result<AssetHandle> ContentRuntime::request(
    const std::filesystem::path& package_path) {
    if (package_path.empty()) {
        return Error{ErrorCode::InvalidArgument, "content package path is empty"};
    }
    std::uint32_t index = 0U;
    std::uint32_t generation = 1U;
    {
        const std::lock_guard lock{implementation_->mutex};
        const auto reusable = std::ranges::find(
            implementation_->slots, AssetState::Unloaded, &Impl::Slot::state);
        if (reusable == implementation_->slots.end()) {
            implementation_->slots.emplace_back();
            index = static_cast<std::uint32_t>(implementation_->slots.size() - 1U);
        } else {
            index = static_cast<std::uint32_t>(
                std::distance(implementation_->slots.begin(), reusable));
        }
        auto& slot = implementation_->slots[index];
        slot.state = AssetState::Loading;
        slot.path = package_path;
        slot.package.reset();
        slot.failure.clear();
        slot.bindless_index = 0U;
        slot.last_use_token = 0U;
        generation = slot.generation;
        implementation_->requests.push_back(index);
    }
    implementation_->condition.notify_one();
    return AssetHandle::from_parts(index + 1U, generation);
}

Result<void> ContentRuntime::wait_cpu_ready(
    AssetHandle asset,
    std::chrono::milliseconds timeout) {
    if (!asset.valid() || asset.index() == 0U) {
        return Error{ErrorCode::InvalidHandle, "invalid content asset handle"};
    }
    const std::size_t index = asset.index() - 1U;
    std::unique_lock lock{implementation_->mutex};
    if (index >= implementation_->slots.size() ||
        implementation_->slots[index].generation != asset.generation()) {
        return Error{ErrorCode::InvalidHandle, "stale content asset handle"};
    }
    const bool ready = implementation_->condition.wait_for(lock, timeout, [&] {
        return implementation_->slots[index].state != AssetState::Loading;
    });
    if (!ready) {
        return Error{ErrorCode::Timeout, "content I/O timed out"};
    }
    const auto& slot = implementation_->slots[index];
    if (slot.state != AssetState::CpuReady) {
        return Error{ErrorCode::IoFailure, "content load failed: " + slot.failure};
    }
    return {};
}

Result<std::shared_ptr<const ContentPackage>> ContentRuntime::begin_upload(
    AssetHandle asset) {
    const std::lock_guard lock{implementation_->mutex};
    if (!asset.valid() || asset.index() == 0U ||
        asset.index() > implementation_->slots.size()) {
        return Error{ErrorCode::InvalidHandle, "invalid content asset handle"};
    }
    auto& slot = implementation_->slots[asset.index() - 1U];
    if (slot.generation != asset.generation() || slot.state != AssetState::CpuReady) {
        return Error{ErrorCode::InvalidState, "content asset is not CPU-ready"};
    }
    slot.state = AssetState::Uploading;
    return std::shared_ptr<const ContentPackage>{slot.package};
}

Result<void> ContentRuntime::publish(
    AssetHandle asset,
    std::uint32_t bindless_index,
    std::uint64_t submission_token) {
    const std::lock_guard lock{implementation_->mutex};
    if (!asset.valid() || asset.index() == 0U ||
        asset.index() > implementation_->slots.size()) {
        return Error{ErrorCode::InvalidHandle, "invalid content asset handle"};
    }
    auto& slot = implementation_->slots[asset.index() - 1U];
    if (slot.generation != asset.generation() || slot.state != AssetState::Uploading) {
        return Error{ErrorCode::InvalidState, "content asset is not uploading"};
    }
    slot.bindless_index = bindless_index;
    slot.last_use_token = submission_token;
    slot.state = AssetState::Resident;
    return {};
}

Result<void> ContentRuntime::retire(
    AssetHandle asset,
    std::uint64_t last_use_token) {
    const std::lock_guard lock{implementation_->mutex};
    if (!asset.valid() || asset.index() == 0U ||
        asset.index() > implementation_->slots.size()) {
        return Error{ErrorCode::InvalidHandle, "invalid content asset handle"};
    }
    auto& slot = implementation_->slots[asset.index() - 1U];
    if (slot.generation != asset.generation() || slot.state != AssetState::Resident) {
        return Error{ErrorCode::InvalidState, "content asset is not resident"};
    }
    slot.last_use_token = last_use_token;
    slot.state = AssetState::Retiring;
    return {};
}

void ContentRuntime::collect(std::uint64_t completed_token) {
    const std::lock_guard lock{implementation_->mutex};
    for (auto& slot : implementation_->slots) {
        if (slot.state == AssetState::Retiring && slot.last_use_token <= completed_token) {
            slot.package.reset();
            slot.path.clear();
            slot.bindless_index = 0U;
            slot.last_use_token = 0U;
            slot.state = AssetState::Unloaded;
            ++slot.generation;
            if (slot.generation == 0U) slot.generation = 1U;
        }
    }
}

AssetState ContentRuntime::state(AssetHandle asset) const noexcept {
    const std::lock_guard lock{implementation_->mutex};
    if (!asset.valid() || asset.index() == 0U ||
        asset.index() > implementation_->slots.size()) {
        return AssetState::Unloaded;
    }
    const auto& slot = implementation_->slots[asset.index() - 1U];
    return slot.generation == asset.generation()
        ? slot.state
        : AssetState::Unloaded;
}

}  // namespace alpha::content
