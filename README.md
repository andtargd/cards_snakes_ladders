# Cards, Snakes & Ladders

Snakes and ladders up paper tiers on a board of 50, 70 or 100 cells, with a deck of 25 cards that bend the board, the dice and your rivals. Written in plain JavaScript on top of [three.js](https://threejs.org) — no build step.

**Play:** <https://andtargd.github.io/cards_snakes_ladders/>

## Features

- **Two modes:** *Champion* — the first to reach the last cell wins; *Fool* — whoever is left last on the board is the Fool.
- **Bots and friends:** 2 to 6 on the board, any mix of players at one computer (pass-and-play) and bots of three levels.
- **Cards:** extra and golden dice, swamps, trampolines and portals, snakes turned into ladders, shields, freezes, steals and swaps; one card per turn, played before or after the roll.
- A 3D paper board with animated dice, sound effects, works on desktop and phones.

Controls: click a card, then its target; Space rolls, 1–3 play a card, wheel or +/− zoom, drag to look around, M or Tab opens the menu.

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
experience/         the game itself: rules, board, UI, sounds (also the Project 0 experience package)
tools/              dev tools: harness with shared rooms, rules simulation, card and diorama previews
build/              the street-view diorama for the Project 0 lot
```

The game was made for [Project 0](https://project0.city), where players in a lot can also sit down together at the Shared Table; the web version is single-device only.
