import { Capacitor } from '@capacitor/core'
import { CapacitorUpdater } from '@capgo/capacitor-updater'

export function markOtaBundleReady() {
  if (!Capacitor.isNativePlatform()) return

  void CapacitorUpdater.notifyAppReady().catch((error) => {
    console.warn('[ota] notifyAppReady failed', error)
  })
}

/**
 * Qual pacote OTA está rodando neste aparelho agora.
 *
 * Existe porque sem isso ninguém sabe. A correção era publicada, o endpoint
 * respondia certo, o arquivo tinha o conserto — e o testador continuava vendo
 * o defeito antigo. Sem um número na tela, cada rodada virava "publiquei" x
 * "não chegou", sem como saber quem estava certo.
 *
 * Devolve 'builtin' quando o app está rodando o pacote que veio embutido no
 * binário da loja, ou seja: nenhuma OTA foi aplicada ainda.
 */
export async function versaoDoPacote(): Promise<string> {
  if (!Capacitor.isNativePlatform()) return 'web'
  try {
    const atual = await CapacitorUpdater.current()
    // `builtin` é o id que o plugin usa para o pacote de fábrica.
    const v = atual?.bundle?.version
    if (!v || v === 'builtin') return 'builtin'
    return v
  } catch {
    return 'desconhecida'
  }
}
