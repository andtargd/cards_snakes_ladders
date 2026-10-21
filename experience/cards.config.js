// The deck's settings, for tuning the game: names, texts, rarity, how often each card comes up and the
// numbers it works with. Edit, save and reload the page.
//
// Every card:
//   name     the title on the card, in the log and on the effect badges
//   rarity   C (Common), U (Uncommon), R (Rare) or L (Legendary): the card's frame, its stars and how
//            often it is drawn (see `rarity` below); bots value rarer cards more
//   weight   how often the card comes up among the cards of its rarity (1 = as often as the others,
//            2 = twice as often, 0.5 = half as often)
//   enabled  false takes the card out of the deck and out of the How to Play catalogue
//   text     the text on the card. {name} in it is replaced by the card's own number of that name,
//            so "Move any player {spaces} spaces forward" follows `spaces`. Up to 4 short lines fit.
//   popup    (some cards) the word that pops up over a player's piece when the card's effect hits them,
//            and its colour: { text: 'Stuck!', color: '#5d7d22' }
//   target   (cards played on a player) who it can be played on:
//              any_player          any player on the board, the one playing it included
//              not_current_player  any player but the one playing it
//              current_player      the one playing it, without choosing
//            Swap Places, Peek, Steal and Swap Hands always go to another player. Fix the text if you
//            change it.
// and the numbers of its own, described next to each card.
//
// Its category (colour and picture), how it works and what the other cards target (cells, ladders,
// snakes, the leader) stay in rules.js.

