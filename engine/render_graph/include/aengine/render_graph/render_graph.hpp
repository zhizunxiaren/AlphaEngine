#pragma once

#include <aengine/core/handle.hpp>
#include <aengine/core/result.hpp>

#include <cstdint>
#include <string>
#include <string_view>
#include <vector>

namespace alpha::render_graph {

struct ResourceTag;
using ResourceRef = Handle<ResourceTag>;

enum class ResourceKind : std::uint8_t {
    Texture,
    Buffer,
};

enum class TextureFormat : std::uint8_t {
    Unknown,
    R32Typeless,
    D32Float,
    RGBA16Float,
    RGBA8Unorm,
};

enum class ResourceLifetime : std::uint8_t {
    Transient,
    Imported,
    Persistent,
};

enum class ResourceUsage : std::uint8_t {
    Undefined,
    ColorAttachmentWrite,
    DepthAttachmentWrite,
    ShaderRead,
    CopySource,
    CopyDestination,
    Present,
};

struct ResourceDesc {
    ResourceKind kind{ResourceKind::Texture};
    ResourceLifetime lifetime{ResourceLifetime::Transient};
    std::string name;
    std::uint32_t width{1U};
    std::uint32_t height{1U};
    TextureFormat format{TextureFormat::Unknown};

    [[nodiscard]] static ResourceDesc texture(
        std::string name,
        ResourceLifetime lifetime = ResourceLifetime::Transient);
    [[nodiscard]] static ResourceDesc texture(
        std::string name,
        ResourceLifetime lifetime,
        std::uint32_t width,
        std::uint32_t height,
        TextureFormat format);
    [[nodiscard]] static ResourceDesc buffer(
        std::string name,
        ResourceLifetime lifetime = ResourceLifetime::Transient);
};

enum class GraphErrorCode : std::uint8_t {
    InvalidResource,
    ReadBeforeWrite,
    IncompatibleUsage,
    DuplicatePassName,
    EmptyPassName,
};

struct GraphError {
    GraphErrorCode code{GraphErrorCode::InvalidResource};
    std::string message;
    std::string pass;
    ResourceRef resource;
};

struct ResourceTransition {
    ResourceRef resource;
    ResourceUsage before{ResourceUsage::Undefined};
    ResourceUsage after{ResourceUsage::Undefined};
};

struct CompiledPass {
    std::string name;
    std::vector<ResourceTransition> transitions;
};

class ExecutionPlan {
public:
    [[nodiscard]] const std::vector<CompiledPass>& passes() const noexcept {
        return passes_;
    }
    [[nodiscard]] const std::vector<ResourceDesc>& resources() const noexcept {
        return resources_;
    }
    [[nodiscard]] std::uint64_t stable_hash() const noexcept { return stable_hash_; }

private:
    friend class RenderGraph;
    std::vector<CompiledPass> passes_;
    std::vector<ResourceDesc> resources_;
    std::uint64_t stable_hash_{0U};
};

class RenderGraph;

class PassBuilder {
public:
    PassBuilder& read(ResourceRef resource, ResourceUsage usage);
    PassBuilder& write(ResourceRef resource, ResourceUsage usage);

private:
    friend class RenderGraph;
    PassBuilder(RenderGraph& graph, std::size_t pass_index)
        : graph_(&graph), pass_index_(pass_index) {}

    RenderGraph* graph_;
    std::size_t pass_index_;
};

class RenderGraph {
public:
    [[nodiscard]] ResourceRef create_texture(ResourceDesc description);
    [[nodiscard]] ResourceRef create_buffer(ResourceDesc description);
    PassBuilder add_pass(std::string name);
    [[nodiscard]] Result<PassBuilder, GraphError> insert_pass_before(
        std::string_view anchor,
        std::string name);

    [[nodiscard]] Result<ExecutionPlan, GraphError> compile() const;
    void reset();

private:
    friend class PassBuilder;

    struct Access {
        ResourceRef resource;
        ResourceUsage usage{ResourceUsage::Undefined};
        bool write{false};
    };

    struct Pass {
        std::string name;
        std::vector<Access> accesses;
    };

    void add_access(
        std::size_t pass_index,
        ResourceRef resource,
        ResourceUsage usage,
        bool write);
    [[nodiscard]] bool contains(ResourceRef resource) const noexcept;

    std::vector<ResourceDesc> resources_;
    std::vector<Pass> passes_;
};

}  // namespace alpha::render_graph
