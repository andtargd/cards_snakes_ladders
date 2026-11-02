// The deck's settings, for tuning the game: rarity, how often each card comes up and the numbers it works
// with. Edit, save and reload the page. Names and texts are in locale.js, in every language.
//
// Every card:
//   rarity   C (Common), U (Uncommon), R (Rare) or L (Legendary): the card's frame, its stars and how
//            often it is drawn (see `rarity` below); bots value rarer cards more
//   weight   how often the card comes up among the cards of its rarity (1 = as often as the others,
//            2 = twice as often, 0.5 = half as often)
//   enabled  false takes the card out of the deck and out of the How to Play catalogue
//   popup    (some cards) the colour of the word that pops up over a player's piece when the card's
//            effect hits them: { color: '#5d7d22' }. The word itself is in locale.js
//   target   (cards played on a player) who it can be played on:
//              any_player          any player on the board, the one playing it included
//              not_current_player  any player but the one playing it
//              current_player      the one playing it, without choosing
//            Swap Places, Peek, Steal and Swap Hands always go to another player. Fix the texts if you
//            change it.
// and the numbers of its own, described next to each card.
//
// Its category (colour and picture), how it works and what the other cards target (cells, ladders,
// snakes, the leader) stay in rules.js.

export default {
  // cards a player may hold at the end of their turn (they draw one at the start of each turn, so the
  // one over this is burnt)
  hand: 3,

  // a card the player holds and got lately comes up less often in their draws, so a hand fills up with the
  // same card less: its chance drops by getSameCardChance (0.8 = 80% less, 0 turns it off), the rest of the
  // deck sharing what it gives up, for the next getSameCardCooldown turns of that player (the turn they got
  // it in does not count). Any card got counts: drawn, chosen, stolen or swapped in
  getSameCardChance: 0.8,
  getSameCardCooldown: 2,

  // a draw first picks a rarity by these weights (out of their sum), then a card of that rarity
  rarity: {
    C: { weight: 55 },
    U: { weight: 28 },
    R: { weight: 13 },
    L: { weight: 4 },
  },

  // `turns`: how many turns of the player who played the card the effect lasts (the turn it is played
  // in does not count)
  cards: {
    // ---------- Movement ----------
    M1: {
      rarity: 'C', weight: 1, enabled: true,
      target: 'any_player',
      spaces: 2, // spaces forward
    },
    M2: {
      rarity: 'U', weight: 1, enabled: true,
      target: 'any_player',
      spaces: 3, // spaces back (never past cell 1)
    },
    M3: {
      rarity: 'L', weight: 1, enabled: true,
      target: 'not_current_player',
    },
    M4: {
      rarity: 'R', weight: 1, enabled: true,
      target: 'current_player',
    },
    M5: {
      rarity: 'U', weight: 1, enabled: true,
      target: 'current_player',
      popup: { color: '#3fa66b' }, // over the player where the leap lands
    },
    M6: {
      rarity: 'R', weight: 1, enabled: true,
      target: 'any_player',
      popup: { color: '#9b59d6' }, // over the player sent back
    },

    // ---------- Dice: they change the target's next roll ----------
    D1: {
      rarity: 'C', weight: 1, enabled: true,
      target: 'current_player',
      dice: 2, // dice in the next roll (the tray shows up to 3: Choose Your Roll throws one more)
    },
    D2: {
      rarity: 'R', weight: 1, enabled: true,
      target: 'current_player',
      max: 3, // the player picks a value from 1 to this
    },
    D3: {
      rarity: 'R', weight: 1, enabled: true,
      target: 'current_player',
      min: 3, // the lowest face the dice can show (1 to 6)
    },
    D4: {
      rarity: 'L', weight: 1, enabled: true,
      target: 'current_player',
      max: 6, // the player picks a value from 1 to this
    },
    D5: {
      rarity: 'U', weight: 1, enabled: true,
      target: 'current_player',
    },

    // ---------- Board ----------
    B1: {
      rarity: 'C', weight: 1, enabled: true,
      turns: 3,
      popup: { color: '#5d7d22' }, // over a piece the swamp stops
    },
    B2: {
      rarity: 'U', weight: 1, enabled: true,
      turns: 3,
    },
    B3: {
      rarity: 'U', weight: 1, enabled: true,
      turns: 3,
    },
    B4: {
      rarity: 'U', weight: 1, enabled: true,
      spaces: 3, // spaces forward for whoever lands on it
      turns: 3,
    },
    B5: {
      rarity: 'R', weight: 1, enabled: true,
      turns: 3,
    },
    B6: {
      rarity: 'L', weight: 1, enabled: true,
      shift: 2, // each end of every snake and ladder moves 1 to this many cells, for the rest of the game
      spaces: 5, // then every other player moves this many spaces back (never past cell 1); not one under
      //            the Holy Grail
    },

    // ---------- Hinder ----------
    H1: {
      rarity: 'C', weight: 1, enabled: true,
      target: 'any_player',
      max: 3, // the next roll's total is cut to this
    },
    H2: {
      rarity: 'U', weight: 1, enabled: true,
      target: 'any_player',
      popup: { color: '#d64545' }, // over the player at the start of the turn they can't play cards
    },
    H3: {
      rarity: 'R', weight: 1, enabled: true,
      target: 'any_player',
      popup: { color: '#d64545' }, // over the player when their turn is skipped
    },
    H4: {
      rarity: 'R', weight: 1, enabled: true,
      target: 'any_player',
      popup: { color: '#d64545' }, // over the player as their roll moves them back
    },
    H5: {
      rarity: 'L', weight: 1, enabled: true,
      spaces: 10, // spaces back for the leader (never past cell 1)
    },

    // ---------- Protection ----------
    P1: {
      rarity: 'C', weight: 1, enabled: true,
      target: 'current_player',
      slide: 0.5, // the part of a snake's length the player still slides (0.5 = half); fix the texts if you change it
      turns: 3, // it also ends on the first snake it softens
    },
    P2: {
      rarity: 'U', weight: 1, enabled: true,
      target: 'current_player',
      turns: 3,
    },
    P3: {
      rarity: 'R', weight: 1, enabled: true,
      target: 'current_player',
      turns: 3, // it also ends on the first snake it blocks
      popup: { color: '#2b8fd6' }, // over the player when it blocks a snake
    },
    P4: {
      rarity: 'L', weight: 1, enabled: true,
      target: 'current_player',
      // every effect on the player goes; then, for this many rounds (until their own turn has come again
      // this many times), no other player can play on them the Hinder cards, Dash, Setback, Swap Places,
      // Rewind, Steal or Swap Hands, and an Earthquake does not throw them back
      rounds: 2,
      popup: { color: '#c99400' }, // over the player as it clears their effects
    },

    // ---------- Hand ----------
    C1: {
      rarity: 'C', weight: 1, enabled: true,
      extra: 1, // cards drawn over the number discarded (the hand still holds at most `hand` after it)
    },
    C2: {
      rarity: 'C', weight: 1, enabled: true,
      target: 'not_current_player',
    },
    C3: {
      rarity: 'U', weight: 1, enabled: true,
      target: 'not_current_player',
    },
    C4: {
      rarity: 'R', weight: 1, enabled: true,
      target: 'not_current_player',
    },
    C5: {
      rarity: 'U', weight: 1, enabled: true,
      draw: 3, // cards offered at the start of the next turn (1 to 5); the player keeps one
    },
    C6: {
      rarity: 'L', weight: 1, enabled: true,
    },
  },
}