export default {
  // cards a player may hold at the end of their turn (they draw one at the start of each turn, so the
  // one over this is burnt)
  hand: 3,

  // a draw first picks a rarity by these weights (out of their sum), then a card of that rarity
  rarity: {
    C: { name: 'Common', weight: 55 },
    U: { name: 'Uncommon', weight: 28 },
    R: { name: 'Rare', weight: 13 },
    L: { name: 'Legendary', weight: 4 },
  },

  // `turns`: how many turns of the player who played the card the effect lasts (the turn it is played
  // in does not count)
  cards: {
    // ---------- Movement ----------
    M1: {
      name: 'Dash', rarity: 'C', weight: 1, enabled: true,
      target: 'any_player',
      spaces: 2, // spaces forward
      text: 'Move any player {spaces} spaces forward, over any swamp.',
    },
    M2: {
      name: 'Setback', rarity: 'U', weight: 1, enabled: true,
      target: 'any_player',
      spaces: 3, // spaces back (never past cell 1)
      text: 'Move any player {spaces} spaces back.',
    },
    M3: {
      name: 'Swap Places', rarity: 'L', weight: 1, enabled: true,
      target: 'not_current_player',
      text: 'Instead of rolling, swap places with another player.',
    },
    M4: {
      name: 'Double Move', rarity: 'R', weight: 1, enabled: true,
      target: 'current_player',
      text: 'A player immediately rolls again and moves.',
    },
    M5: {
      name: 'Tailgate', rarity: 'U', weight: 1, enabled: true,
      target: 'current_player',
      popup: { text: 'Leap!', color: '#3fa66b' }, // over the player where the leap lands
      text: 'Instead of rolling, leap to the cell just behind the nearest player ahead.',
    },
    M6: {
      name: 'Rewind', rarity: 'R', weight: 1, enabled: true,
      target: 'any_player',
      popup: { text: 'Rewind!', color: '#9b59d6' }, // over the player sent back
      text: 'A player goes back to where their last turn began. Nothing there takes effect.',
    },

    // ---------- Dice: they change the target's next roll ----------
    D1: {
      name: 'Extra Die', rarity: 'C', weight: 1, enabled: true,
      target: 'current_player',
      dice: 2, // dice in the next roll (the tray shows up to 2)
      text: "A player's next roll uses {dice} dice.",
    },
    D2: {
      name: 'Choose a Face', rarity: 'R', weight: 1, enabled: true,
      target: 'current_player',
      max: 3, // the player picks a value from 1 to this
      text: 'A player picks a value from 1 to {max} for a die instead of rolling it.',
    },
    D3: {
      name: 'Heavy Die', rarity: 'R', weight: 1, enabled: true,
      target: 'current_player',
      min: 3, // the lowest face the dice can show (1 to 6)
      text: "A player's next roll: no die shows less than {min}.",
    },
    D4: {
      name: 'Golden Die', rarity: 'L', weight: 1, enabled: true,
      target: 'current_player',
      max: 6, // the player picks a value from 1 to this
      text: 'A player picks any value from 1 to {max} for a die instead of rolling it.',
    },
    D5: {
      name: 'Choose Your Roll', rarity: 'U', weight: 1, enabled: true,
      target: 'current_player',
      text: "A player's next roll uses 2 dice: they move by the one they pick.",
    },

    // ---------- Board ----------
    B1: {
      name: 'Swamp', rarity: 'C', weight: 1, enabled: true,
      turns: 3,
      popup: { text: 'Stuck!', color: '#5d7d22' }, // over a piece the swamp stops
      text: 'Place a swamp. Anyone who reaches it stops there. Lasts {turns} turns.',
    },
    B2: {
      name: 'Ladder to Snake', rarity: 'U', weight: 1, enabled: true,
      turns: 3,
      text: 'Turn a ladder into a snake for {turns} turns.',
    },
    B3: {
      name: 'Snake to Ladder', rarity: 'U', weight: 1, enabled: true,
      turns: 3,
      text: 'Turn a snake into a ladder for {turns} turns.',
    },
    B4: {
      name: 'Trampoline', rarity: 'U', weight: 1, enabled: true,
      spaces: 3, // spaces forward for whoever lands on it
      turns: 3,
      text: 'Place a trampoline. Landing on it launches you {spaces} spaces forward. Lasts {turns} turns.',
    },
    B5: {
      name: 'Portal', rarity: 'R', weight: 1, enabled: true,
      turns: 3,
      text: 'Place two portals on cells up to your own. Landing on one sends you to the other. Lasts {turns} turns.',
    },
    B6: {
      name: 'Earthquake', rarity: 'L', weight: 1, enabled: true,
      shift: 2, // each end of every snake and ladder moves 1 to this many cells, for the rest of the game
      text: 'Every snake and ladder shifts 1–{shift} spaces for the rest of the game.',
    },

    // ---------- Hinder ----------
    H1: {
      name: 'Slow Down', rarity: 'C', weight: 1, enabled: true,
      target: 'any_player',
      max: 3, // the next roll's total is cut to this
      text: "A player's next roll totals {max} at most.",
    },
    H2: {
      name: 'Vanilla play', rarity: 'U', weight: 1, enabled: true,
      target: 'any_player',
      popup: { text: 'No cards!', color: '#d64545' }, // over the player at the start of the turn they can't play cards
      text: "A player can't play cards on their next turn.",
    },
    H3: {
      name: 'Skip Turn', rarity: 'R', weight: 1, enabled: true,
      target: 'any_player',
      popup: { text: 'Skips', color: '#d64545' }, // over the player when their turn is skipped
      text: 'A player skips their next turn.',
    },
    H4: {
      name: 'Moonwalk', rarity: 'R', weight: 1, enabled: true,
      target: 'any_player',
      popup: { text: 'Backwards!', color: '#d64545' }, // over the player as their roll moves them back
      text: "A player's next roll moves them back instead of forward (never past cell 1).",
    },
    H5: {
      name: 'Dethrone', rarity: 'L', weight: 1, enabled: true,
      spaces: 10, // spaces back for the leader (never past cell 1)
      text: 'The player closest to the finish moves {spaces} spaces back.',
    },

    // ---------- Protection ----------
    P1: {
      name: 'Parachute', rarity: 'C', weight: 1, enabled: true,
      target: 'current_player',
      slide: 0.5, // the part of a snake's length the player still slides (0.5 = half); fix the text if you change it
      turns: 3, // it also ends on the first snake it softens
      text: 'A player slides only half as far down the next snake they land on. Lasts {turns} turns.',
      popup: { text: 'Parachute!' }, // over the player as it opens on a snake
    },
    P2: {
      name: 'Swamp Boots', rarity: 'U', weight: 1, enabled: true,
      target: 'current_player',
      turns: 3,
      text: 'A player ignores swamps for {turns} turns.',
      popup: { text: 'Boots!' }, // over the player as a roll wades on past a swamp
    },
    P3: {
      name: 'Shield', rarity: 'R', weight: 1, enabled: true,
      target: 'current_player',
      turns: 3, // it also ends on the first snake it blocks
      popup: { text: 'Shield!', color: '#2b8fd6' }, // over the player when it blocks a snake
      text: 'A player ignores the next snake they land on. Lasts {turns} turns.',
    },

    // ---------- Hand ----------
    C1: {
      name: 'Redraw', rarity: 'C', weight: 1, enabled: true,
      extra: 1, // cards drawn over the number discarded (the hand still holds at most `hand` after it)
      text: 'Discard the rest of your hand, then draw {extra} more card than you discarded.',
    },
    C2: {
      name: 'Peek', rarity: 'C', weight: 1, enabled: true,
      target: 'not_current_player',
      text: "Look at another player's hand until the end of your turn.",
    },
    C3: {
      name: 'Steal', rarity: 'U', weight: 1, enabled: true,
      target: 'not_current_player',
      text: "Take a random card from another player's hand.",
    },
    C4: {
      name: 'Swap Hands', rarity: 'R', weight: 1, enabled: true,
      target: 'not_current_player',
      text: 'Swap hands with another player.',
    },
    C5: {
      name: 'Choose Your Card', rarity: 'U', weight: 1, enabled: true,
      draw: 3, // cards offered at the start of the next turn (1 to 5); the player keeps one
      text: 'On your next turn draw {draw} cards instead of one and keep the one you choose.',
    },
    C6: {
      name: 'Echo', rarity: 'L', weight: 1, enabled: true,
      text: "Replay the last card a player played, on targets you choose. Not an Echo.",
    },
  },
}
