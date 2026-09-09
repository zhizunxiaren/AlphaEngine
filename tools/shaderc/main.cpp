#define NOMINMAX
#include <aengine/content/content.hpp>

#include <Windows.h>

#include <dxcapi.h>
#include <wrl/client.h>

#include <nlohmann/json.hpp>

#include <cstddef>
#include <filesystem>
#include <fstream>
#include <iostream>
#include <string>
#include <string_view>
#include <vector>

namespace {

using Microsoft::WRL::ComPtr;

[[nodiscard]] std::wstring widen(std::string_view text) {
    const int count = MultiByteToWideChar(
        CP_UTF8, 0, text.data(), static_cast<int>(text.size()), nullptr, 0);
    std::wstring output(static_cast<std::size_t>(count), L'\0');
    MultiByteToWideChar(
        CP_UTF8, 0, text.data(), static_cast<int>(text.size()), output.data(), count);
    return output;
}

[[nodiscard]] std::string hash_hex(const alpha::content::ContentHash& hash) {
    constexpr char digits[] = "0123456789abcdef";
    std::string output;
    output.reserve(hash.size() * 2U);
    for (const std::byte value : hash) {
        const auto byte = std::to_integer<unsigned int>(value);
        output.push_back(digits[byte >> 4U]);
        output.push_back(digits[byte & 0xFU]);
    }
    return output;
}

struct Arguments {
    std::filesystem::path input;
    std::filesystem::path output;
    std::filesystem::path metadata;
    std::string entry;
    std::string profile;
};

[[nodiscard]] bool parse_arguments(int argc, char** argv, Arguments& result) {
    for (int index = 1; index + 1 < argc; index += 2) {
        const std::string_view name = argv[index];
        const std::string value = argv[index + 1];
        if (name == "--input") result.input = value;
        else if (name == "--output") result.output = value;
        else if (name == "--metadata") result.metadata = value;
        else if (name == "--entry") result.entry = value;
        else if (name == "--profile") result.profile = value;
        else return false;
    }
    return !result.input.empty() && !result.output.empty() && !result.metadata.empty() &&
        !result.entry.empty() && !result.profile.empty();
}

}  // namespace

int main(int argc, char** argv) {
    Arguments arguments;
    if (!parse_arguments(argc, argv, arguments)) {
        std::cerr << "usage: shaderc --input file --entry name --profile profile --output file --metadata file\n";
        return 2;
    }

    ComPtr<IDxcUtils> utils;
    ComPtr<IDxcCompiler3> compiler;
    HRESULT result = DxcCreateInstance(CLSID_DxcUtils, IID_PPV_ARGS(&utils));
    if (SUCCEEDED(result)) {
        result = DxcCreateInstance(CLSID_DxcCompiler, IID_PPV_ARGS(&compiler));
    }
    if (FAILED(result)) {
        std::cerr << "shaderc: cannot initialize pinned DXC\n";
        return 3;
    }

    ComPtr<IDxcBlobEncoding> source;
    result = utils->LoadFile(arguments.input.c_str(), nullptr, &source);
    if (FAILED(result)) {
        std::cerr << "shaderc: cannot read source\n";
        return 4;
    }
    const DxcBuffer buffer{source->GetBufferPointer(), source->GetBufferSize(), DXC_CP_UTF8};
    const std::wstring entry = widen(arguments.entry);
    const std::wstring profile = widen(arguments.profile);
    const std::wstring include_directory = arguments.input.parent_path().wstring();
    std::vector<LPCWSTR> compiler_arguments{
        L"-E", entry.c_str(),
        L"-T", profile.c_str(),
        L"-I", include_directory.c_str(),
        L"-HV", L"2021",
        L"-Ges",
        L"-WX",
        L"-Qstrip_debug",
    };
    ComPtr<IDxcIncludeHandler> include_handler;
    utils->CreateDefaultIncludeHandler(&include_handler);
    ComPtr<IDxcResult> compilation;
    result = compiler->Compile(
        &buffer,
        compiler_arguments.data(),
        static_cast<UINT32>(compiler_arguments.size()),
        include_handler.Get(),
        IID_PPV_ARGS(&compilation));
    if (FAILED(result)) {
        std::cerr << "shaderc: DXC invocation failed\n";
        return 5;
    }
    HRESULT status = E_FAIL;
    compilation->GetStatus(&status);
    ComPtr<IDxcBlobUtf8> errors;
    compilation->GetOutput(DXC_OUT_ERRORS, IID_PPV_ARGS(&errors), nullptr);
    if (errors && errors->GetStringLength() != 0U) {
        std::cerr.write(errors->GetStringPointer(), static_cast<std::streamsize>(errors->GetStringLength()));
    }
    if (FAILED(status)) {
        return 6;
    }

    ComPtr<IDxcBlob> object;
    compilation->GetOutput(DXC_OUT_OBJECT, IID_PPV_ARGS(&object), nullptr);
    std::filesystem::create_directories(arguments.output.parent_path());
    std::ofstream output(arguments.output, std::ios::binary | std::ios::trunc);
    output.write(
        static_cast<const char*>(object->GetBufferPointer()),
        static_cast<std::streamsize>(object->GetBufferSize()));
    if (!output) {
        std::cerr << "shaderc: cannot write DXIL\n";
        return 7;
    }

    const auto hash = alpha::content::sha256(std::span{
        static_cast<const std::byte*>(object->GetBufferPointer()),
        object->GetBufferSize()});
    if (!hash) {
        std::cerr << "shaderc: cannot hash DXIL\n";
        return 8;
    }
    const nlohmann::json metadata{
        {"schema_version", 1},
        {"binding_layout_version", 2},
        {"matrix_layout", "row_major"},
        {"dxc_version", "1.9.2607.13"},
        {"source", arguments.input.generic_string()},
        {"entry", arguments.entry},
        {"profile", arguments.profile},
        {"dxil_sha256", hash_hex(hash.value())},
        {"root_signature", "1.1"},
        {"spaces", {
            {"space0", {"b0 DrawRootConstants", "b1 FrameConstants", "b2 PassConstants", "t0 ObjectTable", "t1 MaterialTable", "t2 LightTable", "t3 ShadowMap"}},
            {"space1", "Texture2D[]"},
            {"space2", "Sampler[]"},
        }},
    };
    std::ofstream metadata_output(arguments.metadata, std::ios::trunc);
    metadata_output << metadata.dump(2);
    return metadata_output ? 0 : 9;
}
