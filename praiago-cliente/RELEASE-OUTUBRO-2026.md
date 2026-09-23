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

### Modo escuro · 23/09/2026

- Perfil → Modo escuro: disponível com e sem login; ativação imediata, com rótulo acessível, alvo de toque de 48 × 44 px e preferência local persistida. Tema claro permanece o padrão.
- Paleta noturna em azul-petróleo e verde; superfícies, campos, cartões, navegação, ajuda, cupons, avisos e estados de erro acompanham o tema. Fotos, marca original e QR de pagamento não são invertidos.
- Praia mantém areia dourada, zonas e palmeiras. Cidade mantém OpenStreetMap com brilho reduzido somente nos tiles; sem novo provedor, chave ou permissão.
- Inicialização externa antes da primeira pintura, compatível com a CSP existente. Preferências anteriores preservadas; gravação restrita a quatro configurações, sem sessão, localização ou dados pessoais. Falha de armazenamento não impede usar o tema na sessão atual.
- Transparências usam canais RGB dos tokens, sem depender de `color-mix()` (disponível apenas a partir do [Safari 16.2](https://webkit.org/blog/13591/webkit-features-in-safari-16-2/)). Mantido o requisito nativo existente, sem elevar a versão mínima do iOS.
- Barra de status nativa acompanha a escolha usando o plugin já instalado; chamadas serializadas e falhas toleradas. Implementação conforme [Status Bar do Capacitor](https://capacitorjs.com/docs/apis/status-bar); falta homologação visual em aparelho físico.
- **56 testes em seis arquivos**, incluindo contraste mínimo de 4,5:1 dos pares principais, persistência/reidratação, armazenamento inválido/bloqueado, Perfil autenticado e anônimo, inicialização e barra nativa simulada. Build web aprovado; lint sem erros, mantendo avisos legados; auditoria de dependências de produção sem vulnerabilidades.
- Nenhum exemplo público, migração, alteração de autorização, pedido real, pagamento ou alteração do aplicativo Ambulante.
- Revisão visual no app normal: Perfil claro/escuro em 320 × 700 e 390 × 844, persistência após recarregar, início, catálogo, pedidos sem sessão, eventos, ajuda e mapas Praia/Cidade. Perfil autenticado coberto por testes isolados; não foram criadas contas de demonstração.

### Refinamento de marca e mapa · 21/09/2026

- Logotipo oficial no cabeçalho, usando o PNG já existente sem redesenhar a marca.
- Mapa compacto (270 px em 390 × 844, 236 px em 320 × 700), com opção de ampliar. A troca Mapa/Lista preserva a instância e o zoom.
- **Praia**: guia vetorial local da orla de Praia Grande, sem tiles ou nomes de ruas; faixa amarela, divisões, palmeiras ilustrativas e nomes das zonas. Usa a geometria já cadastrada, com limites aproximados indicados na tela, não novos dados de levantamento.
- Seletor de Canto do Forte, Boqueirão, Guilhermina, Aviação, Tupi, Ocian, Vila Mirim e Caiçara. “Explorando” identifica a câmera; não afirma a localização do usuário. Selecionar praia não altera GPS nem autorização de pedidos.
- **Cidade**: mapa OpenStreetMap com nomes de ruas/endereços e o ponto de referência real. Fora da orla, o botão de localização leva a esse estilo.
- Busca sem acentos e filtros iguais para cartões e pinos; lista conjunta de restaurantes e ambulantes, ordenada pela distância ao ponto de referência.
- Ícones locais substituem o renderizador de servidor do React: chunk compartilhado dos mapas caiu de 347,45 KB / 107,17 KB gzip para cerca de 160,53 KB / 50,65 KB gzip. Isso mede código transferido, não FPS ou velocidade total do aplicativo.
- Tiles de Cidade carregam após o movimento, sem atualizações durante zoom e com buffer reduzido. Palmeiras só são montadas dentro da área visível e em zoom legível. Configuração conforme [Leaflet 1.9.4](https://leafletjs.com/reference.html).
- Removida a entrada de prévia autenticada e de lojas fictícias. Nenhum vendedor/produto de demonstração entra no bundle. Dublês existem somente nos testes automatizados isolados, nunca na aplicação pública.

### Acabamento do modo escuro · 23/09/2026

- Removida a placa clara de CSS atrás do logotipo original e o aro branco do avatar.
- As 28 categorias da Home e da grade Todos usam imagens recortadas com alpha real, não fundos brancos embutidos. Originais preservados; [arquivos, edição e prompts](docs/CATEGORIAS-RECORTES-2026-09-23.md).
- Corrigido contraste de botões de compra/checkout/chat, selos, estados de pedidos/reembolso, diálogos e escudo de segurança do perfil. Sem alteração de regras, APIs ou pagamentos.
- Escala e contornos dos pinos de mapa acompanham o tema; rastreamento usa o mesmo tratamento noturno dos tiles de Cidade. QR Pix continua preto sobre branco.
- Mais espaço para nomes de categorias: as 28 não apresentam sobreposição entre título e contador em 320 e 390 px. Tema claro preservado e fundo decorativo do início suavizado no escuro.
- 57 testes aprovados: inclui regressão de alpha dos WebP e contraste dos extremos dos gradientes de marca. Build aprovado, lint sem erros (20 avisos anteriores).

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

Resultado base em 20/09/2026: **33 testes aprovados em quatro arquivos**, também no Codemagic da versão 1.1 (17).

Refinamento em 21/09/2026: **45 testes aprovados em cinco arquivos**, build web/TypeScript aprovado e `npm audit` sem vulnerabilidades. Os 12 casos adicionais verificam marca, filtros/ordenação, coordenadas inválidas, mapa compacto, preservação na alternância de lista, estilos/tiles, escolha de praia sem alterar GPS, navegação de cardápio e ausência de lojas fictícias no catálogo vazio.

O lint do projeto tem avisos preexistentes de dependências de hooks e Fast Refresh. Avisos não devem ser confundidos com erros nem com revisão completa de todo o legado.

## Visualização local sem demonstrações

```sh
npm run dev -- --host 127.0.0.1
```

Abra `http://127.0.0.1:5173/ambulantes`. É o aplicativo normal, com o catálogo real e estados vazios honestos. A prévia na porta 5174 foi encerrada e seus arquivos de entrada foram removidos a pedido do usuário. Os testes automatizados continuam com rede bloqueada; navegar no aplicativo normal não tem esse isolamento, portanto não fazer transações para testar.

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

### Candidata atual · 23/09/2026 · 1.1 (19)

- Código: `2f0dd54fd4f7f12da315c73171b1513b6cd836fe`, branch `feat/cliente-outubro-2026`, [PR #3 em rascunho](https://github.com/driftfutebol-glitch/praiago/pull/3).
- [Codemagic](https://codemagic.io/app/6a74a80b532034dc3f9b1a5d/build/6ab34e52c8f5d2bf623edd4f): todas as etapas concluídas com sucesso, **56/56 testes**, build web/iOS, assinatura e upload. Log confirmou versão **1.1 (19)** e `UPLOAD SUCCEEDED with no errors`; check nativo no GitHub também aprovado.
- App Store Connect confirmou a build `4ca196c8-f591-449a-9f15-1f231e1b7818`, versão **1.1 (19)**, com `processingState: VALID`, `internalBuildState: IN_BETA_TESTING` e `externalBuildState: READY_FOR_BETA_SUBMISSION`. Disponível para testes internos; não foi submetida revisão externa/pública nem adicionado testador.
- [GitHub Actions](https://github.com/driftfutebol-glitch/praiago/actions/runs/35816412965): job não iniciado por bloqueio de cobrança da conta, confirmado pela anotação do check; nenhuma alteração financeira.
- Sem merge para `main`, submissão externa/pública, novo testador ou OTA de produção. Homologação física no iPhone continua pendente.

### Candidata anterior · 21/09/2026 · 1.1 (18)

- Código: `b6b9536ce3f689e50e32d290555a15b384bf8ee3`, branch `feat/cliente-outubro-2026`; aplicação no commit `aa961621ddd49b9ea51fe15a4f8937530c3c1bf2` e correção de YAML no commit seguinte.
- [Codemagic](https://codemagic.io/app/6a74a80b532034dc3f9b1a5d/build/6ab0a17aa02981cef2c6b5d2), workflow `ios-cliente-outubro-candidate`: todas as etapas concluídas com sucesso; testes **45/45**, lint sem erros, compilação IPA assinada e upload aprovados. Artefato `App.ipa`, versão **1.1 (18)**; log confirmou `UPLOAD SUCCEEDED with no errors`.
- App Store Connect: build `757decc2-102e-42f4-912d-fca9c24d45f8`, versão **1.1 (18)**. API confirmou `processingState: VALID`, `internalBuildState: IN_BETA_TESTING` e `externalBuildState: READY_FOR_BETA_SUBMISSION`. Disponível para testes internos, sem submeter revisão externa/pública e sem adicionar testadores.
- A execução `6ab0a0f80df2e20da6311891` falhou antes da compilação por indentação do workflow. Correção validada com parser YAML e publicada antes da execução atual; não houve upload nessa tentativa.
- [GitHub Actions](https://github.com/driftfutebol-glitch/praiago/actions/runs/35556950313): job não iniciado por bloqueio de cobrança da conta, confirmado pela anotação do check. Nenhuma alteração financeira.
- Revisão visual do refinamento em 320 × 700 e 390 × 844: logo, mapa compacto/ampliado, Boqueirão/Ocian/Canto do Forte, palmeiras, alternância Praia/Cidade, zoom e créditos cartográficos. Pacote de produção verificado sem entrada de prévia, lojas de exemplo ou `react-dom/server`.

### Evidências da candidata anterior · 1.1 (17)

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

Sem migração para provedor de mapas pago. Cidade usa tiles OpenStreetMap; Praia usa geometria local ilustrativa da orla, sem tiles. As zonas aproximadas não são divisas cadastrais oficiais, as palmeiras são decoração e o guia não substitui navegação urbana. Respeitar a [política de tiles](https://operations.osmfoundation.org/policies/tiles/), com atribuição e sem download em massa.

A elegibilidade de `min_native_version` no serviço de OTA já existente ainda precisa de validação/implementação antes de uma distribuição ampla que altere requisitos nativos. Esta candidata não muda esse serviço nem usa o canal de produção. A versão de lançamento precisa revisar o comportamento de rollback/downgrade do serviço antes de voltar ao canal público.

## Rollback e critérios de parada

Base anterior: `ba3d3d6117f5879e41e0d874c0863efb8ac60e1d`.

Interromper distribuição se houver falha de login, acesso entre papéis, confirmação incorreta de pagamento, bloqueio da navegação por teclado/safe area ou travamento do mapa. Como a candidata está isolada, manter App Store/OTA de produção atuais enquanto corrige a branch. Não apagar releases antigos, não reverter banco e não publicar um bundle em produção para testar rollback.
