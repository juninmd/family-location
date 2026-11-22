# AGENTS.md

Perto ("family always nearby"): real-time location sharing for families on Android and iOS. Pairing uses a short code instead of login. Product text is in Portuguese (pt-BR).

## Stack
- App (`app/`): Capacitor 7, React, TypeScript, MapLibre GL (OpenFreeMap tiles, no API key)
- Server (`server/`): Node 22 with no framework, `ws` for WebSocket, SQLite through `node:sqlite`
- Deploy: Docker image `ghcr.io/juninmd/family-location`, released through ArgoCD (`app-charts/family-location`)

## Commands
Server (`cd server`):
- Install: `npm ci`
- Test: `npm test` (`node --test test/*.test.js`)
- Start: `PUBLIC_DIR=../app/dist npm start` (port 3000)
- Dev: `npm run dev` (watch mode)
- Demo with fake users: `node test/simulate.js http://localhost:3000`

App (`cd app`):
- Install: `npm ci`
- Build: `npm run build` (`tsc --noEmit` and `vite build`)
- Dev: `npm run dev` (proxies the API to `:3000`)
- Sync native projects: `npm run sync` (`cap sync`)

Native builds: Android with `cd app/android && ./gradlew assembleRelease`. iOS builds only on macOS (see `.github/workflows/mobile.yml`).

## Structure
- `app/src/lib/`: API client, config, native tracker, push, socket, store
- `app/src/map/`: map view, geo helpers, markers, style
- `app/src/ui/`: screens and components
- `app/android/`, `app/ios/`: Capacitor native projects
- `server/src/`: HTTP app and entry point, SQLite, push (FCM), geocoding, backup
- `server/test/`: integration tests and the demo simulator
- `docs/`: benchmark, push setup, iOS TestFlight

## Conventions
- Login-free security model. `register` returns an `id` and a random `secret`. The device keeps the secret; the server stores only its SHA-256 hash. Only the holder of the secret publishes positions, and only the holder of the pairing code follows. Keep this model. Code attempts are rate-limited
- Do not collect email, password or phone number. Location history is kept for 72 hours
- Node 22 only, with the built-in test runner and `node:sqlite`. Do not add a framework for the server
- Background tracking sends through native HTTP, because the WebView is suspended in the background

## Gotchas
- **Server URL:** the app defaults to the production domain. Override it with `VITE_SERVER_URL` in `app/.env`, or in the app under Profile -> Advanced -> Server
- **Android signing:** `android/debug.keystore` is a fixed key committed on purpose, so updates install over the old build. To use your own key, set `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS` and `ANDROID_KEY_PASSWORD` as GitHub secrets
- **Single replica:** the server stores data in SQLite on a PVC. Keep one replica
- **Environment:** `PORT`, `DB_PATH` (default `./data/family.sqlite`), `PUBLIC_DIR`, `BACKUP_DIR`, `BACKUP_KEEP`, `BACKUP=off`, and `FCM_SERVICE_ACCOUNT_JSON` or `FCM_SERVICE_ACCOUNT_FILE` for push. Treat the FCM value as a secret and never log it
- **Push:** optional. See `docs/PUSH.md`
- **Platform limits:** iOS stops tracking if the user force-quits the app. Some Android vendors need battery optimization turned off for the app. Home-screen widgets are not implemented yet

<!-- base-actions-main-policy -->
## GitHub Actions — padrão obrigatório (@main)

- Referencie as actions internas sempre pelo branch, nunca por SHA:
  - `uses: juninmd/base-actions/<action>@main`
  - `uses: juninmd/base-actions/.github/workflows/<arquivo>.yml@main`
- Não fixe `@<sha>` em `juninmd/base-actions`: a atualização é centralizada no
  `main` e passa a valer no próximo run.
- PRs cujos checks não iniciam por billing/spending limit são mesclados pelo bot central
  `juninmd/base-actions/.github/workflows/auto-merge-billing-blocked.yml`.
  Para impedir o merge automático de um PR, aplique a label `do-not-merge`.