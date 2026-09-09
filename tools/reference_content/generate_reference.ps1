$ErrorActionPreference = 'Stop'

$referenceDirectory = [System.IO.Path]::GetFullPath(
    [System.IO.Path]::Combine($PSScriptRoot, '..', '..', 'content', 'reference'))
[System.IO.Directory]::CreateDirectory($referenceDirectory) | Out-Null

$binaryStream = [System.IO.MemoryStream]::new()
$binaryWriter = [System.IO.BinaryWriter]::new($binaryStream)

$vertices = @(
    @(-0.72, -0.72, 0.2,  0.0, 0.0, 1.0,  1.0, 0.0, 0.0, 1.0,  0.0, 1.0),
    @( 0.72, -0.72, 0.2,  0.0, 0.0, 1.0,  1.0, 0.0, 0.0, 1.0,  1.0, 1.0),
    @( 0.0,   0.72, 0.2,  0.0, 0.0, 1.0,  1.0, 0.0, 0.0, 1.0,  0.5, 0.0)
)
foreach ($vertex in $vertices) {
    foreach ($component in $vertex) {
        $binaryWriter.Write([single]$component)
    }
}
$binaryWriter.Write([uint32]0)
$binaryWriter.Write([uint32]1)
$binaryWriter.Write([uint32]2)
Add-Type -AssemblyName System.Drawing
$bitmap = [System.Drawing.Bitmap]::new(1, 1)
$bitmap.SetPixel(0, 0, [System.Drawing.Color]::FromArgb(255, 128, 128, 255))
$pngStream = [System.IO.MemoryStream]::new()
$bitmap.Save($pngStream, [System.Drawing.Imaging.ImageFormat]::Png)
$pngBytes = $pngStream.ToArray()
$pngStream.Dispose()
$bitmap.Dispose()
$pngOffset = $binaryStream.Position
$binaryWriter.Write($pngBytes)
while (($binaryStream.Position % 4) -ne 0) {
    $binaryWriter.Write([byte]0)
}
$binaryWriter.Flush()
$binaryBytes = $binaryStream.ToArray()
$binaryWriter.Dispose()
$binaryStream.Dispose()

$nodes = @(
    [ordered]@{ name = 'ReferenceRoot'; children = @(1); translation = @(0.0, 0.0, 0.0) },
    [ordered]@{ name = 'ReferenceTriangle-000'; mesh = 0 }
)
for ($index = 1; $index -lt 100; ++$index) {
    $nodes += [ordered]@{ name = ('ReferenceTriangle-{0:D3}' -f $index); mesh = 0 }
}
$sceneNodes = @(0)
$sceneNodes += 2..100

