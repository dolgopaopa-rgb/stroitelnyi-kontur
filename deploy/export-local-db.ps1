$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$source = Join-Path $root "app\construction.db"
$backupDir = Join-Path $root "data\backups"

if (!(Test-Path $source)) {
  throw "Local database not found: $source"
}

New-Item -ItemType Directory -Force -Path $backupDir | Out-Null
$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$target = Join-Path $backupDir "local-export-$timestamp.db"
Copy-Item -Path $source -Destination $target
Write-Host "Local database exported to $target"
