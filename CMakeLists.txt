cmake_minimum_required(VERSION 3.31)

project(AlphaEngine VERSION 0.1.0 LANGUAGES CXX)

# Bump when a public C++ contract changes. This also protects Ninja/MSVC builds
# on localized hosts where /showIncludes dependency discovery can be unreliable.
set(AENGINE_CONTRACT_VERSION 13)
add_compile_definitions(AENGINE_CONTRACT_VERSION=${AENGINE_CONTRACT_VERSION})

option(AENGINE_BUILD_TESTS "Build AlphaEngine tests" ON)
option(AENGINE_BUILD_RUNTIME "Build SDL3/D3D12 runtime applications" ON)
option(AENGINE_WARNINGS_AS_ERRORS "Treat first-party warnings as errors" ON)

list(APPEND CMAKE_MODULE_PATH "${CMAKE_CURRENT_SOURCE_DIR}/cmake")
include(CompilerWarnings)

add_library(aengine_core INTERFACE)
add_library(AlphaEngine::Core ALIAS aengine_core)
target_include_directories(aengine_core INTERFACE
    "$<BUILD_INTERFACE:${CMAKE_CURRENT_SOURCE_DIR}/engine/core/include>")
target_compile_features(aengine_core INTERFACE cxx_std_20)

add_library(aengine_render_graph
    engine/render_graph/src/render_graph.cpp)
add_library(AlphaEngine::RenderGraph ALIAS aengine_render_graph)
target_include_directories(aengine_render_graph PUBLIC
    "$<BUILD_INTERFACE:${CMAKE_CURRENT_SOURCE_DIR}/engine/render_graph/include>")
target_link_libraries(aengine_render_graph PUBLIC AlphaEngine::Core)
aengine_apply_first_party_defaults(aengine_render_graph)

add_library(aengine_graphics
    engine/graphics/src/trace_graphics.cpp)
add_library(AlphaEngine::Graphics ALIAS aengine_graphics)
target_include_directories(aengine_graphics PUBLIC
    "$<BUILD_INTERFACE:${CMAKE_CURRENT_SOURCE_DIR}/engine/graphics/include>")
target_link_libraries(aengine_graphics PUBLIC
    AlphaEngine::Core
    AlphaEngine::RenderGraph)
aengine_apply_first_party_defaults(aengine_graphics)

add_library(aengine_scene
    engine/scene/src/scene.cpp)
add_library(AlphaEngine::Scene ALIAS aengine_scene)
target_include_directories(aengine_scene PUBLIC
    "$<BUILD_INTERFACE:${CMAKE_CURRENT_SOURCE_DIR}/engine/scene/include>")
target_link_libraries(aengine_scene PUBLIC AlphaEngine::Core)
aengine_apply_first_party_defaults(aengine_scene)

add_library(aengine_renderer
    engine/renderer/src/forward_renderer.cpp)
add_library(AlphaEngine::Renderer ALIAS aengine_renderer)
target_include_directories(aengine_renderer PUBLIC
    "$<BUILD_INTERFACE:${CMAKE_CURRENT_SOURCE_DIR}/engine/renderer/include>")
target_link_libraries(aengine_renderer PUBLIC
    AlphaEngine::Core
    AlphaEngine::Scene
    AlphaEngine::RenderGraph)
aengine_apply_first_party_defaults(aengine_renderer)

