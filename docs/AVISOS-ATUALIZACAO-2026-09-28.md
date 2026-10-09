# Avisos de atualização — Cliente e Ambulante

## Funcionamento

O sistema compara a versão **nativa instalada** (`CapacitorUpdater.current().native`) com a versão publicada e aprovada. O número do pacote OTA não representa a versão da loja. Web, versão desconhecida, rede indisponível e aplicativos já atualizados não recebem aviso.

No Admin, `/atualizacoes` é exclusivo de `sysadmin` ativo e autorizado a escrever. Fluxo: cadastrar pendente → conferir loja → aprovar. Conferência não ativa aviso. Aprovação exige conferência de menos de 24 horas, substitui atomicamente o aviso ativo anterior para o mesmo aplicativo/loja e registra auditoria. Negar ou pausar também exige motivo. Um aviso pausado precisa de nova conferência para ser reaprovado.

O aviso é opcional: “Atualizar agora” abre o link oficial da loja correta; “Lembrar amanhã” dispensa por 24 horas. Consultas ocorrem ao abrir e a cada cinco minutos enquanto a página estiver visível. Pausas são refletidas na próxima consulta bem-sucedida. O sistema não efetua pagamento, não reinicia o app e não altera carrinho, login, KYC ou pedidos.

## Conferência das lojas

- iOS: Edge Function consulta `itunes.apple.com/lookup` no Brasil; exige ID, bundle ID, versão e data de publicação válidos. Comparação numérica considera 1.0 e 1.0.0 equivalentes.
- Android: confirmação manual do dono sobre publicação em Produção no Brasil e referência da release. Fica explicitamente registrada como `play_console_manual`. Não há credencial Android Publisher disponível; um HTTP 200 na página da Play Store não prova a versão publicada.
- A aprovação libera uma mensagem remota, não envia binário nem publica aplicativos nas lojas.
- Antes de aprovar uma atualização com distribuição gradual, conferir se a versão está disponível para todo o público alvo. O sistema atual não segmenta rollout por país, usuário ou porcentagem.

## Segurança e backend

Migração isolada: `20260929000000_app_update_notices.sql`. Não aplicar a cadeia histórica com `db push`.

`app_update_notices` e `app_update_notice_events` têm RLS e leitura exclusiva do dono. Escritas diretas de anon/authenticated estão revogadas. A RPC administrativa verifica novamente a autorização. A prova de publicação só pode ser gravada por `service_role`, após autenticação e autorização do dono na Edge Function. IDs de atores não têm novas FKs para `auth.users`, evitando ampliar a cadeia de limpeza de contas.

- `app-update`: endpoint público GET, projeção mínima de avisos aprovados, `Cache-Control: no-store`, sem coleta de localização, login ou identificadores do aparelho. Link é definido pelo servidor, não por input do Admin.
- `admin-app-updates`: POST autenticado; autorização efetiva no handler. `verify_jwt=false` no gateway não torna a operação anônima: `auth.getUser` e `app_updates_owner` são obrigatórios.
- `ota-update`: passa a respeitar limites mínimo e máximo da versão nativa (`version_build`). Releases legadas sem faixa mantêm o comportamento anterior. Versão desconhecida é bloqueada para releases com faixa. Se o release mais recente é incompatível, não oferece um release antigo como fallback.

## Pacote isolado para instalação por OTA

Não usar `mobile/publish-ota.ps1` para esta instalação: ele compila o candidato atual completo e incluiria as mudanças de outubro.

As bases públicas OTA 1.2.1 foram baixadas e tiveram os checksums conferidos:

| App | Base SHA256 | Novo pacote isolado 1.2.2 SHA256 |
| --- | --- | --- |
| Cliente | c94b8491c9549474844d5e6f7e36ed71958780253dc8a8844b1e9f60441f1282 | 92994152eb040933aac3d30be5ffbdab5ece9c5da8b8f2a01f8c6d9a1acd3e9d |
| Ambulante | 202e4573ac08016d746c318667fabb6e14ca92d70a35ebab5059f35d4c7b03c6 | 1c3c7069cc7c9d36cd7226e08e920e2d948def51b54d19098c11ddcad231dc1d |

`mobile/build-store-notice-ota.mjs` copia a base extraída para uma pasta nova, falha se a pasta já existe, compila apenas o bootstrap, acrescenta um script externo no `index.html` e compara o hash de cada outro arquivo. Foram preservados 30 arquivos Cliente e 38 Ambulante; nenhuma tela antiga foi recompilada. O plugin nativo já existente é reutilizado. O ZIP usa entradas POSIX pelo `mobile/zipar.js`.

Artefatos: bucket `ota-bundles`, prefixo `store-notice-staging-20260928/praiago-{cliente|ambulante}/1.2.2/dist.zip`. Quatro registros, um por app/plataforma, canal `store-notice-staging`, **enabled=false**. Esse canal não é o canal production dos aparelhos públicos.

### Bloqueios antes da distribuição pública

