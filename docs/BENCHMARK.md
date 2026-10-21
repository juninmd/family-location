# Benchmark: localização em tempo real para família (sem login, pareamento por código)

Data da pesquisa: out/2026. Legenda de confiança: [V] verificado em fonte oficial/primária; [S] fonte secundária ou de concorrente (confirmar antes de decidir); [C] conhecimento geral do autor, não re-verificado nesta pesquisa. Preços mudam com frequência: sempre confirmar nas páginas oficiais.

## 1. Apps de consumo

| App | Mapa ao vivo | Histórico/trilha | Lugares/geofence | Bateria | SOS / check-in | Direção/queda | Privacidade e pareamento | Negócio |
|---|---|---|---|---|---|---|---|---|
| **Life360** | Sim, por "Círculo" | Free 2 dias, Silver 7, Gold/Platinum 30 [S] | Alertas de chegada/saída; lugares ilimitados nos planos altos [S] | Mostra bateria do membro [C] | SOS e check-in; assistência de emergência em planos pagos [S] | Relatório de direção, detecção de acidente (tier incerto) [S] | Conta + convite/código de círculo. Em 2021 a The Markup acusou venda de localização precisa a brokers [S] | Freemium + assinaturas (Silver/Gold/Platinum; preços divergem entre fontes, ~US$8-25/mês); hardware Tile |
| **Apple Find My / Compartilhar localização** | Sim, tempo real; direção e velocidade ao se mover [V] | Não (só localização atual) [C] | Notificação de chegada/saída, opt-in por pessoa [V] | Não destacado [C] | Check In (aviso de chegada) e satélite (iPhone 14/15+) [V/S] | Detecção de acidente é recurso do iOS, não do Find My [C] | Compartilha por uma hora, um dia ou indefinidamente [V]; exige Apple ID, só ecossistema Apple; dados criptografados | Grátis, parte do ecossistema (lock-in) |
| **Google Maps (compartilhar local)** | Sim | Não (Timeline é separado e local) [C] | Não | Mostra % de bateria e se carrega [S] | Não | Não | Duração até 1 dia ou "até desativar"; exige conta Google; destinatário pode ver por link [S] | Grátis; monetiza o ecossistema |
| **Zenly (encerrado)** | Sim, mapa social com avatares | Não | Lugares ("Home") [C] | Mostrava bateria [C] | Não | Não | "Ghost mode" (congelar/borrar localização) [S]; conta + amigos mútuos | Nunca monetizou bem; Snap encerrou em 03/02/2023 por corte de custos [S]. Lição: custo de manter app grátis em escala |
| **Glympse** | Sim, por link | Não | Não | Não | Não (é mais "compartilhar ETA") | Velocidade e ETA [S] | Compartilhamento temporário de 5 min a 12 h, destinatário não precisa de app nem conta, dados apagados após expirar [S] | Grátis para consumidores; B2B (Glympse En Route, tags premium US$9,99/mês) [S] |
| **OwnTracks** | Mapa simples / apps de terceiros | Sim, no seu servidor | Regiões (geofence) com eventos enter/leave [C] | Modos "significant changes" (economiza) e "move" (consome como navegação; padrão 100 m / 300 s) [V] | Não | Não | Open source, sem conta; você controla o broker MQTT ou endpoint HTTP | Grátis, auto-hospedado |
| **Traccar (Client + Server)** | Sim (web) | Sim, relatórios e trilhas | Geofences e alertas | Intervalo e distância configuráveis [C] | Botão de alarme [C] | Alertas de velocidade/movimento [C] | Cliente Apache 2.0, sem anúncios [V]; pareia por "identifier" do dispositivo (parecido com nosso código) | Servidor grátis/open source; hospedagem paga de terceiros |
| **GeoZilla** | Sim | Sim | Sim | Sim [C] | SOS [C] | Direção em planos pagos [C] | Conta + círculo | Freemium, ~US$5,80/mês [S] |
| **FamiSafe** | Sim | Sim | Sim | [C] | SOS [C] | Driving Safety [S] | Controle parental (bloqueio de apps, tempo de tela); consentimento é do responsável | Assinatura US$4,99-9,99/mês [S] |
| **Familo** | Sim | [C] | [C] | [C] | Botão de pânico + chat familiar [V] | [C] | Cada usuário decide quem vê; permissão para entrar no círculo [V] | Grátis + assinatura (~US$9,99/mês, US$59,99/ano) [S] |
| **Hoop** | Não encontrado: o "Hoop" achado é app britânico de atividades infantis, não de localização [S] | n/a | n/a | n/a | n/a | n/a | n/a | Comissão de 10% sobre reservas [S]. Descartar da comparação |

