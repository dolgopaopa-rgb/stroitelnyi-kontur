$ErrorActionPreference = "Stop"

$Root = Resolve-Path (Join-Path $PSScriptRoot "..")
$ToolsDir = Join-Path $Root ".web-build-tools"
$DownloadsDir = Join-Path $ToolsDir "downloads"
$EsbuildVersion = "0.28.1"
$EsbuildPackage = "@esbuild/win32-x64"
$EsbuildArchive = Join-Path $DownloadsDir "esbuild-win32-x64-$EsbuildVersion.tgz"
$EsbuildDir = Join-Path $ToolsDir "esbuild-$EsbuildVersion"
$EsbuildExe = Join-Path $EsbuildDir "package\esbuild.exe"
$Source = Join-Path $Root "app\static\app.js"
$Target = Join-Path $Root "app\static\app.compat.js"

New-Item -ItemType Directory -Force -Path $ToolsDir, $DownloadsDir | Out-Null

if (!(Test-Path $EsbuildArchive)) {
    $Url = "https://registry.npmjs.org/$EsbuildPackage/-/win32-x64-$EsbuildVersion.tgz"
    Write-Host "Downloading esbuild $EsbuildVersion"
    Invoke-WebRequest -Uri $Url -OutFile $EsbuildArchive
}

if (!(Test-Path $EsbuildExe)) {
    $Temp = Join-Path $ToolsDir ("extract-" + [Guid]::NewGuid().ToString("N"))
    New-Item -ItemType Directory -Force -Path $Temp | Out-Null
    tar -xzf $EsbuildArchive -C $Temp
    if (Test-Path $EsbuildDir) {
        Remove-Item -LiteralPath $EsbuildDir -Recurse -Force
    }
    New-Item -ItemType Directory -Force -Path $EsbuildDir | Out-Null
    Move-Item -LiteralPath (Join-Path $Temp "package") -Destination $EsbuildDir
    Remove-Item -LiteralPath $Temp -Recurse -Force
}

& $EsbuildExe $Source `
    --bundle `
    --format=iife `
    --target=chrome58 `
    --charset=utf8 `
    --legal-comments=none `
    --outfile=$Target

Write-Host "Compat bundle ready: $Target"
