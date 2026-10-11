// Street view of Cards, Snakes & Ladders: four pawns play a recorded game on the paper board,
// the big die tumbles for every roll, the fan of cards sways and one card turns above the board.
// Everything runs on the world clock, so every viewer sees the same moment of the game.

// [player, roll, cells stepped, slide: [kind (S snake, L ladder, T trampoline, P portal), element, to] or 0]
const TURNS = [
  [0,2,[1,2],0], [1,1,[1],0], [2,4,[1,2,3,4],0], [3,6,[1,2,3,4,5,6],0],
  [0,1,[3],0], [1,1,[2],0], [2,5,[5,6,7,8,9],0], [3,4,[7,8,9,10],0],
  [0,4,[4,5,6,7],0], [1,5,[3,4,5,6,7],0], [2,1,[10],0], [3,6,[11,12,13,14,15,16],0],
  [0,2,[8,9],0], [1,4,[8,9,10,11],["L",11,47]], [2,5,[11,12,13,14,15],0], [3,4,[17,18,19,20],0],
  [0,4,[10,11,12,13],0], [1,5,[48,49,50,51,52],0], [2,6,[16,17,18,19,20,21],["L",5,60]], [3,2,[21,22],0],
  [0,2,[14,15],0], [1,6,[53,54,55,56,57,58],["T",-1,61]], [2,3,[61,62,63],0], [3,3,[23,24,25],0],
  [0,2,[16,17],0], [1,1,[62],0], [2,3,[64,65,66],0], [3,1,[26],0],
  [0,2,[18,19],0], [1,2,[63,64],0], [2,2,[67,68],0], [3,2,[27,28],["L",3,46]],
  [0,4,[20,21,22,23],["P",-1,76]], [1,4,[65,66,67,68],0], [2,2,[69,70],["S",14,33]], [3,4,[47,48,49,50],0],
  [0,3,[77,78,79],0], [1,2,[69,70],["S",14,33]], [2,3,[34],0], [3,5,[51,52,53,54,55],0],
  [0,2,[80,81],0], [1,1,[34],0], [2,4,[35,36,37,38],0], [3,4,[56,57,58,59],0],
  [0,1,[82],0], [1,1,[35],["S",6,17]], [2,5,[39,40,41,42,43],["S",10,18]], [3,3,[60,61,62],0],
  [0,1,[83],["S",0,59]], [1,3,[18,19,20],0], [2,3,[19,20,21],["L",5,60]], [3,6,[63,64,65,66,67,68],0],
  [0,1,[60],0], [1,5,[21,22,23,24,25],0], [2,3,[61,62,63],0], [3,2,[69,70],["S",14,33]],
  [0,3,[61,62,63],0], [1,1,[26],0], [2,5,[64,65,66,67,68],0], [3,1,[34],0],
  [0,1,[64],0], [1,4,[27,28,29,30],["L",9,51]], [2,4,[69,70,71,72],0], [3,3,[35,36,37],0],
  [0,3,[65,66,67],["L",13,88]], [1,2,[52,53],0], [2,1,[73],0], [3,4,[38,39,40,41],0],
  [0,4,[89,90,91,92],0], [1,6,[54,55,56,57,58,59],0], [2,5,[74,75,76,77,78],0], [3,2,[42,43],["S",10,18]],
  [0,4,[93,94,95,96],["S",8,77]], [1,5,[60,61,62,63,64],0], [2,2,[79,80],["L",7,99]], [3,6,[19,20,21,22,23,24],0],
  [0,2,[78,79],0], [1,6,[65,66,67,68,69,70],["S",14,33]], [2,1,[100],0],
]
// points [x, z] along each snake (head to tail) and ladder (foot to top)
const PATHS = [
  [
    [-2.5,-5.03], [-2.6,-4.73], [-2.76,-4.46], [-2.76,-4.14], [-2.66,-3.79], [-2.66,-3.47], [-2.9,-3.22], [-3.23,-2.99],
    [-3.39,-2.71], [-3.32,-2.37], [-3.19,-2.02], [-3.23,-1.71], [-3.41,-1.44], [-3.5,-1.28],
  ],
  [
    [-0.5,-1.28], [-0.68,-1.5], [-0.86,-1.73], [-1.05,-1.96], [-1.23,-2.18], [-1.41,-2.41], [-1.59,-2.64], [-1.77,-2.87],
    [-1.95,-3.09], [-2.14,-3.32], [-2.32,-3.55], [-2.5,-3.78],
  ],
  [
    [3.5,2.47], [3.21,2.6], [2.9,2.66], [2.61,2.78], [2.38,3.04], [2.15,3.29], [1.85,3.39], [1.47,3.3],
    [1.09,3.18], [0.77,3.25], [0.57,3.56], [0.4,3.97], [0.18,4.25], [-0.15,4.27], [-0.55,4.12], [-0.93,4.03],
    [-1.22,4.15], [-1.43,4.45], [-1.65,4.75], [-1.92,4.9], [-2.25,4.93], [-2.5,4.97],
  ],
  [
    [2.5,2.47], [2.32,2.25], [2.14,2.02], [1.95,1.79], [1.77,1.57], [1.59,1.34], [1.41,1.11], [1.23,0.88],
    [1.05,0.66], [0.86,0.43], [0.68,0.2], [0.5,-0.03],
  ],
  [
    [3.5,-2.53], [3.2,-2.43], [2.9,-2.36], [2.6,-2.28], [2.34,-2.07], [2.08,-1.87], [1.77,-1.82], [1.41,-1.94],
    [1.04,-2.06], [0.75,-1.97], [0.52,-1.64], [0.32,-1.25], [0.06,-1.05], [-0.3,-1.15], [-0.7,-1.4], [-1.06,-1.51],
    [-1.33,-1.32], [-1.52,-0.91], [-1.74,-0.55], [-2.03,-0.45], [-2.4,-0.6], [-2.78,-0.77], [-3.1,-0.75], [-3.35,-0.52],
    [-3.59,-0.24], [-3.86,-0.07], [-4.18,-0.05], [-4.5,-0.03],
  ],
  [
    [-4.5,2.47], [-4.5,2.19], [-4.5,1.9], [-4.5,1.61], [-4.5,1.32], [-4.5,1.03], [-4.5,0.74], [-4.5,0.46],
    [-4.5,0.17], [-4.5,-0.12], [-4.5,-0.41], [-4.5,-0.7], [-4.5,-0.99], [-4.5,-1.28],
  ],
  [
    [0.5,1.22], [0.27,1.44], [0.05,1.65], [-0.01,2], [-0.09,2.33], [-0.41,2.46], [-0.81,2.54], [-1,2.79],
    [-1,3.18], [-1.12,3.48], [-1.4,3.65], [-1.5,3.72],
  ],
  [
    [-4.5,-3.78], [-4.39,-4.05], [-4.28,-4.32], [-4.17,-4.59], [-4.07,-4.86], [-3.96,-5.13], [-3.85,-5.41], [-3.74,-5.68],
    [-3.63,-5.95], [-3.52,-6.22], [-3.5,-6.27],
  ],
  [
    [-0.5,-6.27], [-0.65,-6.01], [-0.86,-5.76], [-1,-5.48], [-1.01,-5.16], [-0.98,-4.82], [-1,-4.5], [-1.14,-4.23],
    [-1.36,-3.98], [-1.5,-3.78],
  ],
  [
    [4.5,2.47], [4.5,2.19], [4.5,1.9], [4.5,1.61], [4.5,1.32], [4.5,1.03], [4.5,0.74], [4.5,0.46],
    [4.5,0.17], [4.5,-0.12], [4.5,-0.41], [4.5,-0.7], [4.5,-0.99], [4.5,-1.28],
  ],
  [
    [-2.5,-0.03], [-2.53,0.29], [-2.61,0.6], [-2.5,0.91], [-2.3,1.22], [-2.28,1.54], [-2.5,1.85], [-2.73,2.16],
    [-2.72,2.47], [-2.5,2.79], [-2.35,3.1], [-2.4,3.41], [-2.5,3.72],
  ],
  [
    [4.5,3.72], [4.32,3.5], [4.13,3.27], [3.95,3.04], [3.77,2.81], [3.59,2.58], [3.4,2.35], [3.22,2.12],
    [3.04,1.9], [2.85,1.67], [2.67,1.44], [2.49,1.21], [2.3,0.98], [2.12,0.75], [1.94,0.52], [1.76,0.3],
    [1.57,0.07], [1.5,-0.03],
  ],
  [
    [0.5,-5.03], [0.79,-4.92], [1.06,-4.74], [1.36,-4.69], [1.71,-4.77], [2.05,-4.81], [2.32,-4.65], [2.54,-4.33],
    [2.78,-4.05], [3.08,-3.97], [3.43,-4.06], [3.78,-4.14], [4.07,-4.06], [4.34,-3.87], [4.5,-3.78],
  ],
  [
    [1.5,-2.53], [1.61,-2.8], [1.72,-3.07], [1.83,-3.34], [1.93,-3.61], [2.04,-3.88], [2.15,-4.16], [2.26,-4.43],
    [2.37,-4.7], [2.48,-4.97], [2.5,-5.03],
  ],
  [
    [4.5,-2.53], [4.34,-2.25], [4.11,-2.02], [4,-1.73], [4.01,-1.37], [3.99,-1.03], [3.78,-0.78], [3.42,-0.62],
    [3.1,-0.44], [2.96,-0.16], [2.99,0.21], [3,0.57], [2.87,0.85], [2.62,1.08], [2.5,1.22],
  ],
  [
    [-0.5,-5.03], [-0.25,-5.18], [0,-5.34], [0.25,-5.49], [0.5,-5.65], [0.75,-5.81], [1,-5.96], [1.25,-6.12],
    [1.5,-6.27],
  ],
]
const DIE_REST = [[0,0.5,0],[-1.57,0,0.5],[0,0.5,1.57],[0,0.5,-1.57],[1.57,0,-0.5],[0,0.5,-3.14]]
const DIE_HOME = [2.15,0.62,7.4]
const START = [[-4.8,0.16,6.29],[-4.1,0.16,6.29],[-4.8,0.16,6.97],[-4.1,0.16,6.97]]
const SLOT = [[-0.22,-0.24],[0.22,-0.24],[-0.22,0.24],[0.22,0.24]]
const FAN_AT = [0,4.2,-7.6]
const CARD_AT = [0,7.2,-1.2]
const BOARD = { base: 0.12, step: 0.3, tile: 0.03, front: 5.6, depth: 1.25, tiers: 10 }