### Leituras do mercado
- **Gratuito sem login funciona só com custo de infra baixo.** Zenly morreu por não monetizar. Nosso backend é leve (WebSocket + posição em memória/Redis), então o custo é pequeno se não guardarmos histórico longo.
- **Life360 domina por recursos pagos** (histórico, direção, SOS), mas tem a pior reputação de privacidade. Diferencial possível: "não vendemos nem guardamos seus dados".
- **Glympse e Traccar provam o modelo sem conta**: link/identificador + expiração (Glympse) e identificador de dispositivo (Traccar). Nosso código de pareamento segue essa linha.
- **Apple e Google ganham pela integração** (sem instalar nada), mas não atravessam plataformas (Apple) nem oferecem histórico/lugares. Nosso espaço: família mista Android+iOS, sem conta.

## 2. Ferramentas técnicas

### 2.1 Geolocalização em background

| Item | @capacitor-community/background-geolocation | Transistorsoft capacitor-background-geolocation |
|---|---|---|
| Serve para | Watcher simples: callback de localização em background (Android: foreground service com notificação; iOS: modo `location`) | SDK completo: detecção de movimento (acelerômetro/giroscópio), para o GPS quando parado, geofencing, persistência SQLite, upload HTTP nativo, headless |
| Licença/custo | MIT, grátis [V] | Licença paga por app ID (perpétua, 1 ano de updates); build release exige chave, v9+ usa JWT também no iOS [S] |
| Capacitor | Suporta até Capacitor 7 (plugin v1) [V]. Confirmar compatibilidade com a versão do projeto | Acompanha versões atuais [C] |
| Limitações | Sem pausa de watcher (só remover); sem upload nativo; sem geofence; sem detecção de movimento; manutenção modesta (20 issues abertas) [V] | Custo e chave por app; mais complexo |
| Android | Exige `backgroundMessage` (vira texto da notificação do foreground service); `POST_NOTIFICATIONS` no Android 13+; `android.useLegacyBridge: true`, senão as atualizações param após 5 min em background; após 5 min o Android limita requisições HTTP iniciadas pelo WebView, usar plugin HTTP nativo (CapacitorHttp) [V] | Foreground service próprio, mais robusto contra Doze/OEM [C] |
| iOS | `Info.plist`: `NSLocationWhenInUseUsageDescription`, `NSLocationAlwaysAndWhenInUseUsageDescription`, `UIBackgroundModes=location` [V] | Idem, mais "stop-on-terminate/relaunch" via significant-change [C] |

Alternativa gratuita mantida: Cap-go/capacitor-background-geolocation (MIT), com opção `url` para POST nativo e `minIntervalMs` [S, fonte do próprio fornecedor]. Vale avaliar caso o plugin comunitário fique desatualizado.

### 2.2 O WebView/JS continua rodando em background?
Resposta curta: **parcialmente e sem garantia; não dependa dele para enviar a posição.**

| Plataforma | O que acontece |
|---|---|
| Android | Com foreground service ativo o processo continua vivo e o plugin entrega fixes ao JS, mas timers do Chromium sofrem throttling e, após ~5 min em background, requisições HTTP do WebView são limitadas [V]. Sem `useLegacyBridge`, as entregas ao JS param após 5 min [V]. WebSocket aberto no WebView pode ser derrubado por Doze/OEM [C] |
| iOS | App em background sem modo `location` é suspenso e o WebView para. Com `location` ativo e sessão iniciada em foreground, o app continua rodando e os callbacks chegam, porém a entrega via JS/`fetch` pode atrasar ou falhar; recomenda-se envio por código nativo [S]. Force-quit pelo usuário encerra o tracking padrão [S] |

Implicação para nosso design: no callback do plugin, enviar a posição por **HTTP nativo (CapacitorHttp)** ou fila + reenvio ao voltar ao foreground; usar WebSocket só para receber enquanto o app está aberto; no servidor, tratar posições atrasadas (campo `time` do fix) e marcar "visto há X min".

### 2.3 Mapas

