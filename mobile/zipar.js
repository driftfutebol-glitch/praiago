// Empacota uma pasta em .zip com separador "/" nos nomes das entradas.
//
// Existe porque o Compress-Archive do PowerShell 5.1 grava caminho de Windows
// dentro do zip ("assets\app.js"). O Android descompacta assim mesmo — o unzip
// do Java tolera. O iOS nao: o SSZipArchive que o @capgo/capacitor-updater usa
// trata "assets\app.js" como UM arquivo de nome esquisito na raiz. O pacote sai
// sem a pasta assets/, o index.html aponta para arquivos que nao existem, e o
// plugin descarta a atualizacao e volta para o pacote de fabrica.
//
// Sintoma: Android atualiza, iPhone nunca. Foi o que aconteceu com todas as
// OTA de 02 e 03/09/2026 — o iPhone pedia, recebia a oferta, baixava e
// continuava reportando a versao nativa "1.0".
//
//   node zipar.js <pasta de origem> <arquivo .zip de saida>

const fs = require('fs')
const path = require('path')
const zlib = require('zlib')

const tabelaCrc = (() => {
  const t = new Int32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c
  }
  return t
})()

function crc32(buf) {
  let c = -1
  for (let i = 0; i < buf.length; i++) c = tabelaCrc[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  return (c ^ -1) >>> 0
}

function listar(raiz, prefixo = '') {
  const saida = []
  for (const nome of fs.readdirSync(path.join(raiz, prefixo))) {
    const relativo = prefixo ? `${prefixo}/${nome}` : nome
    const completo = path.join(raiz, relativo)
    if (fs.statSync(completo).isDirectory()) saida.push(...listar(raiz, relativo))
    else saida.push(relativo)
  }
  return saida
}

// Data/hora no formato MS-DOS que o zip exige.
function dataDos(d) {
  const hora = ((d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() / 2)) & 0xffff
  const data = (((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate()) & 0xffff
  return { hora, data }
}

function zipar(origem, destino) {
  const arquivos = listar(origem)
  const locais = []
  const central = []
  let offset = 0

  for (const relativo of arquivos) {
    const bruto = fs.readFileSync(path.join(origem, relativo))
    const comprimido = zlib.deflateRawSync(bruto, { level: 9 })
    // path.join usa "\" no Windows; a lista acima ja monta com "/", mas
    // normalizar aqui garante mesmo que alguem mexa em listar().
    const nome = Buffer.from(relativo.split(path.sep).join('/'), 'utf8')
    const crc = crc32(bruto)
    const { hora, data } = dataDos(new Date())

    const cabecalho = Buffer.alloc(30)
    cabecalho.writeUInt32LE(0x04034b50, 0)   // assinatura
    cabecalho.writeUInt16LE(20, 4)           // versao necessaria
    cabecalho.writeUInt16LE(0x0800, 6)       // bit 11: nomes em UTF-8
    cabecalho.writeUInt16LE(8, 8)            // metodo: deflate
    cabecalho.writeUInt16LE(hora, 10)
    cabecalho.writeUInt16LE(data, 12)
    cabecalho.writeUInt32LE(crc, 14)
    cabecalho.writeUInt32LE(comprimido.length, 18)
    cabecalho.writeUInt32LE(bruto.length, 22)
    cabecalho.writeUInt16LE(nome.length, 26)
    cabecalho.writeUInt16LE(0, 28)

    locais.push(cabecalho, nome, comprimido)

    const dir = Buffer.alloc(46)
    dir.writeUInt32LE(0x02014b50, 0)
    dir.writeUInt16LE(20, 4)                 // versao que criou
    dir.writeUInt16LE(20, 6)                 // versao necessaria
    dir.writeUInt16LE(0x0800, 8)
    dir.writeUInt16LE(8, 10)
    dir.writeUInt16LE(hora, 12)
    dir.writeUInt16LE(data, 14)
    dir.writeUInt32LE(crc, 16)
    dir.writeUInt32LE(comprimido.length, 20)
    dir.writeUInt32LE(bruto.length, 24)
    dir.writeUInt16LE(nome.length, 28)
    dir.writeUInt16LE(0, 30)                 // extra
    dir.writeUInt16LE(0, 32)                 // comentario
    dir.writeUInt16LE(0, 34)                 // disco
    dir.writeUInt16LE(0, 36)                 // atributos internos
    // `<< 16` estoura para negativo em JS (deslocamento e com sinal, 32 bits).
    // Multiplicar mantem o valor sem sinal, que e o que o formato espera.
    dir.writeUInt32LE((0o100644 * 0x10000) >>> 0, 38) // atributos externos (arquivo comum)
    dir.writeUInt32LE(offset, 42)
    central.push(dir, nome)

    offset += cabecalho.length + nome.length + comprimido.length
  }

  const corpoCentral = Buffer.concat(central)
  const fim = Buffer.alloc(22)
  fim.writeUInt32LE(0x06054b50, 0)
  fim.writeUInt16LE(0, 4)
  fim.writeUInt16LE(0, 6)
  fim.writeUInt16LE(arquivos.length, 8)
  fim.writeUInt16LE(arquivos.length, 10)
  fim.writeUInt32LE(corpoCentral.length, 12)
  fim.writeUInt32LE(offset, 16)
  fim.writeUInt16LE(0, 20)

  fs.writeFileSync(destino, Buffer.concat([...locais, corpoCentral, fim]))
  return arquivos.length
}

const [, , origem, destino] = process.argv
if (!origem || !destino) {
  console.error('uso: node zipar.js <pasta> <saida.zip>')
  process.exit(1)
}
const total = zipar(origem, destino)
console.log(`zip criado com ${total} arquivo(s), separador "/": ${destino}`)
