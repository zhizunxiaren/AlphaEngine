#define NOMINMAX
#include <aengine/content/content.hpp>

#include <fastgltf/core.hpp>
#include <fastgltf/tools.hpp>
#include <fastgltf/types.hpp>

#include <DirectXTex.h>

#include <Windows.h>

#include <nlohmann/json.hpp>

#include <algorithm>
#include <array>
#include <cstddef>
#include <cstdint>
#include <filesystem>
#include <fstream>
#include <iostream>
#include <limits>
#include <numeric>
#include <span>
#include <optional>
#include <string>
#include <string_view>
#include <vector>

namespace {

class ComApartment {
public:
    ComApartment() noexcept : result_(CoInitializeEx(nullptr, COINIT_MULTITHREADED)) {}
    ~ComApartment() {
        if (SUCCEEDED(result_)) CoUninitialize();
    }
    [[nodiscard]] bool available() const noexcept {
        return SUCCEEDED(result_) || result_ == RPC_E_CHANGED_MODE;
    }

private:
    HRESULT result_{};
};

[[nodiscard]] std::uint32_t read_u32_le(
    std::span<const std::byte> bytes,
    std::size_t offset) noexcept {
    return std::to_integer<std::uint32_t>(bytes[offset]) |
        (std::to_integer<std::uint32_t>(bytes[offset + 1U]) << 8U) |
        (std::to_integer<std::uint32_t>(bytes[offset + 2U]) << 16U) |
        (std::to_integer<std::uint32_t>(bytes[offset + 3U]) << 24U);
}

[[nodiscard]] bool prevalidate_gltf_ranges(
    std::span<const std::byte> bytes,
    std::string& reason) {
    try {
        constexpr std::uint32_t bin_chunk = 0x004E4942U;
        constexpr std::uint64_t max_items = 1'000'000ULL;
        const std::uint32_t json_length = read_u32_le(bytes, 12U);
        const std::size_t bin_header = 20U + json_length;
        if (bin_header + 8U > bytes.size() ||
            read_u32_le(bytes, bin_header + 4U) != bin_chunk) {
            reason = "MVP1 requires one embedded GLB BIN chunk";
            return false;
        }
        const std::uint32_t bin_length = read_u32_le(bytes, bin_header);
        if (bin_header + 8ULL + bin_length != bytes.size()) {
            reason = "MVP1 rejects extra GLB chunks and external payloads";
            return false;
        }
        const std::string json_text{
            reinterpret_cast<const char*>(bytes.data() + 20U), json_length};
        const auto root = nlohmann::json::parse(json_text);
        const auto& buffers = root.at("buffers");
        if (!buffers.is_array() || buffers.size() != 1U || buffers[0].contains("uri")) {
            reason = "MVP1 GLB must use exactly one embedded buffer";
            return false;
        }
        const std::uint64_t declared_buffer_size = buffers[0].at("byteLength").get<std::uint64_t>();
        if (declared_buffer_size > bin_length) {
            reason = "GLB buffer byteLength exceeds its BIN chunk";
            return false;
        }

        struct ViewRange {
            std::uint64_t offset{};
            std::uint64_t length{};
            std::uint64_t stride{};
        };
        const auto& source_views = root.at("bufferViews");
        if (!source_views.is_array() || source_views.size() > max_items) {
            reason = "GLB bufferView count exceeds the cooker limit";
            return false;
        }
        std::vector<ViewRange> views;
        views.reserve(source_views.size());
        for (const auto& source : source_views) {
            if (source.value("buffer", std::uint64_t{1}) != 0U) {
                reason = "GLB bufferView references a non-embedded buffer";
                return false;
            }
            const std::uint64_t offset = source.value("byteOffset", std::uint64_t{0});
            const std::uint64_t length = source.at("byteLength").get<std::uint64_t>();
            const std::uint64_t stride = source.value("byteStride", std::uint64_t{0});
            if (length == 0U || offset > declared_buffer_size ||
                length > declared_buffer_size - offset ||
                (stride != 0U && (stride < 4U || stride > 252U || (stride & 3U) != 0U))) {
                reason = "GLB bufferView range or stride is invalid";
                return false;
            }
            views.push_back({offset, length, stride});
        }

        const auto component_size = [](std::uint32_t type) -> std::uint64_t {
            switch (type) {
            case 5120U:
            case 5121U: return 1U;
            case 5122U:
            case 5123U: return 2U;
            case 5125U:
            case 5126U: return 4U;
            default: return 0U;
            }
        };
        const auto component_count = [](std::string_view type) -> std::uint64_t {
            if (type == "SCALAR") return 1U;
            if (type == "VEC2") return 2U;
            if (type == "VEC3") return 3U;
            if (type == "VEC4" || type == "MAT2") return 4U;
            if (type == "MAT3") return 9U;
            if (type == "MAT4") return 16U;
            return 0U;
        };
        const auto& accessors = root.at("accessors");
        if (!accessors.is_array() || accessors.size() > max_items) {
            reason = "GLB accessor count exceeds the cooker limit";
            return false;
        }
        for (const auto& accessor : accessors) {
            if (!accessor.contains("bufferView") || accessor.contains("sparse")) {
                reason = "sparse or bufferless accessors are outside the MVP1 subset";
                return false;
            }
            const std::uint64_t view_index = accessor.at("bufferView").get<std::uint64_t>();
            const std::uint64_t count = accessor.at("count").get<std::uint64_t>();
            const std::uint64_t scalar = component_size(
                accessor.at("componentType").get<std::uint32_t>());
            const std::uint64_t components = component_count(
                accessor.at("type").get<std::string>());
            if (view_index >= views.size() || count == 0U || count > max_items ||
                scalar == 0U || components == 0U ||
                components > std::numeric_limits<std::uint64_t>::max() / scalar) {
                reason = "GLB accessor metadata is invalid or excessive";
                return false;
            }
            const auto& view = views[view_index];
            const std::uint64_t element_size = scalar * components;
            const std::uint64_t stride = view.stride == 0U ? element_size : view.stride;
            const std::uint64_t offset = accessor.value("byteOffset", std::uint64_t{0});
            if (stride < element_size || offset > view.length ||
                count - 1U >
                    (std::numeric_limits<std::uint64_t>::max() - element_size) / stride) {
                reason = "GLB accessor range arithmetic overflowed";
                return false;
            }
            const std::uint64_t required = (count - 1U) * stride + element_size;
            if (required > view.length - offset) {
                reason = "GLB accessor exceeds its bufferView";
                return false;
            }
        }
        if (root.value("nodes", nlohmann::json::array()).size() > max_items ||
            root.value("meshes", nlohmann::json::array()).size() > max_items ||
            root.value("materials", nlohmann::json::array()).size() > 65'536U ||
            root.value("textures", nlohmann::json::array()).size() > 4095U ||
            root.value("images", nlohmann::json::array()).size() > 4095U) {
            reason = "GLB scene or material counts exceed MVP1 limits";
            return false;
        }
        for (const auto& image : root.value("images", nlohmann::json::array())) {
            if (image.contains("uri") || !image.contains("bufferView")) {
                reason = "MVP1 images must be embedded in bounded GLB bufferViews";
                return false;
            }
        }
        return true;
    } catch (const std::exception& exception) {
        reason = std::string{"malformed bounded GLB JSON: "} + exception.what();
        return false;
    }
}

[[nodiscard]] std::uint32_t read_u32_be(
    std::span<const std::byte> bytes,
    std::size_t offset) noexcept {
    return (std::to_integer<std::uint32_t>(bytes[offset]) << 24U) |
        (std::to_integer<std::uint32_t>(bytes[offset + 1U]) << 16U) |
        (std::to_integer<std::uint32_t>(bytes[offset + 2U]) << 8U) |
        std::to_integer<std::uint32_t>(bytes[offset + 3U]);
}

[[nodiscard]] bool safe_image_dimensions(
    std::span<const std::byte> encoded,
    std::string& reason) noexcept {
    constexpr std::uint64_t max_dimension = 16'384U;
    constexpr std::uint64_t max_rgba_bytes = 512ULL * 1024ULL * 1024ULL;
    std::uint64_t width = 0U;
    std::uint64_t height = 0U;
    const std::array<std::byte, 8> png_signature{
        std::byte{0x89}, std::byte{'P'}, std::byte{'N'}, std::byte{'G'},
        std::byte{0x0D}, std::byte{0x0A}, std::byte{0x1A}, std::byte{0x0A}};
    if (encoded.size() >= 24U &&
        std::equal(png_signature.begin(), png_signature.end(), encoded.begin())) {
        width = read_u32_be(encoded, 16U);
        height = read_u32_be(encoded, 20U);
    } else if (encoded.size() >= 4U && encoded[0] == std::byte{0xFF} &&
        encoded[1] == std::byte{0xD8}) {
        std::size_t offset = 2U;
        while (offset + 8U < encoded.size()) {
            while (offset < encoded.size() && encoded[offset] != std::byte{0xFF}) ++offset;
            while (offset < encoded.size() && encoded[offset] == std::byte{0xFF}) ++offset;
            if (offset >= encoded.size()) break;
            const std::uint32_t marker = std::to_integer<std::uint32_t>(encoded[offset++]);
            if (marker == 0xD8U || marker == 0xD9U || (marker >= 0xD0U && marker <= 0xD7U)) continue;
            if (offset + 2U > encoded.size()) break;
            const std::uint32_t length =
                (std::to_integer<std::uint32_t>(encoded[offset]) << 8U) |
                std::to_integer<std::uint32_t>(encoded[offset + 1U]);
            if (length < 2U || length > encoded.size() - offset) break;
            const bool start_of_frame =
                (marker >= 0xC0U && marker <= 0xC3U) ||
                (marker >= 0xC5U && marker <= 0xC7U) ||
                (marker >= 0xC9U && marker <= 0xCBU) ||
                (marker >= 0xCDU && marker <= 0xCFU);
            if (start_of_frame && length >= 7U) {
                height =
                    (std::to_integer<std::uint32_t>(encoded[offset + 3U]) << 8U) |
                    std::to_integer<std::uint32_t>(encoded[offset + 4U]);
                width =
                    (std::to_integer<std::uint32_t>(encoded[offset + 5U]) << 8U) |
                    std::to_integer<std::uint32_t>(encoded[offset + 6U]);
                break;
            }
            offset += length;
        }
    }
    if (width == 0U || height == 0U || width > max_dimension || height > max_dimension ||
        width > max_rgba_bytes / 4U / height) {
        reason = "PNG/JPEG dimensions are invalid or exceed the 512 MiB decode boundary";
        return false;
    }
    return true;
}

[[nodiscard]] std::vector<std::byte> read_file(const std::filesystem::path& path) {
    std::ifstream stream(path, std::ios::binary | std::ios::ate);
    if (!stream) {
        return {};
    }
    const auto size = stream.tellg();
    if (size <= 0) {
        return {};
    }
    std::vector<std::byte> bytes(static_cast<std::size_t>(size));
    stream.seekg(0);
    stream.read(reinterpret_cast<char*>(bytes.data()), size);
    return stream ? bytes : std::vector<std::byte>{};
}

[[nodiscard]] bool supported_asset(const fastgltf::Asset& asset, std::string& reason) {
    if (asset.scenes.size() != 1U) {
        reason = "MVP1 requires exactly one glTF scene";
        return false;
    }
    if (!asset.extensionsRequired.empty() || !asset.extensionsUsed.empty() ||
        !asset.animations.empty() || !asset.skins.empty()) {
        reason = "extensions, animation, and skinning are outside the MVP1 subset";
        return false;
    }
    for (const auto& material : asset.materials) {
        if (material.alphaMode == fastgltf::AlphaMode::Blend) {
            reason = "glTF alphaMode BLEND is unsupported";
            return false;
        }
    }
    for (const auto& mesh : asset.meshes) {
        if (!mesh.weights.empty()) {
            reason = "morph target weights are outside the MVP1 subset";
            return false;
        }
        for (const auto& primitive : mesh.primitives) {
            if (!primitive.targets.empty() || !primitive.mappings.empty() ||
                primitive.dracoCompression != nullptr) {
                reason = "morph targets, material variants, and compressed primitives are unsupported";
                return false;
            }
            if (primitive.type != fastgltf::PrimitiveType::Triangles) {
                reason = "only triangle primitives are supported";
                return false;
            }
            for (const auto& attribute : primitive.attributes) {
                const std::string_view name = attribute.name;
                if (name != "POSITION" && name != "NORMAL" && name != "TANGENT" &&
                    name != "TEXCOORD_0") {
                    reason = "unsupported vertex attribute: " + std::string{name};
                    return false;
                }
            }
            if (primitive.findAttribute("POSITION") == primitive.attributes.end() ||
                primitive.findAttribute("NORMAL") == primitive.attributes.end() ||
                primitive.findAttribute("TANGENT") == primitive.attributes.end() ||
                primitive.findAttribute("TEXCOORD_0") == primitive.attributes.end()) {
                reason = "canonical MVP1 mesh requires POSITION/NORMAL/TANGENT/TEXCOORD_0";
                return false;
            }
        }
    }
    for (const auto& node : asset.nodes) {
        if (node.skinIndex || !node.weights.empty() || !node.instancingAttributes.empty()) {
            reason = "skinned, morphed, and GPU-instanced nodes are outside the MVP1 subset";
            return false;
        }
    }
    return true;
}

[[nodiscard]] std::vector<std::byte> image_bytes(
    const fastgltf::Asset& asset,
    const fastgltf::Image& image) {
    if (const auto* source = std::get_if<fastgltf::sources::BufferView>(&image.data)) {
        const auto bytes = fastgltf::DefaultBufferDataAdapter{}(
            asset, source->bufferViewIndex);
        return {bytes.begin(), bytes.end()};
    }
    if (const auto* source = std::get_if<fastgltf::sources::Array>(&image.data)) {
        return {source->bytes.begin(), source->bytes.end()};
    }
    if (const auto* source = std::get_if<fastgltf::sources::Vector>(&image.data)) {
        return source->bytes;
    }
    if (const auto* source = std::get_if<fastgltf::sources::ByteView>(&image.data)) {
        return {source->bytes.begin(), source->bytes.end()};
    }
    return {};
}

[[nodiscard]] bool cook_texture(
    const fastgltf::Asset& asset,
    std::size_t texture_index,
    alpha::content::TextureColorSpace color_space,
    alpha::content::CookedTexture& output,
    std::string& reason) {
    const auto& texture = asset.textures[texture_index];
    if (!texture.imageIndex || texture.imageIndex.value() >= asset.images.size()) {
        reason = "texture has no supported PNG/JPEG image";
        return false;
    }
    const auto encoded = image_bytes(asset, asset.images[texture.imageIndex.value()]);
    if (encoded.empty()) {
        reason = "texture bytes are unavailable after bounded GLB load";
        return false;
    }
    if (!safe_image_dimensions(encoded, reason)) {
        return false;
    }

    DirectX::TexMetadata metadata{};
    DirectX::ScratchImage decoded;
    HRESULT result = DirectX::LoadFromWICMemory(
        encoded.data(), encoded.size(), DirectX::WIC_FLAGS_FORCE_RGB, &metadata, decoded);
    if (FAILED(result) || metadata.dimension != DirectX::TEX_DIMENSION_TEXTURE2D ||
        metadata.arraySize != 1U || metadata.depth != 1U) {
        reason = "DirectXTex failed to decode a 2D PNG/JPEG texture";
        return false;
    }

    const DirectX::Image* base = decoded.GetImage(0U, 0U, 0U);
    DirectX::ScratchImage converted;
    if (base == nullptr) {
        reason = "decoded texture has no base image";
        return false;
    }
    if (base->format != DXGI_FORMAT_R8G8B8A8_UNORM &&
        base->format != DXGI_FORMAT_R8G8B8A8_UNORM_SRGB) {
        result = DirectX::Convert(
            *base,
            DXGI_FORMAT_R8G8B8A8_UNORM,
            DirectX::TEX_FILTER_DEFAULT,
            DirectX::TEX_THRESHOLD_DEFAULT,
            converted);
        if (FAILED(result)) {
            reason = "DirectXTex failed to canonicalize texture to RGBA8";
            return false;
        }
        base = converted.GetImage(0U, 0U, 0U);
    }

    if (base->width == 1U && base->height == 1U) {
        output.width = 1U;
        output.height = 1U;
        output.color_space = color_space;
        output.mip_offsets.push_back(0U);
        const auto* begin = reinterpret_cast<const std::byte*>(base->pixels);
        output.rgba8.assign(begin, begin + 4U);
        return true;
    }

    DirectX::ScratchImage mip_chain;
    result = DirectX::GenerateMipMaps(
        *base, DirectX::TEX_FILTER_DEFAULT, 0U, mip_chain);
    if (FAILED(result)) {
        reason = "DirectXTex failed to generate texture mip levels";
        return false;
    }
    const auto mip_metadata = mip_chain.GetMetadata();
    if (mip_metadata.width > std::numeric_limits<std::uint32_t>::max() ||
        mip_metadata.height > std::numeric_limits<std::uint32_t>::max() ||
        mip_metadata.mipLevels > std::numeric_limits<std::uint32_t>::max()) {
        reason = "texture dimensions exceed the runtime schema";
        return false;
    }
    output.width = static_cast<std::uint32_t>(mip_metadata.width);
    output.height = static_cast<std::uint32_t>(mip_metadata.height);
    output.color_space = color_space;
    for (std::size_t mip = 0U; mip < mip_metadata.mipLevels; ++mip) {
        const auto* image = mip_chain.GetImage(mip, 0U, 0U);
        if (image == nullptr || image->width > std::numeric_limits<std::size_t>::max() / 4U) {
            reason = "generated texture mip is invalid";
            return false;
        }
        output.mip_offsets.push_back(static_cast<std::uint32_t>(output.rgba8.size()));
        const std::size_t tight_row = image->width * 4U;
        for (std::size_t row = 0U; row < image->height; ++row) {
            const auto* begin = reinterpret_cast<const std::byte*>(image->pixels) + row * image->rowPitch;
            output.rgba8.insert(output.rgba8.end(), begin, begin + tight_row);
        }
    }
    return true;
}

[[nodiscard]] bool cook_scene(
    fastgltf::Asset& asset,
    alpha::content::CookedScene& output,
    std::string& reason) {
    output.materials.reserve(std::max<std::size_t>(asset.materials.size(), 1U));
    std::vector<std::optional<alpha::content::TextureColorSpace>> texture_spaces(
        asset.textures.size());
    const auto mark_texture = [&](const auto& info, alpha::content::TextureColorSpace space) {
        if (!info) return true;
        const std::size_t index = info->textureIndex;
        if (index >= texture_spaces.size()) return false;
        if (texture_spaces[index] && texture_spaces[index].value() != space) return false;
        texture_spaces[index] = space;
        return true;
    };

    for (const auto& source : asset.materials) {
        if (!mark_texture(source.pbrData.baseColorTexture, alpha::content::TextureColorSpace::Srgb) ||
            !mark_texture(source.emissiveTexture, alpha::content::TextureColorSpace::Srgb) ||
            !mark_texture(source.pbrData.metallicRoughnessTexture, alpha::content::TextureColorSpace::Linear) ||
            !mark_texture(source.normalTexture, alpha::content::TextureColorSpace::Linear) ||
            !mark_texture(source.occlusionTexture, alpha::content::TextureColorSpace::Linear)) {
            reason = "a texture cannot be shared between sRGB and linear material roles in MVP1";
            return false;
        }
        alpha::content::CookedMaterial material;
        for (std::size_t index = 0U; index < 4U; ++index) {
            material.base_color[index] = static_cast<float>(source.pbrData.baseColorFactor[index]);
        }
        for (std::size_t index = 0U; index < 3U; ++index) {
            material.emissive[index] = static_cast<float>(source.emissiveFactor[index]);
        }
        material.metallic = static_cast<float>(source.pbrData.metallicFactor);
        material.roughness = static_cast<float>(source.pbrData.roughnessFactor);
        material.normal_scale = source.normalTexture
            ? static_cast<float>(source.normalTexture->scale)
            : 1.0F;
        material.occlusion_strength = source.occlusionTexture
            ? static_cast<float>(source.occlusionTexture->strength)
            : 1.0F;
        material.alpha_cutoff = static_cast<float>(source.alphaCutoff);
        material.alpha_mode = source.alphaMode == fastgltf::AlphaMode::Mask
            ? alpha::content::CookedAlphaMode::Mask
            : alpha::content::CookedAlphaMode::Opaque;
        const auto texture_slot = [](const auto& info) -> std::uint32_t {
            return info ? static_cast<std::uint32_t>(info->textureIndex + 1U) : 0U;
        };
        material.texture_indices = {
            texture_slot(source.pbrData.baseColorTexture),
            texture_slot(source.pbrData.metallicRoughnessTexture),
            texture_slot(source.normalTexture),
            texture_slot(source.occlusionTexture),
            texture_slot(source.emissiveTexture)};
        output.materials.push_back(material);
    }
    if (output.materials.empty()) output.materials.emplace_back();

    std::vector<std::vector<std::uint32_t>> primitive_mesh_indices(asset.meshes.size());
    for (std::size_t source_mesh_index = 0U;
        source_mesh_index < asset.meshes.size();
        ++source_mesh_index) {
        const auto& mesh = asset.meshes[source_mesh_index];
        for (const auto& primitive : mesh.primitives) {
            const auto position = primitive.findAttribute("POSITION");
            const auto normal = primitive.findAttribute("NORMAL");
            const auto tangent = primitive.findAttribute("TANGENT");
            const auto uv = primitive.findAttribute("TEXCOORD_0");
            const auto& position_accessor = asset.accessors[position->accessorIndex];
            const auto& normal_accessor = asset.accessors[normal->accessorIndex];
            const auto& tangent_accessor = asset.accessors[tangent->accessorIndex];
            const auto& uv_accessor = asset.accessors[uv->accessorIndex];
            if (position_accessor.count == 0U ||
                normal_accessor.count != position_accessor.count ||
                tangent_accessor.count != position_accessor.count ||
                uv_accessor.count != position_accessor.count) {
                reason = "canonical vertex accessor counts do not match";
                return false;
            }
            alpha::content::CookedMesh cooked;
            cooked.vertices.resize(position_accessor.count);
            cooked.bounds_min = {
                std::numeric_limits<float>::max(),
                std::numeric_limits<float>::max(),
                std::numeric_limits<float>::max()};
            cooked.bounds_max = {
                std::numeric_limits<float>::lowest(),
                std::numeric_limits<float>::lowest(),
                std::numeric_limits<float>::lowest()};
            fastgltf::iterateAccessorWithIndex<fastgltf::math::fvec3>(
                asset, position_accessor, [&](const auto& value, std::size_t index) {
                    cooked.vertices[index].position = {value[0], value[1], value[2]};
                    for (std::size_t axis = 0U; axis < 3U; ++axis) {
                        cooked.bounds_min[axis] = std::min(cooked.bounds_min[axis], value[axis]);
                        cooked.bounds_max[axis] = std::max(cooked.bounds_max[axis], value[axis]);
                    }
                });
            fastgltf::iterateAccessorWithIndex<fastgltf::math::fvec3>(
                asset, normal_accessor, [&](const auto& value, std::size_t index) {
                    cooked.vertices[index].normal = {value[0], value[1], value[2]};
                });
            fastgltf::iterateAccessorWithIndex<fastgltf::math::fvec4>(
                asset, tangent_accessor, [&](const auto& value, std::size_t index) {
                    cooked.vertices[index].tangent = {value[0], value[1], value[2], value[3]};
                });
            fastgltf::iterateAccessorWithIndex<fastgltf::math::fvec2>(
                asset, uv_accessor, [&](const auto& value, std::size_t index) {
                    cooked.vertices[index].uv = {value[0], value[1]};
                });
            if (primitive.indicesAccessor) {
                const auto& accessor = asset.accessors[primitive.indicesAccessor.value()];
                cooked.indices.resize(accessor.count);
                fastgltf::iterateAccessorWithIndex<std::uint32_t>(
                    asset, accessor, [&](std::uint32_t value, std::size_t index) {
                        cooked.indices[index] = value;
                    });
            } else {
                cooked.indices.resize(cooked.vertices.size());
                std::iota(cooked.indices.begin(), cooked.indices.end(), 0U);
            }
            if (cooked.indices.size() % 3U != 0U) {
                reason = "triangle index count is not divisible by three";
                return false;
            }
            cooked.material_index = primitive.materialIndex
                ? static_cast<std::uint32_t>(primitive.materialIndex.value())
                : 0U;
            if (cooked.material_index >= output.materials.size()) {
                reason = "primitive material index is invalid";
                return false;
            }
            primitive_mesh_indices[source_mesh_index].push_back(
                static_cast<std::uint32_t>(output.meshes.size()));
            output.meshes.push_back(std::move(cooked));
        }
    }
    if (output.meshes.empty()) {
        reason = "MVP1 content requires at least one mesh primitive";
        return false;
    }

    fastgltf::iterateSceneNodes(
        asset,
        0U,
        fastgltf::math::fmat4x4{},
        [&](fastgltf::Node& node, const fastgltf::math::fmat4x4& world) {
            if (!node.meshIndex || node.meshIndex.value() >= primitive_mesh_indices.size()) {
                return;
            }
            for (const std::uint32_t mesh_index :
                primitive_mesh_indices[node.meshIndex.value()]) {
                alpha::content::CookedInstance instance;
                instance.mesh_index = mesh_index;
                for (std::size_t row = 0U; row < 4U; ++row) {
                    for (std::size_t column = 0U; column < 4U; ++column) {
                        // fastgltf is column-vector/column-major. AlphaEngine shaders use
                        // row vectors, so flattening its columns as our rows transposes it.
                        instance.transform[row * 4U + column] = world[row][column];
                    }
                }
                output.instances.push_back(instance);
            }
        });
    if (output.instances.empty()) {
        reason = "the active glTF scene contains no mesh instances";
        return false;
    }

    output.textures.resize(asset.textures.size());
    for (std::size_t index = 0U; index < asset.textures.size(); ++index) {
        const auto space = texture_spaces[index].value_or(
            alpha::content::TextureColorSpace::Linear);
        if (!cook_texture(asset, index, space, output.textures[index], reason)) return false;
    }
    return true;
}

}  // namespace

