$ErrorActionPreference = 'Stop'

$toolRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$bundleRoot = Join-Path $toolRoot 'node_modules\@colbymchenry\codegraph-win32-x64'
$nodeExe = Join-Path $bundleRoot 'node.exe'
$entryPoint = Join-Path $bundleRoot 'lib\dist\bin\codegraph.js'

if (-not (Test-Path -LiteralPath $nodeExe) -or -not (Test-Path -LiteralPath $entryPoint)) {
    throw 'Project-local CodeGraph bundle is missing. Run npm install --ignore-scripts in .codex/tools/codegraph.'
}

$env:DO_NOT_TRACK = '1'
$env:CODEGRAPH_NO_UPDATE_CHECK = '1'
$env:CODEGRAPH_NO_DOWNLOAD = '1'

& $nodeExe --liftoff-only --disable-warning=ExperimentalWarning $entryPoint @args
exit $LASTEXITCODE
