# Discord: выпуск MVP (задача 7)

Задача 7 из [launch-plan.md](launch-plan.md): где живёт продакшен, что уже проверено, что сделать в Portal, как провести прогон с друзьями.

## 1. Хостинг продакшена

**Решение:** `dist/discord/` — отдельный Cloudflare Worker со статикой (`csl-activity`), рядом с релеем, в том же аккаунте.

```
https://csl-activity.csl-relay.workers.dev   ← игра (dist/discord/)        конфиг: server/activity/wrangler.toml
https://csl-relay.csl-relay.workers.dev      ← релей и /api/token          конфиг: server/relay/wrangler.toml
```

Почему так, а не иначе:

| Вариант | За | Против |
|---|---|---|
| **Отдельный Worker со статикой** (выбран) | один аккаунт и один `wrangler` с релеем; бесплатно, запросы к статике не считаются; новая версия игры не трогает релей; откат одной командой | — |
| Тот же Worker, что и релей | одна выкладка | выкладка нового Worker'а перезапускает Durable Objects: каждая правка игры обрывает все партии |
| GitHub Pages | уже есть | Pages раздаёт корень репозитория (профиль pages); `dist/` не в git, пришлось бы коммитить сборку или заводить Actions; кэш 10 минут без управления |

Выкладка (из `server/relay`, `wrangler` там уже установлен и залогинен):

```
npm run deploy:activity     # python ../../tools/build_discord.py, потом wrangler deploy -c ../activity/wrangler.toml
npm run deploy              # релей: нужен один раз после этой задачи (вход для dev-приложения)
```

- Выложено 24.10.2026: игра (версия `31f126b4`) и релей с входом для dev-приложения (`829faa15`). `csl-activity` с `?mockInstance=…` доходит до стола канала через продакшен-релей, ошибок в консоли нет.
- Выложено 29.10.2026: игра (версия `d5e1bfd4`, коммит `4ecdd73`) — на широком экране камера поднимает картинку, чтобы ярус под фигуркой был виден над рукой. Релей не менялся.
- Выложено 29.10.2026: игра (версия `d8362daa`, коммит `0d60cd4`) — задача 8: статус игрока в Discord (`setActivity`, новое разрешение `rpc.activities.write` — вошедшие раньше увидят запрос Discord ещё раз) и кнопка Invite Friends в лобби стола канала. На `csl-activity` с `?mockInstance=…&server=wss://csl-relay.csl-relay.workers.dev` стол открывается, ошибок в консоли нет; в настоящем Discord ещё не проверено. Релей не менялся.
- Выкладывать игру можно когда угодно: кто уже играет, доигрывает старую версию, следующий запуск берёт новую (статика отдаётся с `ETag`, без долгого кэша).
- Релей выкладывать, когда никто не играет: идущие партии оборвутся (игроки переподключатся, но это заметно).
- Откат игры: `npx wrangler rollback -c ../activity/wrangler.toml` (или Deployments в панели Cloudflare).

### URL Mappings: продакшен отдельно от туннеля

В Discord один набор URL Mappings на приложение, поэтому продакшен и туннель — **два приложения** (так и советует документация Discord: у разработчика своё dev-приложение):

| Приложение | Root mapping `/` | Кто запускает |
|---|---|---|
| Cards, snakes and ladders (`1563178748872753223`) — продакшен | `csl-activity.csl-relay.workers.dev` | друзья, App Testers |
| Cards, snakes and ladders (dev) — новое | адрес туннеля (`*.trycloudflare.com`) | только ты |

Остальные mappings у обоих одинаковые (список — `MAPPINGS` в `web/discord.js`):

| Prefix | Target |
|---|---|
| `/x/relay` | `csl-relay.csl-relay.workers.dev` |
| `/x/cdn` | `cdn.discordapp.com` |
| `/x/peerjs` | `0.peerjs.com` |
| `/x/emqx` | `broker.emqx.io:8084` |
| `/x/mosq` | `test.mosquitto.org:8081` |

