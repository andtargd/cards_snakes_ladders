# Discord: карточка в App Directory (задача 11)

Что вписать в Portal → **Обнаружение → Настройки обнаружения**, чтобы включить Discovery. Тексты — по-английски (локаль English): в поиске каталога люди ищут по словам *snakes and ladders*, *board game*, *card game*, *dice game*, *party game*, *multiplayer*, *voice channel*, *with friends*, *bots*, *free* — они стоят в начале краткого описания и в заголовках подробного, без повторов ради повторов.

Статус на 29.10.2026: всё ниже, кроме медиа, вписано и сохранено в Portal, сервер поддержки — CSL (сообщество включено). «Статус обнаружения» — все пункты ✅, «Всё готово!»; сама кнопка «Включить обнаружение» ещё не нажата.

## Краткое описание (191 / 200)

```
Snakes and ladders with cards, right in your voice channel. Roll the dice, play cards, climb ladders and dodge snakes. A free multiplayer board game for 2–6 friends, with bots in empty seats.
```

## Языки

English.

## Подробное описание

Вставлять как есть. Разметка Portal урезанная (проверено в «Предпросмотре»): работают `**жирный**`, `*курсив*`, `__подчёркнутый__`, ссылки, `> цитата`, списки только через `* ` и только после пустой строки, перенос строки — два пробела в конце. Заголовков `#`/`##` и списков через `- ` нет: выводятся как текст, а одиночный перенос строки склеивается с соседней. Поэтому заголовки здесь — жирные строки.

```markdown
**Cards, Snakes & Ladders** is the classic snakes and ladders board game with a twist: a hand of cards. Start it in any voice channel and everyone in the channel sits at one table — no codes, no sign-up, nothing to install.

**How to play**  
Roll the dice, climb the ladders, dodge the snakes and race to the last cell. Each turn you draw a card and can play one before or after your roll: turn a rival's ladder into a snake, drop a swamp in their path, grab a golden die or shield yourself from the next snake. A well-timed card changes the whole race.

**Two ways to win**

* **Champion** — the first to reach the last cell wins.
* **Fool** — everyone races off the board; whoever is left last is the Fool.

**32 cards in six families**

* **Movement:** Dash, Setback, Swap Places, Double Move, Tailgate, Rewind
* **Dice:** Extra Die, Choose a Face, Heavy Die, Golden Die, Choose Your Roll
* **Board:** Swamp, Ladder to Snake, Snake to Ladder, Trampoline, Portal, Earthquake
* **Hinder:** Slow Down, Vanilla Play, Skip Turn, Moonwalk, Dethrone
* **Protection:** Parachute, Swamp Boots, Shield, Holy Grail
* **Hand:** Redraw, Peek, Steal, Swap Hands, Choose Your Card, Echo

**Made for your voice channel**

* **Multiplayer for 2 to 6 players.** Play with friends or family — empty seats get bots of three levels (Easy, Medium, Hard).
* **Drop in any time.** Joined mid-game? Take over a bot's seat, or watch and play the next round.
* **Someone left?** The game goes on: a bot takes their seat, and they can come back to it.
* **Play vs bots** on your own while you wait for friends.
* **Three boards** of 50, 70 or 100 cells, each generated fresh with its own snakes and ladders.
* **A 3D paper board** with animated dice, on desktop, in the browser and on phones (iOS and Android).

A quick, casual party game for game night: easy to learn in one turn, with enough strategy in the cards to keep every race close. Free to play, no ads.
```

## Медиаконтент

Portal принимает PNG, JPEG, GIF, WEBP и ссылки на YouTube — mp4 напрямую нельзя: `media/preview-640x360.mp4` сначала залить на YouTube (можно «по ссылке»).

Скриншоты 1920×1080 — в `media/directory/`, в порядке загрузки (сняты `tools/shots.html?sizes=1920x1080&screens=game,target,peek,cards,results`; места за столом каждый прогон раздаются заново — если «ты» на клетке 88, над полем пусто, перезапустить):

1. `1-game-1920x1080.png` — стол на шестерых: змеи, лестницы, рука карт, кубик.
2. `2-play-a-card-1920x1080.png` — карта Dash выбирает игрока.
3. `3-peek-1920x1080.png` — Peek: чужая рука.
4. `4-all-cards-1920x1080.png` — все 32 карты.
5. `5-results-1920x1080.png` — итоги партии, Rematch.
6. `media/cover-1024x576.png` — обложка полки активностей.

Не хватает кадра из самого Discord (меню канала «Join the Table», несколько настоящих игроков) — снять во время следующей партии с друзьями: это лучший первый кадр.

## Ссылки (до пяти)

| Название | URL |
|---|---|
| Play in the browser | https://andtargd.github.io/cards_snakes_ladders/ |
| Source code | https://github.com/andtargd/cards_snakes_ladders |
| Terms of Service | https://andtargd.github.io/cards_snakes_ladders/terms.html |
| Privacy Policy | https://andtargd.github.io/cards_snakes_ladders/privacy.html |
| Community server | https://discord.com/invite/h7XM7zsNY6 |

Пятая ссылка — бессрочное приглашение без лимита в #welcome (`discord.gg/h7XM7zsNY6`). В Portal сохранена, но на публичной странице каталога 29.10.2026 видны только первые четыре: либо кэш каталога, либо Discord прячет ссылки-приглашения. Проверить через день; если так и не появится — вписать приглашение в конец подробного описания.

## Сервер поддержки

Должен быть сервером сообщества: Настройки сервера → **Включить сообщество** (нужны проверка e-mail участников, фильтр контента, канал правил и канал обновлений). Потом выбрать его в «Настройках обнаружения» → Сервер поддержки. Без него Portal не сохраняет эту страницу вовсе («Необходим сервер поддержки»), и в списке только серверы сообщества — до включения сообщества он был пуст.

Сервер поддержки — бывший CSL, с 29.10.2026 **Cards, Snakes & Ladders**, всё по-английски:

- Профиль сервера: описание, особенности Board games, Card games, Party games, Game dev, Playtesting. «Приватный профиль» включён (так было) — без него профиль виден и тем, кто ещё не на сервере.
- Сообщество: основной язык English; правила — #rules, новости Discord и уведомления об угрозах — #moderator-only.
- Каналы без категории: #rules (сообщение с правилами), #moderator-only, #welcome (только чтение: что за игра, как запустить активность, каналы, ссылки). Community: #general, #clips-and-highlights, #bugs (у каждого тема). Voice: Lobby, Play (бывший «Игры» — в нём и запускать активность).
- Приглашение: https://discord.gg/h7XM7zsNY6 — бессрочное, без лимита, в #welcome. Сервер не в «Путешествии» (Server Discovery), так что найти его можно только по этой ссылке.
- Адаптация включена: все публичные каналы по умолчанию, без вопросов; Server Guide — приветствие от владельца и задания «Learn how to start the game» (#welcome), «Say hi and find people to play with» (#general), «Share a screenshot of your best game» (#clips-and-highlights) и «Прочитать правила».

## Перед включением

- «Максимум участников» в Активности → Настройки — **6**: седьмой в канале не зайдёт в активность, а значит, не сможет и смотреть. Поднять, если зрители нужны (задача 9).
- Описание в «Общей информации» (оно же «Обо мне» бота) старое, из CrazyGames: «Play bots, friends on one screen or people online». Для Discord лучше заменить кратким описанием отсюда.
