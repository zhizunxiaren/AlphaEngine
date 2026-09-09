cbuffer ImGuiConstants : register(b0, space0) { float4x4 Projection; };
Texture2D<float4> UiTextures[] : register(t0, space1);
SamplerState UiSamplers[] : register(s0, space2);

struct UiInput { float2 position : POSITION; float2 uv : TEXCOORD0; float4 color : COLOR0; };
struct UiOutput { float4 position : SV_Position; float2 uv : TEXCOORD0; float4 color : COLOR0; };

UiOutput ImGuiVS(UiInput input) {
    UiOutput output;
    output.position = mul(float4(input.position, 0.0, 1.0), Projection);
    output.uv = input.uv;
    output.color = input.color;
    return output;
}

float4 ImGuiPS(UiOutput input) : SV_Target0 {
    return input.color * UiTextures[0].Sample(UiSamplers[0], input.uv);
}
