#define NOMINMAX
#include <aengine/graphics/d3d12/d3d12_graphics.hpp>
#include <aengine/shader/shader_package.hpp>

#include <d3d12.h>
#include <dxgi1_6.h>
#include <wrl/client.h>

#include <pix3.h>

#include <Windows.h>

#include <algorithm>
#include <array>
#include <chrono>
#include <cstddef>
#include <cstdint>
#include <cstring>
#include <filesystem>
#include <fstream>
#include <limits>
#include <memory>
#include <string>
#include <utility>
#include <variant>
#include <vector>

extern "C" {
__declspec(dllexport) extern const UINT D3D12SDKVersion = 619U;
__declspec(dllexport) extern const char* D3D12SDKPath = ".\\D3D12\\";
}

namespace alpha::graphics::d3d12 {
namespace {

using Microsoft::WRL::ComPtr;

constexpr std::uint32_t frame_count = 2U;
constexpr std::uint32_t back_buffer_count = 3U;
constexpr std::uint32_t texture_descriptor_count = 4096U;
constexpr std::uint32_t sampler_descriptor_count = 64U;
constexpr std::uint32_t shadow_srv_start = texture_descriptor_count;
constexpr std::uint32_t tone_srv_start = shadow_srv_start + frame_count;
constexpr std::uint32_t ui_font_srv_slot = tone_srv_start + frame_count;
constexpr std::uint64_t frame_upload_size = 4ULL * 1024ULL * 1024ULL;
constexpr std::uint32_t max_timed_passes = 8U;
constexpr std::uint32_t queries_per_frame = max_timed_passes + 1U;
constexpr DXGI_FORMAT back_buffer_format = DXGI_FORMAT_R8G8B8A8_UNORM;

[[nodiscard]] Error hresult_error(
    ErrorCode code,
    std::string message,
    HRESULT result) {
    return Error{code, std::move(message), static_cast<std::int64_t>(result)};
}

[[nodiscard]] D3D12_RESOURCE_STATES state_for(
    render_graph::ResourceUsage usage) noexcept {
    using render_graph::ResourceUsage;
    switch (usage) {
    case ResourceUsage::ColorAttachmentWrite:
        return D3D12_RESOURCE_STATE_RENDER_TARGET;
    case ResourceUsage::DepthAttachmentWrite:
        return D3D12_RESOURCE_STATE_DEPTH_WRITE;
    case ResourceUsage::ShaderRead:
        return D3D12_RESOURCE_STATE_PIXEL_SHADER_RESOURCE;
    case ResourceUsage::CopySource:
        return D3D12_RESOURCE_STATE_COPY_SOURCE;
    case ResourceUsage::CopyDestination:
        return D3D12_RESOURCE_STATE_COPY_DEST;
    case ResourceUsage::Present:
        return D3D12_RESOURCE_STATE_PRESENT;
    case ResourceUsage::Undefined:
    default:
        return D3D12_RESOURCE_STATE_COMMON;
    }
}

[[nodiscard]] DXGI_FORMAT format_for(
    render_graph::TextureFormat format) noexcept {
    using render_graph::TextureFormat;
    switch (format) {
    case TextureFormat::R32Typeless:
        return DXGI_FORMAT_R32_TYPELESS;
    case TextureFormat::D32Float:
        return DXGI_FORMAT_D32_FLOAT;
    case TextureFormat::RGBA16Float:
        return DXGI_FORMAT_R16G16B16A16_FLOAT;
    case TextureFormat::RGBA8Unorm:
        return DXGI_FORMAT_R8G8B8A8_UNORM;
    case TextureFormat::Unknown:
    default:
        return DXGI_FORMAT_R8G8B8A8_UNORM;
    }
}

[[nodiscard]] std::string narrow(std::wstring_view text) {
    if (text.empty()) {
        return {};
    }
    const int count = WideCharToMultiByte(
        CP_UTF8, 0, text.data(), static_cast<int>(text.size()), nullptr, 0, nullptr, nullptr);
    std::string output(static_cast<std::size_t>(count), '\0');
    WideCharToMultiByte(
        CP_UTF8, 0, text.data(), static_cast<int>(text.size()), output.data(), count, nullptr, nullptr);
    return output;
}

[[nodiscard]] D3D12_CPU_DESCRIPTOR_HANDLE offset_handle(
    D3D12_CPU_DESCRIPTOR_HANDLE start,
    std::uint32_t index,
    std::uint32_t increment) noexcept {
    start.ptr += static_cast<SIZE_T>(index) * increment;
    return start;
}

[[nodiscard]] D3D12_GPU_DESCRIPTOR_HANDLE offset_handle(
    D3D12_GPU_DESCRIPTOR_HANDLE start,
    std::uint32_t index,
    std::uint32_t increment) noexcept {
    start.ptr += static_cast<UINT64>(index) * increment;
    return start;
}

[[nodiscard]] std::vector<std::byte> read_binary(const std::filesystem::path& path) {
    std::ifstream stream(path, std::ios::binary | std::ios::ate);
    if (!stream) return {};
    const auto size = stream.tellg();
    if (size <= 0) return {};
    std::vector<std::byte> bytes(static_cast<std::size_t>(size));
    stream.seekg(0);
    stream.read(reinterpret_cast<char*>(bytes.data()), size);
    return stream ? bytes : std::vector<std::byte>{};
}

[[nodiscard]] std::string read_text(const std::filesystem::path& path) {
    std::ifstream stream(path, std::ios::binary);
    return stream
        ? std::string{std::istreambuf_iterator<char>{stream}, {}}
        : std::string{};
}

[[nodiscard]] Result<std::vector<std::byte>> read_shader_package(
    const std::filesystem::path& root,
    std::string_view name,
    std::string_view expected_entry,
    std::string_view expected_profile) {
    auto dxil = read_binary(root / (std::string{name} + ".dxil"));
    const auto metadata = read_text(root / (std::string{name} + ".json"));
    if (dxil.empty() || metadata.empty()) {
        return Error{ErrorCode::ShaderCompileFailure, "MVP1 Shader Package is missing or empty"};
    }
    auto package = shader::ShaderPackage::load(dxil, metadata);
    if (!package) return package.error();
    if (package.value().entry() != expected_entry ||
        package.value().profile() != expected_profile) {
        return Error{ErrorCode::ShaderCompileFailure, "Shader Package entry/profile does not match its PSO role"};
    }
    return dxil;
}

[[nodiscard]] constexpr std::uint64_t align_up(
    std::uint64_t value,
    std::uint64_t alignment) noexcept {
    return (value + alignment - 1U) & ~(alignment - 1U);
}

struct FrameConstantsCpu {
    std::array<float, 16> view_projection{};
    std::array<float, 3> camera_position{};
    float exposure{};
};

struct PassConstantsCpu {
    std::array<float, 16> light_view_projection{};
    std::array<float, 3> light_direction{};
    float light_intensity{};
    std::array<float, 3> light_color{};
    std::uint32_t point_light_count{};
    std::array<std::array<float, 4>, 4> point_position_intensity{};
    std::array<std::array<float, 4>, 4> point_color{};
};

struct ObjectGpuCpu {
    std::array<float, 16> world{};
};

static_assert(sizeof(FrameConstantsCpu) == 80U);
static_assert(sizeof(PassConstantsCpu) == 224U);
static_assert(sizeof(ObjectGpuCpu) == 64U);
static_assert(sizeof(PbrMaterialData) == 80U);

}  // namespace

struct D3D12Graphics::Impl {
    struct Frame {
        ComPtr<ID3D12CommandAllocator> allocator;
        ComPtr<ID3D12Resource> upload;
        std::byte* mapped_upload{};
        std::uint64_t upload_cursor{};
        std::uint64_t fence_value{};
        std::uint32_t query_count{};
        std::array<std::string, max_timed_passes> query_names;
        std::vector<ComPtr<ID3D12Resource>> transient_resources;
    };

    struct ResourceSlot {
        ComPtr<ID3D12Resource> resource;
        std::uint32_t generation{1U};
        bool live{false};
        bool pending_retire{false};
        bool buffer{false};
        MemoryClass memory{MemoryClass::DeviceLocal};
        std::uint64_t capacity{};
        std::uint32_t width{};
        std::uint32_t height{};
        std::uint16_t mip_levels{};
        bool srgb{false};
        std::uint32_t descriptor_index{};
        D3D12_RESOURCE_STATES state{D3D12_RESOURCE_STATE_COMMON};
        std::uint64_t last_use{};
    };

    struct LogicalResource {
        ComPtr<ID3D12Resource> resource;
        D3D12_RESOURCE_STATES state{D3D12_RESOURCE_STATE_COMMON};
        D3D12_CPU_DESCRIPTOR_HANDLE rtv{};
        D3D12_CPU_DESCRIPTOR_HANDLE dsv{};
        bool has_rtv{false};
        bool has_dsv{false};
    };

    D3D12Config config;
    Capabilities capabilities;
    ComPtr<IDXGIFactory6> factory;
    ComPtr<IDXGIAdapter1> adapter;
    ComPtr<ID3D12Device> device;
    ComPtr<ID3D12InfoQueue> info_queue;
    ComPtr<ID3D12CommandQueue> queue;
    ComPtr<ID3D12GraphicsCommandList> command_list;
    ComPtr<ID3D12Fence> fence;
    ComPtr<ID3D12QueryHeap> timestamp_heap;
    ComPtr<ID3D12Resource> timestamp_readback;
    ComPtr<IDXGISwapChain3> swapchain;
    ComPtr<ID3D12DescriptorHeap> rtv_heap;
    ComPtr<ID3D12DescriptorHeap> dsv_heap;
    ComPtr<ID3D12DescriptorHeap> srv_heap;
    ComPtr<ID3D12DescriptorHeap> sampler_heap;
    ComPtr<ID3D12RootSignature> forward_root_signature;
    ComPtr<ID3D12RootSignature> tone_map_root_signature;
    ComPtr<ID3D12RootSignature> ui_root_signature;
    ComPtr<ID3D12PipelineState> forward_pipeline;
    ComPtr<ID3D12PipelineState> shadow_pipeline;
    ComPtr<ID3D12PipelineState> tone_map_pipeline;
    ComPtr<ID3D12PipelineState> ui_pipeline;
    ComPtr<ID3D12Resource> ui_font_texture;
    std::uint32_t ui_font_width{};
    std::uint32_t ui_font_height{};
    std::array<Frame, frame_count> frames;
    std::array<ComPtr<ID3D12Resource>, back_buffer_count> back_buffers;
    std::vector<ResourceSlot> resources;
    std::vector<std::uint32_t> free_resource_indices;
    HANDLE fence_event{};
    SwapchainHandle swapchain_handle{SwapchainHandle::from_parts(1U, 1U)};
    std::uint64_t next_frame_id{1U};
    std::uint64_t last_submitted{};
    std::uint64_t active_frame_id{};
    std::uint32_t active_frame_index{};
    std::uint32_t active_back_buffer{};
    std::uint32_t rtv_increment{};
    std::uint32_t dsv_increment{};
    std::uint32_t srv_increment{};
    bool device_lost{false};
    FrameTiming latest_timing;
    std::uint64_t timestamp_frequency{};
    HRESULT last_failure{S_OK};
    std::string last_pass;