Игра сама узнаёт своё приложение по адресу (`<client id>.discordsays.com`), а релей теперь знает оба: `POST /api/token` получает `client_id` и берёт секрет этого приложения (`DISCORD_CLIENT_SECRET` или `DISCORD_DEV_CLIENT_SECRET`). Без dev-секрета dev-приложение играет без имён («Player N») — это не ломает проверку остального.

## 2. Чек-лист MVP: что проверено без людей

Проверено 24.10.2026 в mock (`?platform=discord&mockInstance=…`) на dev-сервере, **через задеплоенный релей** `wss://csl-relay.csl-relay.workers.dev` (то есть на продакшен-сервере), и локально через `npm run dev`:

| Пункт | Что проверено | Итог |
|---|---|---|
| все в канале за одним столом; второй канал — свой стол | `tools/channeltest.html` (12 шагов: вход без меню, лобби, боты, пришедший посреди партии, зритель, rematch, End Game) | ✅ 12/12 и локально, и на продакшен-релее |
| уход хоста посреди партии | channeltest шаг 10: хост закрыл активность, игра идёт, на его месте бот, хостом стал следующий (1,5 с) | ✅ |
| обрыв сети на телефоне и возврат | `tools/nettest.html?server=wss://…` S14 (связь игрока оборвалась без закрытия — вернулся на своё место за 1 с), S9, S10, всего 16 сценариев + 2 только для брокеров пропущены | ✅ 18/18 |
| имена и аватары; отказ от авторизации | `tools/oauthtest.html` (7 шагов: имя и аватар, «Player 3» у отказавшегося, грубое имя заменено, возврат на своё место по Discord id) | ✅ 7/7 |
| нет CSP-ошибок | `tools/build_discord.py`: в `dist/discord/` только относительные пути, внешние адреса — только через mappings | ✅ сборка; в настоящем Discord — проверено в задаче 6, повторить на продакшене |
| читается в PiP и на телефоне, звук тихий | 320×180 и 400×225 — только поле и «Make the window bigger»; 640×360, 1280×720, 375×812, 812×375 — лобби целиком; громкость 0.35 в профиле discord | ✅ |
| секретов нет в репозитории и в dist/ | в git (вся история) и в `dist/discord/` нет секретов; `.env` в `.gitignore`; на Cloudflare `DISCORD_CLIENT_SECRET` — секрет Worker'а | ✅ |
| Pages, CrazyGames, Project 0 | `index.html`, `?platform=crazygames`, `tools/harness.html` доходят до меню без ошибок | ✅ |
| privacy policy и ToS | [privacy.html](https://andtargd.github.io/cards_snakes_ladders/privacy.html), [terms.html](https://andtargd.github.io/cards_snakes_ladders/terms.html) отвечают 200 | ⏳ вписать в Portal (шаг 3) |
| запуск на компьютере, в браузере и на телефоне | — | ⏳ только живьём, сценарий ниже |

Попутно: тестовые страницы с несколькими окнами (`channeltest`, `oauthtest`, `onlinetest`, `quicktest`) открывали игру в окнах 400×250, а с задачи 6 окно ниже 300 — «слишком маленькое» (только поле). Окна теперь 400×300. В channeltest проверка «нет кнопки Back» заменена на «Back есть» (с коммита a2d0e5b он ведёт в меню канала).

## 3. Шаги в Developer Portal (руками)

Пошагово, вместе с командами и тем, что делаю я, — [launch-guide.html](launch-guide.html): по нему и запускать. Ниже — то же коротко.

**Продакшен-приложение** (<https://discord.com/developers/applications/1563178748872753223>):

1. Сначала выложить (раздел 1): `npm run deploy:activity` и `npm run deploy` в `server/relay`; открыть `https://csl-activity.csl-relay.workers.dev` — должна открыться игра.
2. **Activities → URL Mappings**: Root mapping `/` → `csl-activity.csl-relay.workers.dev` (вместо туннеля); проверить, что пять `/x/...` из таблицы выше на месте.
3. **General Information**: App Icon — `docs/discord/media/icon-1024x1024.png`; Description (до 400 символов), например:
   > Snakes and ladders with cards, right in your voice channel. Everyone in the channel sits at one table — no codes, no sign-up. Play cards to bend the dice, dodge the snakes, and race to 100. Empty seats get bots.
4. Там же: **Terms of Service URL** — `https://andtargd.github.io/cards_snakes_ladders/terms.html`, **Privacy Policy URL** — `https://andtargd.github.io/cards_snakes_ladders/privacy.html`.
5. **Activities → Settings**: Supported Platforms — Web, iOS, Android; ориентация на телефоне — не фиксировать (портрет и альбом поддержаны). Обложка для полки активностей, если Portal её просит, — `docs/crazygames/media/cover-burst-sl-1920x1080.png`.
6. **App Testers**: добавить 3–5 друзей (до 50). Каждый должен принять приглашение (придёт от Discord). Неверифицированную активность видят только команда и App Testers, и запускается она только на серверах **меньше 25 участников**.
7. **Installation**: Install Link — Discord Provided Link, Guild Install со scope `applications.commands`; по этой ссылке добавить приложение на сервер CSL. Друзей позвать на этот сервер.
8. Запустить самому из голосового канала («Play» → Activities → Cards, snakes and ladders) и убедиться, что открылось с продакшена (в консоли нет туннеля; меню канала, стол).

**Dev-приложение** (для туннеля, по желанию — можно позже):

1. New Application «Cards, snakes and ladders (dev)» → Activities → Enable → URL Mappings: `/` → адрес туннеля, `/x/...` — те же пять.
2. OAuth2 → Client ID и Client Secret. Client ID вписать в `server/relay/wrangler.toml` (`DISCORD_DEV_CLIENT_ID`), секрет: `npx wrangler secret put DISCORD_DEV_CLIENT_SECRET`, потом `npm run deploy`.
3. С этого момента туннель — только в dev-приложении; продакшен не трогать.

## 4. Прогон с друзьями: сценарий

Перед отправкой: завести на сервере текстовый канал **#bugs**. Текст ниже можно отправить друзьям как есть.

> **Тест игры «Cards, Snakes & Ladders» в Discord** (минут 20–30, 3–5 человек)
>
> Перед тестом: прими приглашение App Tester от Discord (придёт в личку) и зайди на сервер, куда я позову. Нужен Discord на компьютере, и у кого есть — на телефоне.
>
> 1. Зайди в голосовой канал **«Play»**, нажми **Activities** (ракета) → **Cards, snakes and ladders**. Discord спросит разрешение на имя и аватар — нажми «Authorize» (один из нас пусть нажмёт «Cancel»: игра должна пустить его как «Player N»).
> 2. Все должны оказаться **за одним столом**, без кодов. Проверь: видишь ли ты всех, твоё ли имя и аватар.
> 3. Хост (кто зашёл первым) выбирает режим и поле и жмёт **Start**. Сыграйте несколько ходов.
> 4. **Хост закрывает активность** посреди партии. У остальных игра должна идти дальше, на его месте — бот. Потом хост заходит снова.
> 5. **С телефона**: включи режим полёта на 10–20 секунд, выключи. Ты должен вернуться на своё место.
> 6. Переключись в текстовый канал — активность станет маленьким окошком. Должно быть видно поле и надпись «Make the window bigger to play». Вернись.
> 7. Открой **How to Play** → ссылку Privacy или Terms: Discord должен спросить, открыть ли страницу в браузере.
> 8. Доиграйте до конца, хост жмёт **Play Again** — новая партия за тем же столом.
> 9. Кто-нибудь заходит в канал посреди партии: он садится на место бота или ждёт следующую партию с подписью.
>
> **Если что-то не так** — напиши в канал **#bugs** на сервере: что делал, что ожидал, что вышло, устройство (Windows / Mac / браузер / iPhone / Android), примерное время. Скриншот очень помогает.

Что смотреть самому во время прогона:
- лог релея: `npx wrangler tail` в `server/relay` (подключения, ошибки, `full`/`taken`);
- консоль активности — по способу с `dclog.js` (заметка о Discord-консоли), но только в dev-приложении: в продакшен-сборку его не класть.

После прогона: отметить пункты в [чек-листе MVP](launch-plan.md#чек-лист-mvp), баги — отдельными задачами.
