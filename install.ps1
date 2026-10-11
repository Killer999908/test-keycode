# ============================================================================
#  KEYCODE Agent CLI — Windows installer (PowerShell 5.1+ / pwsh)
#  From PowerShell:
#    irm <origin>/install.ps1 | iex
#  Or download and run:  powershell -ExecutionPolicy Bypass -File install.ps1
#  Requires Node.js 18+ — installed automatically via winget if missing.
# ============================================================================
$ErrorActionPreference = 'Stop'

# Server URL: env override > public origin injected by /install.ps1.
$BaseUrl = $env:KEYCODE_URL
if (-not $BaseUrl) { $BaseUrl = '__KEYCODE_URL__' }
$BaseUrl = $BaseUrl.TrimEnd('/')

$BinDir = if ($env:KEYCODE_BIN_DIR) { $env:KEYCODE_BIN_DIR } else { Join-Path $env:USERPROFILE '.keycode\bin' }
New-Item -ItemType Directory -Force -Path $BinDir | Out-Null

function Test-NodeOk {
  try {
    $major = [int](& node -p 'process.versions.node.split(".")[0]' 2>$null)
    return ($major -ge 18)
  } catch { return $false }
}

# ---- Node.js 18+ check (auto-install via winget when missing) ---------------
if (-not (Test-NodeOk)) {
  Write-Host '⠿ Node.js 18+ not found — installing via winget ...' -ForegroundColor Cyan
  $hadWinget = Get-Command winget -ErrorAction SilentlyContinue
  if ($hadWinget) {
    winget install --id OpenJS.NodeJS.LTS --silent --accept-package-agreements --accept-source-agreements
    # refresh PATH for the current session
    $env:Path = [System.Environment]::GetEnvironmentVariable('Path','Machine') + ';' + [System.Environment]::GetEnvironmentVariable('Path','User')
    if (-not (Test-NodeOk)) {
      Write-Host '✗ Node.js installed but not visible yet — close and reopen PowerShell, then re-run this installer.' -ForegroundColor Yellow
      exit 1
    }
  } else {
    Write-Host '✗ Node.js 18+ is required.' -ForegroundColor Red
    Write-Host '  Install it from  https://nodejs.org  then re-run this installer.' -ForegroundColor Yellow
    Write-Host '  (winget not available on this system.)' -ForegroundColor Yellow
    exit 1
  }
}

# ---- Download CLI -----------------------------------------------------------
Write-Host "⠿ Downloading KEYCODE agent CLI from $BaseUrl ..."
$CliPath = Join-Path $BinDir 'keycode.ps1'
$TmpPath = Join-Path $BinDir 'keycode.tmp'
try {
  Invoke-WebRequest -Uri "$BaseUrl/api/cli/download" -OutFile $TmpPath -UseBasicParsing
} catch {
  Write-Host "✗ Download failed: $_" -ForegroundColor Red; exit 1
}
Move-Item -Force $TmpPath $CliPath

# Save the service URL for CLI calls while preserving an existing API key.
$ConfigDir = Join-Path $env:USERPROFILE '.keycode'
$ConfigPath = Join-Path $ConfigDir 'config.json'
New-Item -ItemType Directory -Force -Path $ConfigDir | Out-Null
$Config = [ordered]@{}
if (Test-Path $ConfigPath) {
  $ExistingConfig = Get-Content -Raw $ConfigPath | ConvertFrom-Json
  foreach ($property in $ExistingConfig.PSObject.Properties) { $Config[$property.Name] = $property.Value }
}
$Config['baseUrl'] = $BaseUrl
$Utf8NoBom = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText($ConfigPath, ($Config | ConvertTo-Json), $Utf8NoBom)

# ---- Launcher shim: `keycode` -> `node keycode.ps1` -------------------------
$ShimPath = Join-Path $BinDir 'keycode.cmd'
@"
@echo off
node "%~dp0keycode.ps1" %*
"@ | Set-Content -Encoding ASCII $ShimPath

# ---- PATH (user scope) ------------------------------------------------------
$UserPath = [System.Environment]::GetEnvironmentVariable('Path','User')
if (($UserPath -split ';') -notcontains $BinDir) {
  [System.Environment]::SetEnvironmentVariable('Path', ($UserPath.TrimEnd(';') + ';' + $BinDir), 'User')
  $env:Path = $env:Path + ';' + $BinDir
  Write-Host "ℹ Added $BinDir to your user PATH."
}

Write-Host ''
Write-Host '✓ KEYCODE Agent installed' -ForegroundColor Green
Write-Host ''
Write-Host '  One API key unlocks your agent everywhere:'
Write-Host "    1. Sign in at  $BaseUrl/login.html"
Write-Host "    2. Create an API key:  $BaseUrl/api-keys.html"
Write-Host '    3. Connect the CLI (open a NEW PowerShell window):'
Write-Host ''
Write-Host '         keycode login   (paste is hidden)'
Write-Host '         keycode agent "a portfolio site for a photographer"'
Write-Host ''
