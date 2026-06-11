$ErrorActionPreference = "Stop"

$Root = Resolve-Path (Join-Path $PSScriptRoot "..")
$ToolsDir = Join-Path $Root ".android-build-tools"
$JdkDir = Join-Path $ToolsDir "jdk-17"
$GradleDir = Join-Path $ToolsDir "gradle-8.10.2"
$SdkRoot = Join-Path $ToolsDir "android-sdk"
$DownloadsDir = Join-Path $ToolsDir "downloads"
$DistDir = Join-Path $Root "dist\android"
$AndroidProject = Join-Path $Root "mobile\android"

New-Item -ItemType Directory -Force -Path $ToolsDir, $DownloadsDir, $SdkRoot, $DistDir | Out-Null

function Download-File($Url, $Target) {
    if (Test-Path $Target) { return }
    Write-Host "Downloading $Url"
    Invoke-WebRequest -Uri $Url -OutFile $Target
}

function Expand-ZipIfMissing($Zip, $Destination, $Marker) {
    if (Test-Path $Marker) { return }
    $Temp = Join-Path $ToolsDir ("extract-" + [Guid]::NewGuid().ToString("N"))
    New-Item -ItemType Directory -Force -Path $Temp | Out-Null
    Expand-Archive -LiteralPath $Zip -DestinationPath $Temp -Force
    if (Test-Path $Destination) { Remove-Item -LiteralPath $Destination -Recurse -Force }
    New-Item -ItemType Directory -Force -Path (Split-Path $Destination -Parent) | Out-Null
    $Child = Get-ChildItem -LiteralPath $Temp | Select-Object -First 1
    Move-Item -LiteralPath $Child.FullName -Destination $Destination
    Remove-Item -LiteralPath $Temp -Recurse -Force
}

$JdkZip = Join-Path $DownloadsDir "temurin-jdk17.zip"
$GradleZip = Join-Path $DownloadsDir "gradle-8.10.2-bin.zip"
$CmdlineZip = Join-Path $DownloadsDir "commandlinetools-win.zip"

Download-File "https://api.adoptium.net/v3/binary/latest/17/ga/windows/x64/jdk/hotspot/normal/eclipse?project=jdk" $JdkZip
Download-File "https://services.gradle.org/distributions/gradle-8.10.2-bin.zip" $GradleZip
Download-File "https://dl.google.com/android/repository/commandlinetools-win-11076708_latest.zip" $CmdlineZip

Expand-ZipIfMissing $JdkZip $JdkDir (Join-Path $JdkDir "bin\java.exe")
Expand-ZipIfMissing $GradleZip $GradleDir (Join-Path $GradleDir "bin\gradle.bat")

$CmdlineLatest = Join-Path $SdkRoot "cmdline-tools\latest"
if (!(Test-Path (Join-Path $CmdlineLatest "bin\sdkmanager.bat"))) {
    $TempCmd = Join-Path $ToolsDir "cmdline-temp"
    if (Test-Path $TempCmd) { Remove-Item -LiteralPath $TempCmd -Recurse -Force }
    New-Item -ItemType Directory -Force -Path $TempCmd | Out-Null
    Expand-Archive -LiteralPath $CmdlineZip -DestinationPath $TempCmd -Force
    if (Test-Path $CmdlineLatest) { Remove-Item -LiteralPath $CmdlineLatest -Recurse -Force }
    New-Item -ItemType Directory -Force -Path (Split-Path $CmdlineLatest -Parent) | Out-Null
    Move-Item -LiteralPath (Join-Path $TempCmd "cmdline-tools") -Destination $CmdlineLatest
    Remove-Item -LiteralPath $TempCmd -Recurse -Force
}

$env:JAVA_HOME = $JdkDir
$env:ANDROID_HOME = $SdkRoot
$env:ANDROID_SDK_ROOT = $SdkRoot
$env:GRADLE_USER_HOME = Join-Path $ToolsDir "gradle-home"
$env:Path = "$JdkDir\bin;$SdkRoot\cmdline-tools\latest\bin;$SdkRoot\platform-tools;$GradleDir\bin;$env:Path"

$SdkManager = Join-Path $SdkRoot "cmdline-tools\latest\bin\sdkmanager.bat"
Write-Host "Accepting Android SDK licenses"
(1..80 | ForEach-Object { "y" }) | & $SdkManager --licenses | Out-Host

Write-Host "Installing Android SDK packages"
& $SdkManager "platform-tools" "platforms;android-35" "build-tools;35.0.0" | Out-Host

$LocalProperties = Join-Path $AndroidProject "local.properties"
"sdk.dir=$($SdkRoot.Replace('\', '\\'))" | Set-Content -LiteralPath $LocalProperties -Encoding ASCII

$DrawableDir = Join-Path $AndroidProject "app\src\main\res\drawable"
New-Item -ItemType Directory -Force -Path $DrawableDir | Out-Null
Copy-Item -LiteralPath (Join-Path $Root "app\static\assets\g2-logo-192.png") -Destination (Join-Path $DrawableDir "g2_logo_192.png") -Force

Push-Location $AndroidProject
try {
    & (Join-Path $GradleDir "bin\gradle.bat") --no-daemon assembleDebug
}
finally {
    Pop-Location
}

$ApkSource = Join-Path $AndroidProject "app\build\outputs\apk\debug\app-debug.apk"
$ApkTarget = Join-Path $DistDir "stroitelnyi-kontur-debug.apk"
Copy-Item -LiteralPath $ApkSource -Destination $ApkTarget -Force
Write-Host "APK ready: $ApkTarget"
