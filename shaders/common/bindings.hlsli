#ifndef AENGINE_BINDINGS_HLSLI
#define AENGINE_BINDINGS_HLSLI

struct DrawRootConstants {
    uint objectId;
    uint materialId;
    uint drawId;
    uint flags;
};

struct FrameConstants {
    row_major float4x4 viewProjection;
    float3 cameraPosition;
    float exposure;
};

struct PassConstants {
    row_major float4x4 lightViewProjection;
    float3 lightDirection;
    float lightIntensity;
    float3 lightColor;
    uint pointLightCount;
    float4 pointPositionIntensity[4];
    float4 pointColor[4];
};

struct ObjectGpu { row_major float4x4 world; };
struct MaterialGpu {
    float4 baseColor;
    float3 emissive;
    float metallic;
    float roughness;
    float normalScale;
    float occlusionStrength;
    float alphaCutoff;
    uint baseColorTexture;
    uint metallicRoughnessTexture;
    uint normalTexture;
    uint occlusionTexture;
    uint emissiveTexture;
    uint samplerIndex;
    uint alphaMode;
    uint flags;
};

ConstantBuffer<DrawRootConstants> Draw : register(b0, space0);
ConstantBuffer<FrameConstants> Frame : register(b1, space0);
ConstantBuffer<PassConstants> Pass : register(b2, space0);
StructuredBuffer<ObjectGpu> Objects : register(t0, space0);
StructuredBuffer<MaterialGpu> Materials : register(t1, space0);
Texture2D<float> ShadowMap : register(t3, space0);
Texture2D<float4> Textures[] : register(t0, space1);
SamplerState Samplers[] : register(s0, space2);

#endif