    [[nodiscard]] Result<void> initialize();
    [[nodiscard]] Result<void> initialize_device();
    [[nodiscard]] Result<void> initialize_frame_runtime();
    [[nodiscard]] Result<void> initialize_pipelines();
    [[nodiscard]] Result<void> create_back_buffers();
    [[nodiscard]] Result<void> wait_fence(std::uint64_t value, std::chrono::milliseconds timeout);
    void collect_retired();
    [[nodiscard]] Result<ComPtr<ID3D12Resource>> create_graph_texture(
        const render_graph::ResourceDesc& description);
};

Result<void> D3D12Graphics::Impl::initialize() {
    if (config.width == 0U || config.height == 0U) {
        return Error{ErrorCode::InvalidArgument, "D3D12 output extent must be non-zero"};
    }
    if (auto result = initialize_device(); !result) {
        return result;
    }
    if (auto result = initialize_pipelines(); !result) {
        return result;
    }
    return initialize_frame_runtime();
}

Result<void> D3D12Graphics::Impl::initialize_device() {
    UINT factory_flags = 0U;
    if (config.debug_layer) {
        ComPtr<ID3D12Debug> debug;
        const HRESULT debug_result = D3D12GetDebugInterface(IID_PPV_ARGS(&debug));
        if (FAILED(debug_result)) {
            return hresult_error(ErrorCode::UnsupportedCapability, "D3D12 debug layer is unavailable", debug_result);
        }
        debug->EnableDebugLayer();
        factory_flags |= DXGI_CREATE_FACTORY_DEBUG;
        if (config.gpu_validation) {
            ComPtr<ID3D12Debug1> debug1;
            if (SUCCEEDED(debug.As(&debug1))) {
                debug1->SetEnableGPUBasedValidation(TRUE);
            }
        }
    }

    if (config.dred) {
        ComPtr<ID3D12DeviceRemovedExtendedDataSettings> dred;
        if (SUCCEEDED(D3D12GetDebugInterface(IID_PPV_ARGS(&dred)))) {
            dred->SetAutoBreadcrumbsEnablement(D3D12_DRED_ENABLEMENT_FORCED_ON);
            dred->SetPageFaultEnablement(D3D12_DRED_ENABLEMENT_FORCED_ON);
        }
    }

    HRESULT result = CreateDXGIFactory2(factory_flags, IID_PPV_ARGS(&factory));
    if (FAILED(result)) {
        return hresult_error(ErrorCode::BackendFailure, "CreateDXGIFactory2 failed", result);
    }

    if (config.use_warp) {
        result = factory->EnumWarpAdapter(IID_PPV_ARGS(&adapter));
        if (FAILED(result)) {
            return hresult_error(ErrorCode::UnsupportedCapability, "WARP adapter is unavailable", result);
        }
    } else {
        for (UINT index = 0U; ; ++index) {
            ComPtr<IDXGIAdapter1> candidate;
            result = factory->EnumAdapterByGpuPreference(
                index, DXGI_GPU_PREFERENCE_HIGH_PERFORMANCE, IID_PPV_ARGS(&candidate));
            if (result == DXGI_ERROR_NOT_FOUND) {
                break;
            }
            DXGI_ADAPTER_DESC1 description{};
            candidate->GetDesc1(&description);
            if ((description.Flags & DXGI_ADAPTER_FLAG_SOFTWARE) == 0U &&
                SUCCEEDED(D3D12CreateDevice(
                    candidate.Get(), D3D_FEATURE_LEVEL_12_0, __uuidof(ID3D12Device), nullptr))) {
                adapter = std::move(candidate);
                break;
            }
        }
        if (!adapter) {
            return Error{ErrorCode::UnsupportedCapability, "no FL 12_0 hardware adapter found; WARP must be explicit"};
        }
    }

    result = D3D12CreateDevice(adapter.Get(), D3D_FEATURE_LEVEL_12_0, IID_PPV_ARGS(&device));
    if (FAILED(result)) {
        return hresult_error(ErrorCode::UnsupportedCapability, "D3D12CreateDevice FL 12_0 failed", result);
    }
    if (config.debug_layer) {
        (void)device.As(&info_queue);
    }

    D3D12_FEATURE_DATA_D3D12_OPTIONS options{};
    result = device->CheckFeatureSupport(D3D12_FEATURE_D3D12_OPTIONS, &options, sizeof(options));
    if (FAILED(result) || options.ResourceBindingTier < D3D12_RESOURCE_BINDING_TIER_3) {
        return hresult_error(ErrorCode::UnsupportedCapability, "Resource Binding Tier 3 is required", result);
    }
    D3D12_FEATURE_DATA_SHADER_MODEL shader_model{D3D_SHADER_MODEL_6_0};
    result = device->CheckFeatureSupport(D3D12_FEATURE_SHADER_MODEL, &shader_model, sizeof(shader_model));
    if (FAILED(result) || shader_model.HighestShaderModel < D3D_SHADER_MODEL_6_0) {
        return hresult_error(ErrorCode::UnsupportedCapability, "Shader Model 6.0 is required", result);
    }
    D3D12_FEATURE_DATA_ROOT_SIGNATURE root_signature{D3D_ROOT_SIGNATURE_VERSION_1_1};
    result = device->CheckFeatureSupport(D3D12_FEATURE_ROOT_SIGNATURE, &root_signature, sizeof(root_signature));
    if (FAILED(result) || root_signature.HighestVersion < D3D_ROOT_SIGNATURE_VERSION_1_1) {
        return hresult_error(ErrorCode::UnsupportedCapability, "Root Signature 1.1 is required", result);
    }

    DXGI_ADAPTER_DESC1 adapter_description{};
    adapter->GetDesc1(&adapter_description);
    capabilities.adapter_name = narrow(adapter_description.Description);
    capabilities.is_software = (adapter_description.Flags & DXGI_ADAPTER_FLAG_SOFTWARE) != 0U;
    capabilities.resource_binding_tier = 3U;
    return {};
}

Result<void> D3D12Graphics::Impl::initialize_frame_runtime() {
    D3D12_COMMAND_QUEUE_DESC queue_description{};
    queue_description.Type = D3D12_COMMAND_LIST_TYPE_DIRECT;
    HRESULT result = device->CreateCommandQueue(&queue_description, IID_PPV_ARGS(&queue));
    if (FAILED(result)) {
        return hresult_error(ErrorCode::BackendFailure, "CreateCommandQueue failed", result);
    }

    for (Frame& frame : frames) {
        result = device->CreateCommandAllocator(
            D3D12_COMMAND_LIST_TYPE_DIRECT, IID_PPV_ARGS(&frame.allocator));
        if (FAILED(result)) {
            return hresult_error(ErrorCode::BackendFailure, "CreateCommandAllocator failed", result);
        }
        D3D12_HEAP_PROPERTIES upload_heap{};
        upload_heap.Type = D3D12_HEAP_TYPE_UPLOAD;
        D3D12_RESOURCE_DESC upload_desc{};
        upload_desc.Dimension = D3D12_RESOURCE_DIMENSION_BUFFER;
        upload_desc.Width = frame_upload_size;
        upload_desc.Height = 1U;
        upload_desc.DepthOrArraySize = 1U;
        upload_desc.MipLevels = 1U;
        upload_desc.SampleDesc.Count = 1U;
        upload_desc.Layout = D3D12_TEXTURE_LAYOUT_ROW_MAJOR;
        result = device->CreateCommittedResource(
            &upload_heap,
            D3D12_HEAP_FLAG_NONE,
            &upload_desc,
            D3D12_RESOURCE_STATE_GENERIC_READ,
            nullptr,
            IID_PPV_ARGS(&frame.upload));
        if (FAILED(result)) {
            return hresult_error(ErrorCode::OutOfMemory, "per-frame upload ring allocation failed", result);
        }
        const D3D12_RANGE no_read{0U, 0U};
        result = frame.upload->Map(
            0U, &no_read, reinterpret_cast<void**>(&frame.mapped_upload));
        if (FAILED(result)) {
            return hresult_error(ErrorCode::BackendFailure, "per-frame upload ring map failed", result);
        }
    }
    result = device->CreateCommandList(
        0U,
        D3D12_COMMAND_LIST_TYPE_DIRECT,
        frames[0].allocator.Get(),
        nullptr,
        IID_PPV_ARGS(&command_list));
    if (FAILED(result)) {
        return hresult_error(ErrorCode::BackendFailure, "CreateCommandList failed", result);
    }
    command_list->Close();

    result = device->CreateFence(0U, D3D12_FENCE_FLAG_NONE, IID_PPV_ARGS(&fence));
    if (FAILED(result)) {
        return hresult_error(ErrorCode::BackendFailure, "CreateFence failed", result);
    }
    result = queue->GetTimestampFrequency(&timestamp_frequency);
    if (FAILED(result) || timestamp_frequency == 0U) {
        return hresult_error(ErrorCode::UnsupportedCapability, "GPU timestamp frequency is unavailable", result);
    }
    D3D12_QUERY_HEAP_DESC query_description{};
    query_description.Type = D3D12_QUERY_HEAP_TYPE_TIMESTAMP;
    query_description.Count = frame_count * queries_per_frame;
    result = device->CreateQueryHeap(&query_description, IID_PPV_ARGS(&timestamp_heap));
    if (FAILED(result)) {
        return hresult_error(ErrorCode::BackendFailure, "GPU timestamp query heap creation failed", result);
    }
    D3D12_HEAP_PROPERTIES readback_heap{};
    readback_heap.Type = D3D12_HEAP_TYPE_READBACK;
    D3D12_RESOURCE_DESC readback_desc{};
    readback_desc.Dimension = D3D12_RESOURCE_DIMENSION_BUFFER;
    readback_desc.Width =
        static_cast<std::uint64_t>(frame_count) * queries_per_frame * sizeof(std::uint64_t);
    readback_desc.Height = 1U;
    readback_desc.DepthOrArraySize = 1U;
    readback_desc.MipLevels = 1U;
    readback_desc.SampleDesc.Count = 1U;
    readback_desc.Layout = D3D12_TEXTURE_LAYOUT_ROW_MAJOR;
    result = device->CreateCommittedResource(
        &readback_heap,
        D3D12_HEAP_FLAG_NONE,
        &readback_desc,
        D3D12_RESOURCE_STATE_COPY_DEST,
        nullptr,
        IID_PPV_ARGS(&timestamp_readback));
    if (FAILED(result)) {
        return hresult_error(ErrorCode::OutOfMemory, "GPU timestamp readback allocation failed", result);
    }
    fence_event = CreateEventW(nullptr, FALSE, FALSE, nullptr);
    if (fence_event == nullptr) {
        return Error{ErrorCode::BackendFailure, "CreateEvent for D3D12 fence failed", GetLastError()};
    }

    D3D12_DESCRIPTOR_HEAP_DESC rtv_description{};
    rtv_description.Type = D3D12_DESCRIPTOR_HEAP_TYPE_RTV;
    rtv_description.NumDescriptors = back_buffer_count + frame_count * 8U;
    result = device->CreateDescriptorHeap(&rtv_description, IID_PPV_ARGS(&rtv_heap));
    if (FAILED(result)) {
        return hresult_error(ErrorCode::BackendFailure, "Create RTV heap failed", result);
    }
    D3D12_DESCRIPTOR_HEAP_DESC dsv_description{};
    dsv_description.Type = D3D12_DESCRIPTOR_HEAP_TYPE_DSV;
    dsv_description.NumDescriptors = frame_count * 8U;
    result = device->CreateDescriptorHeap(&dsv_description, IID_PPV_ARGS(&dsv_heap));
    if (FAILED(result)) {
        return hresult_error(ErrorCode::BackendFailure, "Create DSV heap failed", result);
    }
    rtv_increment = device->GetDescriptorHandleIncrementSize(D3D12_DESCRIPTOR_HEAP_TYPE_RTV);
    dsv_increment = device->GetDescriptorHandleIncrementSize(D3D12_DESCRIPTOR_HEAP_TYPE_DSV);

    D3D12_DESCRIPTOR_HEAP_DESC srv_description{};
    srv_description.Type = D3D12_DESCRIPTOR_HEAP_TYPE_CBV_SRV_UAV;
    srv_description.NumDescriptors = ui_font_srv_slot + 1U;
    srv_description.Flags = D3D12_DESCRIPTOR_HEAP_FLAG_SHADER_VISIBLE;
    result = device->CreateDescriptorHeap(&srv_description, IID_PPV_ARGS(&srv_heap));
    if (FAILED(result)) {
        return hresult_error(ErrorCode::BackendFailure, "Create shader-visible descriptor heap failed", result);
    }
    srv_increment = device->GetDescriptorHandleIncrementSize(D3D12_DESCRIPTOR_HEAP_TYPE_CBV_SRV_UAV);

    D3D12_DESCRIPTOR_HEAP_DESC sampler_description{};
    sampler_description.Type = D3D12_DESCRIPTOR_HEAP_TYPE_SAMPLER;
    sampler_description.NumDescriptors = sampler_descriptor_count;
    sampler_description.Flags = D3D12_DESCRIPTOR_HEAP_FLAG_SHADER_VISIBLE;
    result = device->CreateDescriptorHeap(&sampler_description, IID_PPV_ARGS(&sampler_heap));
    if (FAILED(result)) {
        return hresult_error(ErrorCode::BackendFailure, "Create sampler descriptor heap failed", result);
    }
    D3D12_SAMPLER_DESC material_sampler{};
    material_sampler.Filter = D3D12_FILTER_MIN_MAG_MIP_LINEAR;
    material_sampler.AddressU = D3D12_TEXTURE_ADDRESS_MODE_WRAP;
    material_sampler.AddressV = D3D12_TEXTURE_ADDRESS_MODE_WRAP;
    material_sampler.AddressW = D3D12_TEXTURE_ADDRESS_MODE_WRAP;
    material_sampler.MaxLOD = D3D12_FLOAT32_MAX;
    device->CreateSampler(
        &material_sampler, sampler_heap->GetCPUDescriptorHandleForHeapStart());

    D3D12_SHADER_RESOURCE_VIEW_DESC null_texture{};
    null_texture.Format = DXGI_FORMAT_R8G8B8A8_UNORM;
    null_texture.ViewDimension = D3D12_SRV_DIMENSION_TEXTURE2D;
    null_texture.Shader4ComponentMapping = D3D12_DEFAULT_SHADER_4_COMPONENT_MAPPING;
    null_texture.Texture2D.MipLevels = 1U;
    device->CreateShaderResourceView(
        nullptr, &null_texture, srv_heap->GetCPUDescriptorHandleForHeapStart());

    if (config.window_handle != nullptr) {
        DXGI_SWAP_CHAIN_DESC1 swapchain_description{};
        swapchain_description.Width = config.width;
        swapchain_description.Height = config.height;
        swapchain_description.Format = back_buffer_format;
        swapchain_description.SampleDesc.Count = 1U;
        swapchain_description.BufferUsage = DXGI_USAGE_RENDER_TARGET_OUTPUT;
        swapchain_description.BufferCount = back_buffer_count;
        swapchain_description.SwapEffect = DXGI_SWAP_EFFECT_FLIP_DISCARD;
        if (config.allow_tearing) {
            BOOL supported = FALSE;
            if (SUCCEEDED(factory->CheckFeatureSupport(
                    DXGI_FEATURE_PRESENT_ALLOW_TEARING, &supported, sizeof(supported))) && supported) {
                swapchain_description.Flags = DXGI_SWAP_CHAIN_FLAG_ALLOW_TEARING;
            } else {
                return Error{ErrorCode::UnsupportedCapability, "tearing was requested but is unsupported"};
            }
        }
        ComPtr<IDXGISwapChain1> swapchain1;
        result = factory->CreateSwapChainForHwnd(
            queue.Get(),
            static_cast<HWND>(config.window_handle),
            &swapchain_description,
            nullptr,
            nullptr,
            &swapchain1);
        if (FAILED(result)) {
            return hresult_error(ErrorCode::SurfaceLost, "CreateSwapChainForHwnd failed", result);
        }
        factory->MakeWindowAssociation(static_cast<HWND>(config.window_handle), DXGI_MWA_NO_ALT_ENTER);
        swapchain1.As(&swapchain);
    }
    return create_back_buffers();
}

Result<void> D3D12Graphics::Impl::initialize_pipelines() {
    if (config.shader_root.empty()) {
        return {};
    }
    const std::filesystem::path root = config.shader_root;
    auto forward_vs_package = read_shader_package(root, "forward_vs", "ForwardVS", "vs_6_0");
    auto forward_ps_package = read_shader_package(root, "forward_ps", "ForwardPS", "ps_6_0");
    auto shadow_vs_package = read_shader_package(root, "shadow_vs", "ShadowVS", "vs_6_0");
    auto shadow_ps_package = read_shader_package(root, "shadow_ps", "ShadowPS", "ps_6_0");
    auto tonemap_vs_package = read_shader_package(root, "tonemap_vs", "ToneMapVS", "vs_6_0");
    auto tonemap_ps_package = read_shader_package(root, "tonemap_ps", "ToneMapPS", "ps_6_0");
    auto ui_vs_package = read_shader_package(root, "imgui_vs", "ImGuiVS", "vs_6_0");
    auto ui_ps_package = read_shader_package(root, "imgui_ps", "ImGuiPS", "ps_6_0");
    const std::array<const Result<std::vector<std::byte>>*, 8> packages{
        &forward_vs_package, &forward_ps_package, &shadow_vs_package, &shadow_ps_package,
        &tonemap_vs_package, &tonemap_ps_package, &ui_vs_package, &ui_ps_package};
    for (const auto* package : packages) {
        if (!*package) return package->error();
    }
    auto forward_vs = std::move(forward_vs_package).value();
    auto forward_ps = std::move(forward_ps_package).value();
    auto shadow_vs = std::move(shadow_vs_package).value();
    auto shadow_ps = std::move(shadow_ps_package).value();
    auto tonemap_vs = std::move(tonemap_vs_package).value();
    auto tonemap_ps = std::move(tonemap_ps_package).value();
    auto ui_vs = std::move(ui_vs_package).value();
    auto ui_ps = std::move(ui_ps_package).value();

    const auto create_root = [&](const D3D12_VERSIONED_ROOT_SIGNATURE_DESC& description,
                                 ComPtr<ID3D12RootSignature>& output) -> Result<void> {
        ComPtr<ID3DBlob> serialized;
        ComPtr<ID3DBlob> errors;
        HRESULT result = D3D12SerializeVersionedRootSignature(
            &description, &serialized, &errors);
        if (FAILED(result)) {
            const std::string message = errors
                ? std::string{
                    static_cast<const char*>(errors->GetBufferPointer()),
                    errors->GetBufferSize()}
                : "root signature serialization failed";
            return hresult_error(ErrorCode::PipelineCreationFailure, message, result);
        }
        result = device->CreateRootSignature(
            0U,
            serialized->GetBufferPointer(),
            serialized->GetBufferSize(),
            IID_PPV_ARGS(&output));
        if (FAILED(result)) {
            return hresult_error(ErrorCode::PipelineCreationFailure, "CreateRootSignature failed", result);
        }
        return {};
    };

    std::array<D3D12_DESCRIPTOR_RANGE1, 3> ranges{};
    ranges[0] = {
        D3D12_DESCRIPTOR_RANGE_TYPE_SRV,
        1U,
        3U,
        0U,
        D3D12_DESCRIPTOR_RANGE_FLAG_DATA_STATIC_WHILE_SET_AT_EXECUTE,
        0U};
    ranges[1] = {
        D3D12_DESCRIPTOR_RANGE_TYPE_SRV,
        texture_descriptor_count,
        0U,
        1U,
        D3D12_DESCRIPTOR_RANGE_FLAG_DESCRIPTORS_VOLATILE,
        0U};
    ranges[2] = {
        D3D12_DESCRIPTOR_RANGE_TYPE_SAMPLER,
        sampler_descriptor_count,
        0U,
        2U,
        D3D12_DESCRIPTOR_RANGE_FLAG_DESCRIPTORS_VOLATILE,
        0U};
    std::array<D3D12_ROOT_PARAMETER1, 8> parameters{};
    parameters[0].ParameterType = D3D12_ROOT_PARAMETER_TYPE_32BIT_CONSTANTS;
    parameters[0].Constants = {0U, 0U, 4U};
    parameters[0].ShaderVisibility = D3D12_SHADER_VISIBILITY_ALL;
    parameters[1].ParameterType = D3D12_ROOT_PARAMETER_TYPE_CBV;
    parameters[1].Descriptor = {1U, 0U, D3D12_ROOT_DESCRIPTOR_FLAG_DATA_STATIC_WHILE_SET_AT_EXECUTE};
    parameters[1].ShaderVisibility = D3D12_SHADER_VISIBILITY_ALL;
    parameters[2].ParameterType = D3D12_ROOT_PARAMETER_TYPE_CBV;
    parameters[2].Descriptor = {2U, 0U, D3D12_ROOT_DESCRIPTOR_FLAG_DATA_STATIC_WHILE_SET_AT_EXECUTE};
    parameters[2].ShaderVisibility = D3D12_SHADER_VISIBILITY_ALL;
    parameters[3].ParameterType = D3D12_ROOT_PARAMETER_TYPE_SRV;
    parameters[3].Descriptor = {0U, 0U, D3D12_ROOT_DESCRIPTOR_FLAG_DATA_STATIC_WHILE_SET_AT_EXECUTE};
    parameters[3].ShaderVisibility = D3D12_SHADER_VISIBILITY_ALL;
    parameters[4].ParameterType = D3D12_ROOT_PARAMETER_TYPE_SRV;
    parameters[4].Descriptor = {1U, 0U, D3D12_ROOT_DESCRIPTOR_FLAG_DATA_STATIC_WHILE_SET_AT_EXECUTE};
    parameters[4].ShaderVisibility = D3D12_SHADER_VISIBILITY_ALL;
    for (std::size_t index = 0U; index < ranges.size(); ++index) {
        parameters[5U + index].ParameterType = D3D12_ROOT_PARAMETER_TYPE_DESCRIPTOR_TABLE;
        parameters[5U + index].DescriptorTable = {1U, &ranges[index]};
        parameters[5U + index].ShaderVisibility = D3D12_SHADER_VISIBILITY_PIXEL;
    }
    D3D12_VERSIONED_ROOT_SIGNATURE_DESC forward_root{};
    forward_root.Version = D3D_ROOT_SIGNATURE_VERSION_1_1;
    forward_root.Desc_1_1.NumParameters = static_cast<UINT>(parameters.size());
    forward_root.Desc_1_1.pParameters = parameters.data();
    forward_root.Desc_1_1.Flags = D3D12_ROOT_SIGNATURE_FLAG_ALLOW_INPUT_ASSEMBLER_INPUT_LAYOUT;
    if (auto created = create_root(forward_root, forward_root_signature); !created) return created;

    D3D12_DESCRIPTOR_RANGE1 tone_range{
        D3D12_DESCRIPTOR_RANGE_TYPE_SRV,
        1U,
        0U,
        0U,
        D3D12_DESCRIPTOR_RANGE_FLAG_DATA_STATIC_WHILE_SET_AT_EXECUTE,
        0U};
    D3D12_ROOT_PARAMETER1 tone_parameter{};
    tone_parameter.ParameterType = D3D12_ROOT_PARAMETER_TYPE_DESCRIPTOR_TABLE;
    tone_parameter.ShaderVisibility = D3D12_SHADER_VISIBILITY_PIXEL;
    tone_parameter.DescriptorTable = {1U, &tone_range};
    D3D12_STATIC_SAMPLER_DESC tone_sampler{};
    tone_sampler.Filter = D3D12_FILTER_MIN_MAG_MIP_LINEAR;
    tone_sampler.AddressU = D3D12_TEXTURE_ADDRESS_MODE_CLAMP;
    tone_sampler.AddressV = D3D12_TEXTURE_ADDRESS_MODE_CLAMP;
    tone_sampler.AddressW = D3D12_TEXTURE_ADDRESS_MODE_CLAMP;
    tone_sampler.MaxLOD = D3D12_FLOAT32_MAX;
    tone_sampler.ShaderRegister = 0U;
    tone_sampler.RegisterSpace = 0U;
    tone_sampler.ShaderVisibility = D3D12_SHADER_VISIBILITY_PIXEL;
    D3D12_VERSIONED_ROOT_SIGNATURE_DESC tone_root{};
    tone_root.Version = D3D_ROOT_SIGNATURE_VERSION_1_1;
    tone_root.Desc_1_1.NumParameters = 1U;
    tone_root.Desc_1_1.pParameters = &tone_parameter;
    tone_root.Desc_1_1.NumStaticSamplers = 1U;
    tone_root.Desc_1_1.pStaticSamplers = &tone_sampler;
    tone_root.Desc_1_1.Flags = D3D12_ROOT_SIGNATURE_FLAG_ALLOW_INPUT_ASSEMBLER_INPUT_LAYOUT;
    if (auto created = create_root(tone_root, tone_map_root_signature); !created) return created;

    D3D12_DESCRIPTOR_RANGE1 ui_range{
        D3D12_DESCRIPTOR_RANGE_TYPE_SRV,
        1U,
        0U,
        1U,
        D3D12_DESCRIPTOR_RANGE_FLAG_DATA_STATIC_WHILE_SET_AT_EXECUTE,
        0U};
    std::array<D3D12_ROOT_PARAMETER1, 2> ui_parameters{};
    ui_parameters[0].ParameterType = D3D12_ROOT_PARAMETER_TYPE_32BIT_CONSTANTS;
    ui_parameters[0].Constants = {0U, 0U, 16U};
    ui_parameters[0].ShaderVisibility = D3D12_SHADER_VISIBILITY_VERTEX;
    ui_parameters[1].ParameterType = D3D12_ROOT_PARAMETER_TYPE_DESCRIPTOR_TABLE;
    ui_parameters[1].DescriptorTable = {1U, &ui_range};
    ui_parameters[1].ShaderVisibility = D3D12_SHADER_VISIBILITY_PIXEL;
    D3D12_STATIC_SAMPLER_DESC ui_sampler{};
    ui_sampler.Filter = D3D12_FILTER_MIN_MAG_MIP_LINEAR;
    ui_sampler.AddressU = D3D12_TEXTURE_ADDRESS_MODE_CLAMP;
    ui_sampler.AddressV = D3D12_TEXTURE_ADDRESS_MODE_CLAMP;
    ui_sampler.AddressW = D3D12_TEXTURE_ADDRESS_MODE_CLAMP;
    ui_sampler.MaxLOD = D3D12_FLOAT32_MAX;
    ui_sampler.ShaderRegister = 0U;
    ui_sampler.RegisterSpace = 2U;
    ui_sampler.ShaderVisibility = D3D12_SHADER_VISIBILITY_PIXEL;
    D3D12_VERSIONED_ROOT_SIGNATURE_DESC ui_root{};
    ui_root.Version = D3D_ROOT_SIGNATURE_VERSION_1_1;
    ui_root.Desc_1_1.NumParameters = static_cast<UINT>(ui_parameters.size());
    ui_root.Desc_1_1.pParameters = ui_parameters.data();
    ui_root.Desc_1_1.NumStaticSamplers = 1U;
    ui_root.Desc_1_1.pStaticSamplers = &ui_sampler;
    ui_root.Desc_1_1.Flags = D3D12_ROOT_SIGNATURE_FLAG_ALLOW_INPUT_ASSEMBLER_INPUT_LAYOUT;
    if (auto created = create_root(ui_root, ui_root_signature); !created) return created;

    constexpr std::array<D3D12_INPUT_ELEMENT_DESC, 4> input_layout{{
        {"POSITION", 0U, DXGI_FORMAT_R32G32B32_FLOAT, 0U, 0U, D3D12_INPUT_CLASSIFICATION_PER_VERTEX_DATA, 0U},
        {"NORMAL", 0U, DXGI_FORMAT_R32G32B32_FLOAT, 0U, 12U, D3D12_INPUT_CLASSIFICATION_PER_VERTEX_DATA, 0U},
        {"TANGENT", 0U, DXGI_FORMAT_R32G32B32A32_FLOAT, 0U, 24U, D3D12_INPUT_CLASSIFICATION_PER_VERTEX_DATA, 0U},
        {"TEXCOORD", 0U, DXGI_FORMAT_R32G32_FLOAT, 0U, 40U, D3D12_INPUT_CLASSIFICATION_PER_VERTEX_DATA, 0U},
    }};

    D3D12_GRAPHICS_PIPELINE_STATE_DESC pipeline{};
    pipeline.pRootSignature = forward_root_signature.Get();
    pipeline.VS = {forward_vs.data(), forward_vs.size()};
    pipeline.PS = {forward_ps.data(), forward_ps.size()};
    pipeline.InputLayout = {input_layout.data(), static_cast<UINT>(input_layout.size())};
    pipeline.BlendState.RenderTarget[0].RenderTargetWriteMask = D3D12_COLOR_WRITE_ENABLE_ALL;
    pipeline.SampleMask = UINT_MAX;
    pipeline.RasterizerState.FillMode = D3D12_FILL_MODE_SOLID;
    pipeline.RasterizerState.CullMode = D3D12_CULL_MODE_BACK;
    pipeline.RasterizerState.FrontCounterClockwise = TRUE;
    pipeline.RasterizerState.DepthClipEnable = TRUE;
    pipeline.DepthStencilState.DepthEnable = TRUE;
    pipeline.DepthStencilState.DepthWriteMask = D3D12_DEPTH_WRITE_MASK_ALL;
    pipeline.DepthStencilState.DepthFunc = D3D12_COMPARISON_FUNC_LESS;
    pipeline.PrimitiveTopologyType = D3D12_PRIMITIVE_TOPOLOGY_TYPE_TRIANGLE;
    pipeline.NumRenderTargets = 1U;
    pipeline.RTVFormats[0] = DXGI_FORMAT_R16G16B16A16_FLOAT;
    pipeline.DSVFormat = DXGI_FORMAT_D32_FLOAT;
    pipeline.SampleDesc.Count = 1U;
    HRESULT result = device->CreateGraphicsPipelineState(&pipeline, IID_PPV_ARGS(&forward_pipeline));
    if (FAILED(result)) {
        return hresult_error(ErrorCode::PipelineCreationFailure, "Forward PBR PSO failed", result);
    }

    pipeline.VS = {shadow_vs.data(), shadow_vs.size()};
    pipeline.PS = {shadow_ps.data(), shadow_ps.size()};
    pipeline.RasterizerState.DepthBias = 1500;
    pipeline.RasterizerState.SlopeScaledDepthBias = 1.5F;
    pipeline.NumRenderTargets = 0U;
    pipeline.RTVFormats[0] = DXGI_FORMAT_UNKNOWN;
    pipeline.DSVFormat = DXGI_FORMAT_D32_FLOAT;
    result = device->CreateGraphicsPipelineState(&pipeline, IID_PPV_ARGS(&shadow_pipeline));
    if (FAILED(result)) {
        return hresult_error(ErrorCode::PipelineCreationFailure, "Directional shadow PSO failed", result);
    }

    pipeline.pRootSignature = tone_map_root_signature.Get();
    pipeline.VS = {tonemap_vs.data(), tonemap_vs.size()};
    pipeline.PS = {tonemap_ps.data(), tonemap_ps.size()};
    pipeline.InputLayout = {};
    pipeline.RasterizerState.DepthBias = 0;
    pipeline.RasterizerState.SlopeScaledDepthBias = 0.0F;
    pipeline.RasterizerState.CullMode = D3D12_CULL_MODE_NONE;
    pipeline.DepthStencilState.DepthEnable = FALSE;
    pipeline.DepthStencilState.DepthWriteMask = D3D12_DEPTH_WRITE_MASK_ZERO;
    pipeline.NumRenderTargets = 1U;
    pipeline.RTVFormats[0] = back_buffer_format;
    pipeline.DSVFormat = DXGI_FORMAT_UNKNOWN;
    result = device->CreateGraphicsPipelineState(&pipeline, IID_PPV_ARGS(&tone_map_pipeline));
    if (FAILED(result)) {
        return hresult_error(ErrorCode::PipelineCreationFailure, "Tone Map PSO failed", result);
    }

    constexpr std::array<D3D12_INPUT_ELEMENT_DESC, 3> ui_input_layout{{
        {"POSITION", 0U, DXGI_FORMAT_R32G32_FLOAT, 0U, 0U, D3D12_INPUT_CLASSIFICATION_PER_VERTEX_DATA, 0U},
        {"TEXCOORD", 0U, DXGI_FORMAT_R32G32_FLOAT, 0U, 8U, D3D12_INPUT_CLASSIFICATION_PER_VERTEX_DATA, 0U},
        {"COLOR", 0U, DXGI_FORMAT_R8G8B8A8_UNORM, 0U, 16U, D3D12_INPUT_CLASSIFICATION_PER_VERTEX_DATA, 0U},
    }};
    pipeline.pRootSignature = ui_root_signature.Get();
    pipeline.VS = {ui_vs.data(), ui_vs.size()};
    pipeline.PS = {ui_ps.data(), ui_ps.size()};
    pipeline.InputLayout = {ui_input_layout.data(), static_cast<UINT>(ui_input_layout.size())};
    pipeline.BlendState.RenderTarget[0].BlendEnable = TRUE;
    pipeline.BlendState.RenderTarget[0].SrcBlend = D3D12_BLEND_SRC_ALPHA;
    pipeline.BlendState.RenderTarget[0].DestBlend = D3D12_BLEND_INV_SRC_ALPHA;
    pipeline.BlendState.RenderTarget[0].BlendOp = D3D12_BLEND_OP_ADD;
    pipeline.BlendState.RenderTarget[0].SrcBlendAlpha = D3D12_BLEND_ONE;
    pipeline.BlendState.RenderTarget[0].DestBlendAlpha = D3D12_BLEND_INV_SRC_ALPHA;
    pipeline.BlendState.RenderTarget[0].BlendOpAlpha = D3D12_BLEND_OP_ADD;
    pipeline.BlendState.RenderTarget[0].RenderTargetWriteMask = D3D12_COLOR_WRITE_ENABLE_ALL;
    pipeline.NumRenderTargets = 1U;
    pipeline.RTVFormats[0] = back_buffer_format;
    pipeline.DSVFormat = DXGI_FORMAT_UNKNOWN;
    result = device->CreateGraphicsPipelineState(&pipeline, IID_PPV_ARGS(&ui_pipeline));
    if (FAILED(result)) {
        return hresult_error(ErrorCode::PipelineCreationFailure, "Dear ImGui PSO failed", result);
    }
    return {};
}

Result<void> D3D12Graphics::Impl::create_back_buffers() {
    const D3D12_CPU_DESCRIPTOR_HANDLE start = rtv_heap->GetCPUDescriptorHandleForHeapStart();
    for (std::uint32_t index = 0U; index < back_buffer_count; ++index) {
        HRESULT result = S_OK;
        if (swapchain) {
            result = swapchain->GetBuffer(index, IID_PPV_ARGS(&back_buffers[index]));
        } else {
            D3D12_HEAP_PROPERTIES heap{};
            heap.Type = D3D12_HEAP_TYPE_DEFAULT;
            D3D12_RESOURCE_DESC description{};
            description.Dimension = D3D12_RESOURCE_DIMENSION_TEXTURE2D;
            description.Width = config.width;
            description.Height = config.height;
            description.DepthOrArraySize = 1U;
            description.MipLevels = 1U;
            description.Format = back_buffer_format;
            description.SampleDesc.Count = 1U;
            description.Layout = D3D12_TEXTURE_LAYOUT_UNKNOWN;
            description.Flags = D3D12_RESOURCE_FLAG_ALLOW_RENDER_TARGET;
            const D3D12_CLEAR_VALUE clear{back_buffer_format, {0.0F, 0.0F, 0.0F, 1.0F}};
            result = device->CreateCommittedResource(
                &heap,
                D3D12_HEAP_FLAG_NONE,
                &description,
                D3D12_RESOURCE_STATE_COMMON,
                &clear,
                IID_PPV_ARGS(&back_buffers[index]));
        }
        if (FAILED(result)) {
            return hresult_error(ErrorCode::BackendFailure, "back buffer creation failed", result);
        }
        device->CreateRenderTargetView(
            back_buffers[index].Get(), nullptr, offset_handle(start, index, rtv_increment));
    }
    return {};
}

Result<void> D3D12Graphics::resize(std::uint32_t width, std::uint32_t height) {
    if (width == 0U || height == 0U) {
        return Error{ErrorCode::SurfaceUnavailable, "cannot resize D3D12 output to zero"};
    }
    if (implementation_->active_frame_id != 0U) {
        return Error{ErrorCode::InvalidState, "cannot resize while recording a frame"};
    }
    if (implementation_->last_submitted != 0U) {
        if (auto waited = implementation_->wait_fence(
                implementation_->last_submitted, std::chrono::seconds{5}); !waited) {
            return waited;
        }
    }
    for (auto& frame : implementation_->frames) {
        frame.transient_resources.clear();
    }
    for (auto& back_buffer : implementation_->back_buffers) {
        back_buffer.Reset();
    }
    implementation_->config.width = width;
    implementation_->config.height = height;
    if (implementation_->swapchain) {
        const UINT flags = implementation_->config.allow_tearing
            ? DXGI_SWAP_CHAIN_FLAG_ALLOW_TEARING
            : 0U;
        const HRESULT result = implementation_->swapchain->ResizeBuffers(
            back_buffer_count, width, height, back_buffer_format, flags);
        if (FAILED(result)) {
            return hresult_error(ErrorCode::SurfaceLost, "DXGI ResizeBuffers failed", result);
        }
    }
    return implementation_->create_back_buffers();
}

Result<std::vector<std::byte>> D3D12Graphics::capture_rgba8() {
    if (implementation_->active_frame_id != 0U || implementation_->last_submitted == 0U) {
        return Error{ErrorCode::InvalidState, "capture requires a completed rendered frame"};
    }
    if (auto waited = implementation_->wait_fence(
            implementation_->last_submitted, std::chrono::seconds{5}); !waited) {
        return waited.error();
    }

    auto& frame = implementation_->frames[0];
    HRESULT result = frame.allocator->Reset();
    if (SUCCEEDED(result)) {
        result = implementation_->command_list->Reset(frame.allocator.Get(), nullptr);
    }
    if (FAILED(result)) {
        return hresult_error(ErrorCode::BackendFailure, "capture command reset failed", result);
    }

    ID3D12Resource* source = implementation_->back_buffers[implementation_->active_back_buffer].Get();
    const D3D12_RESOURCE_DESC source_description = source->GetDesc();
    D3D12_PLACED_SUBRESOURCE_FOOTPRINT footprint{};
    UINT row_count = 0U;
    UINT64 row_size = 0U;
    UINT64 total_size = 0U;
    implementation_->device->GetCopyableFootprints(
        &source_description,
        0U,
        1U,
        0U,
        &footprint,
        &row_count,
        &row_size,
        &total_size);

    D3D12_HEAP_PROPERTIES heap{};
    heap.Type = D3D12_HEAP_TYPE_READBACK;
    D3D12_RESOURCE_DESC buffer{};
    buffer.Dimension = D3D12_RESOURCE_DIMENSION_BUFFER;
    buffer.Width = total_size;
    buffer.Height = 1U;
    buffer.DepthOrArraySize = 1U;
    buffer.MipLevels = 1U;
    buffer.SampleDesc.Count = 1U;
    buffer.Layout = D3D12_TEXTURE_LAYOUT_ROW_MAJOR;
    ComPtr<ID3D12Resource> readback;
    result = implementation_->device->CreateCommittedResource(
        &heap,
        D3D12_HEAP_FLAG_NONE,
        &buffer,
        D3D12_RESOURCE_STATE_COPY_DEST,
        nullptr,
        IID_PPV_ARGS(&readback));
    if (FAILED(result)) {
        return hresult_error(ErrorCode::OutOfMemory, "capture readback allocation failed", result);
    }

    D3D12_RESOURCE_BARRIER to_copy{};
    to_copy.Type = D3D12_RESOURCE_BARRIER_TYPE_TRANSITION;
    to_copy.Transition.pResource = source;
    to_copy.Transition.StateBefore = D3D12_RESOURCE_STATE_PRESENT;
    to_copy.Transition.StateAfter = D3D12_RESOURCE_STATE_COPY_SOURCE;
    to_copy.Transition.Subresource = D3D12_RESOURCE_BARRIER_ALL_SUBRESOURCES;
    implementation_->command_list->ResourceBarrier(1U, &to_copy);
    D3D12_TEXTURE_COPY_LOCATION destination{};
    destination.pResource = readback.Get();
    destination.Type = D3D12_TEXTURE_COPY_TYPE_PLACED_FOOTPRINT;
    destination.PlacedFootprint = footprint;
    D3D12_TEXTURE_COPY_LOCATION source_location{};
    source_location.pResource = source;
    source_location.Type = D3D12_TEXTURE_COPY_TYPE_SUBRESOURCE_INDEX;
    source_location.SubresourceIndex = 0U;
    implementation_->command_list->CopyTextureRegion(
        &destination, 0U, 0U, 0U, &source_location, nullptr);
    std::swap(to_copy.Transition.StateBefore, to_copy.Transition.StateAfter);
    implementation_->command_list->ResourceBarrier(1U, &to_copy);

    result = implementation_->command_list->Close();
    if (FAILED(result)) {
        return hresult_error(ErrorCode::BackendFailure, "capture command close failed", result);
    }
    ID3D12CommandList* lists[] = {implementation_->command_list.Get()};
    implementation_->queue->ExecuteCommandLists(1U, lists);
    const std::uint64_t token = implementation_->last_submitted + 1U;
    result = implementation_->queue->Signal(implementation_->fence.Get(), token);
    if (FAILED(result)) {
        return hresult_error(ErrorCode::DeviceLost, "capture signal failed", result);
    }
    implementation_->last_submitted = token;
    frame.fence_value = token;
    if (auto waited = implementation_->wait_fence(token, std::chrono::seconds{5}); !waited) {
        return waited.error();
    }

    void* mapped = nullptr;
    const D3D12_RANGE read_range{0U, static_cast<SIZE_T>(total_size)};
    result = readback->Map(0U, &read_range, &mapped);
    if (FAILED(result)) {
        return hresult_error(ErrorCode::BackendFailure, "capture readback map failed", result);
    }
    const auto width = static_cast<std::size_t>(implementation_->config.width);
    const auto height = static_cast<std::size_t>(implementation_->config.height);
    std::vector<std::byte> image(width * height * 4U);
    const auto* source_bytes = static_cast<const std::byte*>(mapped) + footprint.Offset;
    for (std::size_t row = 0U; row < height; ++row) {
        std::memcpy(
            image.data() + row * width * 4U,
            source_bytes + row * footprint.Footprint.RowPitch,
            width * 4U);
    }
    const D3D12_RANGE written_range{0U, 0U};
    readback->Unmap(0U, &written_range);
    (void)row_count;
    (void)row_size;
    return image;
}

Result<ComPtr<ID3D12Resource>> D3D12Graphics::Impl::create_graph_texture(
    const render_graph::ResourceDesc& description) {
    D3D12_HEAP_PROPERTIES heap{};
    heap.Type = D3D12_HEAP_TYPE_DEFAULT;
    D3D12_RESOURCE_DESC native{};
    native.Dimension = D3D12_RESOURCE_DIMENSION_TEXTURE2D;
    native.Width = description.width;
    native.Height = description.height;
    native.DepthOrArraySize = 1U;
    native.MipLevels = 1U;
    native.Format = format_for(description.format);
    native.SampleDesc.Count = 1U;
    native.Layout = D3D12_TEXTURE_LAYOUT_UNKNOWN;
    const bool depth = description.format == render_graph::TextureFormat::D32Float ||
        description.format == render_graph::TextureFormat::R32Typeless;
    native.Flags = depth
        ? D3D12_RESOURCE_FLAG_ALLOW_DEPTH_STENCIL
        : D3D12_RESOURCE_FLAG_ALLOW_RENDER_TARGET;
    D3D12_CLEAR_VALUE clear{};
    clear.Format = depth ? DXGI_FORMAT_D32_FLOAT : native.Format;
    if (depth) {
        clear.DepthStencil = {1.0F, 0U};
    } else {
        clear.Color[3] = 1.0F;
    }
    ComPtr<ID3D12Resource> resource;
    const HRESULT result = device->CreateCommittedResource(
        &heap,
        D3D12_HEAP_FLAG_NONE,
        &native,
        D3D12_RESOURCE_STATE_COMMON,
        &clear,
        IID_PPV_ARGS(&resource));
    if (FAILED(result)) {
        return hresult_error(ErrorCode::OutOfMemory, "graph texture creation failed", result);
    }
    return resource;
}

Result<std::unique_ptr<D3D12Graphics>> D3D12Graphics::create(const D3D12Config& config) {
    auto implementation = std::make_unique<Impl>();
    implementation->config = config;
    if (auto initialized = implementation->initialize(); !initialized) {
        return initialized.error();
    }
    return std::unique_ptr<D3D12Graphics>{new D3D12Graphics{std::move(implementation)}};
}

D3D12Graphics::D3D12Graphics(std::unique_ptr<Impl> implementation)
    : implementation_(std::move(implementation)) {}

D3D12Graphics::~D3D12Graphics() {
    if (implementation_) {
        if (implementation_->last_submitted != 0U) {
            (void)implementation_->wait_fence(
                implementation_->last_submitted, std::chrono::seconds{5});
        }
        if (implementation_->fence_event != nullptr) {
            CloseHandle(implementation_->fence_event);
        }
        for (auto& frame : implementation_->frames) {
            if (frame.upload && frame.mapped_upload != nullptr) {
                const D3D12_RANGE no_write{0U, 0U};
                frame.upload->Unmap(0U, &no_write);
                frame.mapped_upload = nullptr;
            }
        }
    }
}

const Capabilities& D3D12Graphics::capabilities() const noexcept {
    return implementation_->capabilities;
}

Result<ResourceHandle> D3D12Graphics::create(const ResourceDesc& description) {
    if (implementation_->device_lost) {
        return Error{ErrorCode::DeviceLost, "D3D12 session is lost"};
    }
    ComPtr<ID3D12Resource> resource;
    HRESULT result = E_INVALIDARG;
    if (const auto* buffer = std::get_if<BufferDesc>(&description)) {
        if (buffer->name.empty() || buffer->size == 0U) {
            return Error{ErrorCode::InvalidArgument, "buffer name and size must be valid"};
        }
        D3D12_HEAP_PROPERTIES heap{};
        heap.Type = buffer->memory == MemoryClass::Upload
            ? D3D12_HEAP_TYPE_UPLOAD
            : buffer->memory == MemoryClass::Readback
                ? D3D12_HEAP_TYPE_READBACK
                : D3D12_HEAP_TYPE_DEFAULT;
        D3D12_RESOURCE_DESC native{};
        native.Dimension = D3D12_RESOURCE_DIMENSION_BUFFER;
        native.Width = buffer->size;
        native.Height = 1U;
        native.DepthOrArraySize = 1U;
        native.MipLevels = 1U;
        native.SampleDesc.Count = 1U;
        native.Layout = D3D12_TEXTURE_LAYOUT_ROW_MAJOR;
        const auto initial_state = buffer->memory == MemoryClass::Upload
            ? D3D12_RESOURCE_STATE_GENERIC_READ
            : D3D12_RESOURCE_STATE_COPY_DEST;
        result = implementation_->device->CreateCommittedResource(
            &heap, D3D12_HEAP_FLAG_NONE, &native, initial_state, nullptr, IID_PPV_ARGS(&resource));
    } else {
        const auto& texture = std::get<TextureDesc>(description);
        if (texture.name.empty() || texture.width == 0U || texture.height == 0U ||
            texture.mip_levels == 0U) {
            return Error{ErrorCode::InvalidArgument, "texture name and extent must be valid"};
        }
        D3D12_HEAP_PROPERTIES heap{};
        heap.Type = D3D12_HEAP_TYPE_DEFAULT;
        D3D12_RESOURCE_DESC native{};
        native.Dimension = D3D12_RESOURCE_DIMENSION_TEXTURE2D;
        native.Width = texture.width;
        native.Height = texture.height;
        native.DepthOrArraySize = 1U;
        native.MipLevels = texture.mip_levels;
        native.Format = DXGI_FORMAT_R8G8B8A8_TYPELESS;
        native.SampleDesc.Count = 1U;
        native.Layout = D3D12_TEXTURE_LAYOUT_UNKNOWN;
        result = implementation_->device->CreateCommittedResource(
            &heap,
            D3D12_HEAP_FLAG_NONE,
            &native,
            D3D12_RESOURCE_STATE_COPY_DEST,
            nullptr,
            IID_PPV_ARGS(&resource));
    }
    if (FAILED(result)) {
        return hresult_error(ErrorCode::OutOfMemory, "D3D12 resource creation failed", result);
    }

    std::uint32_t index = 0U;
    if (!implementation_->free_resource_indices.empty()) {
        index = implementation_->free_resource_indices.back();
        implementation_->free_resource_indices.pop_back();
    } else {
        implementation_->resources.emplace_back();
        index = static_cast<std::uint32_t>(implementation_->resources.size());
    }
    auto& slot = implementation_->resources[index - 1U];
    slot.resource = std::move(resource);
    slot.live = true;
    slot.pending_retire = false;
    slot.buffer = std::holds_alternative<BufferDesc>(description);
    if (const auto* buffer = std::get_if<BufferDesc>(&description)) {
        slot.memory = buffer->memory;
        slot.capacity = buffer->size;
        slot.width = 0U;
        slot.height = 0U;
        slot.mip_levels = 0U;
        slot.srgb = false;
        slot.descriptor_index = 0U;
        slot.state = buffer->memory == MemoryClass::Upload
            ? D3D12_RESOURCE_STATE_GENERIC_READ
            : D3D12_RESOURCE_STATE_COPY_DEST;
    } else {
        const auto& texture = std::get<TextureDesc>(description);
        slot.memory = MemoryClass::DeviceLocal;
        slot.capacity = 0U;
        slot.width = texture.width;
        slot.height = texture.height;
        slot.mip_levels = texture.mip_levels;
        slot.srgb = texture.srgb;
        slot.descriptor_index = 0U;
        slot.state = D3D12_RESOURCE_STATE_COPY_DEST;
    }
    return ResourceHandle::from_parts(index, slot.generation);
}

Result<void> D3D12Graphics::upload(
    ResourceHandle resource,
    std::span<const std::byte> bytes) {
    if (implementation_->active_frame_id != 0U) {
        return Error{ErrorCode::InvalidState, "cannot upload while a frame is recording"};
    }
    if (!resource.valid() || resource.index() == 0U ||
        resource.index() > implementation_->resources.size()) {
        return Error{ErrorCode::InvalidHandle, "upload received an invalid resource"};
    }
    auto& slot = implementation_->resources[resource.index() - 1U];
    if (!slot.live || slot.generation != resource.generation()) {
        return Error{ErrorCode::InvalidHandle, "upload received a stale resource"};
    }
    if (!slot.buffer || bytes.empty() || bytes.size() > slot.capacity ||
        slot.memory == MemoryClass::Readback) {
        return Error{ErrorCode::InvalidArgument, "buffer upload is empty, too large, or targets readback memory"};
    }
    if (slot.memory == MemoryClass::Upload) {
        void* mapped = nullptr;
        const D3D12_RANGE no_read{0U, 0U};
        const HRESULT mapped_result = slot.resource->Map(0U, &no_read, &mapped);
        if (FAILED(mapped_result)) {
            return hresult_error(ErrorCode::BackendFailure, "upload buffer map failed", mapped_result);
        }
        std::memcpy(mapped, bytes.data(), bytes.size());
        const D3D12_RANGE written{0U, bytes.size()};
        slot.resource->Unmap(0U, &written);
        return {};
    }

    D3D12_HEAP_PROPERTIES upload_heap{};
    upload_heap.Type = D3D12_HEAP_TYPE_UPLOAD;
    D3D12_RESOURCE_DESC upload_desc{};
    upload_desc.Dimension = D3D12_RESOURCE_DIMENSION_BUFFER;
    upload_desc.Width = bytes.size();
    upload_desc.Height = 1U;
    upload_desc.DepthOrArraySize = 1U;
    upload_desc.MipLevels = 1U;
    upload_desc.SampleDesc.Count = 1U;
    upload_desc.Layout = D3D12_TEXTURE_LAYOUT_ROW_MAJOR;
    ComPtr<ID3D12Resource> staging;
    HRESULT result = implementation_->device->CreateCommittedResource(
        &upload_heap,
        D3D12_HEAP_FLAG_NONE,
        &upload_desc,
        D3D12_RESOURCE_STATE_GENERIC_READ,
        nullptr,
        IID_PPV_ARGS(&staging));
    if (FAILED(result)) {
        return hresult_error(ErrorCode::OutOfMemory, "staging buffer allocation failed", result);
    }
    void* mapped = nullptr;
    const D3D12_RANGE no_read{0U, 0U};
    result = staging->Map(0U, &no_read, &mapped);
    if (FAILED(result)) {
        return hresult_error(ErrorCode::BackendFailure, "staging buffer map failed", result);
    }
    std::memcpy(mapped, bytes.data(), bytes.size());
    const D3D12_RANGE written{0U, bytes.size()};
    staging->Unmap(0U, &written);

    ComPtr<ID3D12CommandAllocator> allocator;
    ComPtr<ID3D12GraphicsCommandList> list;
    result = implementation_->device->CreateCommandAllocator(
        D3D12_COMMAND_LIST_TYPE_DIRECT, IID_PPV_ARGS(&allocator));
    if (SUCCEEDED(result)) {
        result = implementation_->device->CreateCommandList(
            0U, D3D12_COMMAND_LIST_TYPE_DIRECT, allocator.Get(), nullptr, IID_PPV_ARGS(&list));
    }
    if (FAILED(result)) {
        return hresult_error(ErrorCode::BackendFailure, "upload command list creation failed", result);
    }
    list->CopyBufferRegion(slot.resource.Get(), 0U, staging.Get(), 0U, bytes.size());
    if (slot.state != D3D12_RESOURCE_STATE_GENERIC_READ) {
        D3D12_RESOURCE_BARRIER barrier{};
        barrier.Type = D3D12_RESOURCE_BARRIER_TYPE_TRANSITION;
        barrier.Transition.pResource = slot.resource.Get();
        barrier.Transition.StateBefore = slot.state;
        barrier.Transition.StateAfter = D3D12_RESOURCE_STATE_GENERIC_READ;
        barrier.Transition.Subresource = D3D12_RESOURCE_BARRIER_ALL_SUBRESOURCES;
        list->ResourceBarrier(1U, &barrier);
        slot.state = D3D12_RESOURCE_STATE_GENERIC_READ;
    }
    result = list->Close();
    if (FAILED(result)) {
        return hresult_error(ErrorCode::BackendFailure, "upload command list close failed", result);
    }
    ID3D12CommandList* lists[] = {list.Get()};
    implementation_->queue->ExecuteCommandLists(1U, lists);
    const std::uint64_t token = implementation_->last_submitted + 1U;
    result = implementation_->queue->Signal(implementation_->fence.Get(), token);
    if (FAILED(result)) {
        return hresult_error(ErrorCode::DeviceLost, "upload queue signal failed", result);
    }
    implementation_->last_submitted = token;
    slot.last_use = token;
    return implementation_->wait_fence(token, std::chrono::seconds{5});
}

Result<void> D3D12Graphics::upload_texture(
    ResourceHandle resource,
    const TextureUpload& upload,
    std::uint32_t bindless_index) {
    if (implementation_->active_frame_id != 0U) {
        return Error{ErrorCode::InvalidState, "cannot upload texture while a frame is recording"};
    }
    if (!resource.valid() || resource.index() == 0U ||
        resource.index() > implementation_->resources.size()) {
        return Error{ErrorCode::InvalidHandle, "texture upload received an invalid resource"};
    }
    auto& slot = implementation_->resources[resource.index() - 1U];
    if (!slot.live || slot.generation != resource.generation() || slot.buffer) {
        return Error{ErrorCode::InvalidHandle, "texture upload received a stale or non-texture resource"};
    }
    if (bindless_index == 0U || bindless_index >= texture_descriptor_count ||
        upload.width != slot.width || upload.height != slot.height ||
        upload.mip_offsets.size() != slot.mip_levels || upload.mip_offsets.empty() ||
        upload.mip_offsets.front() != 0U || upload.rgba8.empty()) {
        return Error{ErrorCode::InvalidArgument, "texture upload metadata or bindless slot is invalid"};
    }
    for (const auto& other : implementation_->resources) {
        if (&other != &slot && other.live && other.descriptor_index == bindless_index) {
            return Error{ErrorCode::OutOfDescriptors, "bindless texture slot is already resident"};
        }
    }

    const auto native_desc = slot.resource->GetDesc();
    std::vector<D3D12_PLACED_SUBRESOURCE_FOOTPRINT> footprints(slot.mip_levels);
    std::vector<UINT> row_counts(slot.mip_levels);
    std::vector<UINT64> row_sizes(slot.mip_levels);
    UINT64 total_size = 0U;
    implementation_->device->GetCopyableFootprints(
        &native_desc,
        0U,
        slot.mip_levels,
        0U,
        footprints.data(),
        row_counts.data(),
        row_sizes.data(),
        &total_size);

    D3D12_HEAP_PROPERTIES upload_heap{};
    upload_heap.Type = D3D12_HEAP_TYPE_UPLOAD;
    D3D12_RESOURCE_DESC buffer{};
    buffer.Dimension = D3D12_RESOURCE_DIMENSION_BUFFER;
    buffer.Width = total_size;
    buffer.Height = 1U;
    buffer.DepthOrArraySize = 1U;
    buffer.MipLevels = 1U;
    buffer.SampleDesc.Count = 1U;
    buffer.Layout = D3D12_TEXTURE_LAYOUT_ROW_MAJOR;
    ComPtr<ID3D12Resource> staging;
    HRESULT result = implementation_->device->CreateCommittedResource(
        &upload_heap,
        D3D12_HEAP_FLAG_NONE,
        &buffer,
        D3D12_RESOURCE_STATE_GENERIC_READ,
        nullptr,
        IID_PPV_ARGS(&staging));
    if (FAILED(result)) {
        return hresult_error(ErrorCode::OutOfMemory, "texture staging allocation failed", result);
    }
    std::byte* mapped = nullptr;
    const D3D12_RANGE no_read{0U, 0U};
    result = staging->Map(0U, &no_read, reinterpret_cast<void**>(&mapped));
    if (FAILED(result)) {
        return hresult_error(ErrorCode::BackendFailure, "texture staging map failed", result);
    }
    for (std::uint32_t mip = 0U; mip < slot.mip_levels; ++mip) {
        const std::uint32_t width = std::max(1U, slot.width >> mip);
        const std::uint32_t height = std::max(1U, slot.height >> mip);
        const std::size_t source_offset = upload.mip_offsets[mip];
        const std::size_t source_end = mip + 1U < slot.mip_levels
            ? upload.mip_offsets[mip + 1U]
            : upload.rgba8.size();
        const std::size_t tight_row = static_cast<std::size_t>(width) * 4U;
        if (source_offset > source_end || source_end > upload.rgba8.size() ||
            source_end - source_offset != tight_row * height ||
            row_counts[mip] != height || row_sizes[mip] != tight_row) {
            const D3D12_RANGE no_write{0U, 0U};
            staging->Unmap(0U, &no_write);
            return Error{ErrorCode::InvalidArgument, "texture mip data is not tightly packed RGBA8"};
        }
        for (std::uint32_t row = 0U; row < height; ++row) {
            std::memcpy(
                mapped + footprints[mip].Offset +
                    static_cast<std::size_t>(row) * footprints[mip].Footprint.RowPitch,
                upload.rgba8.data() + source_offset + row * tight_row,
                tight_row);
        }
    }
    const D3D12_RANGE written{0U, static_cast<SIZE_T>(total_size)};
    staging->Unmap(0U, &written);

    ComPtr<ID3D12CommandAllocator> allocator;
    ComPtr<ID3D12GraphicsCommandList> list;
    result = implementation_->device->CreateCommandAllocator(
        D3D12_COMMAND_LIST_TYPE_DIRECT, IID_PPV_ARGS(&allocator));
    if (SUCCEEDED(result)) {
        result = implementation_->device->CreateCommandList(
            0U, D3D12_COMMAND_LIST_TYPE_DIRECT, allocator.Get(), nullptr, IID_PPV_ARGS(&list));
    }
    if (FAILED(result)) {
        return hresult_error(ErrorCode::BackendFailure, "texture upload command list creation failed", result);
    }
    for (std::uint32_t mip = 0U; mip < slot.mip_levels; ++mip) {
        D3D12_TEXTURE_COPY_LOCATION destination{};
        destination.pResource = slot.resource.Get();
        destination.Type = D3D12_TEXTURE_COPY_TYPE_SUBRESOURCE_INDEX;
        destination.SubresourceIndex = mip;
        D3D12_TEXTURE_COPY_LOCATION source{};
        source.pResource = staging.Get();
        source.Type = D3D12_TEXTURE_COPY_TYPE_PLACED_FOOTPRINT;
        source.PlacedFootprint = footprints[mip];
        list->CopyTextureRegion(&destination, 0U, 0U, 0U, &source, nullptr);
    }
    D3D12_RESOURCE_BARRIER barrier{};
    barrier.Type = D3D12_RESOURCE_BARRIER_TYPE_TRANSITION;
    barrier.Transition.pResource = slot.resource.Get();
    barrier.Transition.StateBefore = slot.state;
    barrier.Transition.StateAfter = D3D12_RESOURCE_STATE_PIXEL_SHADER_RESOURCE;
    barrier.Transition.Subresource = D3D12_RESOURCE_BARRIER_ALL_SUBRESOURCES;
    list->ResourceBarrier(1U, &barrier);
    slot.state = D3D12_RESOURCE_STATE_PIXEL_SHADER_RESOURCE;
    result = list->Close();
    if (FAILED(result)) {
        return hresult_error(ErrorCode::BackendFailure, "texture upload command list close failed", result);
    }
    ID3D12CommandList* lists[] = {list.Get()};
    implementation_->queue->ExecuteCommandLists(1U, lists);
    const std::uint64_t token = implementation_->last_submitted + 1U;
    result = implementation_->queue->Signal(implementation_->fence.Get(), token);
    if (FAILED(result)) {
        return hresult_error(ErrorCode::DeviceLost, "texture upload queue signal failed", result);
    }
    implementation_->last_submitted = token;
    slot.last_use = token;
    if (auto waited = implementation_->wait_fence(token, std::chrono::seconds{5}); !waited) {
        return waited;
    }

    D3D12_SHADER_RESOURCE_VIEW_DESC view{};
    view.Format = slot.srgb
        ? DXGI_FORMAT_R8G8B8A8_UNORM_SRGB
        : DXGI_FORMAT_R8G8B8A8_UNORM;
    view.ViewDimension = D3D12_SRV_DIMENSION_TEXTURE2D;
    view.Shader4ComponentMapping = D3D12_DEFAULT_SHADER_4_COMPONENT_MAPPING;
    view.Texture2D.MipLevels = slot.mip_levels;
    implementation_->device->CreateShaderResourceView(
        slot.resource.Get(),
        &view,
        offset_handle(
            implementation_->srv_heap->GetCPUDescriptorHandleForHeapStart(),
            bindless_index,
            implementation_->srv_increment));
    slot.descriptor_index = bindless_index;
    return {};
}

void D3D12Graphics::retire(ResourceHandle resource) {
    if (!resource.valid() || resource.index() == 0U ||
        resource.index() > implementation_->resources.size()) {
        return;
    }
    auto& slot = implementation_->resources[resource.index() - 1U];
    if (!slot.live || slot.generation != resource.generation()) {
        return;
    }
    slot.live = false;
    slot.pending_retire = true;
    implementation_->collect_retired();
}

Result<FrameContext> D3D12Graphics::begin_frame(SwapchainHandle swapchain) {
    if (implementation_->device_lost) {
        return Error{ErrorCode::DeviceLost, "D3D12 session is lost"};
    }
    if (swapchain != implementation_->swapchain_handle) {
        return Error{ErrorCode::InvalidHandle, "unknown D3D12 swapchain"};
    }
    if (implementation_->active_frame_id != 0U) {
        return Error{ErrorCode::InvalidState, "a frame is already being recorded"};
    }
    const std::uint32_t frame_index = static_cast<std::uint32_t>(
        implementation_->next_frame_id - 1U) % frame_count;
    auto& frame = implementation_->frames[frame_index];
    if (frame.fence_value != 0U) {
        if (auto waited = implementation_->wait_fence(
                frame.fence_value, std::chrono::seconds{5}); !waited) {
            return waited.error();
        }
    }
    if (frame.query_count >= 2U) {
        const std::uint64_t first_query =
            static_cast<std::uint64_t>(frame_index) * queries_per_frame;
        const std::uint64_t byte_offset = first_query * sizeof(std::uint64_t);
        const std::uint64_t byte_size =
            static_cast<std::uint64_t>(frame.query_count) * sizeof(std::uint64_t);
        const D3D12_RANGE read_range{
            static_cast<SIZE_T>(byte_offset),
            static_cast<SIZE_T>(byte_offset + byte_size)};
        void* mapped = nullptr;
        const HRESULT map_result = implementation_->timestamp_readback->Map(
            0U, &read_range, &mapped);
        if (FAILED(map_result)) {
            return hresult_error(ErrorCode::BackendFailure, "GPU timestamp readback map failed", map_result);
        }
        const auto* timestamps = reinterpret_cast<const std::uint64_t*>(
            static_cast<const std::byte*>(mapped) + byte_offset);
        FrameTiming timing;
        timing.valid = true;
        timing.gpu_frame_ms = static_cast<double>(timestamps[frame.query_count - 1U] - timestamps[0]) *
            1000.0 / static_cast<double>(implementation_->timestamp_frequency);
        timing.passes.reserve(frame.query_count - 1U);
        for (std::uint32_t index = 0U; index + 1U < frame.query_count; ++index) {
            timing.passes.push_back({
                frame.query_names[index],
                static_cast<double>(timestamps[index + 1U] - timestamps[index]) *
                    1000.0 / static_cast<double>(implementation_->timestamp_frequency)});
        }
        const D3D12_RANGE no_write{0U, 0U};
        implementation_->timestamp_readback->Unmap(0U, &no_write);
        implementation_->latest_timing = std::move(timing);
    }
    frame.transient_resources.clear();
    frame.upload_cursor = 0U;
    implementation_->collect_retired();

    HRESULT result = frame.allocator->Reset();
    if (SUCCEEDED(result)) {
        result = implementation_->command_list->Reset(frame.allocator.Get(), nullptr);
    }
    if (FAILED(result)) {
        return hresult_error(ErrorCode::BackendFailure, "D3D12 frame reset failed", result);
    }

    const std::uint64_t id = implementation_->next_frame_id++;
    implementation_->active_frame_id = id;
    implementation_->active_frame_index = frame_index;
    implementation_->active_back_buffer = implementation_->swapchain
        ? implementation_->swapchain->GetCurrentBackBufferIndex()
        : static_cast<std::uint32_t>(id - 1U) % back_buffer_count;
    return FrameContext::from_parts(id, swapchain);
}

Result<Submission> D3D12Graphics::execute(
    FrameContext&& frame_context,
    render_graph::ExecutionPlan&& plan,
    FramePacket packet) {
    if (!frame_context.valid() ||
        frame_context.id() != implementation_->active_frame_id ||
        frame_context.swapchain() != implementation_->swapchain_handle) {
        return Error{ErrorCode::InvalidState, "invalid or already consumed D3D12 frame"};
    }
    frame_context.consume();
    const auto frame_index = implementation_->active_frame_index;
    auto& frame = implementation_->frames[frame_index];

    struct UploadAllocation {
        D3D12_GPU_VIRTUAL_ADDRESS address{};
        std::byte* cpu{};
    };
    const auto allocate_upload = [&](std::uint64_t size, std::uint64_t alignment)
        -> Result<UploadAllocation> {
        const std::uint64_t offset = align_up(frame.upload_cursor, alignment);
        if (size == 0U || offset > frame_upload_size || size > frame_upload_size - offset) {
            return Error{ErrorCode::OutOfMemory, "per-frame upload ring exhausted"};
        }
        frame.upload_cursor = offset + size;
        return UploadAllocation{
            frame.upload->GetGPUVirtualAddress() + offset,
            frame.mapped_upload + offset};
    };

    FrameConstantsCpu frame_constants{
        packet.view_projection,
        packet.camera_position,
        packet.exposure};
    PassConstantsCpu pass_constants{};
    pass_constants.light_view_projection = packet.light_view_projection;
    pass_constants.light_direction = packet.directional_light.direction;
    pass_constants.light_intensity = packet.directional_light.intensity;
    pass_constants.light_color = packet.directional_light.color;
    pass_constants.point_light_count = std::min(packet.point_light_count, 4U);
    for (std::uint32_t index = 0U; index < pass_constants.point_light_count; ++index) {
        pass_constants.point_position_intensity[index] = {
            packet.point_lights[index].position[0],
            packet.point_lights[index].position[1],
            packet.point_lights[index].position[2],
            packet.point_lights[index].intensity};
        pass_constants.point_color[index] = {
            packet.point_lights[index].color[0],
            packet.point_lights[index].color[1],
            packet.point_lights[index].color[2],
            0.0F};
    }
    auto frame_upload = allocate_upload(sizeof(frame_constants), D3D12_CONSTANT_BUFFER_DATA_PLACEMENT_ALIGNMENT);
    auto pass_upload = allocate_upload(sizeof(pass_constants), D3D12_CONSTANT_BUFFER_DATA_PLACEMENT_ALIGNMENT);
    if (!frame_upload || !pass_upload) {
        implementation_->active_frame_id = 0U;
        return !frame_upload ? frame_upload.error() : pass_upload.error();
    }
    std::memcpy(frame_upload.value().cpu, &frame_constants, sizeof(frame_constants));
    std::memcpy(pass_upload.value().cpu, &pass_constants, sizeof(pass_constants));

    UploadAllocation object_upload{};
    UploadAllocation material_upload{};
    if (!packet.draws.empty()) {
        auto objects = allocate_upload(
            packet.draws.size() * sizeof(ObjectGpuCpu), alignof(ObjectGpuCpu));
        auto materials = allocate_upload(
            packet.draws.size() * sizeof(PbrMaterialData), alignof(PbrMaterialData));
        if (!objects || !materials) {
            implementation_->active_frame_id = 0U;
            return !objects ? objects.error() : materials.error();
        }
        object_upload = objects.value();
        material_upload = materials.value();
        for (std::size_t index = 0U; index < packet.draws.size(); ++index) {
            const ObjectGpuCpu object{packet.draws[index].world};
            std::memcpy(
                object_upload.cpu + index * sizeof(ObjectGpuCpu), &object, sizeof(object));
            std::memcpy(
                material_upload.cpu + index * sizeof(PbrMaterialData),
                &packet.draws[index].material,
                sizeof(PbrMaterialData));
        }
    }

    struct NativeDraw {
        D3D12_VERTEX_BUFFER_VIEW vertex;
        D3D12_INDEX_BUFFER_VIEW index;
    };
    std::vector<NativeDraw> native_draws;
    native_draws.reserve(packet.draws.size());
    for (const auto& draw : packet.draws) {
        if (!draw.vertex_buffer.valid() || !draw.index_buffer.valid() ||
            draw.vertex_buffer.index() > implementation_->resources.size() ||
            draw.index_buffer.index() > implementation_->resources.size() ||
            draw.index_count == 0U) {
            implementation_->active_frame_id = 0U;
            return Error{ErrorCode::InvalidHandle, "draw packet contains an invalid mesh handle"};
        }
        const auto& vertex = implementation_->resources[draw.vertex_buffer.index() - 1U];
        const auto& index = implementation_->resources[draw.index_buffer.index() - 1U];
        const std::uint64_t required_index_bytes =
            (static_cast<std::uint64_t>(draw.first_index) + draw.index_count) * sizeof(std::uint32_t);
        if (!vertex.live || !index.live || !vertex.buffer || !index.buffer ||
            vertex.generation != draw.vertex_buffer.generation() ||
            index.generation != draw.index_buffer.generation() ||
            vertex.capacity > std::numeric_limits<UINT>::max() ||
            index.capacity > std::numeric_limits<UINT>::max() ||
            required_index_bytes > index.capacity || vertex.capacity < 48U) {
            implementation_->active_frame_id = 0U;
            return Error{ErrorCode::InvalidState, "draw packet mesh buffers are stale or undersized"};
        }
        native_draws.push_back({
            {vertex.resource->GetGPUVirtualAddress(), static_cast<UINT>(vertex.capacity), 48U},
            {index.resource->GetGPUVirtualAddress(), static_cast<UINT>(index.capacity), DXGI_FORMAT_R32_UINT}});
    }

    D3D12_VERTEX_BUFFER_VIEW ui_vertex_view{};
    D3D12_INDEX_BUFFER_VIEW ui_index_view{};
    const bool has_ui_draws = !packet.ui.vertices.empty() &&
        !packet.ui.indices.empty() && !packet.ui.batches.empty();
    if (has_ui_draws) {
        if (std::ranges::any_of(packet.ui.batches, [](const UiDrawBatch& batch) {
                return batch.texture_index >= texture_descriptor_count;
            })) {
            implementation_->active_frame_id = 0U;
            return Error{ErrorCode::OutOfDescriptors, "Dear ImGui draw references an invalid Texture2D descriptor"};
        }
        auto vertices = allocate_upload(
            packet.ui.vertices.size() * sizeof(UiVertex), alignof(UiVertex));
        auto indices = allocate_upload(
            packet.ui.indices.size() * sizeof(std::uint32_t), alignof(std::uint32_t));
        if (!vertices || !indices) {
            implementation_->active_frame_id = 0U;
            return !vertices ? vertices.error() : indices.error();
        }
        std::memcpy(
            vertices.value().cpu,
            packet.ui.vertices.data(),
            packet.ui.vertices.size() * sizeof(UiVertex));
        std::memcpy(
            indices.value().cpu,
            packet.ui.indices.data(),
            packet.ui.indices.size() * sizeof(std::uint32_t));
        ui_vertex_view = {
            vertices.value().address,
            static_cast<UINT>(packet.ui.vertices.size() * sizeof(UiVertex)),
            sizeof(UiVertex)};
        ui_index_view = {
            indices.value().address,
            static_cast<UINT>(packet.ui.indices.size() * sizeof(std::uint32_t)),
            DXGI_FORMAT_R32_UINT};
    }

    if (has_ui_draws && !packet.ui.font_rgba8.empty() &&
        (implementation_->ui_font_texture == nullptr ||
            implementation_->ui_font_width != packet.ui.font_width ||
            implementation_->ui_font_height != packet.ui.font_height)) {
        const std::size_t expected_font_size =
            static_cast<std::size_t>(packet.ui.font_width) * packet.ui.font_height * 4U;
        if (packet.ui.font_width == 0U || packet.ui.font_height == 0U ||
            packet.ui.font_rgba8.size() != expected_font_size) {
            implementation_->active_frame_id = 0U;
            return Error{ErrorCode::DebugUiUnavailable, "Dear ImGui font atlas is invalid"};
        }
        D3D12_HEAP_PROPERTIES default_heap{};
        default_heap.Type = D3D12_HEAP_TYPE_DEFAULT;
        D3D12_RESOURCE_DESC texture_desc{};
        texture_desc.Dimension = D3D12_RESOURCE_DIMENSION_TEXTURE2D;
        texture_desc.Width = packet.ui.font_width;
        texture_desc.Height = packet.ui.font_height;
        texture_desc.DepthOrArraySize = 1U;
        texture_desc.MipLevels = 1U;
        texture_desc.Format = DXGI_FORMAT_R8G8B8A8_UNORM;
        texture_desc.SampleDesc.Count = 1U;
        texture_desc.Layout = D3D12_TEXTURE_LAYOUT_UNKNOWN;
        ComPtr<ID3D12Resource> font_texture;
        HRESULT result = implementation_->device->CreateCommittedResource(
            &default_heap,
            D3D12_HEAP_FLAG_NONE,
            &texture_desc,
            D3D12_RESOURCE_STATE_COPY_DEST,
            nullptr,
            IID_PPV_ARGS(&font_texture));
        if (FAILED(result)) {
            implementation_->active_frame_id = 0U;
            return hresult_error(ErrorCode::DebugUiUnavailable, "Dear ImGui font texture allocation failed", result);
        }
        D3D12_PLACED_SUBRESOURCE_FOOTPRINT footprint{};
        UINT rows = 0U;
        UINT64 row_size = 0U;
        UINT64 total_size = 0U;
        implementation_->device->GetCopyableFootprints(
            &texture_desc, 0U, 1U, 0U, &footprint, &rows, &row_size, &total_size);
        D3D12_HEAP_PROPERTIES upload_heap{};
        upload_heap.Type = D3D12_HEAP_TYPE_UPLOAD;
        D3D12_RESOURCE_DESC upload_desc{};
        upload_desc.Dimension = D3D12_RESOURCE_DIMENSION_BUFFER;
        upload_desc.Width = total_size;
        upload_desc.Height = 1U;
        upload_desc.DepthOrArraySize = 1U;
        upload_desc.MipLevels = 1U;
        upload_desc.SampleDesc.Count = 1U;
        upload_desc.Layout = D3D12_TEXTURE_LAYOUT_ROW_MAJOR;
        ComPtr<ID3D12Resource> staging;
        result = implementation_->device->CreateCommittedResource(
            &upload_heap,
            D3D12_HEAP_FLAG_NONE,
            &upload_desc,
            D3D12_RESOURCE_STATE_GENERIC_READ,
            nullptr,
            IID_PPV_ARGS(&staging));
        if (FAILED(result)) {
            implementation_->active_frame_id = 0U;
            return hresult_error(ErrorCode::DebugUiUnavailable, "Dear ImGui font staging allocation failed", result);
        }
        std::byte* mapped = nullptr;
        const D3D12_RANGE no_read{0U, 0U};
        result = staging->Map(0U, &no_read, reinterpret_cast<void**>(&mapped));
        if (FAILED(result)) {
            implementation_->active_frame_id = 0U;
            return hresult_error(ErrorCode::DebugUiUnavailable, "Dear ImGui font staging map failed", result);
        }
        const std::size_t tight_row = static_cast<std::size_t>(packet.ui.font_width) * 4U;
        for (std::uint32_t row = 0U; row < packet.ui.font_height; ++row) {
            std::memcpy(
                mapped + footprint.Offset + row * footprint.Footprint.RowPitch,
                packet.ui.font_rgba8.data() + row * tight_row,
                tight_row);
        }
        const D3D12_RANGE written{0U, static_cast<SIZE_T>(total_size)};
        staging->Unmap(0U, &written);
        D3D12_TEXTURE_COPY_LOCATION destination{};
        destination.pResource = font_texture.Get();
        destination.Type = D3D12_TEXTURE_COPY_TYPE_SUBRESOURCE_INDEX;
        D3D12_TEXTURE_COPY_LOCATION source{};
        source.pResource = staging.Get();
        source.Type = D3D12_TEXTURE_COPY_TYPE_PLACED_FOOTPRINT;
        source.PlacedFootprint = footprint;
        implementation_->command_list->CopyTextureRegion(
            &destination, 0U, 0U, 0U, &source, nullptr);
        D3D12_RESOURCE_BARRIER barrier{};
        barrier.Type = D3D12_RESOURCE_BARRIER_TYPE_TRANSITION;
        barrier.Transition.pResource = font_texture.Get();
        barrier.Transition.StateBefore = D3D12_RESOURCE_STATE_COPY_DEST;
        barrier.Transition.StateAfter = D3D12_RESOURCE_STATE_PIXEL_SHADER_RESOURCE;
        barrier.Transition.Subresource = D3D12_RESOURCE_BARRIER_ALL_SUBRESOURCES;
        implementation_->command_list->ResourceBarrier(1U, &barrier);
        if (implementation_->ui_font_texture) {
            frame.transient_resources.push_back(implementation_->ui_font_texture);
        }
        implementation_->ui_font_texture = std::move(font_texture);
        implementation_->ui_font_width = packet.ui.font_width;
        implementation_->ui_font_height = packet.ui.font_height;
        frame.transient_resources.push_back(staging);
        D3D12_SHADER_RESOURCE_VIEW_DESC font_view{};
        font_view.Format = DXGI_FORMAT_R8G8B8A8_UNORM;
        font_view.ViewDimension = D3D12_SRV_DIMENSION_TEXTURE2D;
        font_view.Shader4ComponentMapping = D3D12_DEFAULT_SHADER_4_COMPONENT_MAPPING;
        font_view.Texture2D.MipLevels = 1U;
        implementation_->device->CreateShaderResourceView(
            implementation_->ui_font_texture.Get(),
            &font_view,
            offset_handle(
                implementation_->srv_heap->GetCPUDescriptorHandleForHeapStart(),
                ui_font_srv_slot,
                implementation_->srv_increment));
        (void)rows;
        (void)row_size;
    }

    std::vector<Impl::LogicalResource> logical(plan.resources().size());
    std::uint32_t rtv_cursor = back_buffer_count + frame_index * 8U;
    std::uint32_t dsv_cursor = frame_index * 8U;
    const auto rtv_start = implementation_->rtv_heap->GetCPUDescriptorHandleForHeapStart();
    const auto dsv_start = implementation_->dsv_heap->GetCPUDescriptorHandleForHeapStart();

    for (std::size_t index = 0U; index < plan.resources().size(); ++index) {
        const auto& description = plan.resources()[index];
        auto& target = logical[index];
        if (description.lifetime == render_graph::ResourceLifetime::Imported) {
            target.resource = implementation_->back_buffers[implementation_->active_back_buffer];
            target.state = D3D12_RESOURCE_STATE_PRESENT;
            target.rtv = offset_handle(rtv_start, implementation_->active_back_buffer, implementation_->rtv_increment);
            target.has_rtv = true;
            continue;
        }
        auto created = implementation_->create_graph_texture(description);
        if (!created) {
            implementation_->active_frame_id = 0U;
            return created.error();
        }
        target.resource = std::move(created).value();
        frame.transient_resources.push_back(target.resource);
        const bool depth = description.format == render_graph::TextureFormat::D32Float ||
            description.format == render_graph::TextureFormat::R32Typeless;
        if (depth) {
            target.dsv = offset_handle(dsv_start, dsv_cursor++, implementation_->dsv_increment);
            D3D12_DEPTH_STENCIL_VIEW_DESC view{};
            view.Format = DXGI_FORMAT_D32_FLOAT;
            view.ViewDimension = D3D12_DSV_DIMENSION_TEXTURE2D;
            implementation_->device->CreateDepthStencilView(target.resource.Get(), &view, target.dsv);
            target.has_dsv = true;
        } else {
            target.rtv = offset_handle(rtv_start, rtv_cursor++, implementation_->rtv_increment);
            implementation_->device->CreateRenderTargetView(target.resource.Get(), nullptr, target.rtv);
            target.has_rtv = true;
        }
    }

    Impl::LogicalResource* shadow_map = nullptr;
    Impl::LogicalResource* scene_color = nullptr;
    Impl::LogicalResource* scene_depth = nullptr;
    Impl::LogicalResource* back_buffer = nullptr;
    for (std::size_t index = 0U; index < plan.resources().size(); ++index) {
        const auto& description = plan.resources()[index];
        if (description.format == render_graph::TextureFormat::R32Typeless) {
            shadow_map = &logical[index];
        } else if (description.format == render_graph::TextureFormat::RGBA16Float) {
            scene_color = &logical[index];
        } else if (description.format == render_graph::TextureFormat::D32Float) {
            scene_depth = &logical[index];
        }
        if (description.lifetime == render_graph::ResourceLifetime::Imported) {
            back_buffer = &logical[index];
        }
    }
    if (shadow_map != nullptr) {
        D3D12_SHADER_RESOURCE_VIEW_DESC shadow_view{};
        shadow_view.Format = DXGI_FORMAT_R32_FLOAT;
        shadow_view.ViewDimension = D3D12_SRV_DIMENSION_TEXTURE2D;
        shadow_view.Shader4ComponentMapping = D3D12_DEFAULT_SHADER_4_COMPONENT_MAPPING;
        shadow_view.Texture2D.MipLevels = 1U;
        implementation_->device->CreateShaderResourceView(
            shadow_map->resource.Get(),
            &shadow_view,
            offset_handle(
                implementation_->srv_heap->GetCPUDescriptorHandleForHeapStart(),
                shadow_srv_start + frame_index,
                implementation_->srv_increment));
    }

    const auto bind_scene_roots = [&] {
        ID3D12DescriptorHeap* heaps[] = {
            implementation_->srv_heap.Get(), implementation_->sampler_heap.Get()};
        implementation_->command_list->SetDescriptorHeaps(2U, heaps);
        implementation_->command_list->SetGraphicsRootSignature(
            implementation_->forward_root_signature.Get());
        implementation_->command_list->SetGraphicsRootConstantBufferView(
            1U, frame_upload.value().address);
        implementation_->command_list->SetGraphicsRootConstantBufferView(
            2U, pass_upload.value().address);
        implementation_->command_list->SetGraphicsRootShaderResourceView(
            3U, object_upload.address);
        implementation_->command_list->SetGraphicsRootShaderResourceView(
            4U, material_upload.address);
        implementation_->command_list->SetGraphicsRootDescriptorTable(
            5U,
            offset_handle(
                implementation_->srv_heap->GetGPUDescriptorHandleForHeapStart(),
                shadow_srv_start + frame_index,
                implementation_->srv_increment));
        implementation_->command_list->SetGraphicsRootDescriptorTable(
            6U, implementation_->srv_heap->GetGPUDescriptorHandleForHeapStart());
        implementation_->command_list->SetGraphicsRootDescriptorTable(
            7U, implementation_->sampler_heap->GetGPUDescriptorHandleForHeapStart());
    };
    const auto bind_shadow_roots = [&] {
        ID3D12DescriptorHeap* heaps[] = {
            implementation_->srv_heap.Get(), implementation_->sampler_heap.Get()};
        implementation_->command_list->SetDescriptorHeaps(2U, heaps);
        implementation_->command_list->SetGraphicsRootSignature(
            implementation_->forward_root_signature.Get());
        implementation_->command_list->SetGraphicsRootConstantBufferView(
            1U, frame_upload.value().address);
        implementation_->command_list->SetGraphicsRootConstantBufferView(
            2U, pass_upload.value().address);
        implementation_->command_list->SetGraphicsRootShaderResourceView(
            3U, object_upload.address);
        implementation_->command_list->SetGraphicsRootShaderResourceView(
            4U, material_upload.address);
        implementation_->command_list->SetGraphicsRootDescriptorTable(
            6U, implementation_->srv_heap->GetGPUDescriptorHandleForHeapStart());
        implementation_->command_list->SetGraphicsRootDescriptorTable(
            7U, implementation_->sampler_heap->GetGPUDescriptorHandleForHeapStart());
    };
    const auto draw_scene = [&] {
        implementation_->command_list->IASetPrimitiveTopology(
            D3D_PRIMITIVE_TOPOLOGY_TRIANGLELIST);
        for (std::size_t index = 0U; index < packet.draws.size(); ++index) {
            implementation_->command_list->IASetVertexBuffers(
                0U, 1U, &native_draws[index].vertex);
            implementation_->command_list->IASetIndexBuffer(&native_draws[index].index);
            const std::array<std::uint32_t, 4> constants{
                static_cast<std::uint32_t>(index),
                static_cast<std::uint32_t>(index),
                static_cast<std::uint32_t>(index),
                packet.draws[index].material.flags};
            implementation_->command_list->SetGraphicsRoot32BitConstants(
                0U, static_cast<UINT>(constants.size()), constants.data(), 0U);
            implementation_->command_list->DrawIndexedInstanced(
                packet.draws[index].index_count,
                1U,
                packet.draws[index].first_index,
                packet.draws[index].vertex_offset,
                0U);
        }
    };

    if (plan.passes().size() > max_timed_passes) {
        implementation_->active_frame_id = 0U;
        return Error{ErrorCode::InvalidArgument, "execution plan exceeds the MVP1 timestamp pass limit"};
    }
    const std::uint32_t first_query = frame_index * queries_per_frame;
    implementation_->command_list->EndQuery(
        implementation_->timestamp_heap.Get(), D3D12_QUERY_TYPE_TIMESTAMP, first_query);
    std::uint32_t timed_pass_index = 0U;
    for (const auto& pass : plan.passes()) {
        implementation_->last_pass = pass.name;
        PIXBeginEvent(implementation_->command_list.Get(), PIX_COLOR_DEFAULT, pass.name.c_str());
        for (const auto& transition : pass.transitions) {
            const std::size_t resource_index = transition.resource.index() - 1U;
            auto& target = logical[resource_index];
            const auto after = state_for(transition.after);
            if (target.state != after) {
                D3D12_RESOURCE_BARRIER barrier{};
                barrier.Type = D3D12_RESOURCE_BARRIER_TYPE_TRANSITION;
                barrier.Transition.pResource = target.resource.Get();
                barrier.Transition.StateBefore = target.state;
                barrier.Transition.StateAfter = after;
                barrier.Transition.Subresource = D3D12_RESOURCE_BARRIER_ALL_SUBRESOURCES;
                implementation_->command_list->ResourceBarrier(1U, &barrier);
                target.state = after;
            }
        }

        for (const auto& transition : pass.transitions) {
            auto& target = logical[transition.resource.index() - 1U];
            if (transition.after == render_graph::ResourceUsage::DepthAttachmentWrite && target.has_dsv) {
                implementation_->command_list->ClearDepthStencilView(
                    target.dsv, D3D12_CLEAR_FLAG_DEPTH, 1.0F, 0U, 0U, nullptr);
            }
            if (transition.after == render_graph::ResourceUsage::ColorAttachmentWrite &&
                target.has_rtv && pass.name != "DearImGui") {
                const std::array<float, 4> color = pass.name == "ToneMap"
                    ? std::array<float, 4>{0.055F, 0.12F, 0.22F, 1.0F}
                    : std::array<float, 4>{0.012F, 0.025F, 0.05F, 1.0F};
                implementation_->command_list->ClearRenderTargetView(target.rtv, color.data(), 0U, nullptr);
            }
        }

        const D3D12_VIEWPORT viewport{
            0.0F,
            0.0F,
            static_cast<float>(implementation_->config.width),
            static_cast<float>(implementation_->config.height),
            0.0F,
            1.0F};
        const D3D12_RECT scissor{
            0,
            0,
            static_cast<LONG>(implementation_->config.width),
            static_cast<LONG>(implementation_->config.height)};
        if (pass.name == "Shadow" && implementation_->shadow_pipeline &&
            shadow_map != nullptr && !packet.draws.empty()) {
            const auto shadow_desc = shadow_map->resource->GetDesc();
            const D3D12_VIEWPORT shadow_viewport{
                0.0F,
                0.0F,
                static_cast<float>(shadow_desc.Width),
                static_cast<float>(shadow_desc.Height),
                0.0F,
                1.0F};
            const D3D12_RECT shadow_scissor{
                0, 0, static_cast<LONG>(shadow_desc.Width), static_cast<LONG>(shadow_desc.Height)};
            bind_shadow_roots();
            implementation_->command_list->SetPipelineState(
                implementation_->shadow_pipeline.Get());
            implementation_->command_list->RSSetViewports(1U, &shadow_viewport);
            implementation_->command_list->RSSetScissorRects(1U, &shadow_scissor);
            implementation_->command_list->OMSetRenderTargets(
                0U, nullptr, FALSE, &shadow_map->dsv);
            draw_scene();
        }
        if (pass.name == "ForwardOpaqueMask" && implementation_->forward_pipeline) {
            if (scene_color != nullptr && scene_depth != nullptr && !packet.draws.empty()) {
                bind_scene_roots();
                implementation_->command_list->SetGraphicsRootSignature(
                    implementation_->forward_root_signature.Get());
                implementation_->command_list->SetPipelineState(
                    implementation_->forward_pipeline.Get());
                implementation_->command_list->RSSetViewports(1U, &viewport);
                implementation_->command_list->RSSetScissorRects(1U, &scissor);
                implementation_->command_list->OMSetRenderTargets(
                    1U, &scene_color->rtv, FALSE, &scene_depth->dsv);
                draw_scene();
            }
        }
        if (pass.name == "ToneMap" && implementation_->tone_map_pipeline) {
            if (scene_color != nullptr && back_buffer != nullptr) {
                const auto srv_cpu = offset_handle(
                    implementation_->srv_heap->GetCPUDescriptorHandleForHeapStart(),
                    tone_srv_start + frame_index,
                    implementation_->srv_increment);
                D3D12_SHADER_RESOURCE_VIEW_DESC view{};
                view.Format = DXGI_FORMAT_R16G16B16A16_FLOAT;
                view.ViewDimension = D3D12_SRV_DIMENSION_TEXTURE2D;
                view.Shader4ComponentMapping = D3D12_DEFAULT_SHADER_4_COMPONENT_MAPPING;
                view.Texture2D.MipLevels = 1U;
                implementation_->device->CreateShaderResourceView(
                    scene_color->resource.Get(), &view, srv_cpu);
                ID3D12DescriptorHeap* heaps[] = {implementation_->srv_heap.Get()};
                implementation_->command_list->SetDescriptorHeaps(1U, heaps);
                implementation_->command_list->SetGraphicsRootSignature(
                    implementation_->tone_map_root_signature.Get());
                implementation_->command_list->SetGraphicsRootDescriptorTable(
                    0U,
                    offset_handle(
                        implementation_->srv_heap->GetGPUDescriptorHandleForHeapStart(),
                        tone_srv_start + frame_index,
                        implementation_->srv_increment));
                implementation_->command_list->SetPipelineState(
                    implementation_->tone_map_pipeline.Get());
                implementation_->command_list->RSSetViewports(1U, &viewport);
                implementation_->command_list->RSSetScissorRects(1U, &scissor);
                implementation_->command_list->OMSetRenderTargets(
                    1U, &back_buffer->rtv, FALSE, nullptr);
                implementation_->command_list->IASetPrimitiveTopology(
                    D3D_PRIMITIVE_TOPOLOGY_TRIANGLELIST);
                implementation_->command_list->DrawInstanced(3U, 1U, 0U, 0U);
            }
        }
        if (pass.name == "DearImGui" && implementation_->ui_pipeline &&
            implementation_->ui_font_texture && back_buffer != nullptr && has_ui_draws &&
            packet.ui.display_size[0] > 0.0F && packet.ui.display_size[1] > 0.0F) {
            const float left = packet.ui.display_position[0];
            const float right = left + packet.ui.display_size[0];
            const float top = packet.ui.display_position[1];
            const float bottom = top + packet.ui.display_size[1];
            const std::array<float, 16> projection{
                2.0F / (right - left), 0.0F, 0.0F, 0.0F,
                0.0F, 2.0F / (top - bottom), 0.0F, 0.0F,
                0.0F, 0.0F, 0.5F, 0.0F,
                (right + left) / (left - right),
                (top + bottom) / (bottom - top),
                0.5F,
                1.0F};
            ID3D12DescriptorHeap* heaps[] = {implementation_->srv_heap.Get()};
            implementation_->command_list->SetDescriptorHeaps(1U, heaps);
            implementation_->command_list->SetGraphicsRootSignature(
                implementation_->ui_root_signature.Get());
            implementation_->command_list->SetGraphicsRoot32BitConstants(
                0U, static_cast<UINT>(projection.size()), projection.data(), 0U);
            implementation_->command_list->SetGraphicsRootDescriptorTable(
                1U,
                offset_handle(
                    implementation_->srv_heap->GetGPUDescriptorHandleForHeapStart(),
                    ui_font_srv_slot,
                    implementation_->srv_increment));
            implementation_->command_list->SetPipelineState(implementation_->ui_pipeline.Get());
            implementation_->command_list->RSSetViewports(1U, &viewport);
            implementation_->command_list->OMSetRenderTargets(
                1U, &back_buffer->rtv, FALSE, nullptr);
            implementation_->command_list->IASetPrimitiveTopology(
                D3D_PRIMITIVE_TOPOLOGY_TRIANGLELIST);
            implementation_->command_list->IASetVertexBuffers(0U, 1U, &ui_vertex_view);
            implementation_->command_list->IASetIndexBuffer(&ui_index_view);
            for (const auto& batch : packet.ui.batches) {
                const float clip_left = (batch.clip_rect[0] - left) * packet.ui.framebuffer_scale[0];
                const float clip_top = (batch.clip_rect[1] - top) * packet.ui.framebuffer_scale[1];
                const float clip_right = (batch.clip_rect[2] - left) * packet.ui.framebuffer_scale[0];
                const float clip_bottom = (batch.clip_rect[3] - top) * packet.ui.framebuffer_scale[1];
                const D3D12_RECT clip{
                    std::max<LONG>(0, static_cast<LONG>(clip_left)),
                    std::max<LONG>(0, static_cast<LONG>(clip_top)),
                    std::min<LONG>(static_cast<LONG>(implementation_->config.width), static_cast<LONG>(clip_right)),
                    std::min<LONG>(static_cast<LONG>(implementation_->config.height), static_cast<LONG>(clip_bottom))};
                if (clip.right <= clip.left || clip.bottom <= clip.top) continue;
                const std::uint32_t descriptor_index = batch.texture_index == 0U
                    ? ui_font_srv_slot
                    : batch.texture_index;
                implementation_->command_list->SetGraphicsRootDescriptorTable(
                    1U,
                    offset_handle(
                        implementation_->srv_heap->GetGPUDescriptorHandleForHeapStart(),
                        descriptor_index,
                        implementation_->srv_increment));
                implementation_->command_list->RSSetScissorRects(1U, &clip);
                implementation_->command_list->DrawIndexedInstanced(
                    batch.index_count,
                    1U,
                    batch.first_index,
                    batch.vertex_offset,
                    0U);
            }
        }
        PIXEndEvent(implementation_->command_list.Get());
        implementation_->command_list->EndQuery(
            implementation_->timestamp_heap.Get(),
            D3D12_QUERY_TYPE_TIMESTAMP,
            first_query + timed_pass_index + 1U);
        frame.query_names[timed_pass_index] = pass.name;
        ++timed_pass_index;
    }
    frame.query_count = timed_pass_index + 1U;
    implementation_->command_list->ResolveQueryData(
        implementation_->timestamp_heap.Get(),
        D3D12_QUERY_TYPE_TIMESTAMP,
        first_query,
        frame.query_count,
        implementation_->timestamp_readback.Get(),
        static_cast<std::uint64_t>(first_query) * sizeof(std::uint64_t));

    HRESULT result = implementation_->command_list->Close();
    if (FAILED(result)) {
        implementation_->active_frame_id = 0U;
        return hresult_error(ErrorCode::BackendFailure, "closing D3D12 command list failed", result);
    }
    ID3D12CommandList* lists[] = {implementation_->command_list.Get()};
    implementation_->queue->ExecuteCommandLists(1U, lists);

    if (implementation_->swapchain) {
        const UINT sync_interval = implementation_->config.vsync ? 1U : 0U;
        const UINT flags = !implementation_->config.vsync && implementation_->config.allow_tearing
            ? DXGI_PRESENT_ALLOW_TEARING
            : 0U;
        result = implementation_->swapchain->Present(sync_interval, flags);
        if (FAILED(result)) {
            implementation_->device_lost = result == DXGI_ERROR_DEVICE_REMOVED || result == DXGI_ERROR_DEVICE_RESET;
            implementation_->last_failure = result;
            implementation_->active_frame_id = 0U;
            return hresult_error(
                implementation_->device_lost ? ErrorCode::DeviceLost : ErrorCode::SurfaceLost,
                "D3D12 Present failed",
                result);
        }
    }

    const SubmissionToken token{implementation_->last_submitted + 1U};
    result = implementation_->queue->Signal(implementation_->fence.Get(), token.value);
    if (FAILED(result)) {
        implementation_->active_frame_id = 0U;
        implementation_->device_lost = true;
        implementation_->last_failure = result;
        return hresult_error(ErrorCode::DeviceLost, "D3D12 queue signal failed", result);
    }
    implementation_->last_submitted = token.value;
    frame.fence_value = token.value;
    for (auto& resource : implementation_->resources) {
        if (resource.live) {
            resource.last_use = token.value;
        }
    }
    implementation_->active_frame_id = 0U;
    return Submission{token};
}

FrameTiming D3D12Graphics::latest_timing() const {
    return implementation_->latest_timing;
}

DiagnosticSnapshot D3D12Graphics::diagnostics() const {
    DiagnosticSnapshot snapshot;
    snapshot.device_lost = implementation_->device_lost;
    snapshot.last_pass = implementation_->last_pass;
    HRESULT reason = implementation_->last_failure;
    if (snapshot.device_lost && implementation_->device) {
        const HRESULT removed = implementation_->device->GetDeviceRemovedReason();
        if (FAILED(removed)) reason = removed;
    }
    snapshot.native_reason = static_cast<std::int64_t>(reason);

    if (implementation_->info_queue) {
        const UINT64 count =
            implementation_->info_queue->GetNumStoredMessagesAllowedByRetrievalFilter();
        for (UINT64 index = 0U; index < count; ++index) {
            SIZE_T size = 0U;
            if (FAILED(implementation_->info_queue->GetMessage(index, nullptr, &size)) ||
                size < sizeof(D3D12_MESSAGE)) {
                continue;
            }
            std::vector<std::byte> storage(size);
            auto* message = reinterpret_cast<D3D12_MESSAGE*>(storage.data());
            if (FAILED(implementation_->info_queue->GetMessage(index, message, &size))) continue;
            if (message->Severity == D3D12_MESSAGE_SEVERITY_ERROR ||
                message->Severity == D3D12_MESSAGE_SEVERITY_CORRUPTION) {
                snapshot.validation_errors.emplace_back(
                    message->pDescription,
                    message->DescriptionByteLength > 0U
                        ? message->DescriptionByteLength - 1U
                        : 0U);
            }
        }
    }

    if (snapshot.device_lost && implementation_->device) {
        ComPtr<ID3D12DeviceRemovedExtendedData1> dred;
        if (SUCCEEDED(implementation_->device.As(&dred))) {
            D3D12_DRED_AUTO_BREADCRUMBS_OUTPUT1 breadcrumbs{};
            if (SUCCEEDED(dred->GetAutoBreadcrumbsOutput1(&breadcrumbs))) {
                const D3D12_AUTO_BREADCRUMB_NODE1* node = breadcrumbs.pHeadAutoBreadcrumbNode;
                for (std::uint32_t count = 0U; node != nullptr && count < 64U;
                     ++count, node = node->pNext) {
                    std::string name = node->pCommandListDebugNameA != nullptr
                        ? node->pCommandListDebugNameA
                        : node->pCommandListDebugNameW != nullptr
                            ? narrow(node->pCommandListDebugNameW)
                            : "unnamed-command-list";
                    const UINT completed = node->pLastBreadcrumbValue != nullptr
                        ? *node->pLastBreadcrumbValue
                        : 0U;
                    snapshot.dred_breadcrumbs.push_back(
                        std::move(name) + ":" + std::to_string(completed) + "/" +
                        std::to_string(node->BreadcrumbCount));
                }
            }
            D3D12_DRED_PAGE_FAULT_OUTPUT1 page_fault{};
            if (SUCCEEDED(dred->GetPageFaultAllocationOutput1(&page_fault))) {
                snapshot.page_fault_address = page_fault.PageFaultVA;
            }
        }
    }
    return snapshot;
}

CompletionStatus D3D12Graphics::poll(SubmissionToken token) const noexcept {
    if (token.value == 0U || token.value > implementation_->last_submitted) {
        return CompletionStatus::Unknown;
    }
    return implementation_->fence->GetCompletedValue() >= token.value
        ? CompletionStatus::Complete
        : CompletionStatus::Pending;
}

Result<void> D3D12Graphics::wait(
    SubmissionToken token,
    std::chrono::milliseconds timeout) {
    if (token.value == 0U || token.value > implementation_->last_submitted) {
        return Error{ErrorCode::InvalidArgument, "unknown D3D12 submission token"};
    }
    return implementation_->wait_fence(token.value, timeout);
}

Result<void> D3D12Graphics::Impl::wait_fence(
    std::uint64_t value,
    std::chrono::milliseconds timeout) {
    if (fence->GetCompletedValue() >= value) {
        return {};
    }
    const HRESULT result = fence->SetEventOnCompletion(value, fence_event);
    if (FAILED(result)) {
        device_lost = true;
        last_failure = result;
        return hresult_error(ErrorCode::DeviceLost, "SetEventOnCompletion failed", result);
    }
    const auto count = timeout.count();
    const DWORD wait_time = count < 0
        ? INFINITE
        : count >= static_cast<std::int64_t>(INFINITE - 1U)
            ? INFINITE - 1U
            : static_cast<DWORD>(count);
    const DWORD wait_result = WaitForSingleObject(fence_event, wait_time);
    if (wait_result == WAIT_TIMEOUT) {
        return Error{ErrorCode::Timeout, "D3D12 submission wait timed out"};
    }
    if (wait_result != WAIT_OBJECT_0) {
        return Error{ErrorCode::BackendFailure, "D3D12 fence wait failed", GetLastError()};
    }
    collect_retired();
    return {};
}

void D3D12Graphics::Impl::collect_retired() {
    const std::uint64_t completed = fence ? fence->GetCompletedValue() : 0U;
    for (std::size_t index = 0U; index < resources.size(); ++index) {
        auto& slot = resources[index];
        if (slot.pending_retire && slot.last_use <= completed) {
            slot.resource.Reset();
            slot.pending_retire = false;
            slot.buffer = false;
            slot.capacity = 0U;
            slot.width = 0U;
            slot.height = 0U;
            slot.mip_levels = 0U;
            slot.srgb = false;
            slot.descriptor_index = 0U;
            slot.state = D3D12_RESOURCE_STATE_COMMON;
            ++slot.generation;
            if (slot.generation == 0U) {
                slot.generation = 1U;
            }
            free_resource_indices.push_back(static_cast<std::uint32_t>(index + 1U));
        }
    }
}

SwapchainHandle D3D12Graphics::default_swapchain() const noexcept {
    return implementation_->swapchain_handle;
}

}  // namespace alpha::graphics::d3d12
