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

# NAO usar Compress-Archive aqui.
#
# O Compress-Archive do Windows PowerShell 5.1 grava separador do Windows
# dentro do zip ("assets\app.js"). O Android descompacta assim mesmo; o iOS
# nao — o SSZipArchive usado pelo @capgo/capacitor-updater le isso como UM
# arquivo de nome esquisito na raiz, o pacote sai sem a pasta assets/, e o
# plugin descarta a atualizacao e volta para o pacote de fabrica.
#
# Sintoma: Android atualiza, iPhone nunca sai da versao nativa. Foi assim com
# todas as OTA de 02 e 03/09/2026, ate o registro em ota_checagens mostrar o
# iPhone pedindo, recebendo a oferta e continuando a reportar "1.0".
$ziparJs = Join-Path $PSScriptRoot 'zipar.js'
& node $ziparJs $distDir $zipPath
if ($LASTEXITCODE -ne 0) { throw "Falha ao compactar o pacote OTA (zipar.js)." }
$checksum = (Get-FileHash -Algorithm SHA256 -LiteralPath $zipPath).Hash.ToLowerInvariant()

$objectPath = "$App/$Version/dist.zip"
$uploadUrl = "$supabaseUrl/storage/v1/object/ota-bundles/$objectPath"
$headers = @{
  Authorization = "Bearer $serviceRoleKey"
  apikey = $serviceRoleKey
  'Content-Type' = 'application/zip'
  'x-upsert' = 'true'
}

# -UserAgent obrigatorio: sem ele o Invoke-RestMethod se anuncia como
# "Mozilla/5.0 (Windows NT ...) WindowsPowerShell", e o Supabase recusa chave
# secreta vinda de coisa que parece navegador — "Forbidden use of secret API key
# in browser". O Storage passava, o PostgREST nao, e a publicacao terminava com
# o zip no ar e nenhuma release apontando pra ele.
$agente = 'praiago-ota-publisher/1'

Invoke-RestMethod -Method Put -Uri $uploadUrl -Headers $headers -InFile $zipPath -UserAgent $agente | Out-Null

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
Invoke-RestMethod -Method Post -Uri $releaseUrl -Headers $restHeaders -Body $release -UserAgent $agente | Out-Null

Write-Host "OTA publicado."
Write-Host "App: $App"
Write-Host "Versao: $Version"
Write-Host "Canal: $Channel"
Write-Host "Plataforma: $Platform"
Write-Host "Arquivo: $zipPath"
Write-Host "URL: $publicUrl"
Write-Host "SHA256: $checksum"
