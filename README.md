# Cards, Snakes & Ladders

Snakes and ladders up paper tiers on a board of 50, 70 or 100 cells, with a deck of 25 cards that bend the board, the dice and your rivals. Written in plain JavaScript on top of [three.js](https://threejs.org) — no build step.

**Play:** <https://andtargd.github.io/cards_snakes_ladders/>

**Diorama:** `diorama/index.html` — a giant cardboard snake coiled round a giant ladder over the pastel board, to orbit, snapshot or download as GLB.

## Features

- **Two modes:** *Champion* — the first to reach the last cell wins; *Fool* — whoever is left last on the board is the Fool.
- **The menu:** *Quick Match* in one click; *Solo Play* (you against bots, works offline), *Pass & Play* (2 to 6 players by name taking turns at one screen, with bots if you like) and *Online* (the mode, Quick Match, a room of your own or a friend's room by its code). A first Solo Play is short and easy: Champion on the 50-cell board against two Easy bots; after that each screen keeps your last choices.
- **Bots and friends:** 2 to 6 on the board, any mix of players at one computer (pass-and-play) and bots of three levels.
- **Cards:** extra and golden dice, swamps, trampolines and portals, snakes turned into ladders, shields, freezes, steals and swaps; one card per turn, played before or after the roll. You keep up to 3: a 4th burns at the end of your turn.
- **Online:** *Quick Match* sits you down with others who are looking for a game of the same mode on the same board (chosen on the Online screen, or in the Quick Match lobby, which then looks for another table); while you wait, bots sit down one by one as players would, and a player who comes later takes a bot's seat during the game. *Create a Room* gives a code and a link for friends; in the room the host sets the mode, the board and the bots, as in Solo Play. The room's table has seats for up to 6 (players and bots); others can watch.
- A 3D paper board with animated dice, sound effects, works on desktop and phones.

Controls: click the dice tray when it lights up (or press Space) to roll; while you can still play a card the tray says End Turn: click it or press Space to end the turn. Click a card, then its target; 1–4 play a card, wheel or +/− zoom, drag to look around, M or Tab opens the menu.

## Tuning the cards and the board

`experience/cards.config.js` holds the deck for game design: each card's name, text, rarity, how often it comes up within its rarity (`weight`), whether it is in the deck (`enabled`), who it can be played on (`target`: any player, any player but yourself, or yourself) and its numbers (spaces, turns, dice values…). Texts use `{placeholders}` for those numbers, so they follow the values. The hand size and the rarity weights are there too. Edit and reload the page.

`experience/board.config.js` holds the field: the snakes and ladders of each board size, how long they run, how many may stand on one tier, how many tiers may stay empty, the share of ladders in the first half and of snakes in the second, and the snake just before the finish.

## Running locally

Serve the folder with any static server (ES modules don't load from `file://`):

```bash
python -m http.server 8765
```

Then visit <http://localhost:8765>.

three.js (0.186.0) is kept in `vendor/three/`: only the core and the addons the game imports. PeerJS (1.5.4) is in `vendor/peerjs/` and loads only when a player goes online. Nothing comes from a CDN.

## The CrazyGames build

```bash
python tools/build_cg.py
```

It writes `dist/crazygames/` and `dist/crazygames.zip` (the file to upload): `index.html` with `window.CSL_PLATFORM = 'crazygames'` (see `web/platform.js`), `web/`, `experience/` and `vendor/` — nothing else. It stops if a page or module loads anything by an absolute path, and prints the number of files and the size against the portal's limits (1500 files, 50 MB). `dist/` is not committed.

To try the build the way the portal shows it, serve the project folder (`python tools/server.py 5500`) and open <http://localhost:5500/tools/cgframe.html>: the game in an iframe of each size CrazyGames tests at, with the time it takes to reach the menu. `?platform=crazygames` on the plain page gives the same profile without a build.

## Project structure

```
index.html          the web page (GitHub Pages entry)
web/p0web.js        browser stand-in for the Project 0 runtime the game is written for
web/net.js          online rooms: WebRTC through PeerJS, one player relays, host handover
web/mq.js           the way round when WebRTC cannot connect: a small MQTT client for public brokers
web/clock.js        a timer that keeps going in a background tab (heartbeats, a hosted table)
web/online.js       online play behind the game's Online screen: the name, Quick Match, rooms, how an attempt goes
web/textfield.js    a real text input laid over a field the game draws (names, room codes)
web/platform.js     the site it runs on (GitHub Pages or CrazyGames) and the hooks a site's SDK answers
vendor/three/       three.js and the addons the game uses
vendor/peerjs/      PeerJS
experience/         the game itself: rules, board, UI, sounds (also the Project 0 experience package)
  cards.config.js   the deck's names, texts, rarity, targets and numbers, for tuning
  board.config.js   where snakes and ladders may stand, for tuning
tools/              dev tools: harness with shared rooms, rules simulation, card and diorama previews, the CrazyGames build,
                    online tests (nettest.html: the network; onlinetest.html: three players through a whole game;
                    quicktest.html: Quick Match with bots, on two sites)
build/              the street-view diorama for the Project 0 lot
diorama/            a monumental paper-craft diorama (12 × 19 × 12 m) with its own viewer page
```

## How online play works

There is no game server: players connect to each other directly over WebRTC, using [PeerJS](https://peerjs.com) and its free public signalling server. A room is a PeerJS id; the browser that holds it relays messages for everyone and hosts the game (runs the rules and the bots). If it leaves, the oldest remaining player takes the room over and the game goes on, with a bot in the leaver's seat. Quick Match uses a few shared rooms for each mode and board (`QM1`…`QM8` for Champion on 100 cells, then a letter for the others: `QMC1`… Champion on 50, `QMD1`… on 70, `QMF1`, `QMG1`, `QMH1`… Fool on 50, 70, 100; `CG…` the same on CrazyGames; a quick room turns away a player of the other site, even with its code typed by hand). Its table waits 25 seconds for players (10 more for each who sits down); meanwhile bots sit down one by one, every few seconds, under random names like the players' own, and play on the clock as players do. A table is full with 4 players on 50 and 70 cells and 5 on 100 (so 3 or 4 bots with one player); a full table starts 5 seconds later, and at the end of the wait bots fill it up and the game starts. A player who comes to a table the bots have filled takes the place of one of them. Those bots keep their seats for players: one who comes during the game takes the seat of the bot furthest on, under their own name, and keeps it for the rematch. Leaving a quick table leaves its room, so no one there waits for a host who has gone to the menu.

Two browsers behind strict NATs (mobile internet, CGNAT, some Wi-Fi) cannot open a WebRTC channel without a TURN relay, and there is no free one that works (PeerJS's own `*.turn.peerjs.com` no longer resolve). So the room's holder also listens on two free public MQTT brokers (`broker.emqx.io`, `test.mosquitto.org`, see `web/mq.js`), and a player whose data channel has not opened in 2.5 s says hello there too; the relay answers the first hello and the player stays on that way. These are public test brokers, with no promises and no encryption beyond TLS to the broker. A TURN server of your own (a free Metered account, Cloudflare) can go into `ICE` in `web/net.js`.

To test it: serve the folder (`python tools/server.py 5500`) and open `tools/nettest.html` (17 network scenarios: direct and broker joins, takeover, a vanished relay or player, reloads, Quick Match, rooms closing) `tools/onlinetest.html` (three players in iframes through the Online screen, the lobby, a whole game, a reload, the host leaving, a rematch) and `tools/quicktest.html` (Quick Match: waiting alone until bots sit down, a newcomer taking a bot's seat, two players finding each other, two sites kept apart). They use the real servers (the tests' quick rooms have codes of their own, `?quick=` on `index.html`); `?sid=` on `index.html` keeps several players apart in one tab, and `?ice=relay` (on `index.html` or `onlinetest.html`) blocks direct connections the way a strict NAT does, so everything goes through the brokers.

The game was made for [Project 0](https://project0.city), where everyone in a lot can sit down together at the Shared Table; on the web an online room stands in for the lot.
