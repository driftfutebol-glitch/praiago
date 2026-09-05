import { useEffect, useState } from 'react'
import { versaoDoPacote } from '../lib/ota'

// Mostra qual pacote OTA está rodando. Parece detalhe, mas é o que encerra a
// discussão de "já publiquei" contra "continua igual": quem testa lê o número
// e diz. Sem ele, cada correção vira uma rodada de adivinhação.
//
// "instalada da loja" quer dizer que nenhuma atualização foi aplicada ainda —
// o app está no pacote que veio dentro do binário.
export default function VersaoDoApp() {
  const [versao, setVersao] = useState<string | null>(null)

  useEffect(() => {
    let vivo = true
    void versaoDoPacote().then(v => { if (vivo) setVersao(v) })
    return () => { vivo = false }
  }, [])

  if (!versao) return null

  const rotulo =
    versao === 'builtin' ? 'versão instalada da loja (sem atualização aplicada)'
    : versao === 'web' ? 'rodando no navegador'
    : versao === 'desconhecida' ? 'versão não identificada'
    : `versão ${versao}`

  return (
    <div style={{
      marginTop: 18, marginBottom: 8, textAlign: 'center',
      color: '#94a3b8', fontSize: 11, fontWeight: 700, letterSpacing: 0.2,
    }}>
      PraiaGo · {rotulo}
    </div>
  )
}