if(AENGINE_BUILD_RUNTIME)
    include(Dependencies)
    include(DirectXPackages)

    add_library(aengine_application INTERFACE)
    add_library(AlphaEngine::Application ALIAS aengine_application)
    target_include_directories(aengine_application INTERFACE
        "$<BUILD_INTERFACE:${CMAKE_CURRENT_SOURCE_DIR}/engine/application/include>")
    target_link_libraries(aengine_application INTERFACE
        AlphaEngine::Core
        nlohmann_json::nlohmann_json)
    target_compile_features(aengine_application INTERFACE cxx_std_20)

    add_library(aengine_content
        engine/content/src/content.cpp)
    add_library(AlphaEngine::Content ALIAS aengine_content)
    target_include_directories(aengine_content PUBLIC
        "$<BUILD_INTERFACE:${CMAKE_CURRENT_SOURCE_DIR}/engine/content/include>")
    target_link_libraries(aengine_content PUBLIC AlphaEngine::Core bcrypt)
    aengine_apply_first_party_defaults(aengine_content)

    add_library(aengine_shader
        engine/shader/src/shader_package.cpp)
    add_library(AlphaEngine::Shader ALIAS aengine_shader)
    target_include_directories(aengine_shader PUBLIC
        "$<BUILD_INTERFACE:${CMAKE_CURRENT_SOURCE_DIR}/engine/shader/include>")
    target_link_libraries(aengine_shader PUBLIC
        AlphaEngine::Content
        nlohmann_json::nlohmann_json)
    aengine_apply_first_party_defaults(aengine_shader)

    add_library(aengine_platform
        engine/platform/src/sdl_platform_host.cpp)
    add_library(AlphaEngine::Platform ALIAS aengine_platform)
    target_include_directories(aengine_platform PUBLIC
        "$<BUILD_INTERFACE:${CMAKE_CURRENT_SOURCE_DIR}/engine/platform/include>")
    target_link_libraries(aengine_platform PUBLIC AlphaEngine::Core SDL3::SDL3)
    aengine_apply_first_party_defaults(aengine_platform)

    add_library(aengine_graphics_d3d12
        engine/graphics/d3d12/src/d3d12_graphics.cpp)
    add_library(AlphaEngine::GraphicsD3D12 ALIAS aengine_graphics_d3d12)
    target_include_directories(aengine_graphics_d3d12 PUBLIC
        "$<BUILD_INTERFACE:${CMAKE_CURRENT_SOURCE_DIR}/engine/graphics/d3d12/include>")
    target_link_libraries(aengine_graphics_d3d12 PUBLIC
        AlphaEngine::Core
        AlphaEngine::Graphics
        AlphaEngine::Shader
        AlphaEngine::AgilitySDK
        Microsoft::WinPixEventRuntime
        d3d12
        dxgi
        dxguid)
    aengine_apply_first_party_defaults(aengine_graphics_d3d12)

    add_library(aengine_debug_ui
        apps/sandbox/debug_ui/src/debug_ui.cpp)
    add_library(AlphaEngine::DebugUi ALIAS aengine_debug_ui)
    target_include_directories(aengine_debug_ui PUBLIC
        "$<BUILD_INTERFACE:${CMAKE_CURRENT_SOURCE_DIR}/apps/sandbox/debug_ui/include>")
    target_link_libraries(aengine_debug_ui PUBLIC
        AlphaEngine::Core
        AlphaEngine::Graphics
        AlphaEngine::Platform
        AlphaEngine::RenderGraph
        imgui::imgui)
    aengine_apply_first_party_defaults(aengine_debug_ui)

    add_executable(assetc tools/assetc/main.cpp)
    target_link_libraries(assetc PRIVATE
        AlphaEngine::Content
        fastgltf::fastgltf
        Microsoft::DirectXTex
        nlohmann_json::nlohmann_json)
    aengine_apply_first_party_defaults(assetc)
    add_custom_command(TARGET assetc POST_BUILD
        COMMAND "${CMAKE_COMMAND}" -E copy_if_different
            "$<TARGET_FILE:Microsoft::DirectXTex>"
            "$<TARGET_FILE_DIR:assetc>"
        VERBATIM)

    add_executable(shaderc tools/shaderc/main.cpp)
    target_link_libraries(shaderc PRIVATE
        AlphaEngine::Content
        AlphaEngine::DXC
        nlohmann_json::nlohmann_json)
    aengine_apply_first_party_defaults(shaderc)
    aengine_stage_directx_runtime(shaderc)

    set(AENGINE_SHADER_PACKAGE_DIR "${CMAKE_BINARY_DIR}/shaders/$<CONFIG>")
    set(AENGINE_SHADER_OUTPUTS)
    function(aengine_add_shader name source entry profile)
        set(output "${AENGINE_SHADER_PACKAGE_DIR}/${name}.dxil")
        set(metadata "${AENGINE_SHADER_PACKAGE_DIR}/${name}.json")
        add_custom_command(
            OUTPUT "${output}" "${metadata}"
            COMMAND "${CMAKE_COMMAND}" -E make_directory "${AENGINE_SHADER_PACKAGE_DIR}"
            COMMAND "$<TARGET_FILE:shaderc>"
                --input "${CMAKE_CURRENT_SOURCE_DIR}/${source}"
                --entry "${entry}"
                --profile "${profile}"
                --output "${output}"
                --metadata "${metadata}"
            DEPENDS shaderc "${source}" shaders/common/bindings.hlsli shaders/common/pbr.hlsli
            VERBATIM)
        list(APPEND AENGINE_SHADER_OUTPUTS "${output}" "${metadata}")
        set(AENGINE_SHADER_OUTPUTS "${AENGINE_SHADER_OUTPUTS}" PARENT_SCOPE)
    endfunction()

    aengine_add_shader(shadow_vs shaders/shadow.hlsl ShadowVS vs_6_0)
    aengine_add_shader(shadow_ps shaders/shadow.hlsl ShadowPS ps_6_0)
    aengine_add_shader(forward_vs shaders/forward.hlsl ForwardVS vs_6_0)
    aengine_add_shader(forward_ps shaders/forward.hlsl ForwardPS ps_6_0)
    aengine_add_shader(bootstrap_vs shaders/bootstrap.hlsl BootstrapVS vs_6_0)
    aengine_add_shader(bootstrap_ps shaders/bootstrap.hlsl BootstrapPS ps_6_0)
    aengine_add_shader(tonemap_vs shaders/tonemap.hlsl ToneMapVS vs_6_0)
    aengine_add_shader(tonemap_ps shaders/tonemap.hlsl ToneMapPS ps_6_0)
    aengine_add_shader(imgui_vs shaders/imgui.hlsl ImGuiVS vs_6_0)
    aengine_add_shader(imgui_ps shaders/imgui.hlsl ImGuiPS ps_6_0)
    add_custom_target(aengine_shaders ALL DEPENDS ${AENGINE_SHADER_OUTPUTS})

    set(AENGINE_REFERENCE_GLB "${CMAKE_CURRENT_SOURCE_DIR}/content/reference/reference.glb")
    set(AENGINE_REFERENCE_PACKAGE "${CMAKE_CURRENT_SOURCE_DIR}/content/reference/reference.acontent")
    add_custom_command(
        OUTPUT "${AENGINE_REFERENCE_GLB}"
        COMMAND powershell.exe -NoProfile -ExecutionPolicy Bypass
            -File "${CMAKE_CURRENT_SOURCE_DIR}/tools/reference_content/generate_reference.ps1"
        DEPENDS tools/reference_content/generate_reference.ps1
        VERBATIM)
    add_custom_command(
        OUTPUT "${AENGINE_REFERENCE_PACKAGE}"
        COMMAND "$<TARGET_FILE:assetc>" "${AENGINE_REFERENCE_GLB}" "${AENGINE_REFERENCE_PACKAGE}"
        DEPENDS assetc "${AENGINE_REFERENCE_GLB}"
        VERBATIM)
    add_custom_target(aengine_reference_content ALL
        DEPENDS "${AENGINE_REFERENCE_PACKAGE}")

    add_library(aengine_runtime
        engine/application/src/run_application.cpp)
    add_library(AlphaEngine::Runtime ALIAS aengine_runtime)
    target_include_directories(aengine_runtime PUBLIC
        "$<BUILD_INTERFACE:${CMAKE_CURRENT_SOURCE_DIR}/engine/application/include>")
    target_link_libraries(aengine_runtime PUBLIC
        AlphaEngine::Application
        AlphaEngine::Content
        AlphaEngine::DebugUi
        AlphaEngine::GraphicsD3D12
        AlphaEngine::Platform
        AlphaEngine::Renderer
        AlphaEngine::Scene
        nlohmann_json::nlohmann_json
        spdlog::spdlog)
    target_compile_definitions(aengine_runtime PRIVATE
        AENGINE_DEFAULT_SHADER_ROOT="${CMAKE_BINARY_DIR}/shaders/$<CONFIG>")
    aengine_apply_first_party_defaults(aengine_runtime)

    add_executable(alpha_sandbox apps/sandbox/main.cpp)
    target_link_libraries(alpha_sandbox PRIVATE AlphaEngine::Runtime)
    aengine_apply_first_party_defaults(alpha_sandbox)
    add_dependencies(alpha_sandbox aengine_shaders aengine_reference_content)
    aengine_stage_directx_runtime(alpha_sandbox)

    add_executable(alpha_benchmark apps/benchmark/main.cpp)
    target_link_libraries(alpha_benchmark PRIVATE AlphaEngine::Runtime)
    aengine_apply_first_party_defaults(alpha_benchmark)
    add_dependencies(alpha_benchmark aengine_shaders aengine_reference_content)
    aengine_stage_directx_runtime(alpha_benchmark)
endif()

if(AENGINE_BUILD_TESTS)
    include(CTest)
    enable_testing()
    add_subdirectory(tests)
endif()
