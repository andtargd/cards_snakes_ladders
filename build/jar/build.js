// Mind the Jar: the brain floats and turns slowly in the water, its two eyes look around together.
// The bubbles, the nerves, the waves and the light shafts run in the shaders on the same clock.
const BASE = [0.1,9.7,0.1]
const EYES = [[-1.69,-2.67,3.05],[2.28,-2.86,2.8]]
const OUT = [0,0.14]

export default function build(b) {
  b.loop((dt, t) => {
    b.node('head', {
      position: [BASE[0] + Math.sin(t * 0.21) * 0.25, BASE[1] + Math.sin(t * 0.37) * 0.35, BASE[2] + Math.cos(t * 0.17) * 0.22],
      rotation: [Math.sin(t * 0.23) * 0.08 - 0.04, 0.55 + Math.sin(t * 0.11) * 0.4, Math.sin(t * 0.29 + 1) * 0.06],
    })
    const gy = Math.sin(t * 0.31) * 0.28 + Math.sin(t * 0.83) * 0.06, gx = Math.sin(t * 0.23 + 0.7) * 0.14
    b.node('eyeL', { position: EYES[0], rotation: [gx, gy + OUT[0], 0] })
    b.node('eyeR', { position: EYES[1], rotation: [gx, gy + OUT[1], 0] })
  })
}
