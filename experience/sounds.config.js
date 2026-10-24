// How loud each of the game's sounds is, for tuning the mix. Edit, save and reload the page.
//
// Every moment the game makes a sound has a line here:
//   name: volume                        the sound of that name (sfx/<name>.mp3) at this volume
//   name: { sound: 'file', volume }     another sound (sfx/<file>.mp3): one sound may play at several
//                                       moments, each at a level of its own
// Volume: 0 is silent, 0.5 the usual level, 2 as loud as a sound can play (anything over that is 2).
// The player's own Sound slider (the menu's settings) turns all of them up and down together.
//
// To try levels out without editing, the page's address can set any of them for a while:
//   index.html?sfx=roll:0.3,land:0.8
// The new sounds themselves: tools/make_sfx.py writes them into sfx/.

export default {
  // ── the dice
  roll: 0.4, //                                  the wooden ticks as the dice are thrown (roll1-4.mp3, one at random)
  land: 0.6, //                                  the ding as they come to rest showing the number (land1-3.mp3)
  faceChosen: { sound: 'fold', volume: 0.7 }, // Choose a Face, Golden Die: the die is set to its face
  dieChosen: { sound: 'select', volume: 0.5 }, // Choose Your Roll: the die picked hops to the middle of the tray

  // ── the pieces on the board
  hop: 0.3, //                                   a piece steps on to the next cell
  ladder: 0.5, //                                up a ladder
  snake: 0.5, //                                 down a snake
  jump: 0.5, //                                  a piece leaps over the board (Leap, a jump)
  tramp: 0.5, //                                 a trampoline throws a piece up
  portal: 0.5, //                                through a portal; Swap Places
  rewind: { sound: 'portal', volume: 0.4 }, //   Rewind: a piece goes back the way it came
  boardChange: { sound: 'fold', volume: 0.5 }, // snakes and ladders change on the board (a card)
  quake: 0.5, //                                 Earthquake: the whole board shifts
  win: 0.6, //                                   a player reaches the last cell

  // ── words popping up over a piece as a card's effect hits it
  skip: 0.5, //                                  Skip, Frozen, Back (Choose Your Roll / a roll undone)
  swamp: 0.5, //                                 stuck in a swamp
  boots: { sound: 'swamp', volume: 0.4 }, //     Swamp Boots: through a swamp on the way
  shield: 0.5, //                                a shield stops a card
  leap: { sound: 'select', volume: 0.5 }, //     Leap
  rewound: { sound: 'fold', volume: 0.5 }, //    Rewind's word over the piece

  // ── cards
  draw: 0.4, //                                  I draw a card
  offer: { sound: 'draw', volume: 0.5 }, //      cards are offered for me to take one
  card: 0.6, //                                  a card is played (it shows in the middle)
  target: 0.5, //                                the player a card is played on lights up
  take: { sound: 'select', volume: 0.45 }, //    a card taken from the ones offered; a die picked (Choose Your Roll)
  play: { sound: 'select', volume: 0.45 }, //    a card of my hand played on what I aimed it at
  aim: { sound: 'draw', volume: 0.3 }, //        a card of my hand picked up to aim (and Echo's card to aim again)
  firstCell: { sound: 'select', volume: 0.35 }, // the first of two cells picked for a card
  discard: { sound: 'fold', volume: 0.4 }, //    a card of my hand burns (thrown away, or one over the hand's limit)
  burn: { sound: 'fold', volume: 0.3 }, //       a card another player threw away burns by their row
  effects: { sound: 'draw', volume: 0.3 }, //    the window of a player's effects opens

  // ── the menus and windows
  menu: 0.45, //                                 a button that goes on to another screen
  back: 0.45, //                                 a button that goes back (Back, Leave, Cancel, Close)
  tick: 0.45, //                                 any other button
  tip: { sound: 'tick', volume: 0.35 }, //       a tip shakes: tap what it points at
  option: { sound: 'select', volume: 0.35 }, //  a mode chosen on the setup screens
  soundOn: { sound: 'select', volume: 0.5 }, //  the sound turned on, the Sound slider let go
  start: { sound: 'draw', volume: 0.4 }, //      a game starts; Pass & Play: the next player shows their hand
  invite: { sound: 'target', volume: 0.5 }, //   an invitation to someone's table comes in
}
