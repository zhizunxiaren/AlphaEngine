include_guard(GLOBAL)

set(AENGINE_AGILITY_VERSION "1.619.5")
set(AENGINE_AGILITY_SDK_VERSION 619)
set(AENGINE_DXC_VERSION "1.9.2607.13")

set(_aengine_package_cache "${CMAKE_SOURCE_DIR}/.cache/nuget")
set(_aengine_package_root "${CMAKE_BINARY_DIR}/directx-packages")
file(MAKE_DIRECTORY "${_aengine_package_cache}" "${_aengine_package_root}")

function(_aengine_acquire_nuget name version sha256 output_variable)
    set(archive "${_aengine_package_cache}/${name}.${version}.zip")
    if(EXISTS "${archive}")
        file(SHA256 "${archive}" actual_hash)
        string(TOUPPER "${actual_hash}" actual_hash)
        string(TOUPPER "${sha256}" expected_hash)
        if(NOT actual_hash STREQUAL expected_hash)
            message(FATAL_ERROR "Integrity check failed for ${archive}")
        endif()
    else()
        file(DOWNLOAD
            "https://www.nuget.org/api/v2/package/${name}/${version}"
            "${archive}"
            EXPECTED_HASH "SHA256=${sha256}"
            TLS_VERIFY ON
            SHOW_PROGRESS)
    endif()

    set(extract_root "${_aengine_package_root}/${name}-${version}")
    if(NOT EXISTS "${extract_root}/.aengine-extracted")
        file(MAKE_DIRECTORY "${extract_root}")
        file(ARCHIVE_EXTRACT INPUT "${archive}" DESTINATION "${extract_root}")
        file(TOUCH "${extract_root}/.aengine-extracted")
    endif()
    set(${output_variable} "${extract_root}" PARENT_SCOPE)
endfunction()

_aengine_acquire_nuget(
    "Microsoft.Direct3D.D3D12"
    "${AENGINE_AGILITY_VERSION}"
    "0E9BCF32AAC9A79343EDE9B21E4864950EE54577E3D8E19BFCDF002BB4E9BFD6"
    AENGINE_AGILITY_ROOT)
_aengine_acquire_nuget(
    "Microsoft.Direct3D.DXC"
    "${AENGINE_DXC_VERSION}"
    "5D6ACD23089B2979A3C1D39B7E31227DA989A47B5D9F3DB57111AD4717EA537E"
    AENGINE_DXC_ROOT)

add_library(aengine_agility_sdk INTERFACE)
add_library(AlphaEngine::AgilitySDK ALIAS aengine_agility_sdk)
target_include_directories(aengine_agility_sdk SYSTEM INTERFACE
    "${AENGINE_AGILITY_ROOT}/build/native/include")

add_library(aengine_dxc SHARED IMPORTED GLOBAL)
add_library(AlphaEngine::DXC ALIAS aengine_dxc)
set_target_properties(aengine_dxc PROPERTIES
    IMPORTED_IMPLIB "${AENGINE_DXC_ROOT}/build/native/lib/x64/dxcompiler.lib"
    IMPORTED_LOCATION "${AENGINE_DXC_ROOT}/build/native/bin/x64/dxcompiler.dll"
    INTERFACE_INCLUDE_DIRECTORIES "${AENGINE_DXC_ROOT}/build/native/include")

set(AENGINE_DXC_EXECUTABLE
    "${AENGINE_DXC_ROOT}/build/native/bin/x64/dxc.exe"
    CACHE FILEPATH "Pinned DXC executable" FORCE)

function(aengine_stage_directx_runtime target)
    add_custom_command(TARGET ${target} POST_BUILD
        COMMAND "${CMAKE_COMMAND}" -E make_directory "$<TARGET_FILE_DIR:${target}>/D3D12"
        COMMAND "${CMAKE_COMMAND}" -E copy_if_different
            "${AENGINE_AGILITY_ROOT}/build/native/bin/x64/D3D12Core.dll"
            "$<TARGET_FILE_DIR:${target}>/D3D12/D3D12Core.dll"
        COMMAND "${CMAKE_COMMAND}" -E copy_if_different
            "${AENGINE_AGILITY_ROOT}/build/native/bin/x64/d3d12SDKLayers.dll"
            "$<TARGET_FILE_DIR:${target}>/D3D12/d3d12SDKLayers.dll"
        COMMAND "${CMAKE_COMMAND}" -E copy_if_different
            "${AENGINE_DXC_ROOT}/build/native/bin/x64/dxcompiler.dll"
            "${AENGINE_DXC_ROOT}/build/native/bin/x64/dxil.dll"
            "$<TARGET_FILE_DIR:${target}>"
        VERBATIM)
endfunction()
