# Checklist das contas e serviços do PraiaGo

Este arquivo não contém senhas, tokens, certificados ou chaves privadas. Guarde esses dados somente em um gerenciador de senhas.

## O que precisa ser lembrado no computador novo

### 1. Codex / conversa

- Entrar na mesma conta usada no Codex para acessar o histórico desta tarefa.
- Se o histórico não estiver disponível, abrir primeiro `CONTINUIDADE-PRAIAGO.md` no repositório.
- A conversa completa fica no serviço do Codex; o GitHub contém o resumo técnico necessário para continuar com segurança.

### 2. GitHub

- Conta: `driftfutebol-glitch`
- Repositório: `https://github.com/driftfutebol-glitch/praiago`
- Branch atual: `feat/supabase-auth-mapas-seguranca`
- Commit de migração conferido: `d54619a`
- O GitHub é a cópia principal do código-fonte.

Comandos:

```bash
git clone https://github.com/driftfutebol-glitch/praiago.git
cd praiago
git switch feat/supabase-auth-mapas-seguranca
```

### 3. Supabase

- Projeto: PraiaGo
- Project ref: `kfxpzjqktbcsxlqapkyv`
- URL-base: `https://kfxpzjqktbcsxlqapkyv.supabase.co`
- Contém banco, autenticação, storage, realtime, edge functions e dados reais.
- As variáveis públicas dos apps são `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY`.
- Nunca colocar `service_role`, senha do banco ou token de acesso no GitHub ou no chat.
- No computador novo, autenticar novamente o Supabase CLI/MCP em vez de copiar tokens de sessão do computador antigo.

### 4. Vercel

- Hospeda os sites e demos web.
- Site principal: `https://www.praiago.com.br`
- Cadastro do evento: `https://praiago-cadastro.vercel.app`
- Ativação: `https://www.praiago.com.br/ativar`
- Demo Cliente: `https://praiago-demo-cliente.vercel.app`
- Demo Ambulante: `https://praiago-demo-ambulante.vercel.app`
- Painel Restaurante: `https://praiago-restaurante.vercel.app`
- Deploy padrão do site: `https://praiago-site.vercel.app`
- Entrar na mesma conta/equipe da Vercel e conferir os projetos vinculados antes de fazer um novo deploy.
- Não copiar token da Vercel para o GitHub.

### 5. Codemagic

- Login conhecido: `driftfutebol@gmail.com`
- Aplicação: `praiago`
- App ID Codemagic: `6a74a80b532034dc3f9b1a5d`
- Branch selecionada: `feat/supabase-auth-mapas-seguranca`
- O arquivo de configuração é `codemagic.yaml` na raiz.
- Workflows iOS Cliente e Ambulante estão preparados.
- Integração Apple ainda precisa ser criada com o nome exato `praiago-apple`.

### 6. Apple Developer e App Store Connect

- A assinatura Apple Developer está paga e ativa segundo o proprietário.
- Entrar em `https://appstoreconnect.apple.com` e `https://developer.apple.com/account`.
- Bundle Cliente: `com.ferrazcode.praiago.cliente`
- Bundle Ambulante: `com.ferrazcode.praiago.ambulante`
- Guardar em local seguro: Issuer ID, Key ID e arquivo `.p8` da App Store Connect.
- O arquivo `.p8` deve ser enviado somente ao Codemagic e nunca ao GitHub/chat.
- Ainda falta confirmar/criar os registros dos dois apps no App Store Connect e obter os Apple IDs numéricos.

### 7. Google Play Console

- Cliente e Ambulante já possuem trabalho de publicação Android realizado.
- Guardar em segurança o keystore/JKS, alias e senhas de assinatura.
- Guardar também `key.properties` fora do GitHub.
- Versões locais salvas na branch: Cliente `1.0.9` code `10`; Ambulante `1.0.4` code `5`.
- Os recursos gráficos do Play Console ficam em `PraiaGo-PlayStore-Recursos/`.

### 8. Domínio e DNS

- Domínio principal: `praiago.com.br`
- Lembrar da conta do Registro.br/provedor DNS que administra o domínio.
- `www` e domínio sem `www` precisam continuar apontando para o projeto correto da Vercel.
- Não apagar registros TXT de verificação sem confirmar qual serviço ainda depende deles.

### 9. Pagar.me

- Processa Pix e cartão dos pedidos.
- Chaves privadas ficam somente nas Edge Functions/segredos do Supabase.
- O frontend usa apenas chave pública quando necessário.
- Nunca transferir chave secreta por chat, commit ou arquivo público.

## Arquivos secretos para levar separadamente

Transferir por pendrive seguro ou armazenamento criptografado:

- `.env` e `.env.local` dos projetos
- keystore/JKS Android
- `key.properties`
- `.p8` da App Store Connect
- certificados `.p12` e perfis `.mobileprovision`, caso existam
- AAB/APK/IPA que ainda não estejam publicados

Antes de apagar ou formatar o computador antigo, confirmar no novo computador:

1. O repositório clona e abre normalmente.
2. `npm ci` e `npm run build` passam no Cliente e Ambulante.
3. O login no Supabase, Vercel, Codemagic, Apple e Google Play funciona.
4. Os arquivos de assinatura Android e Apple foram transferidos.
5. O gerenciador de senhas contém todas as contas e códigos de recuperação.
