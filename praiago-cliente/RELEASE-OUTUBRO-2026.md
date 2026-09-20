# PraiaGo Cliente · candidata de outubro de 2026

## Escopo

Atualização do aplicativo **Cliente**. Ambulante, sites, contratos de API, regras de pedidos, pagamentos e banco não foram migrados nesta mudança. Produção não deve receber esta candidata antes da validação e da janela de lançamento combinada para outubro.

## O que mudou

- Identidade visual em tons de oceano, areia e verde; tipografia legível, navegação de cinco destinos e alvos maiores.
- Login/cadastro com contraste corrigido, formulário de teclado, autofill, visibilidade de senha, estados de erro e confirmação por código preservados.
- Perfil com edição de nome/telefone/foto, atalhos reais de pedidos, favoritos, cupons, região, notificações, suporte e privacidade.
- Preferências locais de som de avisos e movimento reduzido. Não alteram permissões do sistema nem as regras de notificação push.
- Mapa com filtros por tipo/abertura, estilo praia ou ruas, restaurantes na lista e precisão real do GPS. Créditos cartográficos visíveis.
- Início, exploração, pedidos e eventos com hierarquia e espaçamento revisados. Busca de lojas sem acentos; filtro de ofertas efetivo.
- Catálogo paginado, com seleção explícita de campos, requisições concorrentes deduplicadas, recargas agrupadas e recuperação de falhas sem apagar dados anteriores.
- Um acompanhamento de GPS compartilhado. Pino manual sincronizado entre telas, sem substituir a localização objetiva na autorização de pedidos. Removida publicação em canal global de GPS sem consumidor; compartilhamento por pedido preservado.
- Chat de ajuda carregado sob demanda e acessível no cabeçalho, sem balão sobre o mapa ou checkout.

## Validação reproduzível

```sh
cd praiago-cliente
npm ci
npm test
npm run lint
npm run build
npm audit
```

