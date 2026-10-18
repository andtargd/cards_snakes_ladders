// Harness entry that shows the paper board for a seed (geometry check).
import * as THREE from 'three'
import * as R from '../experience/rules.js'
import * as P from '../experience/paper.js'
import * as G from '../experience/board3d.js'

export default function start(p0) {
  const q = new URLSearchParams(location.search)
  const seed = +(q.get('seed') || 7)
  const fibre = P.texture(P.fibreCanvas(512), { repeat: true })
  const paper = new THREE.MeshStandardMaterial({ vertexColors: true, map: fibre, roughness: 0.92 })
  const numbers = new THREE.MeshStandardMaterial({ vertexColors: true, map: P.texture(P.atlasCanvas(1024)), roughness: 0.9 })
  p0.scene.background = new THREE.Color('#f4efe6')
  const sun = new THREE.DirectionalLight(0xffffff, 1.6); sun.position.set(-4, 12, -6); p0.scene.add(sun)
  p0.scene.add(new THREE.Mesh(G.buildTiers({ lot: p0.lot }), paper))
  p0.scene.add(new THREE.Mesh(G.buildTiles(), numbers))
  const els = R.generateBoard(seed)
  const ups = G.stackElements(els), cols = G.snakeColors(els)
  els.forEach((e, i) => p0.scene.add(new THREE.Mesh(G.elementGeometry(e, i, { up: ups[i], color: cols[i] }), paper)))
  const free = (() => { const s = { n: 100, base: els, mods: [], quake: null, mk: [] }; return R.freeCells(s) })()
  p0.scene.add(new THREE.Mesh(G.markerGeometry('sw', free[10]), paper))
  p0.scene.add(new THREE.Mesh(G.markerGeometry('tr', free[30]), paper))
  p0.scene.add(new THREE.Mesh(G.markerGeometry('po', free[50], 0), paper))
  const pawn = new THREE.Mesh(G.pawnGeometry(), new THREE.MeshStandardMaterial({ color: '#e53935', roughness: 0.35 }))
  pawn.position.copy(G.cellPos(1)); p0.scene.add(pawn)
  const die = new THREE.Mesh(G.dieGeometry(0.5), new THREE.MeshStandardMaterial({ map: P.texture(P.diceCanvas(128)), roughness: 0.4 }))
  die.position.set(G.B.dice.x, G.B.base + 0.3, G.B.dice.z); die.quaternion.copy(P.dieQuaternion(6, 0.3)); p0.scene.add(die)
  p0.controls.mode = 'none'
  const view = q.get('view') || 'top'
  const cam = { top: [[0, 11.5, 9.2], [0, 1.5, -0.6]], side: [[-14, 6, 6], [0, 1.5, 0]], front: [[0, 4, 16], [0, 2, 0]], back: [[3, 8, -18], [0, 2, 0]] }[view]
  p0.camera.fov = 60; p0.camera.updateProjectionMatrix()
  p0.camera.position.set(...cam[0]); p0.camera.lookAt(...cam[1])
  // look=<cell>: close up on one cell, from the front (a snake's head, say)
  if (q.get('look')) {
    const c = G.cellPos(+q.get('look'))
    p0.camera.position.set(c.x, c.y + 1.1, c.z + 1.3); p0.camera.lookAt(c)
  }
  p0.log('els', JSON.stringify(els))
}