| Opção | Custo | Prós | Contras |
|---|---|---|---|
| **MapLibre GL JS + OpenFreeMap** | Grátis, sem chave, sem cadastro, sem limite de requisições; custos cobertos por doações [V/S] | Zero custo/lock-in, sem SDK nativo, privacidade melhor (sem conta) | Serviço público "as is", sem SLA; pode mudar ou sair. Mitigação: self-host (repo suporta) ou trocar a URL de estilo. Atribuição OSM obrigatória |
| Mapbox GL JS | 50 mil loads/mês grátis, depois US$5/1000 (faixa 50-100 mil) [S]; exige cartão | Estilos, qualidade, SLA | Custo cresce; chave de API exposta no app |
| Google Maps | 10 mil loads/mês grátis, depois ~US$7/1000 [S]; exige faturamento | Dados locais excelentes no Brasil | Mais caro, termos restritivos, chave e faturamento |

Recomendação: MapLibre + OpenFreeMap, com a URL do estilo em configuração para trocar de provedor (ou self-host) sem novo release.

### 2.4 Geocodificação reversa gratuita

| Serviço | Regras | Uso no app |
|---|---|---|
| **Nominatim público** | Máx. 1 req/s por aplicação, User-Agent/Referer identificável, cache obrigatório, sem autocomplete, consultas sistemáticas proibidas [V] | Chamar do **servidor**, com cache por célula (ex.: arredondar a ~100 m) e fila a 1 req/s. Em escala, self-host |
| **BigDataCloud (client-side)** | Gratuito, sem limite declarado, mas a política de uso justo restringe a coordenadas do GPS atual do próprio dispositivo; violação gera erro 402 e ban de IP [S]. Versão servidor: grátis até 50 mil consultas/mês [S] | Só para o dispositivo geocodificar a própria posição; não usar para coordenadas de outros membros recebidas do servidor |

Dica: geocodificar apenas o que o usuário vê (endereço do membro selecionado) e guardar o resultado em cache.

## 3. Recursos que vamos adotar (priorizados)

| Prioridade | Recurso | Referência de mercado | Observação |
|---|---|---|---|
| P0 | Mapa ao vivo com membros pareados (MapLibre + OpenFreeMap) | Todos | Núcleo |
| P0 | Pareamento por código por aparelho, **consentimento explícito** do dono do código, revogável | Traccar (identifier), Familo (permissão), Glympse | Código curto, rotacionável, com expiração opcional; mostrar quem está vendo você |
| P0 | Pausar/parar compartilhamento a qualquer momento + indicador permanente "você está compartilhando" | Apple, Zenly (ghost mode), Glympse | Exigido por lojas e LGPD na prática |
| P0 | Estado "visto há X min", precisão, bateria do aparelho | Google Maps, Life360 | Evita falsa sensação de segurança com dado velho |
| P1 | Tracking em background resiliente (foreground service Android; modo `location` iOS; envio nativo; filtro por distância/movimento) | Transistorsoft, OwnTracks | Ver seção 4 |
| P1 | Alertas de chegada/saída em lugares (geofence), opt-in de quem é monitorado | Apple, Life360 | Calcular no servidor com histórico mínimo; evita geofence nativo no início |
| P1 | Botão SOS/"Estou bem" (check-in) que envia posição + aviso aos pareados | Familo, Life360 | Sem prometer serviço de emergência |
| P2 | Histórico/trilha curto (24-72 h) com retenção automática e opção de desligar | Life360 (2-30 dias) | Diferencial de privacidade: retenção curta e configurável |
| P2 | Endereço legível (geocodificação reversa com cache) | Life360, Apple | Servidor + Nominatim com cache |
| P2 | Compartilhamento temporário (1 h, 8 h, até desligar) | Apple, Glympse, Google | Reaproveita o código com validade |
| P3 | Detecção de direção/velocidade e de queda/acidente | Life360, FamiSafe | Alto risco de falso positivo e de responsabilidade; só depois de validar o núcleo |
| P3 | Monetização opcional (histórico estendido, mais membros) | Life360, Familo | Sem venda de dados |

Não adotar agora: chat, controle parental/tempo de tela, hardware.

## 4. Boas práticas de bateria e privacidade para tracking em background

