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

## Tuning the cards

`experience/cards.config.js` holds the deck for game design: each card's name, text, rarity, how often it comes up within its rarity (`weight`), whether it is in the deck (`enabled`) and its numbers (spaces, turns, dice values…). Texts use `{placeholders}` for those numbers, so they follow the values. The hand size and the rarity weights are there too. Edit and reload the page.

## Running locally

Serve the folder with any static server (ES modules don't load from `file://`):

```bash
python -m http.server 8765
```

Then visit <http://localhost:8765>.

## Project structure

```
index.html          the web page (GitHub Pages entry)
web/p0web.js        browser stand-in for the Project 0 runtime the game is written for
web/net.js          online rooms: WebRTC through PeerJS, one player relays, host handover
web/online.js       the Play Online dialog
experience/         the game itself: rules, board, UI, sounds (also the Project 0 experience package)
  cards.config.js   the deck's names, texts, rarity and numbers, for tuning
tools/              dev tools: harness with shared rooms, rules simulation, card and diorama previews
build/              the street-view diorama for the Project 0 lot
diorama/            a monumental paper-craft diorama (12 × 19 × 12 m) with its own viewer page
```

## How online play works

There is no game server: players connect to each other directly over WebRTC, using [PeerJS](https://peerjs.com) and its free public signalling and TURN servers. A room is a PeerJS id; the browser that holds it relays messages for everyone and hosts the game (runs the rules and the bots). If it leaves, the oldest remaining player takes the room over and the game goes on, with a bot in the leaver's seat. Quick Match uses a few shared rooms (`QM1`…`QM8`).

The game was made for [Project 0](https://project0.city), where everyone in a lot can sit down together at the Shared Table; on the web an online room stands in for the lot.
