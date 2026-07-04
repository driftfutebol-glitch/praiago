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
  Write-Host "==> Build Android debug: $app" -ForegroundColor Cyan
  Push-Location $dir
  npm.cmd run build
  npm.cmd exec -- cap sync android
  Push-Location android
  .\gradlew.bat assembleDebug
  Pop-Location
  Pop-Location
}

Write-Host "APKs debug gerados em */android/app/build/outputs/apk/debug/." -ForegroundColor Green
