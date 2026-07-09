# PraiaGo - ambiente do cliente e deploy

## Projetos separados para hospedagem

Use um projeto de hospedagem para cada painel/site:

| Nome do projeto | Pasta raiz | Tipo | Porta local |
| --- | --- | --- | --- |
| `praiago-admin` | `praiago-admin` | site/painel web | `5174` |
| `praiago-restaurante` | `praiago-restaurante` | site/painel web | `5176` |
| `praiago-cliente` | `praiago-cliente` | app web/PWA do cliente | `5173` |
| `praiago-ambulante` | `praiago-ambulante` | app web/PWA do ambulante | `5175` |

Todos ja tem `vercel.json` com:

- `buildCommand`: `npm run build`
- `outputDirectory`: `dist`
- fallback SPA para rotas React.

No Vercel, crie projetos separados apontando para a mesma branch do GitHub, mudando apenas o `Root Directory`.

## Variaveis obrigatorias nos projetos web

Configure em cada projeto hospedado:

```text
VITE_SUPABASE_URL=https://SEU-PROJETO.supabase.co
VITE_SUPABASE_ANON_KEY=SUA_CHAVE_ANON_PUBLICA
```

Nunca coloque `SUPABASE_SERVICE_ROLE_KEY` em app web. Essa chave fica apenas em Edge Functions, scripts seguros ou ambiente administrativo controlado.

## O que instalar no PC do cliente para rodar local

Instale:

1. Git for Windows
2. Node.js LTS
3. Google Chrome ou Microsoft Edge
4. Visual Studio Code, opcional para suporte

Depois, no PowerShell dentro da pasta do projeto:

```powershell
npm --prefix praiago-admin install
npm --prefix praiago-restaurante install
npm --prefix praiago-cliente install
npm --prefix praiago-ambulante install
```

Para rodar local:

```powershell
npm --prefix praiago-cliente run dev -- --host 0.0.0.0 --port 5173 --strictPort
npm --prefix praiago-admin run dev -- --host 0.0.0.0 --port 5174 --strictPort
npm --prefix praiago-ambulante run dev -- --host 0.0.0.0 --port 5175 --strictPort
npm --prefix praiago-restaurante run dev -- --host 0.0.0.0 --port 5176 --strictPort
```

## Apps iOS na nuvem

No Windows nao precisa instalar Xcode. O iOS fica pelo Codemagic.

O arquivo `codemagic.yaml` ja tem workflows para:

- Cliente iOS
- Ambulante iOS
- Restaurante iOS

Antes do TestFlight, configure no Codemagic:

- grupo `praiago_public_env`
- grupo `praiago_ios_appstore`
- integracao App Store Connect `praiago-apple`

O passo a passo completo esta em `mobile/ios-cloud.md`.

## Android local

Para Android no PC, alem de Git/Node, instale:

1. Android Studio
2. Android SDK pelo Android Studio
3. JDK que vem no Android Studio

Depois use os scripts em `mobile/`:

```powershell
.\mobile\sync-mobile.ps1
.\mobile\build-android-debug.ps1
.\mobile\start-emulator.ps1
```
