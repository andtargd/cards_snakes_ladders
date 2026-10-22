# CrazyGames submission: Cards, Snakes & Ladders

Texts and form answers for the Basic Launch submission (no ads; since task 12 the build uses the SDK v3: loading, gameplay start and stop, happytime and online play). The final check run is at the end.

Requirements: <https://docs.crazygames.com/requirements/intro/>

## Title

**Cards, Snakes & Ladders**

## Short description

Snakes and ladders with a hand of cards: trap your rivals in swamps, turn their ladders into snakes and race up a 3D paper board. Play bots, friends on one screen or people online.

## Full description

Cards, Snakes & Ladders is the classic race up the board with a twist: every turn you draw a card, and a well-timed card changes everything. Roll the die, climb the ladders, dodge the snakes, and play one card before or after your roll to bend the board, the dice or your rivals.

**Two ways to win**
- **Champion:** the first to reach the last cell wins.
- **Fool:** everyone races to get off the board; whoever is left last is the Fool (3 or more players).

**32 cards in six families**
- **Movement:** Dash, Setback, Swap Places, Double Move, Tailgate, Rewind.
- **Dice:** Extra Die, Choose a Face, Heavy Die, Golden Die, Choose Your Roll.
- **Board:** Swamp, Ladder to Snake, Snake to Ladder, Trampoline, Portal, Earthquake.
- **Hinder:** Slow Down, Vanilla play, Skip Turn, Moonwalk, Dethrone.
- **Protection:** Parachute, Swamp Boots, Shield, Holy Grail.
- **Hand:** Redraw, Peek, Steal, Swap Hands, Choose Your Card, Echo.

Common cards come up often; rare and legendary ones hit harder. You keep up to three.

**Play your way**
- **Quick Match:** one click into a game online, with no waiting: it joins a game where a bot keeps a seat for you, or starts a new one with bots in the empty seats, and a player who arrives later takes over a bot's seat.
- **Solo Play:** you against 1 to 5 bots (Easy, Medium or Hard). No waiting, no connection needed.
- **Pass & Play:** 2 to 6 players take turns on one screen; each hand stays hidden until its turn. Add bots if you like.
- **Online rooms:** create a room and give friends its 5-letter code, or join a friend's room. The host picks the mode, the board and the bots.

**Three boards:** 50, 70 or 100 cells, each one generated fresh with its own snakes and ladders.

Your first game is a short tutorial match that teaches by playing; you can skip it at any time. A solo game in progress is saved and continues after a reload.

## Controls

Mouse:
- Click the dice tray to roll; click it again (it says End Turn) to end your turn.
- Click a card in your hand, then its target (a player, their panel, a cell, a ladder or a snake).
- Right-click, Cancel, or a click beside the board puts a card back.
- Hold the button on a card to read it larger.
- Drag to look around the board; mouse wheel to zoom (over the log, the wheel scrolls it).
- Corner buttons: game menu, sound, game speed (1x, 2x, 4x, Skip), zoom in and out, the whole board, the log.

