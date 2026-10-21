# 📍 Perto — a família sempre por perto

Compartilhe a localização do celular **em tempo real** com a família, no **Android e no iOS**.
Sem login: cada aparelho tem o **seu código de pareamento** (ex.: `K7M4-QX2P`). Digite o código da sua esposa e ela aparece no mapa, ao vivo, com coordenadas GPS, velocidade, bateria e endereço.

| | |
|---|---|
| **App** | Capacitor 7 + React + TypeScript + MapLibre GL (mapas OpenFreeMap, sem chave de API) |
| **Backend** | Node 22 (sem framework) + WebSocket (`ws`) + SQLite (`node:sqlite`) |
| **Deploy** | Docker → `ghcr.io/juninmd/family-location` → ArgoCD (`app-charts/family-location`) |
| **Pesquisa** | [docs/BENCHMARK.md](docs/BENCHMARK.md) — Life360, Find My, Google Maps, Zenly, Glympse, OwnTracks, Traccar… |

## Recursos
- 🗺️ **Mapa ao vivo** com avatares animados, trilha (1/6/24 h), precisão do GPS, tema claro/escuro.
- 🔢 **Pareamento por código** (8 caracteres, sem 0/O/1/I/L). Quem tem o código vê você; você vê e remove quem te acompanha, pausa o compartilhamento ou **troca o código** (revoga todos).
- 📡 Coordenadas (decimal e graus/min/seg), velocidade, direção, altitude, bateria/carregando, endereço (Nominatim com cache), distância até você, “rota até aqui”.
- 🏠 **Lugares** (Casa, Escola…) com aviso de **chegada/saída**; feed de **Atividade**.
- 🚨 **SOS**, check-in e **mensagens rápidas** (“Cheguei”, “Estou a caminho”…) com a localização exata.
- ✅ **Consentimento**: opção de aprovar cada novo acompanhante; **códigos temporários** (1/8/24 h) que expiram sozinhos; **QR Code** para parear (gerar e escanear).
- 👪 **Grupos** (Família, Amigos…), **alertas de velocidade** por pessoa, **bateria baixa**, **resumo de 24 h** (distância, velocidade máxima, paradas) e **reprodução do trajeto**.
- 📴 **Fila offline**: sem sinal os pontos são guardados e enviados em lote ao reconectar; modo adaptativo (parado = menos GPS e menos bateria).
- 🔔 **Push com o app fechado** (FCM, opcional — ver [docs/PUSH.md](docs/PUSH.md)); PWA com cache do app e dos tiles do mapa.
- 🔋 Rastreamento em segundo plano (serviço em primeiro plano no Android; modo `location` no iOS), com envio por HTTP nativo (o WebView é suspenso em background).
- 🛡️ Privacidade: sem e-mail/senha/telefone; histórico de 72 h; apagar conta e dados no app; notificação fixa sempre visível enquanto compartilha.

## Arquitetura
```
celular ──(GPS)──► tracker.ts ──WS (foreground) / HTTP nativo (background)──► servidor
                                                                              │ SQLite (positions, follows, places, events)
celular ◄──────────── WebSocket: pos / person / event / watchers ◄────────────┘
```
Segurança sem login: o `register` devolve `id` + `secret` aleatório (guardado só no aparelho; o servidor guarda o hash SHA-256) e o **código público** de pareamento. Só quem tem o `secret` publica posição; só quem tem o código acompanha. Tentativas de código têm rate-limit.

## Rodar localmente
```bash
cd server && npm ci && npm test            # 5 testes de integração (HTTP + WebSocket)
cd ../app && npm ci && npm run build       # gera app/dist
cd ../server && PUBLIC_DIR=../app/dist npm start   # http://localhost:3000 (PWA + API)
node test/simulate.js http://localhost:3000        # 3 familiares fictícios se movendo (demo)
```
Desenvolvimento do front com HMR: `cd app && npm run dev` (proxy para o servidor em :3000).

## Gerar os apps
- **Android (APK):** `cd app && npm run build && npx cap sync android && cd android && ./gradlew assembleRelease` → `android/app/build/outputs/apk/release/app-release.apk`. Assinado com `android/debug.keystore` (chave fixa do repositório, para atualizar sem desinstalar). Para uma chave própria defina `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD` nos *secrets* do GitHub.
- **iOS (IPA):** só compila em macOS. O workflow `.github/workflows/mobile.yml` roda em `macos-latest` e gera `Perto-unsigned.ipa` (sem assinatura). Instale com **AltStore / Sideloadly / TrollStore** (assinam com seu Apple ID) ou distribua via TestFlight com conta de desenvolvedor.
  **Atalho sem IPA:** abra o endereço do servidor no Safari → Compartilhar → *Adicionar à Tela de Início* (PWA; GPS só com o app aberto).
- Os dois são publicados na release **`latest`** do GitHub: `…/releases/download/latest/Perto.apk` e `…/Perto-unsigned.ipa`.

## Servidor / deploy
`app/capacitor.config.json` não fixa o servidor: o app usa `https://family-location.antonio-code.duckdns.org` (altere em `app/.env` com `VITE_SERVER_URL=` ou, no app, **Perfil → Avançado → Servidor**).
O chart está em `app-charts/family-location` (Deployment 1 réplica + PVC SQLite + Ingress Traefik/`wildcard-tls`) e o `argocd/family-location-app.yaml` o registra.

## Variáveis do servidor
| Variável | Padrão | Para quê |
|---|---|---|
| `PORT` | `3000` | porta HTTP/WebSocket |
| `DB_PATH` | `./data/family.sqlite` | banco SQLite |
| `PUBLIC_DIR` | `./public` | PWA estático servido na raiz |
| `BACKUP_DIR` / `BACKUP_KEEP` / `BACKUP=off` | `<DB_DIR>/backups` / `7` | backup diário online do SQLite |
| `FCM_SERVICE_ACCOUNT_JSON` ou `_FILE` | — | ativa push (JSON ou base64 da conta de serviço Firebase) |

## Limites conhecidos
- Widgets de tela inicial (Android/iOS) **não** foram implementados: exigem código nativo (AppWidget / WidgetKit) — ficam como próxima etapa.
- iOS em segundo plano: se o usuário **encerrar o app** (deslizar para cima), o iOS para o rastreamento. Android: alguns fabricantes (Xiaomi, Huawei…) exigem desativar a otimização de bateria para o app.
- Push com o app fechado exige FCM (Android) / APNs (iOS, conta paga): alertas chegam por WebSocket e notificação local enquanto o processo está vivo (push FCM opcional no Android).
- OpenFreeMap é um serviço público sem SLA — a URL do estilo é configurável (`VITE_MAP_STYLE`).
- Publicar nas lojas exige declarações de localização em segundo plano (Play) e justificativa (App Store 2.5.4); ver riscos no benchmark.
