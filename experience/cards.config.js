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
// and the numbers of its own, described next to each card.
//
// Who or what a card can target, its category (colour and picture) and how it works stay in rules.js.

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
      spaces: 2, // spaces forward
      text: 'Move any player {spaces} spaces forward, over any swamp.',
    },
    M2: {
      name: 'Setback', rarity: 'U', weight: 1, enabled: true,
      spaces: 3, // spaces back (never past cell 1)
      text: 'Move any player {spaces} spaces back.',
    },
    M3: {
      name: 'Swap Places', rarity: 'R', weight: 1, enabled: true,
      text: 'Swap places with another player.',
    },
    M4: {
      name: 'Dethrone', rarity: 'L', weight: 1, enabled: true,
      spaces: 10, // spaces back for the leader (never past cell 1)
      text: 'The player closest to the finish moves {spaces} spaces back.',
    },
    M5: {
      name: 'Double Move', rarity: 'L', weight: 1, enabled: true,
      text: 'Any player immediately rolls again and moves.',
    },

    // ---------- Dice: they change the target's next roll ----------
    D1: {
      name: 'Extra Die', rarity: 'C', weight: 1, enabled: true,
      dice: 2, // dice in the next roll (the tray shows up to 2)
      text: "A player's next roll uses {dice} dice.",
    },
    D2: {
      name: 'Choose a Face', rarity: 'U', weight: 1, enabled: true,
      max: 3, // the player picks a value from 1 to this
      text: 'A player picks a value from 1 to {max} instead of rolling.',
    },
    D3: {
      name: 'Heavy Die', rarity: 'R', weight: 1, enabled: true,
      min: 3, // the lowest face the dice can show (1 to 6)
      text: "A player's next roll: no die shows less than {min}.",
    },
    D4: {
      name: 'Golden Die', rarity: 'L', weight: 1, enabled: true,
      max: 6, // the player picks a value from 1 to this
      text: 'A player picks any value from 1 to {max} instead of rolling.',
    },

    // ---------- Board ----------
    B1: {
      name: 'Swamp', rarity: 'C', weight: 1, enabled: true,
      turns: 3,
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
      shift: 2, // each end of every snake and ladder moves 1 to this many cells
      turns: 3,
      text: 'Every snake and ladder shifts 1–{shift} spaces for {turns} turns.',
    },

    // ---------- Hinder ----------
    H1: {
      name: 'Slow Down', rarity: 'C', weight: 1, enabled: true,
      max: 3, // the next roll's total is cut to this
      text: "A player's next roll totals {max} at most.",
    },
    H2: {
      name: 'Freeze', rarity: 'U', weight: 1, enabled: true,
      text: "A player can't play cards on their next turn.",
    },
    H3: {
      name: 'Skip Turn', rarity: 'R', weight: 1, enabled: true,
      text: 'A player skips their next turn.',
    },

    // ---------- Protection ----------
    P1: {
      name: 'Parachute', rarity: 'C', weight: 1, enabled: true,
      slide: 0.5, // the part of a snake's length the player still slides (0.5 = half); fix the text if you change it
      turns: 3,
      text: 'A player slides only half as far down snakes for {turns} turns.',
    },
    P2: {
      name: 'Swamp Boots', rarity: 'U', weight: 1, enabled: true,
      turns: 3,
      text: 'A player ignores swamps for {turns} turns.',
    },
    P3: {
      name: 'Shield', rarity: 'R', weight: 1, enabled: true,
      turns: 3, // it also ends on the first snake it blocks
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
      text: "Look at another player's hand until the end of your turn.",
    },
    C3: {
      name: 'Steal', rarity: 'U', weight: 1, enabled: true,
      text: "Take a random card from another player's hand.",
    },
    C4: {
      name: 'Swap Hands', rarity: 'R', weight: 1, enabled: true,
      text: 'Swap hands with another player.',
    },
  },
}
