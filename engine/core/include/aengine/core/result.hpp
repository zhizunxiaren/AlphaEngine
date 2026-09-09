#pragma once

#include <cassert>
#include <compare>
#include <cstdint>
#include <string>
#include <utility>
#include <variant>

namespace alpha {

enum class ErrorCode : std::uint16_t {
    InvalidArgument = 1,
    InvalidHandle,
    InvalidState,
    UnsupportedCapability,
    UnsupportedAssetFeature,
    OutOfMemory,
    OutOfDescriptors,
    SurfaceChanged,
    SurfaceUnavailable,
    SurfaceLost,
    DeviceLost,
    Timeout,
    BackendFailure,
    AssetCookFailure,
    ShaderCompileFailure,
    PipelineCreationFailure,
    DebugUiUnavailable,
    IoFailure,
};

struct Error {
    ErrorCode code{ErrorCode::InvalidState};
    std::string message;
    std::int64_t native_code{0};

    auto operator<=>(const Error&) const = default;
};

template <typename Value, typename ErrorType = Error>
class [[nodiscard]] Result {
public:
    Result(const Value& value) : storage_(value) {}
    Result(Value&& value) : storage_(std::move(value)) {}
    Result(const ErrorType& error) : storage_(error) {}
    Result(ErrorType&& error) : storage_(std::move(error)) {}

    [[nodiscard]] bool has_value() const noexcept {
        return std::holds_alternative<Value>(storage_);
    }
    explicit operator bool() const noexcept { return has_value(); }

    [[nodiscard]] Value& value() & {
        assert(has_value());
        return std::get<Value>(storage_);
    }
    [[nodiscard]] const Value& value() const& {
        assert(has_value());
        return std::get<Value>(storage_);
    }
    [[nodiscard]] Value&& value() && {
        assert(has_value());
        return std::get<Value>(std::move(storage_));
    }

    [[nodiscard]] ErrorType& error() & {
        assert(!has_value());
        return std::get<ErrorType>(storage_);
    }
    [[nodiscard]] const ErrorType& error() const& {
        assert(!has_value());
        return std::get<ErrorType>(storage_);
    }

private:
    std::variant<Value, ErrorType> storage_;
};

template <typename ErrorType>
class [[nodiscard]] Result<void, ErrorType> {
public:
    Result() = default;
    Result(const ErrorType& error) : error_(error), has_value_(false) {}
    Result(ErrorType&& error) : error_(std::move(error)), has_value_(false) {}

    [[nodiscard]] bool has_value() const noexcept { return has_value_; }
    explicit operator bool() const noexcept { return has_value(); }
    void value() const { assert(has_value_); }

    [[nodiscard]] ErrorType& error() & {
        assert(!has_value_);
        return error_;
    }
    [[nodiscard]] const ErrorType& error() const& {
        assert(!has_value_);
        return error_;
    }

private:
    ErrorType error_{};
    bool has_value_{true};
};

}  // namespace alpha
