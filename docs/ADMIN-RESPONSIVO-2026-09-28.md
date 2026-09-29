# PraiaGo Admin — redesign responsivo — 28/09/2026

## Escopo
Redesign do painel Admin para computador, tablet e celular, seguindo a referência azul-marinho/roxa enviada. Sem migração de banco, alteração de saldos, envio de OTA ou publicação nativa.

- Navegação agrupada no computador, barra inferior no celular e menu completo em diálogo nativo.
- Busca de opções com Ctrl/Cmd+K, normalização de acentos e respeito às permissões.
- Central de pendências e atalhos por conta; consultas de contadores compartilhadas.
- Início com contagens exatas de pedidos/perfis, filas e atividade de sete dias.
- Volume de pedidos entregues separado de saldo/lucro. Valor indisponível não vira zero.
- Gráfico limita a consulta a 500 pedidos; limite/amostra explicitamente indicado. Dias em America/Sao_Paulo.
- Tabelas de pedidos, financeiro, atendimento, segurança, novos cadastros, evento e localização viram cartões rotulados no celular, sem duplicar ações.
- Login, segurança, troca de conta, contraste, filtros, notificações e áreas de toque revisados.
- Carregamento sob demanda de páginas e suporte à preferência de redução de movimento.
- Regras existentes de permissões, aprovação, conciliação externa, confirmação e auditoria mantidas.

## Verificações
- Admin: TypeScript/Vite build aprovado e 21 testes de exceções administrativas aprovados.
- Harness Cliente: 119 testes aprovados em 13 arquivos, incluindo 24 testes novos de navegação, login, permissões, falhas de consulta, métricas e tabelas.
- Oxlint: zero erros; três avisos preexistentes de Fast Refresh em src/lib/dialog.tsx.
- Navegador local: todas as 25 opções do menu percorridas em 390px, 320px e 1440px. Inicial também conferida em 768px. Cortes nos filtros de verificações e cadastros de evento corrigidos e reconferidos.
- Login inspecionado em desktop e 390px. Busca sem acentos, navegação, atalhos e fechamento de diálogo conferidos.
- Suporte conferido com linhas animadas, colunas condicionais e rótulos nos cartões.
- Fixtures em tests/visual são exclusivamente locais, com aviso visível, Supabase substituído e escritas bloqueadas. Não se trata de sessão administrativa real.
- Busca por marcadores de fixtures no dist de produção: nenhum resultado.
- Não foram aprovados saques, alteradas regras de IP ou executadas ações financeiras durante o QA.

## Reproduzir QA local
No praiago-admin: node tests/visual/server.mjs
Servidor exclusivo em http://127.0.0.1:5184, com dados de teste visivelmente identificados e sem banco real.
A rota /login-test serve apenas nesse servidor de QA; não integra a aplicação de produção.
Testes de interface: no praiago-cliente, npm test -- --run tests/adminWorkspace.test.tsx.

## Publicação
Pré-deploy: versão anterior do Admin confirmada no Vercel:
- Projeto: praiago-admin; escopo pedrin1; Root Directory praiago-admin.
- Deployment anterior / rollback: dpl_FMsNv6ii7Bq6yUishkxQttZdympw.
- Commit anterior publicado: 29f138d4a636fd03c3276bb108b37f3302a54cc1.
- Domínio: https://admin.praiago.com.br.

A nova publicação será feita a partir de checkout limpo do commit de redesign, com preview antes de produção. Atualizar esta seção com IDs, SHA, arquivos servidos e resultado da verificação pública após o deploy.

Limite de validação: as telas internas foram verificadas em ambiente de QA isolado. A sessão real do Admin estava deslogada; não contornar a autenticação para testar produção.
