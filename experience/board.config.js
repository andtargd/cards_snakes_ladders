// The field's settings, for tuning the game: how many snakes and ladders a board has, how long they run
// and where they may stand. Edit, save and reload the page. Each game's board is generated from its seed:
// boards are drawn until one passes every rule here.
//
// A snake or ladder stands on the tier where a piece steps on it: a ladder on the tier of its foot, a
// snake on the tier of its head. A tier is a row of 10 cells.

export default {
  // each board size (in cells):
  //   snakes, ladders  how many of each
  //   maxLen           the longest a snake or ladder may run, in cells
  //   rolls            [fewest, most]: the mean number of rolls a lone player without cards needs to finish
  //                    (checked over 1,000 runs); boards outside this range are thrown away
  //   emptyTiers       tiers with no snake and no ladder at all, at most
  sizes: {
    50: { snakes: 4, ladders: 4, maxLen: 30, rolls: [12, 23], emptyTiers: 1 },
    70: { snakes: 6, ladders: 6, maxLen: 42, rolls: [17, 32], emptyTiers: 1 },
    100: { snakes: 8, ladders: 8, maxLen: 60, rolls: [25, 45], emptyTiers: 2 },
  },

  // the shortest a snake or ladder may run, in cells (every one also joins two different tiers)
  minLen: 8,

  // on one tier, at most:
  perTier: {
    ladders: 2,
    snakes: 2,
    ends: 4, // ends of snakes and ladders (heads, tails, feet and tops together)
  },

  // one tier of the whole board may hold more snakes than `perTier.snakes`: up to `snakes`, and only a
  // tier that starts `from` the way along the board or later (0.7: in its last 30%)
  crowdedTier: { snakes: 3, from: 0.7 },

  // the start is gentle, the end is hard: [fewest, most] share of the ladders that stand in the board's
  // first half, and of the snakes in its second half; the rest stand in the other half. Each share is
  // rounded to the nearest count (8 at [0.6, 0.8]: 5 to 6; 6: 4 to 5; 4: 2 to 3), and each board takes
  // a count from that range by its seed
  laddersFirstHalf: [0.6, 0.8],
  snakesSecondHalf: [0.6, 0.8],

  // a snake's head stands 1 to this many cells before the finish (0: no such snake is required)
  finalSnake: 5,

  // the total climb of the ladders and the total fall of the snakes differ by this share at most
  balance: 0.15,

  // seen from above, a snake or ladder crosses at most `maxCrossings` others, each at `minCrossAngle`
  // degrees or more
  maxCrossings: 2,
  minCrossAngle: 40,

  // seen from above, no snake and no other ladder passes over a ladder's foot (with its arrow) or top,
  // where a piece gets on and off: it keeps this far (in metres) from them, past its own width and the ladder's
  ladderEndsClear: 0.05,

  // seen from the front, a snake or ladder leans left or right as it rises; of the ladders that lean, and of
  // the snakes, at least this share leans each way (0.4 of 8 rounds to 3: 3 and 5 at the worst)
  leanEachWay: 0.4,
}
