# iOS na nuvem pelo Windows

Xcode nao roda no Windows. O fluxo certo no nosso caso e: o Windows prepara o codigo Capacitor, sobe para o Git, e o Codemagic compila em macOS/Xcode na nuvem.

## O que ja esta pronto

- Projetos iOS criados para:
  - Cliente: `com.ferrazcode.praiago.cliente`
  - Ambulante: `com.ferrazcode.praiago.ambulante`
  - Restaurante: `com.ferrazcode.praiago.restaurante`
- `codemagic.yaml` na raiz com workflows:
  - `ios-cliente-simulator`
  - `ios-ambulante-simulator`
  - `ios-restaurante-simulator`
  - `ios-cliente-testflight`
  - `ios-ambulante-testflight`
  - `ios-restaurante-testflight`
- Schemes Xcode compartilhados `App.xcscheme` nos tres projetos.
- OTA ja configurado, entao depois da primeira versao instalada/TestFlight as correcoes web podem ir sem novo build iOS.
- O `codemagic.yaml` usa grupos de variaveis para nao gravar chaves sensiveis no repositorio.

## Comecar teste iOS na nuvem

1. Subir este repositorio para o GitHub/GitLab/Bitbucket.
2. Entrar em https://codemagic.io e adicionar o repositorio.
3. Criar o grupo de variaveis `praiago_public_env` no Codemagic:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
   - `CAPACITOR_OTA_UPDATE_URL` opcional, se quiser sobrescrever a URL padrao
   - `CAPACITOR_OTA_CHANNEL` opcional, exemplo `production`
   - Exemplo sem segredos: `mobile/codemagic-env.example`
4. Rodar primeiro estes workflows, que nao precisam de assinatura Apple:
   - `ios-cliente-simulator`
   - `ios-ambulante-simulator`
   - `ios-restaurante-simulator`

Se esses tres passarem, o app ja esta compilando no Xcode da nuvem.

## Para enviar ao TestFlight

1. Conta Apple Developer ativa.
2. Acesso ao App Store Connect.
3. Criar os tres App Records no App Store Connect com estes bundle IDs:
   - `com.ferrazcode.praiago.cliente`
   - `com.ferrazcode.praiago.ambulante`
   - `com.ferrazcode.praiago.restaurante`
4. Criar uma API Key no App Store Connect:
   - Role: `App Manager` ou `Admin`
   - Guardar `Issuer ID`, `Key ID` e o arquivo `.p8`
5. No Codemagic:
   - Conectar este repositorio.
   - Adicionar a integracao App Store Connect com o nome `praiago-apple`.
   - Gerar ou buscar certificados Apple Distribution.
   - Gerar ou buscar provisioning profiles `app_store` para os tres bundle IDs.
6. Criar o grupo de variaveis `praiago_ios_appstore` no Codemagic:
   - `PRAIAGO_CLIENTE_APPLE_ID`
   - `PRAIAGO_AMBULANTE_APPLE_ID`
   - `PRAIAGO_RESTAURANTE_APPLE_ID`

Os Apple IDs acima ficam dentro de cada app no App Store Connect em `General > App Information > Apple ID`.

Depois disso, rodar um TestFlight por vez:

```text
ios-cliente-testflight
ios-ambulante-testflight
ios-restaurante-testflight
```

## Limites importantes

Atualizacao OTA cobre mudancas web: tela, botao, CSS, regra React, chamadas para API e assets. Mudancas nativas como plugin novo, permissao, camera/GPS, bundle ID, SDK iOS ou configuracao Xcode ainda precisam de novo build na nuvem e novo TestFlight/App Store.

## Referencias oficiais

- Codemagic Ionic Capacitor: https://docs.codemagic.io/yaml-quick-start/building-an-ionic-app/
- Variaveis e grupos no Codemagic: https://docs.codemagic.io/yaml-basic-configuration/configuring-environment-variables/
- Usar variaveis entre scripts com `CM_ENV`: https://docs.codemagic.io/yaml-basic-configuration/using-environment-variables/
- Assinatura iOS: https://docs.codemagic.io/yaml-code-signing/signing-ios/
- Publicar no App Store Connect/TestFlight: https://docs.codemagic.io/yaml-publishing/app-store-connect/
