# Continuidade do PraiaGo

Atualizado em 21/08/2026 para migração a outro computador.

## Repositório e versão atual

- GitHub: `https://github.com/driftfutebol-glitch/praiago`
- Branch de trabalho e produção atual: `feat/supabase-auth-mapas-seguranca`
- Commit-base conferido antes da preparação do iOS: `c198923`
- Commit da preparação Codemagic e correção do banner: `5bb90c3`
- O repositório remoto e o computador estavam sincronizados após esse commit.

No computador novo:

```bash
git clone https://github.com/driftfutebol-glitch/praiago.git
cd praiago
git switch feat/supabase-auth-mapas-seguranca
```

## Aplicativos móveis

| Aplicativo | Pasta | Bundle ID iOS/Android |
|---|---|---|
| Cliente | `praiago-cliente` | `com.ferrazcode.praiago.cliente` |
| Ambulante | `praiago-ambulante` | `com.ferrazcode.praiago.ambulante` |

Os dois usam React, Vite, TypeScript, Capacitor 8 e Supabase. Os projetos nativos iOS ficam em `ios/App/App.xcodeproj`, com scheme `App`.

### Visual conferido

- Cliente: Início, Explorar, Radar, Eventos, Pedidos e Perfil carregaram em 390x844 sem tela branca, sem rolagem horizontal e sem erro de console.
- O destaque da tela inicial foi corrigido de “Eventos na Praia” para “Eventos na Baixada”.
- Ambulante: login novo conferido em 390x844, com logo completa, sem overflow e sem erro de console.
- `npm run build` passou nos dois aplicativos.
- `npx cap sync ios` passou nos dois aplicativos no Windows; o Codemagic repetirá a sincronização no macOS antes de compilar.

## Codemagic

- Conta conectada: `driftfutebol@gmail.com`
- Aplicação Codemagic: `praiago`
- Repositório GitHub já conectado.
- Aplicação Codemagic ID: `6a74a80b532034dc3f9b1a5d`
- A branch selecionada no painel foi alterada de `main` para `feat/supabase-auth-mapas-seguranca`.
- O arquivo raiz `codemagic.yaml` contém workflows separados de simulador e TestFlight para Cliente e Ambulante.
- Node foi fixado em `22.14.0` nos workflows para compatibilidade com Capacitor 8.
- A publicação automática está limitada ao TestFlight; `submit_to_app_store` não é executado automaticamente.

Workflows principais:

- `ios-cliente-simulator`
- `ios-ambulante-simulator`
- `ios-cliente-testflight`
- `ios-ambulante-testflight`

### Configuração Apple ainda pendente

O Codemagic ainda não está conectado ao Apple Developer Portal. O formulário espera:

1. Nome da integração: `praiago-apple`
2. Issuer ID
3. Key ID
4. Arquivo privado `.p8` da chave App Store Connect

Depois, criar ou buscar um certificado Apple Distribution e os perfis App Store dos dois bundle IDs.

O App Store Connect abriu na tela de login e não foi autenticado nesta sessão. Após entrar, confirmar se já existem os dois registros de app. Os workflows esperam estas variáveis no grupo `praiago_ios_appstore`:

- `PRAIAGO_CLIENTE_APPLE_ID`
- `PRAIAGO_AMBULANTE_APPLE_ID`

O grupo `praiago_public_env` precisa conter as variáveis públicas usadas no build:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `VITE_PAGARME_PUBLIC_KEY` apenas se o build Cliente exigir essa chave

Nunca colocar `service_role`, senha do banco, chave secreta Pagar.me ou conteúdo do `.p8` no GitHub ou em conversa.

## Infraestrutura

- Supabase ref: `kfxpzjqktbcsxlqapkyv`
- Vercel: sites e demos do PraiaGo
- Site institucional: `https://www.praiago.com.br`
- Sistema de cadastro do evento: `https://praiago-cadastro.vercel.app`
- Ativação de conta: `https://www.praiago.com.br/ativar`

## Arquivos que precisam ser transferidos separadamente e com segurança

O `.gitignore` exclui corretamente estes itens. Eles não estarão no clone do GitHub:

- `.env`, `.env.local` e demais arquivos de ambiente de cada app
- keystore/JKS e `key.properties` usados na assinatura Android
- arquivo `.p8` da App Store Connect
- certificados `.p12`, `.cer` e perfis `.mobileprovision`, caso existam localmente
- pacotes AAB/APK/IPA já gerados dentro de pastas `release`

Transferir esses arquivos por um pendrive seguro ou armazenamento criptografado. Não enviar por chat, commit ou repositório público.

## Comandos de preparação no computador novo

Em cada pasta `praiago-cliente` e `praiago-ambulante`:

```bash
npm ci
npm run build
npx cap sync ios
```

O build iOS assinado deve ser feito pelo Codemagic em uma máquina macOS, não pelo Windows.

## Próxima ação exata

1. Entrar em `https://appstoreconnect.apple.com` no Chrome.
2. Criar/conferir os dois registros dos apps e seus bundle IDs.
3. Criar uma chave App Store Connect com a menor permissão necessária para build/publicação.
4. Conectar essa chave no Codemagic com o nome `praiago-apple`.
5. Configurar os grupos de variáveis.
6. Rodar primeiro `ios-cliente-simulator` e `ios-ambulante-simulator`.
7. Somente depois rodar os workflows de TestFlight.

