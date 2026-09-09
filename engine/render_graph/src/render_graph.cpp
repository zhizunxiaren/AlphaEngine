#include <aengine/render_graph/render_graph.hpp>

#include <cstddef>
#include <cstdint>
#include <optional>
#include <string>
#include <string_view>
#include <unordered_set>
#include <utility>
#include <vector>

namespace alpha::render_graph {
namespace {

constexpr std::uint64_t fnv_offset = 14'695'981'039'346'656'037ULL;
constexpr std::uint64_t fnv_prime = 1'099'511'628'211ULL;

void hash_bytes(std::uint64_t& hash, std::string_view bytes) noexcept {
    for (const unsigned char value : bytes) {
        hash ^= value;
        hash *= fnv_prime;
    }
}

void hash_value(std::uint64_t& hash, std::uint64_t value) noexcept {
    for (std::size_t byte = 0; byte < sizeof(value); ++byte) {
        hash ^= static_cast<std::uint8_t>(value >> (byte * 8U));
        hash *= fnv_prime;
    }
}

}  // namespace

ResourceDesc ResourceDesc::texture(
    std::string name,
    ResourceLifetime lifetime) {
    return texture(
        std::move(name),
        lifetime,
        1U,
        1U,
        TextureFormat::Unknown);
}

ResourceDesc ResourceDesc::texture(
    std::string name,
    ResourceLifetime lifetime,
    std::uint32_t width,
    std::uint32_t height,
    TextureFormat format) {
    return ResourceDesc{
        ResourceKind::Texture,
        lifetime,
        std::move(name),
        width,
        height,
        format};
}

ResourceDesc ResourceDesc::buffer(
    std::string name,
    ResourceLifetime lifetime) {
    return ResourceDesc{
        ResourceKind::Buffer,
        lifetime,
        std::move(name),
        1U,
        1U,
        TextureFormat::Unknown};
}

PassBuilder& PassBuilder::read(ResourceRef resource, ResourceUsage usage) {
    graph_->add_access(pass_index_, resource, usage, false);
    return *this;
}

PassBuilder& PassBuilder::write(ResourceRef resource, ResourceUsage usage) {
    graph_->add_access(pass_index_, resource, usage, true);
    return *this;
}

ResourceRef RenderGraph::create_texture(ResourceDesc description) {
    description.kind = ResourceKind::Texture;
    resources_.push_back(std::move(description));
    return ResourceRef::from_parts(
        static_cast<std::uint32_t>(resources_.size()),
        1U);
}

ResourceRef RenderGraph::create_buffer(ResourceDesc description) {
    description.kind = ResourceKind::Buffer;
    resources_.push_back(std::move(description));
    return ResourceRef::from_parts(
        static_cast<std::uint32_t>(resources_.size()),
        1U);
}

PassBuilder RenderGraph::add_pass(std::string name) {
    passes_.push_back(Pass{std::move(name), {}});
    return PassBuilder{*this, passes_.size() - 1U};
}

Result<PassBuilder, GraphError> RenderGraph::insert_pass_before(
    std::string_view anchor,
    std::string name) {
    const auto found = std::find_if(passes_.begin(), passes_.end(), [anchor](const Pass& pass) {
        return pass.name == anchor;
    });
    if (found == passes_.end()) {
        return GraphError{
            GraphErrorCode::InvalidResource,
            "render graph insertion anchor does not exist",
            std::string{anchor},
            {}};
    }
    const auto index = static_cast<std::size_t>(std::distance(passes_.begin(), found));
    passes_.insert(found, Pass{std::move(name), {}});
    return PassBuilder{*this, index};
}

Result<ExecutionPlan, GraphError> RenderGraph::compile() const {
    std::unordered_set<std::string> pass_names;
    std::vector<std::optional<ResourceUsage>> current_usage(resources_.size());
    std::vector<bool> initialized(resources_.size(), false);

    ExecutionPlan plan;
    plan.resources_ = resources_;
    plan.passes_.reserve(passes_.size());
    std::uint64_t stable_hash = fnv_offset;

    for (const Pass& pass : passes_) {
        if (pass.name.empty()) {
            return GraphError{
                GraphErrorCode::EmptyPassName,
                "render graph pass name cannot be empty",
                pass.name,
                {}};
        }
        if (!pass_names.insert(pass.name).second) {
            return GraphError{
                GraphErrorCode::DuplicatePassName,
                "render graph pass names must be unique",
                pass.name,
                {}};
        }

        std::unordered_set<std::uint64_t> resources_in_pass;
        CompiledPass compiled;
        compiled.name = pass.name;
        hash_bytes(stable_hash, pass.name);

        for (const Access& access : pass.accesses) {
            if (!contains(access.resource)) {
                return GraphError{
                    GraphErrorCode::InvalidResource,
                    "pass references an invalid graph resource",
                    pass.name,
                    access.resource};
            }

            if (!resources_in_pass.insert(access.resource.raw()).second) {
                return GraphError{
                    GraphErrorCode::IncompatibleUsage,
                    "a resource may have only one usage per MVP1 pass",
                    pass.name,
                    access.resource};
            }

            const auto resource_index =
                static_cast<std::size_t>(access.resource.index() - 1U);
            const ResourceDesc& description = resources_[resource_index];

            if (!access.write && !initialized[resource_index] &&
                description.lifetime == ResourceLifetime::Transient) {
                return GraphError{
                    GraphErrorCode::ReadBeforeWrite,
                    "transient resource is read before its first write",
                    pass.name,
                    access.resource};
            }

            const ResourceUsage before =
                current_usage[resource_index].value_or(ResourceUsage::Undefined);
            if (!current_usage[resource_index].has_value() ||
                before != access.usage) {
                compiled.transitions.push_back(ResourceTransition{
                    access.resource,
                    before,
                    access.usage});
            }

            current_usage[resource_index] = access.usage;
            initialized[resource_index] =
                initialized[resource_index] || access.write ||
                description.lifetime != ResourceLifetime::Transient;

            hash_value(stable_hash, access.resource.raw());
            hash_value(stable_hash, static_cast<std::uint64_t>(access.usage));
            hash_value(stable_hash, access.write ? 1U : 0U);
        }

        plan.passes_.push_back(std::move(compiled));
    }

    plan.stable_hash_ = stable_hash;
    return plan;
}

void RenderGraph::reset() {
    resources_.clear();
    passes_.clear();
}

void RenderGraph::add_access(
    std::size_t pass_index,
    ResourceRef resource,
    ResourceUsage usage,
    bool write) {
    passes_[pass_index].accesses.push_back(Access{resource, usage, write});
}

bool RenderGraph::contains(ResourceRef resource) const noexcept {
    return resource.valid() &&
           resource.generation() == 1U &&
           resource.index() > 0U &&
           resource.index() <= resources_.size();
}

}  // namespace alpha::render_graph