int main(int argc, char** argv) {
    const ComApartment com;
    if (!com.available()) {
        std::cerr << "assetc: COM initialization failed for WIC texture processing\n";
        return 1;
    }
    if (argc != 3) {
        std::cerr << "usage: assetc <input.glb> <output.acontent>\n";
        return 2;
    }
    const std::filesystem::path input = argv[1];
    const std::filesystem::path output = argv[2];
    const auto bytes = read_file(input);
    if (bytes.empty()) {
        std::cerr << "assetc: cannot read input\n";
        return 3;
    }
    if (const auto boundary = alpha::content::prevalidate_glb(bytes); !boundary) {
        std::cerr << "assetc: " << boundary.error().message << '\n';
        return 4;
    }
    std::string reason;
    if (!prevalidate_gltf_ranges(bytes, reason)) {
        std::cerr << "assetc: bounded GLB validation: " << reason << '\n';
        return 5;
    }

    // fastgltf is called only after the bounded container and JSON range walks above. This is the
    // explicit mitigation for malformed-GLB parser issue #144 in the pinned 0.9.0.
    auto data = fastgltf::GltfDataBuffer::FromBytes(bytes.data(), bytes.size());
    if (data.error() != fastgltf::Error::None) {
        std::cerr << "assetc: fastgltf buffer: " << fastgltf::getErrorMessage(data.error()) << '\n';
        return 6;
    }
    fastgltf::Parser parser;
    auto parsed = parser.loadGltfBinary(
        data.get(),
        input.parent_path(),
        fastgltf::Options::None);
    if (parsed.error() != fastgltf::Error::None) {
        std::cerr << "assetc: fastgltf: " << fastgltf::getErrorMessage(parsed.error()) << '\n';
        return 7;
    }
    if (const auto validation = fastgltf::validate(parsed.get());
        validation != fastgltf::Error::None) {
        std::cerr << "assetc: validation: " << fastgltf::getErrorMessage(validation) << '\n';
        return 8;
    }
    if (!supported_asset(parsed.get(), reason)) {
        std::cerr << "assetc: unsupported feature: " << reason << '\n';
        return 9;
    }

    alpha::content::CookedScene cooked_scene;
    if (!cook_scene(parsed.get(), cooked_scene, reason)) {
        std::cerr << "assetc: cook failed: " << reason << '\n';
        return 10;
    }
    const auto cooked_payload = alpha::content::encode_cooked_scene(cooked_scene);
    if (!cooked_payload) {
        std::cerr << "assetc: " << cooked_payload.error().message << '\n';
        return 11;
    }

    alpha::content::PackageMetadata metadata;
    metadata.mesh_count = static_cast<std::uint32_t>(cooked_scene.meshes.size());
    metadata.instance_count = static_cast<std::uint32_t>(cooked_scene.instances.size());
    metadata.material_count = static_cast<std::uint32_t>(cooked_scene.materials.size());
    metadata.texture_count = static_cast<std::uint32_t>(cooked_scene.textures.size());
    const auto source_hash = alpha::content::sha256(bytes);
    if (!source_hash) {
        std::cerr << "assetc: " << source_hash.error().message << '\n';
        return 12;
    }
    metadata.source_hash = source_hash.value();
    const auto package = alpha::content::encode_package(cooked_payload.value(), metadata);
    if (!package) {
        std::cerr << "assetc: " << package.error().message << '\n';
        return 13;
    }

    std::filesystem::create_directories(output.parent_path());
    std::ofstream stream(output, std::ios::binary | std::ios::trunc);
    stream.write(
        reinterpret_cast<const char*>(package.value().data()),
        static_cast<std::streamsize>(package.value().size()));
    if (!stream) {
        std::cerr << "assetc: cannot write output\n";
        return 13;
    }
    std::cout << "assetc: cooked " << input.string() << " -> " << output.string() << '\n';
    return 0;
}
