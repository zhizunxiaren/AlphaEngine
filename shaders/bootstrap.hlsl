#include "common/pbr.hlsli"

struct BootstrapVertex {
    float4 position : SV_Position;
    float3 worldPosition : POSITION0;
    float3 normal : NORMAL;
};

BootstrapVertex BootstrapVS(uint id : SV_VertexID) {
    static const float3 positions[3] = {
        float3(-0.72, -0.72, 0.2),
        float3( 0.00,  0.72, 0.2),
        float3( 0.72, -0.72, 0.2)
    };
    BootstrapVertex output;
    output.position = float4(positions[id], 1.0);
    output.worldPosition = positions[id];
    output.normal = float3(0.0, 0.0, 1.0);
    return output;
}

float4 BootstrapPS(BootstrapVertex input) : SV_Target0 {
    const float3 baseColor = float3(0.8, 0.24, 0.08);
    const float3 view = normalize(float3(0.0, 0.0, 3.0) - input.worldPosition);
    const float3 light = normalize(float3(-0.35, 0.65, 0.8));
    const float3 radiance = float3(5.0, 4.7, 4.3);
    const float3 lit = EvaluateMetallicRoughness(
        baseColor, 0.15, 0.42, normalize(input.normal), view, light, radiance);
    return float4(lit, 1.0);
}