**Android**
- Foreground service com `foregroundServiceType="location"` e notificação clara (`backgroundMessage`); a partir do Android 14 declarar também a permissão `FOREGROUND_SERVICE_LOCATION` no manifesto [C]. Pedir `POST_NOTIFICATIONS` no Android 13+ [V].
- Pedir localização "em uso" primeiro; `ACCESS_BACKGROUND_LOCATION` só se necessário, em passo separado e com tela de divulgação própria antes do diálogo do sistema [S/V].
- `android.useLegacyBridge: true` e envio via CapacitorHttp [V]. Orientar o usuário a desativar otimização de bateria para o app (Xiaomi/Samsung/etc. matam serviços) [C].
- Pausar em Doze não é problema se o serviço é foreground; ainda assim aceitar atrasos e tratar no servidor.

**iOS**
- `UIBackgroundModes=location`, sessão iniciada com o app em foreground, indicador azul visível [S]. "Quando em uso" já mantém o tracking enquanto o app está em background, mas relançar app terminado exige "Sempre" (significant-change) [S]. Pedir "Quando em uso" primeiro e escalar para "Sempre" com justificativa; tratar "Permitir uma vez".
- Descrição de uso clara em português; notas para o revisor explicando o motivo do modo background (guideline 2.5.4) [S].
- Testar Low Power Mode e force-quit; informar ao usuário que fechar o app pelo seletor interrompe o compartilhamento.

**Bateria (ambos)**
- Usar `distanceFilter` (ex.: 25-50 m) e intervalo mínimo; baixar frequência quando parado (Transistorsoft faz via detecção de movimento; no plugin comunitário implementar: se não houve deslocamento significativo, reduzir envios/heartbeat a cada alguns minutos) [V/C].
- Precisão balanceada em vez de GPS contínuo; agrupar (batch) envios; WebSocket só em foreground; heartbeat em vez de posição repetida.
- Modelo OwnTracks: modo "significativo" (economia) vs "movimento" (alto consumo) como escolha do usuário [V].

**Privacidade**
- Sem login e sem dados pessoais: ID aleatório por aparelho + código de pareamento; não coletar advertising ID; nenhum SDK de analytics/ads.
- Minimização: guardar só a última posição (memória/Redis com TTL); histórico opcional com retenção curta e exclusão ao desfazer pareamento.
- TLS obrigatório; códigos com entropia suficiente e limite de tentativas (rate limit) contra enumeração; revogação imediata.
- Transparência: tela "quem vê minha localização", aviso quando alguém passa a te ver, política de privacidade em português, no app e nas lojas.
- Nunca vender nem compartilhar dados (contraponto ao caso Life360 de 2021) [S].

## 5. Riscos (App Store / Play / LGPD)

| Risco | Detalhe | Mitigação |
|---|---|---|
| Rejeição Apple 2.5.4 (modo `location` sem justificativa) | Revisores exigem funcionalidades que precisam de localização persistente; casos de rejeição por "rastrear funcionários" [S] | Posicionar como compartilhamento familiar consentido; notas ao revisor; conta/código de demonstração; vídeo |
| Apple: "rastreamento sem consentimento" (stalkerware) | Apps de localização que permitam monitorar alguém sem ciência são alvo de rejeição/remoção [C] | Consentimento ativo de quem é visto, indicador permanente, notificação de quem passou a ver |
| Google Play: localização em background | Exige formulário de declaração, vídeo demonstrativo, divulgação proeminente no app e política de privacidade na loja e no app; avalia se a função não funciona só em foreground [V] | Preparar vídeo curto (~30 s), texto de divulgação antes do diálogo do sistema, declarar o foreground service de localização |
| Play: política "stalkerware" | Apps que escondem o rastreamento são proibidos [C] | Notificação persistente visível (já exigida pelo foreground service); sem modo oculto |
| Fragmentação Android (OEMs) | Serviços mortos em Xiaomi/Huawei/Samsung [C] | Tela de orientação de bateria; indicar "visto há X min" |
| Dependência de plugin comunitário | Suporte até Capacitor 7 [V]; manutenção modesta | Fixar versão, plano B Cap-go (MIT) ou Transistorsoft (pago) |
| Serviços gratuitos (OpenFreeMap, Nominatim, BigDataCloud) | Sem SLA; Nominatim e BigDataCloud têm políticas de uso restritas [V/S] | Cache, rate limit no servidor, estilo configurável, self-host futuro |
| LGPD: localização como dado pessoal | Mesmo sem login, ID de aparelho + posição identifica pessoa. Parte da doutrina trata localização como sensível; enquadramento a confirmar com jurídico [S] | Base legal = consentimento específico e revogável (art. 7º, I); finalidade clara; minimização; retenção curta; direito de exclusão |
| LGPD: crianças e adolescentes (art. 14) | Consentimento específico e em destaque de pelo menos um dos pais/responsável; esforço razoável de verificação (§5); informação simples (§6) [S]. ECA Digital (Lei 15.211/2025) pode acrescentar obrigações, a verificar [S] | Sem login impede verificar idade: declarar no termo que menores só usam com responsável, tela de consentimento parental, não direcionar a menores; consultar advogado |
| LGPD: governança | Encarregado (DPO), política de privacidade, registro de operações, plano de incidentes | Documentar mesmo sendo projeto pequeno; hospedar com contrato de operador |
| Responsabilidade por SOS/queda | Falsa expectativa de socorro | Aviso claro: não substitui serviços de emergência (190/192/193) |