Os testes usam [Vitest](https://vitest.dev/guide/) e [React Testing Library](https://testing-library.com/docs/react-testing-library/intro/), com Supabase substituído por um dublê local e `fetch` bloqueado. Não criam contas, pedidos, pagamentos, exclusões ou alterações em produção.

Cobertura funcional: login e isolamento de papéis; conta banida; cadastro/CPF/aceite; passagem para OTP sem liberar sessão antes da confirmação; edição restrita de perfil e falha de gravação; destinos de menu; persistência das preferências; catálogo/estoque/promoção/paginação/erro/realtime; compartilhamento do sensor e integridade da localização objetiva; preservação da conversa e do rascunho ao reabrir a ajuda.

Resultado em 20/09/2026: **33 testes aprovados em quatro arquivos**, build web/TypeScript aprovado e `npm audit` sem vulnerabilidades. O mesmo commit passou pelos testes, lint e build web no macOS do Codemagic, além da compilação nativa assinada.

O lint do projeto tem avisos preexistentes de dependências de hooks e Fast Refresh. Avisos não devem ser confundidos com erros nem com revisão completa de todo o legado.

## Prévia local de perfil autenticado

```sh
npm run dev -- --config tests/preview.config.ts
```

Abra `http://127.0.0.1:5174/tests/preview.html`. O cabeçalho identifica **dados fictícios**. Essa entrada não faz parte do `dist` normal: o alias de Supabase existe só no config de testes. Upload, remoção, RPCs e chamadas externas estão desabilitados. Não usar como evidência de teste integrado de produção.

O aplicativo normal continua em `http://127.0.0.1:5173/`.

## Checklist de candidata e publicação

- [x] Testes locais com rede de produção bloqueada.
- [x] Build web/TypeScript local.
- [x] Auditoria npm sem vulnerabilidades após atualização compatível de `@xmldom/xmldom` transitivo.
- [x] Fluxos de exclusão, checkout, pagamento e CPF sem relaxamento de autorização.
- [x] Nenhuma migration ou atualização de edge function aplicada.
- [ ] GitHub Actions do commit final aprovado — bloqueado pela cobrança da conta antes de iniciar o job; não é um resultado dos testes.
- [x] Build nativo assinado da candidata concluído no Codemagic.
- [x] Upload da candidata para App Store Connect concluído sem erros.
- [x] Processamento da candidata concluído no App Store Connect/TestFlight.
- [ ] Teste em iPhone real: teclado, safe areas, permissões, GPS, foto, retomada do app e abertura sem rede.
- [ ] Fluxo integrado com conta de teste autorizada: login, verificação, pedido, pagamento em sandbox e suporte.
- [ ] Homologação do visual e definição do dia de lançamento em outubro.
- [ ] Preparação da versão pública, metadados e revisão Apple quando a candidata for aprovada.

### Evidências da candidata

- Branch `feat/cliente-outubro-2026`; código da candidata no commit `c0aab0fe18527218ec1a2eb362386b4c968ac64d`.
- [PR #3 em rascunho](https://github.com/driftfutebol-glitch/praiago/pull/3). Sem merge para `main` e sem publicação pública.
- Codemagic: build `6ab017885ddfe5cccf8e35fa`, workflow `ios-cliente-outubro-candidate`, todas as etapas concluídas com sucesso em 20/09/2026. Artefato `App.ipa`, versão **1.1 (17)**, iOS mínimo 15.0. O log do envio confirmou `UPLOAD SUCCEEDED with no errors`.
- App Store Connect: app Cliente `6804792683`, build `9b35b3fc-2b50-4cf7-bd99-54da0ab395b3`, versão **1.1 (17)**. API confirmou `processingState: VALID` e `internalBuildState: IN_BETA_TESTING`. `externalBuildState: READY_FOR_BETA_SUBMISSION`: não foi submetida revisão externa/pública nesta entrega. Nenhum testador foi adicionado.
- [Execução do GitHub Actions](https://github.com/driftfutebol-glitch/praiago/actions/runs/35525707398): a anotação informa que o job não iniciou porque a conta está bloqueada por um problema de cobrança. Nenhuma configuração financeira foi alterada. O check nativo do Codemagic está aprovado no mesmo commit.
- Revisão visual web: início, login, exploração, pedidos sem sessão, eventos, mapa, filtros, estilo cartográfico e ajuda em 390 × 844; perfil autenticado e editor com dados fictícios também em 320 × 700. Sem transações reais e sem tratar a prévia fictícia como teste integrado.
- A primeira execução da candidata (`6ab0159d39b55bcdfcdfb1b8`) foi cancelada para incluir o ajuste final de preservação da ajuda. A evidência válida é a execução posterior acima.

### Canal da candidata

O workflow `ios-cliente-outubro-candidate` reutiliza assinatura e upload já configurados, roda os testes e gera marketing version `1.1`. Usa `candidate-outubro-2026` tanto no canal quanto na URL de OTA para não baixar o pacote antigo de produção por cima do novo visual. Não submete revisão pública nem publica bundle OTA. Os workflows originais não foram redirecionados.

### Limitações deliberadas

Sem migração para provedor de mapas pago. Os tiles continuam OpenStreetMap; o estilo praia é uma camada visual local, não um novo serviço cartográfico. Respeitar a [política de tiles](https://operations.osmfoundation.org/policies/tiles/), com atribuição e sem download em massa.

A elegibilidade de `min_native_version` no serviço de OTA já existente ainda precisa de validação/implementação antes de uma distribuição ampla que altere requisitos nativos. Esta candidata não muda esse serviço nem usa o canal de produção. A versão de lançamento precisa revisar o comportamento de rollback/downgrade do serviço antes de voltar ao canal público.

## Rollback e critérios de parada

Base anterior: `ba3d3d6117f5879e41e0d874c0863efb8ac60e1d`.

Interromper distribuição se houver falha de login, acesso entre papéis, confirmação incorreta de pagamento, bloqueio da navegação por teclado/safe area ou travamento do mapa. Como a candidata está isolada, manter App Store/OTA de produção atuais enquanto corrige a branch. Não apagar releases antigos, não reverter banco e não publicar um bundle em produção para testar rollback.
