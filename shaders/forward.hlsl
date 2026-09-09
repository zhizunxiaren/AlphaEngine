#include "common/bindings.hlsli"
#include "common/pbr.hlsli"

struct VertexInput {
    float3 position : POSITION;
    float3 normal : NORMAL;
    float4 tangent : TANGENT;
    float2 uv : TEXCOORD0;
};

struct VertexOutput {
    float4 position : SV_Position;
    float3 worldPosition : POSITION0;
    float3 normal : NORMAL;
    float4 tangent : TANGENT;
    float2 uv : TEXCOORD0;
    float4 shadowPosition : TEXCOORD1;
};

VertexOutput ForwardVS(VertexInput input) {
    VertexOutput output;
    float4x4 worldMatrix = Objects[Draw.objectId].world;
    float4 world = mul(float4(input.position, 1.0), worldMatrix);
    output.position = mul(world, Frame.viewProjection);
    output.worldPosition = world.xyz;
    output.normal = normalize(mul(float4(input.normal, 0.0), worldMatrix).xyz);
    output.tangent = float4(
        normalize(mul(float4(input.tangent.xyz, 0.0), worldMatrix).xyz),
        input.tangent.w);
    output.uv = input.uv;
    output.shadowPosition = mul(world, Pass.lightViewProjection);
    return output;
}

float DirectionalShadow(float4 shadowPosition) {
    float3 projected = shadowPosition.xyz / max(shadowPosition.w, 0.00001);
    float2 uv = projected.xy * float2(0.5, -0.5) + 0.5;
    if (any(uv < 0.0) || any(uv > 1.0) || projected.z < 0.0 || projected.z > 1.0) {
        return 1.0;
    }
    uint width;
    uint height;
    ShadowMap.GetDimensions(width, height);
    const float2 texel = 1.0 / float2(width, height);
    float visible = 0.0;
    [unroll]
    for (int y = -1; y <= 1; ++y) {
        [unroll]
        for (int x = -1; x <= 1; ++x) {
            const float depth = ShadowMap.SampleLevel(
                Samplers[0], uv + float2(x, y) * texel, 0.0);
            visible += projected.z - 0.0015 <= depth ? 1.0 : 0.0;
        }
    }
    return visible / 9.0;
}

float4 ForwardPS(VertexOutput input) : SV_Target0 {
    MaterialGpu material = Materials[Draw.materialId];
    float4 sampledBase = material.baseColorTexture == 0U
        ? material.baseColor
        : Textures[material.baseColorTexture].Sample(
            Samplers[material.samplerIndex], input.uv) * material.baseColor;
    if (material.alphaMode == 1) clip(sampledBase.a - material.alphaCutoff);
    const float4 metallicRoughness = material.metallicRoughnessTexture == 0U
        ? 1.0
        : Textures[material.metallicRoughnessTexture].Sample(
            Samplers[material.samplerIndex], input.uv);
    const float3 tangentNormal = material.normalTexture == 0U
        ? float3(0.0, 0.0, 1.0)
        : Textures[material.normalTexture].Sample(
            Samplers[material.samplerIndex], input.uv).xyz * 2.0 - 1.0;
    const float3 tangent = normalize(input.tangent.xyz);
    const float3 bitangent = normalize(cross(input.normal, tangent)) * input.tangent.w;
    const float3 normal = normalize(
        tangent * tangentNormal.x * material.normalScale +
        bitangent * tangentNormal.y * material.normalScale +
        normalize(input.normal) * tangentNormal.z);
    float3 view = normalize(Frame.cameraPosition - input.worldPosition);
    float3 light = normalize(-Pass.lightDirection);
    float3 radiance = Pass.lightColor * Pass.lightIntensity;
    float3 color = EvaluateMetallicRoughness(
        sampledBase.rgb,
        material.metallic * metallicRoughness.b,
        max(material.roughness * metallicRoughness.g, 0.045),
        normal, view, light, radiance) * DirectionalShadow(input.shadowPosition);
    [loop]
    for (uint index = 0; index < min(Pass.pointLightCount, 4U); ++index) {
        const float3 toLight = Pass.pointPositionIntensity[index].xyz - input.worldPosition;
        const float distanceSquared = max(dot(toLight, toLight), 0.01);
        color += EvaluateMetallicRoughness(
            sampledBase.rgb,
            material.metallic * metallicRoughness.b,
            max(material.roughness * metallicRoughness.g, 0.045),
            normal,
            view,
            normalize(toLight),
            Pass.pointColor[index].rgb *
                (Pass.pointPositionIntensity[index].w / distanceSquared));
    }
    const float occlusion = material.occlusionTexture == 0U
        ? 1.0
        : Textures[material.occlusionTexture].Sample(
            Samplers[material.samplerIndex], input.uv).r;
    color *= lerp(1.0, occlusion, material.occlusionStrength);
    const float3 emissive = material.emissiveTexture == 0U
        ? material.emissive
        : Textures[material.emissiveTexture].Sample(
            Samplers[material.samplerIndex], input.uv).rgb * material.emissive;
    return float4(color + emissive + sampledBase.rgb * 0.02, 1.0);
}