## 6. Fontes

- Life360 (preços/recursos): https://www.itechguides.com/what-is-life360-how-it-works-features-and-free-vs-paid-plans/ , https://greenlight.com/learning-center/reviews/life360-review , https://subger.com/en/service/life360
- Life360 e venda de dados (The Markup, via cobertura): https://www.telecoms.com/enterprise-telecoms/life360-reportedly-sells-precise-identifiable-location-data , https://iapp.org/news/b/family-safety-app-allegedly-sells-users-location-data
- Zenly: https://www.life360.com/pt-br/blog/what-happened-to-zenly (fonte de concorrente), https://app.dealroom.co/companies/zenly
- Apple Find My: https://apple.com/icloud/find-my
- Google Maps compartilhamento/bateria: https://mobilesyrup.com/2018/08/02/google-maps-location-sharing-battery-level/ , https://www.trustedreviews.com/news/google-maps-share-location-battery-3522498
- Glympse: https://app.glympse.com/?p=17635 , https://app.glympse.com/?p=17809 , https://apps.apple.com/us/app/-/id947567072
- OwnTracks: https://owntracks.org/booklet/features/location/ , https://github.com/owntracks/android/discussions/1071
- Traccar Client: https://github.com/traccar/traccar-client , https://www.traccar.org/download
- GeoZilla/FamiSafe: https://parental-control.flashget.com/best-app-to-track-family-6-locator-apps , https://www.techjockey.com/us/compare/famisafe-vs-parentalvalues
- Familo / Hoop: https://apps.apple.com/US/app/id638696816 , https://adapty.io/paywall-library/familo/ , https://techcrunch.com/2017/09/27/hoop-app-for-millennial-parents-secures-2-4m-in-a-round-led-by-bgf-ventures/
- Plugin comunitário (README): https://cdn.jsdelivr.net/npm/@capacitor-community/background-geolocation@1.2.26/README.md , https://github.com/capacitor-community/background-geolocation
- Transistorsoft/alternativa Capgo: https://capgo.app/blog/transistorsoft-background-geolocation-alternative/ , https://www.npmjs.com/package/@transistorsoft/capacitor-background-geolocation , https://github.com/Cap-go/capacitor-background-geolocation
- iOS e background location em Capacitor: https://capgo.app/blog/why-ios-stops-background-location-updates-capacitor/
- Google Play, localização em background: https://support.google.com/googleplay/android-developer/answer/9799150 , https://radar.com/blog/guide-to-play-store-background-location-approval
- Apple 2.5.4 / UIBackgroundModes: https://developer.apple.com/forums/thread/771202 , https://forums.expo.dev/t/ios-app-store-rejections-with-the-location-background-mode/25537
- OpenFreeMap: https://openfreemap.org/ , https://feeds.simonwillison.net/2024/Sep/28/openfreemap/
- Mapbox / Google Maps preços: https://docs.mapbox.com/accounts/guides/pricing/ , https://developers.google.com/maps/billing-and-pricing/pricing
- Nominatim: https://operations.osmfoundation.org/policies/nominatim/
- BigDataCloud: https://bigdatacloud.com/free-api/free-reverse-geocode-to-city-api , https://github.com/bigdatacloudapi/js-reverse-geocode-client
- LGPD (art. 14 e crianças): https://confidata.com.br/blog/lgpd-comentada-10-criancas-adolescentes , https://www.mayerbrown.com/pt/insights/publications/2022/09/anpd-launches-public-consultation-on-preliminary-study-of-processing-childrens-adolescents-personal-data
