# iOS sem renovar a cada 7 dias (TestFlight)

O IPA da release `latest` é **sem assinatura** (precisa de AltStore/Sideloadly e expira em 7 dias com Apple ID gratuito).
Para instalar via **TestFlight** (builds de 90 dias, sem cabo) é preciso uma conta **Apple Developer (US$ 99/ano)**.

1. Em developer.apple.com → *Identifiers*, crie o App ID `br.com.juninmd.perto` (capacidades: *Push Notifications* se for usar push).
2. Crie o certificado **Apple Distribution** e exporte como `.p12`; crie o perfil de provisionamento **App Store** para o App ID.
3. Em appstoreconnect.apple.com crie o app (mesmo bundle id) e uma **chave de API** (Users and Access → Integrations) — baixe o `.p8`.
4. No GitHub → Settings → Secrets → Actions, cadastre:
   `IOS_CERT_P12_BASE64`, `IOS_CERT_PASSWORD`, `IOS_PROVISION_PROFILE_BASE64`, `IOS_TEAM_ID`,
   `APPSTORE_ISSUER_ID`, `APPSTORE_KEY_ID`, `APPSTORE_PRIVATE_KEY` (base64: `base64 -i arquivo | pbcopy`).
5. Rode **Actions → iOS → TestFlight → Run workflow**. Em alguns minutos o build aparece no TestFlight; convide a família pelo e-mail.

> O workflow `ios-testflight.yml` foi escrito seguindo o fluxo padrão do `xcodebuild`/`altool`, mas **não pôde ser testado** sem as credenciais — ajuste conforme o erro que aparecer na primeira execução.
