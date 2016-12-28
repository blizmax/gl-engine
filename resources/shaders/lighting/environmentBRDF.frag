#version 400 core

in vec2 TexCoords;
in vec3 envMapCoords;
out vec4 colorOutput;


struct LightObject {
    vec3 position;
    vec4 color;
    float radius;
};

float PI  = 3.14159265359f;

// Light source(s) informations
uniform int lightPointCounter = 3;
uniform LightObject lightPointArray[3];

// G-Buffer
uniform sampler2D gPosition;
uniform sampler2D gNormal;
uniform sampler2D gAlbedo;
uniform sampler2D gRoughness;
uniform sampler2D gMetalness;
uniform sampler2D gAO;

uniform sampler2D ssao;
uniform sampler2D envMap;
uniform sampler2D envMapIrradiance;
uniform sampler2D brdfLUT;

uniform int gBufferView;
uniform float materialRoughness;
uniform float materialMetallicity;
uniform float ambientIntensity;
uniform vec3 materialF0;
uniform mat4 view;


float Fd90(float NoL, float roughness);
float KDisneyTerm(float NoL, float NoV, float roughness);
vec3 FresnelSchlick(float NdotV, vec3 F0);
vec3 FresnelSchlick(float NdotV, vec3 F0, float roughness);
float DistributionGGX(vec3 N, vec3 H, float roughness);
float GeometryAttenuationGGXSmith(float NdotL, float NdotV, float roughness);
vec3 colorLinear(vec3 colorVector);
float saturate(float f);
vec2 saturate(vec2 vec);
vec3 saturate(vec3 vec);
vec2 getSphericalCoord(vec3 normalCoord);


void main()
{
    // Retrieve G-Buffer informations
    vec3 worldPos = texture(gPosition, TexCoords).rgb;
    vec3 normal = texture(gNormal, TexCoords).rgb;
    vec3 albedo = colorLinear(texture(gAlbedo, TexCoords).rgb);
    float roughness = texture(gRoughness, TexCoords).r;
    float metalness = texture(gMetalness, TexCoords).r;
    float ao = texture(gAO, TexCoords).r;
    float depth = texture(gPosition, TexCoords).a;

    float ssao = texture(ssao, TexCoords).r;
    vec3 envColor = texture(envMap, getSphericalCoord(normalize(envMapCoords))).rgb;

    vec3 color = vec3(0.0f);
    vec3 diffuse = vec3(0.0f);
    vec3 specular = vec3(0.0f);

    if(depth == 1.0f)
    {
        color = envColor;
    }

    else
    {
        vec3 V = normalize(- worldPos);
        vec3 N = normalize(normal);
        vec3 R = reflect(-V, N);
        vec3 nView = normalize(N * mat3(view));

        float NdotV = saturate(dot(N, V));

        // Fresnel (Schlick) computation (F term)
        vec3 F0 = mix(materialF0, albedo, metalness);
        vec3 F = FresnelSchlick(NdotV, F0, roughness);

        // Energy conservation
        vec3 kS = F;
        vec3 kD = vec3(1.0f) - kS;
        kD *= 1.0f - metalness;

        // Irradiance computation
        vec3 irradiance = texture(envMapIrradiance, getSphericalCoord(nView)).rgb;
        vec3 diffuse  = (albedo * irradiance);


        color = diffuse * kD;
    }


    // Switching between the different buffers
    // Final buffer
    if(gBufferView == 1)
        colorOutput = vec4(color, 1.0f);

    // Position buffer
    else if (gBufferView == 2)
        colorOutput = vec4(worldPos, 1.0f);

    // World Normal buffer
    else if (gBufferView == 3)
        colorOutput = vec4(normal, 1.0f);

    // Color buffer
    else if (gBufferView == 4)
        colorOutput = vec4(albedo, 1.0f);

    // Roughness buffer
    else if (gBufferView == 5)
        colorOutput = vec4(vec3(roughness), 1.0f);

    // Metalness buffer
    else if (gBufferView == 6)
        colorOutput = vec4(vec3(metalness), 1.0f);

    // Depth buffer
    else if (gBufferView == 7)
        colorOutput = vec4(vec3(depth/50.0f), 1.0f);

    // SSAO buffer
    else if (gBufferView == 8)
        colorOutput = vec4(vec3(ssao), 1.0f);
}



float Fd90(float NoL, float roughness)
{
  return (2.0f * NoL * roughness) + 0.4f;
}


float KDisneyTerm(float NoL, float NoV, float roughness)
{
  return (1.0f + Fd90(NoL, roughness) * pow(1.0f - NoL, 5.0f)) * (1.0f + Fd90(NoV, roughness) * pow(1.0f - NoV, 5.0f));
}


vec3 FresnelSchlick(float NdotV, vec3 F0)
{
    return F0 + (1.0f - F0) * pow(1.0f - NdotV, 5.0f);
}


vec3 FresnelSchlick(float NdotV, vec3 F0, float roughness)
{
    return F0 + (max(vec3(1.0f - roughness), F0) - F0) * pow(1.0f - NdotV, 5.0f);
}


float DistributionGGX(vec3 N, vec3 H, float roughness)
{
    float alpha = roughness * roughness;
    float alpha2 = alpha * alpha;

    float NdotH = max(dot(N, H), 0.0f);
    float NdotH2 = NdotH * NdotH;

    return (alpha2) / (PI * (NdotH2 * (alpha2 - 1.0f) + 1.0f) * (NdotH2 * (alpha2 - 1.0f) + 1.0f));
}


float GeometryAttenuationGGXSmith(float NdotL, float NdotV, float roughness)
{
    float NdotL2 = NdotL * NdotL;
    float NdotV2 = NdotV * NdotV;
    float kRough2 = roughness * roughness + 0.0001f;

    float ggxL = (2.0f * NdotL) / (NdotL + sqrt(NdotL2 + kRough2 * (1.0f - NdotL2)));
    float ggxV = (2.0f * NdotV) / (NdotV + sqrt(NdotV2 + kRough2 * (1.0f - NdotV2)));

    return ggxL * ggxV;
}


vec3 colorLinear(vec3 colorVector)
{
  vec3 linearColor = pow(colorVector.rgb, vec3(2.2f));

  return linearColor;
}


float saturate(float f)
{
    return clamp(f, 0.0, 1.0);
}


vec2 saturate(vec2 vec)
{
    return clamp(vec, 0.0, 1.0);
}


vec3 saturate(vec3 vec)
{
    return clamp(vec, 0.0, 1.0);
}


vec2 getSphericalCoord(vec3 normalCoord)
{
    float phi = acos(-normalCoord.y);
    float theta = atan(1.0f * normalCoord.x, -normalCoord.z) + PI;

    return vec2(theta / (2.0f * PI), phi / PI);
}