const ROLL = 0.9, HOP = 0.27, SLIDE = 1.1, PAUSE = 0.35, PARTY = 3.0, RESET = 2.0

function cell(c) {
  const t = Math.floor((c - 1) / 10), i = (c - 1) % 10
  const col = t % 2 === 0 ? i : 9 - i
  return [-4.5 + col, BOARD.base + (t + 1) * BOARD.step + BOARD.tile, BOARD.front - (t + 0.5) * BOARD.depth]
}
function spot(p, c) {
  if (c <= 0) return START[p].slice()
  const at = cell(Math.min(100, c))
  return [at[0] + SLOT[p][0], at[1], at[2] + SLOT[p][1]]
}
// the paper laid over the steps leans against each riser; a pawn stands on the highest point under its foot
function drape(z) {
  const tf = (BOARD.front - z) / BOARD.depth
  let y = BOARD.base + BOARD.step + BOARD.tile
  for (let k = 1; k < BOARD.tiers; k++) { const x = (tf - (k - 0.3)) / 0.3; y += BOARD.step * (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x)) }
  return y
}
const FOOT = 0.26
const stand = z => Math.max(drape(z - FOOT), drape(z - FOOT / 2), drape(z), drape(z + FOOT / 2), drape(z + FOOT)) + 0.065
// the top of the board under a point: a tier's cells, or the table around it
function floor(x, z) {
  const tf = (BOARD.front - z) / BOARD.depth
  if (Math.abs(x) > 5.15 || tf < 0 || tf >= BOARD.tiers) return BOARD.base + 0.045
  return BOARD.base + (Math.floor(tf) + 1) * BOARD.step + BOARD.tile
}
/** Keeps a pawn in the air from sinking into a step: never lower than the board under its foot. */
function above(p) {
  let y = 0
  for (const [dx, dz] of [[0, 0], [FOOT, 0], [-FOOT, 0], [0, FOOT], [0, -FOOT]]) y = Math.max(y, floor(p[0] + dx, p[2] + dz))
  if (p[1] < y) p[1] = y
  return p
}
const lerp = (a, b, k) => a + (b - a) * k
// the board is turned half round in the lot: its front faces -z
const turn = p => [-p[0], p[1], -p[2]]
const mix3 = (a, b, k) => [lerp(a[0], b[0], k), lerp(a[1], b[1], k), lerp(a[2], b[2], k)]
const ease = k => (k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2)

