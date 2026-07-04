# PraiaGo Mobile

Ambiente nativo para os apps PraiaGo usando Capacitor.

Apps preparados:

- Cliente: `../praiago-cliente`
- Ambulante: `../praiago-ambulante`
- Restaurante: `../praiago-restaurante`

Todos usam o mesmo Supabase configurado nos `.env.local` de cada app.

## Android no Windows

O Android Studio/SDK fica em:

- `ANDROID_HOME=%LOCALAPPDATA%\\Android\\Sdk`
- `JAVA_HOME=C:\\Program Files\\Android\\Android Studio\\jbr`

Para sincronizar tudo:

```powershell
.\mobile\sync-mobile.ps1
```

Para gerar APK debug:

```powershell
.\mobile\build-android-debug.ps1
```

Para abrir o emulador criado:

```powershell
.\mobile\start-emulator.ps1
```

Para abrir um app no Android Studio:

```powershell
.\mobile\open-android-studio.ps1 praiago-cliente
.\mobile\open-android-studio.ps1 praiago-ambulante
.\mobile\open-android-studio.ps1 praiago-restaurante
```

Para gerar Android App Bundle release:

```powershell
.\mobile\build-android-bundle.ps1
```

Observacao: para publicar na Play Store, assine o bundle com uma keystore definitiva da empresa.

## iOS

As pastas `ios/` ja estao preparadas para Cliente, Ambulante e Restaurante. No Windows, o caminho certo e compilar em macOS na nuvem com Codemagic.

Guia do fluxo iOS:

```powershell
Get-Content .\mobile\ios-cloud.md
```

Primeiro rode no Codemagic os workflows de simulador:

- `ios-cliente-simulator`
- `ios-ambulante-simulator`
- `ios-restaurante-simulator`

Depois de configurar Apple Developer, App Store Connect e certificados, rode os workflows de TestFlight:

- `ios-cliente-testflight`
- `ios-ambulante-testflight`
- `ios-restaurante-testflight`

## Atualizacao sem reinstalar o app

Os tres apps usam live update OTA para arquivos web (`HTML`, `JS`, `CSS` e assets do `dist`). Depois que a versao nativa com o plugin estiver instalada uma vez, correcoes de tela, botoes e regras em React podem ser publicadas assim:

```powershell
$env:SUPABASE_SERVICE_ROLE_KEY="SUA_SERVICE_ROLE_KEY"
.\mobile\publish-ota.ps1 praiago-cliente 1.0.1 -Notes "Correcoes no pagamento"
.\mobile\publish-ota.ps1 praiago-ambulante 1.0.1
.\mobile\publish-ota.ps1 praiago-restaurante 1.0.1
```

O app verifica a atualizacao ao abrir/voltar para primeiro plano, baixa em segundo plano e aplica no proximo fechamento/abertura. Mudancas nativas, como plugin novo, permissao, camera, GPS, SDK ou identificador do app, ainda precisam de novo APK/AAB ou build iOS.
