$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
$javaHome = 'C:\Program Files\Android\Android Studio\jbr'
$sdk = Join-Path $env:LOCALAPPDATA 'Android\Sdk'

$env:JAVA_HOME = $javaHome
$env:ANDROID_HOME = $sdk
$env:ANDROID_SDK_ROOT = $sdk
$env:Path = "$javaHome\bin;$sdk\platform-tools;$sdk\cmdline-tools\latest\bin;$sdk\emulator;$env:Path"

$apps = @('praiago-cliente', 'praiago-ambulante', 'praiago-restaurante')

foreach ($app in $apps) {
  $dir = Join-Path $root $app
  Write-Host "==> $app" -ForegroundColor Cyan
  Push-Location $dir
  npm.cmd run build

  if (-not (Test-Path 'android')) {
    npm.cmd exec -- cap add android
  }

  if (-not (Test-Path 'ios')) {
    npm.cmd exec -- cap add ios
  }

  npm.cmd exec -- cap sync
  Pop-Location
}

Write-Host "Mobile sync completo." -ForegroundColor Green
