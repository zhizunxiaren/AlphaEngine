Texture2D<float4> SceneColor : register(t0, space0);
SamplerState LinearSampler : register(s0, space0);

struct FullscreenOutput { float4 position : SV_Position; float2 uv : TEXCOORD0; };

FullscreenOutput ToneMapVS(uint id : SV_VertexID) {
    FullscreenOutput output;
    output.uv = float2((id << 1) & 2, id & 2);
    output.position = float4(output.uv * float2(2.0, -2.0) + float2(-1.0, 1.0), 0.0, 1.0);
    return output;
}

float3 AcesFitted(float3 color) {
    const float a = 2.51;
    const float b = 0.03;
    const float c = 2.43;
    const float d = 0.59;
    const float e = 0.14;
    return saturate((color * (a * color + b)) / (color * (c * color + d) + e));
}

float4 ToneMapPS(FullscreenOutput input) : SV_Target0 {
    float3 mapped = AcesFitted(SceneColor.Sample(LinearSampler, input.uv).rgb);
    float3 srgb = select(mapped <= 0.0031308, mapped * 12.92, 1.055 * pow(mapped, 1.0 / 2.4) - 0.055);
    return float4(srgb, 1.0);
}
