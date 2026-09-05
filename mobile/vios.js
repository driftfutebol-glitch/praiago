// Confere se um pacote OTA passa nas regras do iOS ANTES de alguem esperar
// dois dias por uma atualizacao que nunca chega.
//
// O @capgo/capacitor-updater roda `resolvePathInsideDirectory` em cada entrada
// do zip e joga o pacote fora inteiro se qualquer uma falhar — sem aviso no
// app, so um `windows_path_fail` que ninguem ve. As quatro regras, copiadas do
// CapgoUpdater.swift:
//
//     if relativePath.isEmpty          -> emptyPath
//     if contains("\\") || contains(0) -> windowsPath
//     if hasPrefix("/")                -> absolutePath
//     if componentes contem ".."       -> pathTraversal
//
// O Android nao tem essa checagem: o unzip do Java engole caminho de Windows
// numa boa. Por isso dava "Android atualiza, iPhone nunca" — e por isso o
// `Compress-Archive` do PowerShell 5.1 esta proibido no publish-ota.ps1.
//
//   node vios.js ota-builds/praiago-cliente/1.2.1/dist.zip [outro.zip ...]

const fs = require('fs')
const path = require('path')

const BARRA_INVERTIDA = String.fromCharCode(92)
const NULO = String.fromCharCode(0)

// Le so o diretorio central do zip — e ele que o descompactador consulta.
function entradas(arquivo) {
  const b = fs.readFileSync(arquivo)
  let fim = b.length - 22
  while (fim >= 0 && b.readUInt32LE(fim) !== 0x06054b50) fim--
  if (fim < 0) throw new Error('nao parece um zip: fim do diretorio central nao encontrado')

  let offset = b.readUInt32LE(fim + 16)
  const total = b.readUInt16LE(fim + 10)
  const nomes = []
  for (let i = 0; i < total; i++) {
    if (b.readUInt32LE(offset) !== 0x02014b50) throw new Error('diretorio central corrompido')
    const tamNome = b.readUInt16LE(offset + 28)
    nomes.push(b.slice(offset + 46, offset + 46 + tamNome).toString('utf8'))
    offset += 46 + tamNome + b.readUInt16LE(offset + 30) + b.readUInt16LE(offset + 32)
  }
  return nomes
}

function reprova(nome) {
  if (!nome) return 'emptyPath'
  if (nome.includes(BARRA_INVERTIDA) || nome.includes(NULO)) return 'windowsPath'
  if (nome.startsWith('/')) return 'absolutePath'
  if (nome.split('/').includes('..')) return 'pathTraversal'
  return null
}

const arquivos = process.argv.slice(2)
if (arquivos.length === 0) {
  console.error('uso: node vios.js <dist.zip> [outro.zip ...]')
  process.exit(1)
}

let houveFalha = false
for (const arquivo of arquivos) {
  console.log(`=== ${path.basename(path.dirname(path.dirname(arquivo)))} ${path.basename(path.dirname(arquivo))} ===`)
  let nomes
  try {
    nomes = entradas(arquivo)
  } catch (erro) {
    console.log(`  NAO DEU PARA LER: ${erro.message}\n`)
    houveFalha = true
    continue
  }

  const problemas = {}
  for (const nome of nomes) {
    const motivo = reprova(nome)
    if (motivo) (problemas[motivo] = problemas[motivo] || []).push(nome)
  }

  console.log(`  ${nomes.length} entrada(s)`)
  for (const [motivo, lista] of Object.entries(problemas)) {
    console.log(`  ${motivo}: ${lista.length}  ex: ${lista[0]}`)
  }
  // index.html na raiz: sem ele o plugin monta o pacote e a WebView abre em branco.
  if (!nomes.includes('index.html')) {
    console.log('  index.html NAO esta na raiz do zip')
    houveFalha = true
  }
  const ruim = Object.keys(problemas).length > 0
  if (ruim) houveFalha = true
  console.log(`  >>> o iOS ${ruim ? 'RECUSA' : 'ACEITA'} este pacote\n`)
}

process.exit(houveFalha ? 1 : 0)