// the timeline: when each turn starts, and where every pawn stands before it
const timeline = []
let clock = 0
const where = [0, 0, 0, 0]
for (const [p, v, path, slide] of TURNS) {
  const length = ROLL + path.length * HOP + (slide ? SLIDE : 0) + PAUSE
  timeline.push({ start: clock, length, before: where.slice() })
  where[p] = slide ? slide[2] : path[path.length - 1]
  clock += length
}
const GAME = clock
const LOOP = GAME + PARTY + RESET
const FINAL = where.slice()

function along(points, k) {
  const f = Math.min(points.length - 1.001, Math.max(0, k * (points.length - 1)))
  const i = Math.floor(f), r = f - i
  const x = lerp(points[i][0], points[i + 1][0], r), z = lerp(points[i][1], points[i + 1][1], r)
  return [x, stand(z), z]
}

export default function build(b) {
  b.loop((dt, time) => {
    const t = time % LOOP
    const pos = [0, 0, 0, 0].map((_, p) => spot(p, 0))
    const turnY = [0, 0, 0, 0]
    let dieAt = DIE_HOME, dieRot = DIE_REST[4], spin = 0
    if (t < GAME) {
      // binary search for the turn being played
      let lo = 0, hi = timeline.length - 1
      while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (timeline[mid].start <= t) lo = mid; else hi = mid - 1 }
      const turn = timeline[lo], [p, v, path, slide] = TURNS[lo]
      for (let q = 0; q < 4; q++) pos[q] = spot(q, turn.before[q])
      let k = t - turn.start
      dieRot = DIE_REST[v - 1]
      if (k < ROLL) {
        // the die tumbles in from the right and settles on the roll
        const r = k / ROLL
        spin = Math.pow(1 - r, 2) * 9
        dieAt = [DIE_HOME[0] + (1 - r) * 1.6, DIE_HOME[1] + Math.abs(Math.cos(r * Math.PI * 2.5)) * (1 - r) * (1 - r) * 1.4, DIE_HOME[2] + (1 - r) * 0.5]
      } else {
        k -= ROLL
        let at = turn.before[p]
        const hops = path.length * HOP
        if (k < hops) {
          const i = Math.floor(k / HOP), r = (k - i * HOP) / HOP
          const a = spot(p, i === 0 ? at : path[i - 1]), c = spot(p, path[i])
          const up = c[1] > a[1] + 0.1 ? 0.7 : 0.4
          const m = mix3(a, c, ease(r))
          m[1] += Math.sin(r * Math.PI) * up
          pos[p] = above(m)
        } else {
          at = path[path.length - 1]
          pos[p] = spot(p, at)
          k -= hops
          if (slide && k < SLIDE) {
            const r = Math.min(1, k / SLIDE)
            const [kind, el, to] = slide
            if (kind === 'S' || kind === 'L') {
              const m = along(PATHS[el], kind === 'L' ? ease(r) : r * r * (3 - 2 * r))
              pos[p] = [m[0] + SLOT[p][0] * 0.5, m[1], m[2] + SLOT[p][1] * 0.5]
            } else {
              const a = spot(p, at), c = spot(p, to)
              const m = mix3(a, c, ease(r))
              m[1] += Math.sin(r * Math.PI) * (kind === 'T' ? 1.4 : 2.2)
              pos[p] = above(m)
            }
          } else if (slide) pos[p] = spot(p, slide[2])
        }
      }
    } else {
      // the winner celebrates on 100, then everyone walks back to the start
      const k = t - GAME
      for (let q = 0; q < 4; q++) pos[q] = spot(q, FINAL[q])
      if (k < PARTY) {
        const w = TURNS[TURNS.length - 1][0]
        pos[w][1] += Math.abs(Math.sin(k * Math.PI * 2)) * 0.6
        turnY[w] = k * Math.PI * 2
      } else {
        const r = ease(Math.min(1, (k - PARTY) / RESET))
        for (let q = 0; q < 4; q++) { const m = mix3(spot(q, FINAL[q]), spot(q, 0), r); m[1] += Math.sin(r * Math.PI) * 1.5; pos[q] = above(m) }
      }
    }
    for (let q = 0; q < 4; q++) b.node('pawn' + q, { position: turn(pos[q]), rotation: [0, turnY[q], 0] })
    b.node('die0', { position: turn(dieAt), rotation: [dieRot[0] + spin, dieRot[1] + spin * 0.6, dieRot[2] + spin * 0.3] })
    b.node('fan', { position: turn(FAN_AT), rotation: [0, 0, Math.sin(time * 0.5) * 0.04] })
    b.node('card', { position: turn([CARD_AT[0], CARD_AT[1] + Math.sin(time * 0.8) * 0.25, CARD_AT[2]]), rotation: [0.15, time * 0.6, 0] })
  })
}
