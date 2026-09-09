#include "test_support.hpp"

#include <aengine/core/handle.hpp>
#include <aengine/core/result.hpp>

namespace {

struct TextureTag;
using TextureHandle = alpha::Handle<TextureTag>;

ALPHA_TEST("typed handle preserves index and generation") {
    const auto handle = TextureHandle::from_parts(42U, 7U);

    ALPHA_REQUIRE(handle.valid());
    ALPHA_REQUIRE_EQ(handle.index(), 42U);
    ALPHA_REQUIRE_EQ(handle.generation(), 7U);
}

ALPHA_TEST("result exposes either value or structured error") {
    const alpha::Result<int> success = 17;
    const alpha::Result<int> failure = alpha::Error{
        alpha::ErrorCode::InvalidState, "frame already consumed"};

    ALPHA_REQUIRE(success.has_value());
    ALPHA_REQUIRE_EQ(success.value(), 17);
    ALPHA_REQUIRE(!failure.has_value());
    ALPHA_REQUIRE_EQ(failure.error().code, alpha::ErrorCode::InvalidState);
}

}  // namespace
