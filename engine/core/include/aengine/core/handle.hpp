#pragma once

#include <compare>
#include <cstdint>
#include <functional>

namespace alpha {

template <typename Tag>
class Handle {
public:
    using RawType = std::uint64_t;

    constexpr Handle() noexcept = default;

    [[nodiscard]] static constexpr Handle from_parts(
        std::uint32_t index,
        std::uint32_t generation) noexcept {
        return Handle{
            (static_cast<RawType>(generation) << 32U) |
            static_cast<RawType>(index)};
    }

    [[nodiscard]] static constexpr Handle from_raw(RawType raw) noexcept {
        return Handle{raw};
    }

    [[nodiscard]] constexpr bool valid() const noexcept { return raw_ != 0U; }
    [[nodiscard]] constexpr std::uint32_t index() const noexcept {
        return static_cast<std::uint32_t>(raw_ & 0xFFFF'FFFFULL);
    }
    [[nodiscard]] constexpr std::uint32_t generation() const noexcept {
        return static_cast<std::uint32_t>(raw_ >> 32U);
    }
    [[nodiscard]] constexpr RawType raw() const noexcept { return raw_; }

    constexpr explicit operator bool() const noexcept { return valid(); }
    constexpr auto operator<=>(const Handle&) const noexcept = default;

private:
    explicit constexpr Handle(RawType raw) noexcept : raw_(raw) {}
    RawType raw_{0U};
};

}  // namespace alpha

template <typename Tag>
struct std::hash<alpha::Handle<Tag>> {
    std::size_t operator()(const alpha::Handle<Tag>& handle) const noexcept {
        return std::hash<std::uint64_t>{}(handle.raw());
    }
};