$gltf = [ordered]@{
    asset = [ordered]@{ version = '2.0'; generator = 'AlphaEngine MVP1 reference generator' }
    scene = 0
    scenes = @([ordered]@{ nodes = $sceneNodes })
    nodes = $nodes
    buffers = @([ordered]@{ byteLength = $binaryBytes.Length })
    bufferViews = @(
        [ordered]@{ buffer = 0; byteOffset = 0; byteLength = 144; byteStride = 48; target = 34962 },
        [ordered]@{ buffer = 0; byteOffset = 144; byteLength = 12; target = 34963 },
        [ordered]@{ buffer = 0; byteOffset = $pngOffset; byteLength = $pngBytes.Length }
    )
    accessors = @(
        [ordered]@{ bufferView = 0; byteOffset = 0; componentType = 5126; count = 3; type = 'VEC3'; min = @(-0.72, -0.72, 0.2); max = @(0.72, 0.72, 0.2) },
        [ordered]@{ bufferView = 0; byteOffset = 12; componentType = 5126; count = 3; type = 'VEC3' },
        [ordered]@{ bufferView = 0; byteOffset = 24; componentType = 5126; count = 3; type = 'VEC4' },
        [ordered]@{ bufferView = 0; byteOffset = 40; componentType = 5126; count = 3; type = 'VEC2' },
        [ordered]@{ bufferView = 1; byteOffset = 0; componentType = 5125; count = 3; type = 'SCALAR'; min = @(0); max = @(2) }
    )
    samplers = @([ordered]@{ magFilter = 9729; minFilter = 9987; wrapS = 10497; wrapT = 10497 })
    images = @(
        [ordered]@{ name = 'BaseColor'; bufferView = 2; mimeType = 'image/png' },
        [ordered]@{ name = 'MetallicRoughness'; bufferView = 2; mimeType = 'image/png' },
        [ordered]@{ name = 'Normal'; bufferView = 2; mimeType = 'image/png' },
        [ordered]@{ name = 'Occlusion'; bufferView = 2; mimeType = 'image/png' },
        [ordered]@{ name = 'Emissive'; bufferView = 2; mimeType = 'image/png' }
    )
    textures = @(
        [ordered]@{ sampler = 0; source = 0 },
        [ordered]@{ sampler = 0; source = 1 },
        [ordered]@{ sampler = 0; source = 2 },
        [ordered]@{ sampler = 0; source = 3 },
        [ordered]@{ sampler = 0; source = 4 }
    )
    materials = @(
        [ordered]@{
            name = 'ReferenceMetal'
            alphaMode = 'OPAQUE'
            pbrMetallicRoughness = [ordered]@{
                baseColorFactor = @(0.8, 0.24, 0.08, 1.0)
                baseColorTexture = [ordered]@{ index = 0 }
                metallicFactor = 0.15
                roughnessFactor = 0.42
                metallicRoughnessTexture = [ordered]@{ index = 1 }
            }
            normalTexture = [ordered]@{ index = 2; scale = 1.0 }
            occlusionTexture = [ordered]@{ index = 3; strength = 1.0 }
            emissiveTexture = [ordered]@{ index = 4 }
            emissiveFactor = @(0.02, 0.01, 0.0)
        },
        [ordered]@{
            name = 'ReferenceMaskedMetal'
            alphaMode = 'MASK'
            alphaCutoff = 0.5
            pbrMetallicRoughness = [ordered]@{
                baseColorFactor = @(0.8, 0.24, 0.08, 1.0)
                baseColorTexture = [ordered]@{ index = 0 }
                metallicFactor = 0.15
                roughnessFactor = 0.42
                metallicRoughnessTexture = [ordered]@{ index = 1 }
            }
            normalTexture = [ordered]@{ index = 2; scale = 1.0 }
            occlusionTexture = [ordered]@{ index = 3; strength = 1.0 }
            emissiveTexture = [ordered]@{ index = 4 }
            emissiveFactor = @(0.02, 0.01, 0.0)
        }
    )
    meshes = @(
        [ordered]@{
            name = 'ReferenceTriangle'
            primitives = @(
                [ordered]@{
                    attributes = [ordered]@{ POSITION = 0; NORMAL = 1; TANGENT = 2; TEXCOORD_0 = 3 }
                    indices = 4
                    material = 0
                    mode = 4
                },
                [ordered]@{
                    attributes = [ordered]@{ POSITION = 0; NORMAL = 1; TANGENT = 2; TEXCOORD_0 = 3 }
                    indices = 4
                    material = 1
                    mode = 4
                }
            )
        }
    )
}

$json = $gltf | ConvertTo-Json -Depth 20 -Compress
$jsonBytes = [System.Text.Encoding]::UTF8.GetBytes($json)
$jsonPadding = (4 - ($jsonBytes.Length % 4)) % 4
if ($jsonPadding -ne 0) {
    $jsonBytes += [byte[]](1..$jsonPadding | ForEach-Object { 0x20 })
}

$glbStream = [System.IO.MemoryStream]::new()
$glbWriter = [System.IO.BinaryWriter]::new($glbStream)
$totalLength = 12 + 8 + $jsonBytes.Length + 8 + $binaryBytes.Length
$glbWriter.Write([uint32]0x46546C67)
$glbWriter.Write([uint32]2)
$glbWriter.Write([uint32]$totalLength)
$glbWriter.Write([uint32]$jsonBytes.Length)
$glbWriter.Write([uint32]0x4E4F534A)
$glbWriter.Write($jsonBytes, 0, $jsonBytes.Length)
$glbWriter.Write([uint32]$binaryBytes.Length)
$glbWriter.Write([uint32]0x004E4942)
$glbWriter.Write($binaryBytes, 0, $binaryBytes.Length)
$glbWriter.Flush()
[System.IO.File]::WriteAllBytes(
    [System.IO.Path]::Combine($referenceDirectory, 'reference.glb'),
    $glbStream.ToArray())
$glbWriter.Dispose()
$glbStream.Dispose()
