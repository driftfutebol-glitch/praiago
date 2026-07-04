$ErrorActionPreference = 'Stop'

$sdk = Join-Path $env:LOCALAPPDATA 'Android\Sdk'
$env:ANDROID_HOME = $sdk
$env:ANDROID_SDK_ROOT = $sdk
$env:Path = "$sdk\emulator;$sdk\platform-tools;$sdk\cmdline-tools\latest\bin;$env:Path"

$name = if ($args.Count -gt 0) { $args[0] } else { 'PraiaGo_API_36' }
Start-Process -FilePath (Join-Path $sdk 'emulator\emulator.exe') -ArgumentList @('-avd', $name)
