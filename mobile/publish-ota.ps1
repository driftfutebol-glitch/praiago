param(
  [Parameter(Mandatory = $true)]
  [ValidateSet('praiago-cliente', 'praiago-ambulante', 'praiago-restaurante')]
  [string]$App,

  [Parameter(Mandatory = $true)]
  [string]$Version,

  [ValidateSet('all', 'android', 'ios')]
  [string]$Platform = 'all',

  [string]$Channel = 'production',
  [string]$Notes = ''
)

$ErrorActionPreference = 'Stop'

$root = Resolve-Path (Join-Path $PSScriptRoot '..')
$projectDir = Join-Path $root $App
$distDir = Join-Path $projectDir 'dist'
$outDir = Join-Path $root "mobile\ota-builds\$App\$Version"
$zipPath = Join-Path $outDir 'dist.zip'
$otaBuildRoot = Join-Path $root 'mobile\ota-builds'

$appIds = @{
  'praiago-cliente' = 'com.ferrazcode.praiago.cliente'
  'praiago-ambulante' = 'com.ferrazcode.praiago.ambulante'
  'praiago-restaurante' = 'com.ferrazcode.praiago.restaurante'
}

$supabaseUrl = $env:SUPABASE_URL
if (-not $supabaseUrl) {
  $supabaseUrl = 'https://kfxpzjqktbcsxlqapkyv.supabase.co'
}
$supabaseUrl = $supabaseUrl.TrimEnd('/')

$serviceRoleKey = $env:SUPABASE_SERVICE_ROLE_KEY
if (-not $serviceRoleKey) {
  throw 'Defina SUPABASE_SERVICE_ROLE_KEY no ambiente antes de publicar OTA. Nao salve essa chave no repositorio.'
}

$resolvedOtaBuildRoot = [System.IO.Path]::GetFullPath($otaBuildRoot)
$resolvedOutDir = [System.IO.Path]::GetFullPath($outDir)
if (-not $resolvedOutDir.StartsWith($resolvedOtaBuildRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
  throw "Diretorio de saida fora da pasta OTA permitida: $resolvedOutDir"
}

if (Test-Path $resolvedOutDir) {
  Remove-Item -LiteralPath $resolvedOutDir -Recurse -Force
}
New-Item -ItemType Directory -Force -Path $outDir | Out-Null

Push-Location $projectDir
try {
  npm.cmd run build
}
finally {
  Pop-Location
}

if (-not (Test-Path (Join-Path $distDir 'index.html'))) {
  throw "Build invalido: index.html nao encontrado em $distDir."
}

Compress-Archive -Path (Join-Path $distDir '*') -DestinationPath $zipPath -Force
$checksum = (Get-FileHash -Algorithm SHA256 -LiteralPath $zipPath).Hash.ToLowerInvariant()

$objectPath = "$App/$Version/dist.zip"
$uploadUrl = "$supabaseUrl/storage/v1/object/ota-bundles/$objectPath"
$headers = @{
  Authorization = "Bearer $serviceRoleKey"
  apikey = $serviceRoleKey
  'Content-Type' = 'application/zip'
  'x-upsert' = 'true'
}

Invoke-RestMethod -Method Put -Uri $uploadUrl -Headers $headers -InFile $zipPath | Out-Null

$publicUrl = "$supabaseUrl/storage/v1/object/public/ota-bundles/$objectPath"
$release = @{
  app_id = $appIds[$App]
  platform = $Platform
  channel = $Channel
  version = $Version
  bundle_url = $publicUrl
  checksum = $checksum
  enabled = $true
  notes = $Notes
} | ConvertTo-Json -Compress

$restHeaders = @{
  Authorization = "Bearer $serviceRoleKey"
  apikey = $serviceRoleKey
  'Content-Type' = 'application/json'
  Prefer = 'resolution=merge-duplicates,return=representation'
}
$releaseUrl = "$supabaseUrl/rest/v1/ota_releases?on_conflict=app_id,platform,channel,version"
Invoke-RestMethod -Method Post -Uri $releaseUrl -Headers $restHeaders -Body $release | Out-Null

Write-Host "OTA publicado."
Write-Host "App: $App"
Write-Host "Versao: $Version"
Write-Host "Canal: $Channel"
Write-Host "Plataforma: $Platform"
Write-Host "Arquivo: $zipPath"
Write-Host "URL: $publicUrl"
Write-Host "SHA256: $checksum"
