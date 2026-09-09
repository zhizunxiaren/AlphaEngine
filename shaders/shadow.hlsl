#include "common/bindings.hlsli"

struct VertexInput {
    float3 position : POSITION;
    float3 normal : NORMAL;
    float4 tangent : TANGENT;
    float2 uv : TEXCOORD0;
};

struct VertexOutput {
    float4 position : SV_Position;
    float2 uv : TEXCOORD0;
};

VertexOutput ShadowVS(VertexInput input) {
    VertexOutput output;
    float4 world = mul(float4(input.position, 1.0), Objects[Draw.objectId].world);
    output.position = mul(world, Pass.lightViewProjection);
    output.uv = input.uv;
    return output;
}

void ShadowPS(VertexOutput input) {
    MaterialGpu material = Materials[Draw.materialId];
    if (material.alphaMode == 1) {
        float alpha = material.baseColorTexture == 0U
            ? material.baseColor.a
            : Textures[material.baseColorTexture].Sample(
                Samplers[material.samplerIndex], input.uv).a * material.baseColor.a;
        clip(alpha - material.alphaCutoff);
    }
}
