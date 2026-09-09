#ifndef AENGINE_PBR_HLSLI
#define AENGINE_PBR_HLSLI

static const float PI = 3.14159265359;

float3 FresnelSchlick(float cosTheta, float3 f0) {
    return f0 + (1.0 - f0) * pow(saturate(1.0 - cosTheta), 5.0);
}

float DistributionGGX(float3 normal, float3 halfway, float roughness) {
    float a = roughness * roughness;
    float a2 = a * a;
    float nh = saturate(dot(normal, halfway));
    float denominator = nh * nh * (a2 - 1.0) + 1.0;
    return a2 / max(PI * denominator * denominator, 1e-5);
}

float GeometrySchlickGGX(float nv, float roughness) {
    float r = roughness + 1.0;
    float k = r * r / 8.0;
    return nv / max(nv * (1.0 - k) + k, 1e-5);
}

float GeometrySmith(float3 normal, float3 view, float3 light, float roughness) {
    return GeometrySchlickGGX(saturate(dot(normal, view)), roughness) *
        GeometrySchlickGGX(saturate(dot(normal, light)), roughness);
}

float3 EvaluateMetallicRoughness(
    float3 baseColor, float metallic, float roughness,
    float3 normal, float3 view, float3 light, float3 radiance) {
    float3 halfway = normalize(view + light);
    float3 f0 = lerp(0.04.xxx, baseColor, metallic);
    float3 fresnel = FresnelSchlick(saturate(dot(halfway, view)), f0);
    float distribution = DistributionGGX(normal, halfway, roughness);
    float geometry = GeometrySmith(normal, view, light, roughness);
    float denominator = max(4.0 * saturate(dot(normal, view)) * saturate(dot(normal, light)), 1e-4);
    float3 specular = distribution * geometry * fresnel / denominator;
    float3 diffuse = (1.0 - fresnel) * (1.0 - metallic) * baseColor / PI;
    return (diffuse + specular) * radiance * saturate(dot(normal, light));
}

#endif
