# Cards, Snakes & Ladders

Snakes and ladders up paper tiers on a board of 50, 70 or 100 cells, with a deck of 25 cards that bend the board, the dice and your rivals. Written in plain JavaScript on top of [three.js](https://threejs.org) — no build step.

**Play:** <https://andtargd.github.io/cards_snakes_ladders/>

**Diorama:** `diorama/index.html` — a giant cardboard snake coiled round a giant ladder over the pastel board, to orbit, snapshot or download as GLB.

## Features

- **Two modes:** *Champion* — the first to reach the last cell wins; *Fool* — whoever is left last on the board is the Fool.
- **Bots and friends:** 2 to 6 on the board, any mix of players at one computer (pass-and-play) and bots of three levels.
- **Cards:** extra and golden dice, swamps, trampolines and portals, snakes turned into ladders, shields, freezes, steals and swaps; one card per turn, played before or after the roll. You keep up to 3: a 4th burns at the end of your turn.
- **Online:** *Quick Match* sits you down with others who are looking for a game; *Create a Room* gives a code and a link for friends. The room's table has seats for up to 6 (players and bots); others can watch.
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

three.js (0.186.0) is kept in `vendor/three/`: only the core and the addons the game imports. Only PeerJS comes from a CDN, and only when a player goes online.

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
web/online.js       the Play Online dialog
web/platform.js     the site it runs on (GitHub Pages or CrazyGames) and the hooks a site's SDK answers
vendor/three/       three.js and the addons the game uses
experience/         the game itself: rules, board, UI, sounds (also the Project 0 experience package)
  cards.config.js   the deck's names, texts, rarity, targets and numbers, for tuning
  board.config.js   where snakes and ladders may stand, for tuning
tools/              dev tools: harness with shared rooms, rules simulation, card and diorama previews, the CrazyGames build
build/              the street-view diorama for the Project 0 lot
diorama/            a monumental paper-craft diorama (12 × 19 × 12 m) with its own viewer page
```

## How online play works

There is no game server: players connect to each other directly over WebRTC, using [PeerJS](https://peerjs.com) and its free public signalling and TURN servers. A room is a PeerJS id; the browser that holds it relays messages for everyone and hosts the game (runs the rules and the bots). If it leaves, the oldest remaining player takes the room over and the game goes on, with a bot in the leaver's seat. Quick Match uses a few shared rooms (`QM1`…`QM8`).

The game was made for [Project 0](https://project0.city), where everyone in a lot can sit down together at the Shared Table; on the web an online room stands in for the lot.
