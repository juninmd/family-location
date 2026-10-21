# Push com o app fechado (opcional)

Sem isso o Perto continua funcionando: avisos chegam por WebSocket (app aberto) e notificação local. Com push, **SOS, chegadas/saídas, bateria baixa e pedidos de acompanhamento** chegam mesmo com o app fechado (Android).

## 1. Firebase
1. Crie um projeto em console.firebase.google.com e adicione um app **Android** com o pacote `br.com.juninmd.perto`.
2. Baixe o `google-services.json`.
3. Em *Configurações do projeto → Contas de serviço → Gerar nova chave privada*, baixe o JSON da conta de serviço.

## 2. App (APK)
No GitHub → Settings → Secrets → Actions crie `GOOGLE_SERVICES_JSON` com o conteúdo do `google-services.json`.
O workflow `mobile.yml` passa a gravá-lo em `app/android/app/` e compila com `VITE_PUSH_ENABLED=true`.

## 3. Servidor (Kubernetes)
```bash
kubectl -n family-location create secret generic family-location-secret \
  --from-file=FCM_SERVICE_ACCOUNT_JSON=conta-de-servico.json
kubectl -n family-location rollout restart deploy/family-location
```
(O deployment já referencia esse secret como opcional.) Nos logs aparece `push: FCM ativo`.

> iOS: push exige conta Apple Developer + APNs configurado no Firebase; o IPA sem assinatura **não** recebe push. Use o TestFlight ([docs/IOS-TESTFLIGHT.md](IOS-TESTFLIGHT.md)).
