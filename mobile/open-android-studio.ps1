$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
$studio = 'C:\Program Files\Android\Android Studio\bin\studio64.exe'
$app = if ($args.Count -gt 0) { $args[0] } else { 'praiago-cliente' }
$project = Join-Path $root "$app\android"

if (-not (Test-Path $studio)) {
  throw "Android Studio nao encontrado em $studio"
}

if (-not (Test-Path $project)) {
  throw "Projeto Android nao encontrado em $project"
}

Start-Process -FilePath $studio -ArgumentList @($project)
