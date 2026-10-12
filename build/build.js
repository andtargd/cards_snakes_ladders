// Street view of the Snakes & Ladders diorama: the snake's head sways and bobs on its waving neck, the
// tongue flicks, the googly pupils roll, one die spins on its edge, the other turns in the air and the pink
// friend breathes. The ladder and the snake's body rock in sway.glsl on the same clock.
// The diorama is turned half round in the lot: the maths runs in its own frame, turned at the end.
const FOOT = [-4.1,1.01,2.9]
const FACE = [0.2012,0.242,0.9492]
const ACROSS = [0.7689,-0.6394,0]
const HEAD_P = [-3.95,10.78,0.95]
const HEAD_Q = [0.0307,0.2517,-0.0903,0.9631]
const PUPILS = [[0.05,-0.08,0.12],[-0.05,-0.08,0.12]]
const TONGUE_P = [0,-0.27,0.5509]
const DIE_A_P = [-1.1,1.7845,-7.9]
const DIE_A_Q = [0.2477,0.1955,0.363,0.8767]
const DIE_B_P = [-2.05,3.75,-6.2]
const DIE_B_E = [0.75,0.35,0.5]
const FRIEND_P = [-4.3,0.51,-6.9]
const FRIEND_Q = [0,0.9922,0,0.1247]
const HALF = [0, 1, 0, 0] // half a turn round the vertical: the diorama in the lot

const qmul = (a, b) => [
  a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
  a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
  a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
  a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2],
]
const qaxis = (k, a) => { const s = Math.sin(a / 2); return [k[0] * s, k[1] * s, k[2] * s, Math.cos(a / 2)] }
// XYZ Euler angles to a quaternion and back, as three.js does them
function qeuler(x, y, z) {
  const c1 = Math.cos(x / 2), c2 = Math.cos(y / 2), c3 = Math.cos(z / 2), s1 = Math.sin(x / 2), s2 = Math.sin(y / 2), s3 = Math.sin(z / 2)
  return [s1 * c2 * c3 + c1 * s2 * s3, c1 * s2 * c3 - s1 * c2 * s3, c1 * c2 * s3 + s1 * s2 * c3, c1 * c2 * c3 - s1 * s2 * s3]
}
function euler(q) {
  const [x, y, z, w] = q
  const m11 = 1 - 2 * (y * y + z * z), m12 = 2 * (x * y - z * w), m13 = 2 * (x * z + y * w)
  const m22 = 1 - 2 * (x * x + z * z), m23 = 2 * (y * z - x * w), m32 = 2 * (y * z + x * w), m33 = 1 - 2 * (x * x + y * y)
  const ey = Math.asin(Math.max(-1, Math.min(1, m13)))
  return Math.abs(m13) < 0.9999999 ? [Math.atan2(-m23, m33), ey, Math.atan2(-m12, m11)] : [Math.atan2(m32, m22), ey, 0]
}
function rotate(q, v) {
  const [x, y, z, w] = q
  const ix = w * v[0] + y * v[2] - z * v[1], iy = w * v[1] + z * v[0] - x * v[2], iz = w * v[2] + x * v[1] - y * v[0], iw = -x * v[0] - y * v[1] - z * v[2]
  return [ix * w + iw * -x + iy * -z - iz * -y, iy * w + iw * -y + iz * -x - ix * -z, iz * w + iw * -z + ix * -y - iy * -x]
}
const toLot = p => [-p[0], p[1], -p[2]]

export default function build(b) {
  b.loop((dt, t) => {
    // the ladder's rock (the same as in sway.glsl), carried by the head on top of the neck's wave
    const qs = qmul(qaxis(FACE, Math.sin(t * 0.8) * 0.02 + Math.sin(t * 1.9) * 0.004), qaxis(ACROSS, Math.sin(t * 0.55) * 0.02))
    const wave = [Math.sin(t * 0.9) * 0.32, Math.sin(t * 1.3) * 0.1, Math.sin(t * 0.65) * 0.22]
    const look = qeuler(Math.sin(t * 1.1) * 0.05, Math.sin(t * 0.7) * 0.12, Math.sin(t * 0.9) * 0.06)
    const hq = qmul(qmul(qs, HEAD_Q), look)
    const r = rotate(qs, [HEAD_P[0] - FOOT[0], HEAD_P[1] - FOOT[1], HEAD_P[2] - FOOT[2]])
    const hp = [FOOT[0] + r[0] + wave[0], FOOT[1] + r[1] + wave[1] + Math.sin(t * 1.4) * 0.05, FOOT[2] + r[2] + wave[2]]
    b.node('head', { position: toLot(hp), rotation: euler(qmul(HALF, hq)), scale: [1.2, 1.2, 1.2] })
    const flick = Math.max(0, Math.sin(t * 2.2)) ** 6
    b.node('tongue', { position: TONGUE_P, rotation: [Math.sin(t * 30) * 0.12 * flick, 0, 0], scale: [1, 1, 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(t * 0.6))] })
    PUPILS.forEach((p, i) => {
      const sx = i ? 1 : -1
      b.node(i ? 'pupilR' : 'pupilL', { position: [p[0] + Math.sin(t * 2.3 + sx) * 0.035, p[1] + Math.cos(t * 1.9 + sx * 2) * 0.03, p[2]] })
    })
    // one die spins on its edge round the upright, the other turns slowly in the air
    b.node('dieA', { position: DIE_A_P, rotation: euler(qmul(HALF, qmul(qaxis([0, 1, 0], t * 1.1), DIE_A_Q))) })
    b.node('dieB', { position: [DIE_B_P[0], DIE_B_P[1] + Math.sin(t * 1.3) * 0.08, DIE_B_P[2]], rotation: euler(qmul(HALF, qeuler(DIE_B_E[0] + t * 0.35, DIE_B_E[1] + t * 0.22, DIE_B_E[2] + t * 0.15))) })
    const s = 1 + Math.sin(t * 2.4) * 0.025
    b.node('friend', { position: FRIEND_P, rotation: euler(FRIEND_Q), scale: [1 / Math.sqrt(s), s, 1 / Math.sqrt(s)] })
  })
}