Keyboard:
- Space: roll; after the roll, end the turn.
- 1–4: play the card in that slot; 1–5: choose a die or a card when the game offers a choice.
- + / −: zoom.
- M or Tab: game menu.
- Backspace or Esc: back (closes a card's target, a peeked hand, a setup screen).
- Enter: start the game on the Solo Play and Pass & Play screens.
- R: rematch when a game is over.

Touch:
- Tap the dice tray to roll and to end the turn; tap a card, then its target.
- Hold a card to read it.
- Drag with one finger to look around; pinch with two fingers to zoom.

Short version for the portal's Controls field:

> Click (tap) the dice tray to roll, then again to end your turn. Click a card, then its target. Right-click or Cancel puts a card back. Drag to look around, wheel or pinch to zoom. Keys: Space roll / end turn, 1–4 play a card, M or Tab menu, Backspace back.

## Category and tags

- Category: **Card** (alternative: **Casual**).
- Tags: Board Game, Dice, Card, Multiplayer, 2 Player, Local Multiplayer (Pass & Play), Family, Strategy, Bots, 3D.

Pick the closest ones from the portal's list; "snakes and ladders" itself is a good keyword for the description if the portal has no such tag.

## Platforms and orientation

- Desktop: yes (mouse and keyboard).
- Mobile: yes (touch). Both orientations work: on a phone held upright the layout changes (full-width players panel, smaller dice tray); landscape is the better fit and the one the covers and videos show. If the form asks for one, choose **landscape**; if it allows both, choose **both**.
- No fullscreen button of its own, no external links, no ads.

## Form answers

| Question | Answer |
|---|---|
| Uses the CrazyGames SDK | Yes, v3: loadingStart/Stop, gameplayStart/Stop, happytime; for online play invite links, the room and whether it can be joined (`updateRoom`), instant multiplayer, the join room listener. No ads, user or data modules. Without the SDK (an ad blocker) rooms go by their code. |
| Multiplayer | Yes: online and local. |
| Multiplayer type | Real-time turn-based over WebRTC peer-to-peer (PeerJS), with public MQTT brokers as a relay when two players can't connect directly. No game server of our own. |
| Lobby / room size | A table seats 2 to 6 (players and bots). Quick Match tables: 4 (5 on the 100-cell board); the game starts at once with bots in the empty seats, and players who come later take the bots' seats. A private room takes up to 12 people (6 seated, the rest watch); a Quick Match room up to 6. |
| Matchmaking | Quick Match by mode and board; private rooms by a 5-letter code (no links on CrazyGames). |
| Solo play without other players | Yes: Solo Play and Quick Match with bots. |
| Cross-platform play | Yes: desktop and mobile in the same rooms. CrazyGames players and players on other sites never meet in Quick Match (separate room prefixes). |
| Chat | No. |
| User-generated content | Only player names in online play. A random friendly name is suggested ("Paper Fox"); names are filtered for rude words (English and Russian, leetspeak and separators) on the player's device and again by the room's host. |
| Accounts / login | None. |
| Data collected | Nothing on a server. Settings, the player's name and a solo game in progress stay in the browser's local storage. Online play shares the name and, by the nature of WebRTC, the IP address with the other players and the connection services. Privacy page: `privacy.html` in the build, linked from the Online screen and How to Play. |
| In-game purchases | No. |
| Ads | No. |
| Languages | English. |
| Age rating / violence | None: a family board game. |
| Third-party libraries | three.js 0.186.0 (MIT), PeerJS 1.5.4 (MIT), both inside the zip. |

## Files to upload

- Game: `dist/crazygames.zip` from `python tools/build_cg.py` (56 files, 2.97 MB unpacked, 0.77 MB zipped; `index.html` at the root).
- Covers: `docs/crazygames/media/cover-burst-sl-1920x1080.png`, `cover-burst-sl-800x1200.png`, `cover-burst-sl-800x800.png`.
- Videos: `docs/crazygames/media/trailer-1920x1080.mp4` and `trailer-1080x1620.mp4` (not in git; rebuild with `tools/trailer.html`).

## Final check run

Run on 2026-10-22 on branch `cg/submission`, build from `python tools/build_cg.py`, served by `tools/server.py`. "ok" = checked and fine, "not ok" = a problem (fixed or left), "not checked" = could not be checked here.

### The build

| Check | Result | Notes |
|---|---|---|
| Files, size | ok | 56 files (limit 1500), 2.97 MB unpacked (target < 20 MB), zip 0.77 MB |
| Contents | ok | `index.html`, `privacy.html`, `experience/`, `web/`, `vendor/` only; no `build/`, `diorama/`, `tools/`, `docs/` |
| Relative paths only | ok | `build_cg.py` checks; no absolute `src`/`href`/`import` |
| No links to the game outside CrazyGames | ok | no URLs in the game's code or pages except `mailto:` on the privacy page; no room links, no `?room=` in the address (`allowLinks=false`) |
| No fullscreen button, ads or links to other platforms | ok | the corner buttons are menu, sound, speed, zoom, whole board, log |
| CDN | ok | three.js and PeerJS are in `vendor/`: no request to unpkg at all; online play talks only to the PeerJS signalling server, STUN and the MQTT brokers |
| Time to menu | ok | 2.8–3.2 s in `tools/cgframe.html` on all 10 QA sizes (local server); 0.7–1.6 s in headless Edge and Chrome |

### Sizes (`tools/shots.html?src=../dist/crazygames/index.html`, DPR 1)

| Check | Result | Notes |
|---|---|---|
| 20 screens × 10 QA sizes (907x510, 1216x684, 1077x606, 821x462, 1366x768, 1920x1080, 1536x864, 1280x720, 800x450, 1080x607) | ok | 200/200 saved, no errors; looked through 821x462 and 800x450 in full: nothing cut off or covered, text readable |
| Phones: 390x844, 844x390, 360x740 | ok | 60/60; upright layout works (full-width players panel, small dice tray) |
| Safe areas (`safe=0,47,21,47`) | ok | buttons and panels stay inside the insets, the board fills the screen |

### Scenarios

Driven by a script over the DevTools protocol in headless Edge and Chrome (fresh profile each), plus the project's online test pages in the app's browser.

| Scenario | Result | Notes |
|---|---|---|
| First launch: menu offers First Match, the rest waits behind the veil | ok | tip "Start your first match", Skip tutorial on the bubble |
| First Match: roll 4 up the ladder to 26, Swamp on cell 1, both bots stuck | ok | forced part done, `first=done` |
| First Match played to the end | ok | results with Play Again, Try Fool mode, Bigger board, Main Menu |
| Results title for a player with no name | not ok → fixed | it read "You wins!" with "You (you)" in the panels and the log (every new player sees it); now "You win!" / "You are the Fool!", the name shows as "You" and the line under the title is dropped |
| Play Again (rematch) | ok | a normal game, Medium bots, no tips |
| Reload in the middle of a solo game | ok | the same game, positions and turn after the reload |
| Pass & Play (hotseat) | ok | 2 players + a bot; "pass the computer" curtain before each player's hand |
| Menus: Solo Play, Pass & Play, Online, How to Play, The Cards | ok | |
| Online: room by code in the CrazyGames build, two players | ok | `tmp/cgroom.html` (not committed): the code joins, no link, both in the lobby |
| Online: full room game, 3 players (`tools/onlinetest.html`) | ok | 15/15: code, brokers-only player, reload, host leaves, rematch |
| Quick Match with bots, two sites (`tools/quicktest.html`) | ok | 8/8: starts at once with bots, a newcomer takes a bot's seat, CrazyGames and GitHub Pages tables never meet |
| Console | ok | 0 errors and 0 warnings in all runs |
| Chrome | ok | Chrome 155 headless + the app's Chromium browser |
| Edge | ok | Edge 155 headless |
| Safari / iOS, a real Android phone | not checked | no such device here; check in the portal's preview before submitting |
| A real cross-origin iframe on the portal | not checked | `cgframe.html` is same-origin; the portal's preview will show it |

### Other sites from the same `main`

| Check | Result | Notes |
|---|---|---|
| GitHub Pages (`index.html`) | ok | profile `pages`: links on, Quick Match prefix `QM`, no console errors |
| Project 0 harness (`tools/harness.html`) | ok | no `p0.web`, no First Match, a game played to the end, `harness.errors` empty |
| Rules (`tools/simtest.html?boards=60&games=40`) | ok | boards bad 0, games errors 0, no round limit hit |

### Submission checklist (from the plan)

- [x] zip: < 1500 files, < 20 MB, relative paths only, no build/, diorama/, tools/
- [x] menu in < 10 s, three.js local
- [x] no links to the game outside CrazyGames
- [x] no fullscreen button of its own, no outside ads, no links to other platforms
- [x] player names filtered on both sides
- [x] Quick Match never a dead end, bots in plain sight
- [x] Play in one click, tips in the first match, skippable
- [x] no Project 0 texts (lot, bar, City, weekly)
- [x] readable at 821x462 and 800x450 at DPR 1, safe areas on phones
- [x] privacy notice online and a link to the policy
- [x] 3 covers (1920x1080, 800x1200, 800x800) and 2 videos (1920x1080 and 1080x1620, 19.6 s, H.264, no sound)
- [x] description, controls, form answers (this file)
- [x] GitHub Pages and Project 0 work from the same main

## Steps in the Developer Portal (by hand)

1. `python tools/build_cg.py` on the commit you submit; take `dist/crazygames.zip`.
2. Developer Portal (<https://developer.crazygames.com>): sign in, Upload new game, choose **Basic Launch** (the SDK is used without ads).
3. Upload the zip; set **HTML5**, the main file `index.html` at the root of the archive.
4. Open the portal's **preview**: check the game in their iframe (desktop and the mobile preview), the menu, a First Match, Online with a room code. Look at it on a real phone (iOS Safari and Android Chrome) if you can: not checked here.
5. Fill in the texts from this file: title, short and full description, controls (the short version fits their Controls field).
6. Category and tags (above); mobile: yes, orientation: landscape (or both, if the form allows).
7. Form questions: answers from the table above (multiplayer yes, chat no, UGC names only with a filter, SDK for multiplayer only, no ads or purchases).
8. Covers: `cover-burst-sl-1920x1080.png`, `cover-burst-sl-800x1200.png`, `cover-burst-sl-800x800.png`; videos: `trailer-1920x1080.mp4`, `trailer-1080x1620.mp4` (all in `docs/crazygames/media/`).
9. If the form asks for a privacy policy URL: the policy ships inside the build as `privacy.html`; the GitHub Pages copy is `https://andtargd.github.io/cards_snakes_ladders/privacy.html` (only as a URL in the form, never as a link inside the game).
10. Submit for QA; answer QA feedback in the portal.
