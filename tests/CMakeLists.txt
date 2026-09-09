add_executable(aengine_unit_tests
    test_main.cpp
    unit/core_tests.cpp
    unit/graphics_trace_tests.cpp
    unit/render_graph_tests.cpp
    unit/scene_renderer_tests.cpp)

if(TARGET aengine_application)
    target_sources(aengine_unit_tests PRIVATE
        unit/content_tests.cpp
        unit/d3d12_graphics_tests.cpp
        unit/debug_ui_tests.cpp
        unit/run_config_tests.cpp
        unit/shader_package_tests.cpp)
    target_link_libraries(aengine_unit_tests PRIVATE
        AlphaEngine::Application
        AlphaEngine::Content
        AlphaEngine::DebugUi
        AlphaEngine::GraphicsD3D12)
    target_link_libraries(aengine_unit_tests PRIVATE AlphaEngine::Shader)
    aengine_stage_directx_runtime(aengine_unit_tests)
endif()

target_include_directories(aengine_unit_tests PRIVATE "${CMAKE_CURRENT_SOURCE_DIR}")
target_compile_definitions(aengine_unit_tests PRIVATE AENGINE_TEST_CONTRACT_VERSION=13)
target_link_libraries(aengine_unit_tests PRIVATE
    AlphaEngine::Core
    AlphaEngine::Graphics
    AlphaEngine::RenderGraph
    AlphaEngine::Renderer
    AlphaEngine::Scene)
aengine_apply_first_party_defaults(aengine_unit_tests)

add_test(NAME aengine.unit COMMAND aengine_unit_tests)

if(TARGET alpha_benchmark)
    add_test(
        NAME aengine.d3d12.smoke
        COMMAND alpha_benchmark
            "${CMAKE_SOURCE_DIR}/config/benchmark.json"
            --frames 3
            --warp
            --output "${CMAKE_BINARY_DIR}/test-runs")
    set_tests_properties(aengine.d3d12.smoke PROPERTIES
        WORKING_DIRECTORY "${CMAKE_SOURCE_DIR}"
        TIMEOUT 30)
    add_test(
        NAME aengine.d3d12.ui-smoke
        COMMAND alpha_sandbox
            "${CMAKE_SOURCE_DIR}/config/sandbox.json"
            --headless
            --frames 2
            --warp
            --output "${CMAKE_BINARY_DIR}/test-runs-ui")
    set_tests_properties(aengine.d3d12.ui-smoke PROPERTIES
        WORKING_DIRECTORY "${CMAKE_SOURCE_DIR}"
        TIMEOUT 30)
endif()