1. Conferir versão e build reais do Android público; configurar faixa nativa restrita para o bootstrap. Não inferir a versão publicada a partir de `package.json`, Git ou número do OTA.
2. Validar instalação/rollback no aparelho com o binário público, abertura externa da loja, comparação da versão nativa, login, navegação, pedidos e pausa do aviso. Teste DOM com bridge simulado não substitui aparelho real.
3. iOS: avaliar a regra Apple 2.5.2 sobre código baixado que introduza/altere funcionalidade. Suporte técnico do Capgo não equivale à autorização da Apple. Se não houver base de conformidade, incluir o sistema na próxima build nativa revisada, sem liberar este bootstrap via OTA.
4. Confirmar o canal production da próxima build nativa pública. O canal `candidate-outubro-2026` é de testes, não de distribuição pública.
5. Antes de lançar o próximo binário, restringir ou retirar releases OTA antigas de production para que o binário novo não receba a interface antiga. O suporte a faixa foi instalado, mas as faixas de todos os releases legados não foram inventadas nesta entrega.
6. Somente após esses gates, promover o pacote isolado validado para a plataforma elegível em production. Nunca ativar `platform=all` para escapar de uma plataforma ainda pendente.

## Evidências da entrega

- Migração aplicada e registrada individualmente em produção.
- Edge Functions: `app-update` v1, `admin-app-updates` v1, `ota-update` v53, ACTIVE.
- Consultas públicas dos quatro destinos retornaram `notice:null`; operação administrativa sem login retornou 401. OTA production continua retornando `up_to_date` para 1.2.1 nos dois apps.
- Em 28/09/2026, Apple Lookup BR retornou Cliente 1.0 e Ambulante 1.0; nenhum aviso de versão futura foi aprovado.
- 95 testes Vitest (inclui quatro contratos de UI Admin), 21 testes Node Admin, 23 verificações SQL descartáveis, 16 verificações dos arquivos bootstrap exatos em DOM isolado. Builds Admin/Cliente/Ambulante aprovados; Deno check das três funções aprovado.
- Testes não criaram produtos fictícios, avisos públicos ou pedidos/pagamentos reais.
- Pendência explicitada: envio público OTA e teste em aparelho real ainda não concluídos. Nenhum upload às lojas foi feito.

### Deploy Admin confirmado

- Código: `29f138d4a636fd03c3276bb108b37f3302a54cc1`, confirmado no GitHub e na metadata da Vercel.
- Preview: `dpl_4mk9JYFjcxtc8iuD6osmEesPYxcN`, `praiago-admin-bitbr8oac-pedrin1.vercel.app`, READY. HTML e JS conferidos via acesso autenticado da CLI; preview no navegador pede login Vercel, sem enfraquecer a proteção.
- Produção: `dpl_FMsNv6ii7Bq6yUishkxQttZdympw`, `praiago-admin-3vkg9ra6e-pedrin1.vercel.app`, READY, alias `admin.praiago.com.br`.
- Domínio `/atualizacoes`: HTTP 200, asset `/assets/index-BZzswzah.js`, rota, RPC de aprovação e verificação da loja presentes. Navegador mostrou o login Admin, sem sessão autenticada do dono disponível; os botões não foram acionados em produção. Contratos desses botões foram testados no harness local.
- GitHub Actions não iniciou por bloqueio de cobrança da conta, confirmado nas annotations. Não há CI verde; evidência de testes é local, além do build efetivo da Vercel.
- Páginas públicas dos dois apps na Play Store conferidas; elas não expuseram a versão nativa publicada na consulta. Não substituem o Play Console para definir faixa de compatibilidade do bootstrap.
- Checksums dos dois ZIPs conferidos novamente após download do Storage.
- Somente `praiago-restaurante/src/components/BulkProductImport.tsx`, alteração anterior não relacionada, permanece fora do commit/deploy.

## Rollback

Aviso incorreto: usar “Pausar aviso”; os apps o retiram na próxima consulta bem-sucedida. Em indisponibilidade da API, o app continua funcionando.

Admin: voltar ao deployment anterior conhecido `dpl_DnGmQJD8ccsWMhEvYypjKUYwz3jQ`, preservando a migração aditiva e a auditoria. Pacotes de bootstrap estão desativados e não precisam de rollback público nesta entrega.

Função OTA: caso a verificação da versão nativa cause regressão em algum cliente legado, restaurar o código anterior da v52 (source conferido antes do deploy). Não apagar dados de avisos/auditoria como rollback. Releases sem limites foram testados para manter a resposta anterior.

## Referências primárias

- [Apple Lookup API](https://developer.apple.com/library/archive/documentation/AudioVideo/Conceptual/iTuneSearchAPI/LookupExamples.html)
- [Apple: software requirements, 2.5.2](https://developer.apple.com/app-store/review/guidelines/#software-requirements)
- [Google Android Publisher: tracks](https://developers.google.com/android-publisher/api-ref/rest/v3/edits.tracks/list)
