// The 3D table: the paper board, the snakes and ladders as they work now, card markers, the players'
// pieces with their name tags, a little dice tray, the camera, and the animations of the rules' events.
import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import * as P from './paper.js'
import * as G from './board3d.js'
import { effectiveElements, FX, CFG, CARD } from './rules.js'

const SLOTS = [[0, 0], [-0.24, -0.2], [0.24, -0.2], [-0.24, 0.22], [0.24, 0.22], [0, -0.38]]
const ease = t => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2)
const easeOut = t => 1 - Math.pow(1 - t, 3)
/** What the tray says under a roll: the sum of two dice, a total cut by Slow Down, a move backwards. */
const rollLabel = (raw, total, sum, slowed, back) => {
  const t = slowed ? `${raw} → ${total}` : sum ? `= ${total}` : ''
  return back ? `${t ? t + ' ' : ''}← back` : t
}
/** Where die i of n rests in the tray: one in the middle, two side by side, three in a shallow arc. */
const trayRest = (i, n) => new THREE.Vector3(
  n === 1 ? 0 : n === 2 ? (i ? 0.5 : -0.5) : (i - 1) * 0.72, 0.23, n === 3 ? (i === 1 ? 0.18 : -0.08) : i ? 0.15 : -0.1)
/** Where die i of n rests on the board's pad. */
const padX = (i, n) => (n === 3 ? -0.8 : -0.4) + i * 0.8
const TILT = 22 * Math.PI / 180
const HOLD = 1.0 // seconds the camera rests on a piece where its move ended
// a roll of the dice: they tumble, and this far into it come to rest showing the number, all at once; they lie
// still after. Their sounds go on a timeline (main.js rollSound); where they can't, the one of landing plays as
// they land, LAND_LEAD s early (a sound played so takes about that long to start)
const ROLL_DUR = 1.05, ROLL_LAND = 0.88, LAND_LEAD = 0.02
const RING_ORDER = 50 // the rings under the pieces go after the other opaque things, the pieces after the rings
// events that move a piece: who moved
const MOVER = { move: e => e.p, ladder: e => e.p, snake: e => e.p, tramp: e => e.p, jump: e => e.p, portal: e => e.p, swap: e => e.a, rewind: e => e.p }

/** A stretch of a Rewind's way back: points with their lengths along them, so the piece moves at an even pace. */
function seg(pts, dur, opts = {}) {
  const len = [0]
  for (let i = 1; i < pts.length; i++) len.push(len[i - 1] + pts[i].distanceTo(pts[i - 1]))
  return { pts, len, dur, ...opts }
}
/** The point a share u (0 to 1) of the way along a stretch, into out. */
function alongPath(sg, u, out) {
  const { pts, len } = sg, d = u * len[len.length - 1]
  if (pts.length < 2 || !len[len.length - 1]) return out.copy(pts[pts.length - 1])
  let i = 1
  while (i < pts.length - 1 && len[i] < d) i++
  const f = (d - len[i - 1]) / Math.max(1e-6, len[i] - len[i - 1])
  return out.lerpVectors(pts[i - 1], pts[i], Math.min(1, Math.max(0, f)))
}
export class View {
  constructor(p0) {
    this.p0 = p0
    this.root = new THREE.Group()
    p0.scene.add(this.root)
    this.speed = 1
    this.tasks = []
    this.listeners = {}
    this.tokens = []
    this.elMeshes = []
    this.mkMeshes = []
    this.badges = []
    this.state = null
    this.focus = new THREE.Vector3(0, 1.5, 0.4)
    this.focusWant = this.focus.clone()
    this.dist = 11
    this.distWant = 11
    this.manual = 0
    this.shake = 0
    // the menus push the board aside: its picture moves right by `side` of the screen's width, `scale` shrinks it
    this.aside = { side: 0, scale: 1, sideNow: 0, scaleNow: 1 }
    // the hand and the panels stand over the board: the picture moves by `dodge` px so the point the camera
    // follows (aim) stays clear of them; cover() gives their screen rectangles (set by the app)
    this.cover = null
    this.aim = null
    this.dodge = new THREE.Vector2()
    this.dodgeWant = new THREE.Vector2()
    // on a wide screen my hand takes much of its height: the picture rises by `lift` px so the tier under the aim
    // shows above the hand; floor() gives the hand's top (set by the app)
    this.floor = null
    this.lift = 0
    this.liftWant = 0
    this.highlight = null
    this.time = 0
    this.buildStatic()
  }
  on(name, fn) { this.listeners[name] = fn }
  emit(name, ...a) { this.listeners[name]?.(...a) }

  buildStatic() {
    const p0 = this.p0
    p0.scene.background = new THREE.Color('#f3eee5')
    const sun = new THREE.DirectionalLight(0xffffff, 1.5)
    sun.position.set(-4, 14, -5)
    p0.scene.add(sun)
    this.fibre = P.texture(P.fibreCanvas(512), { repeat: true })
    this.mat = {
      paper: new THREE.MeshStandardMaterial({ vertexColors: true, map: this.fibre, roughness: 0.92 }),
      numbers: new THREE.MeshStandardMaterial({ vertexColors: true, map: null, roughness: 0.9 }),
      hot: new THREE.MeshStandardMaterial({ vertexColors: true, map: this.fibre, roughness: 0.8, emissive: new THREE.Color('#ffcc33'), emissiveIntensity: 0.35 }),
      dim: new THREE.MeshStandardMaterial({ vertexColors: true, map: this.fibre, roughness: 0.92, transparent: true, opacity: 0.35 }),
      frame: new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.9, depthWrite: false }),
      dice: new THREE.MeshStandardMaterial({ map: P.texture(P.diceCanvas(128)), roughness: 0.35 }),
      gold: new THREE.MeshStandardMaterial({ map: P.texture(P.diceCanvas(128, { gold: true })), roughness: 0.3, metalness: 0.3 }),
    }
    this.frame = []
    this.buildFrame(CFG.cells)
    // the arrow that points at a player chosen by a card
    // a thick paper arrow pointing down, with a dark green rim, always turned to the camera
    const arrowShape = (k) => {
      const sh = new THREE.Shape()
      const hw = 0.22 * k, sw = 0.09 * k, hh = 0.26 * k, top = 0.62 * k
      sh.moveTo(0, -0.02 * (k - 1)); sh.lineTo(hw, hh); sh.lineTo(sw, hh); sh.lineTo(sw, top); sh.lineTo(-sw, top); sh.lineTo(-sw, hh); sh.lineTo(-hw, hh); sh.closePath()
      return sh
    }
    const arrowRim = new THREE.ExtrudeGeometry(arrowShape(1.22), { depth: 0.05, bevelEnabled: true, bevelThickness: 0.015, bevelSize: 0.015, bevelSegments: 2 })
    arrowRim.translate(0, -0.05, -0.035)
    const face = new THREE.ExtrudeGeometry(arrowShape(1), { depth: 0.06, bevelEnabled: true, bevelThickness: 0.02, bevelSize: 0.012, bevelSegments: 2 })
    this.pointer = new THREE.Group()
    this.pointerArrow = new THREE.Group()
    this.pointerArrow.add(
      new THREE.Mesh(arrowRim, new THREE.MeshStandardMaterial({ color: '#1b5e20', roughness: 0.6 })),
      new THREE.Mesh(face, new THREE.MeshStandardMaterial({ color: '#43c759', roughness: 0.45, emissive: new THREE.Color('#2e9e44'), emissiveIntensity: 0.3 })),
    )
    for (const m of this.pointerArrow.children) m.renderOrder = RING_ORDER + 1
    this.pointer.add(this.pointerArrow)
    this.pointer.visible = false
    this.pointerFor = null
    this.pointerUntil = 0
    this.root.add(this.pointer)
    this.elGroup = new THREE.Group(); this.root.add(this.elGroup)
    this.mkGroup = new THREE.Group(); this.root.add(this.mkGroup)
    this.tokGroup = new THREE.Group(); this.root.add(this.tokGroup)
    // cell frames for choosing a target cell
    this.frames = new THREE.InstancedMesh(G.cellFrameGeometry(), this.mat.frame, 100)
    this.frames.count = 0
    this.frames.frustumCulled = false
    this.frames.renderOrder = 2
    this.root.add(this.frames)
    this.pickCell = new THREE.Mesh(new THREE.PlaneGeometry(10.4, 12.6).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ visible: false }))
    // the dice resting on the pad (they show the last roll)
    this.dieGeo = G.dieGeometry(0.46)
    this.padDice = [0, 1, 2].map(i => {
      const m = new THREE.Mesh(this.dieGeo, this.mat.dice)
      m.position.set(G.B.dice.x + padX(i, 2), G.B.base + 0.045 + 0.23, G.B.dice.z)
      m.quaternion.copy(P.dieQuaternion(i ? 4 : 6, 0.4 + i))
      m.visible = i === 0
      this.root.add(m)
      return m
    })
    // confetti
    const cg = new THREE.PlaneGeometry(0.07, 0.11)
    this.confetti = new THREE.InstancedMesh(cg, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }), 220)
    this.confetti.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
    this.confetti.frustumCulled = false
    this.bits = []
    for (let i = 0; i < 220; i++) this.confetti.setColorAt(i, new THREE.Color(P.TIER_COLORS[i % 10]))
    this.confetti.count = 0
    this.root.add(this.confetti)
    this.popups = []
    // the dice tray: its own little scene, drawn in a corner of the screen: the dice on white paper, nothing else
    this.tray = new THREE.Scene()
    this.tray.background = new THREE.Color('#fbf9f4')
    this.tray.add(new THREE.HemisphereLight(0xffffff, 0x9a9a96, 2.2))
    const tl = new THREE.DirectionalLight(0xffffff, 1.2); tl.position.set(-2, 6, 3); this.tray.add(tl)
    const pad = new THREE.Mesh(new THREE.BoxGeometry(9, 0.1, 7), new THREE.MeshStandardMaterial({ color: '#ffffff', map: this.fibre, roughness: 0.95 }))
    pad.position.y = -0.05
    this.tray.add(pad)
    this.trayDice = [0, 1, 2].map(() => { const m = new THREE.Mesh(this.dieGeo, this.mat.dice); m.visible = false; this.tray.add(m); return m })
    this.trayCam = new THREE.PerspectiveCamera(35, 1.4, 0.1, 50)
    this.trayAim = new THREE.Vector3(0, 0.2, -0.05)
    this.trayAway = new THREE.Vector3(0, 2.155, 1.31).sub(this.trayAim) // 15% closer than (0, 2.5, 1.55), so the dice fill more of it
    this.trayZoom = 1 // the camera's distance against that one: a phone's small tray frames the dice closer
    this.trayFit = null // { aspect } of a tray that frames them so (renderTray sets it)
    this.trayCam.position.copy(this.trayAim).add(this.trayAway)
    this.trayCam.lookAt(this.trayAim)
    this.trayVisible = 0
    this.trayLabel = ''
    this.trayPrompt = 0 // dice waiting in the tray for my click (the screen layer sets it every frame)
    this.trayPick = null // while I pick one of the dice: the one under the pointer (0, 1, 2) or -1 (the screen layer sets it)
    this.trayRolling = false
  }

  /** The paper tiers, the numbered cells and the arrows between tiers for a board of n cells. */
  buildFrame(n) {
    if (this.size === n) return
    this.size = n
    G.setBoardSize(n)
    for (const m of this.frame) { m.geometry.dispose(); this.root.remove(m) }
    this.mat.numbers.map?.dispose()
    this.mat.numbers.map = P.texture(P.atlasCanvas(1024, n))
    this.mat.numbers.needsUpdate = true
    this.frame = [
      new THREE.Mesh(G.buildTiers({ lot: this.p0.lot }), this.mat.paper),
      new THREE.Mesh(G.buildTiles(), this.mat.numbers),
      new THREE.Mesh(G.tierArrowsGeometry(), this.mat.paper),
      new THREE.Mesh(G.cellArrowsGeometry(), this.mat.paper),
    ]
    for (const m of this.frame) this.root.add(m)
    this.boardKey = null
  }

  // ---------- state ----------
  /** Shows a state at once (no animation): the board, the markers, every piece where it stands. */
  setState(s, { players = null } = {}) {
    const prev = this.state
    this.state = s
    this.buildFrame(s.n || CFG.cells)
    const boardKey = JSON.stringify([effectiveElements(s), s.mk.map(m => [m.k, m.c]), s.mods.map(m => m.i)])
    this.baseEls = s.base
    if (boardKey !== this.boardKey) { this.buildBoard(effectiveElements(s), s.mk, s.mods.map(m => m.i)); this.boardKey = boardKey }
    this.updateBadges(s)
    if (!prev || prev.pl.length !== s.pl.length || prev.seed !== s.seed || prev.gid !== s.gid || this.tokens.length !== s.pl.length) this.buildTokens(s, players)
    for (let i = 0; i < s.pl.length; i++) {
      const t = this.tokens[i]
      t.pos = s.pl[i].pos
      t.group.visible = !(s.mode === 'fool' && s.pl[i].d)
      t.group.scale.setScalar(1)
    }
    this.layoutTokens(true)
    this.turnOf = s.cur
    this.refreshLabels()
  }

  buildBoard(els, mk, mods) {
    for (const m of this.elMeshes) { m.geometry.dispose(); this.elGroup.remove(m) }
    for (const m of this.mkMeshes) { m.geometry.dispose(); this.mkGroup.remove(m) }
    // each snake keeps the colour it has on the base board, whatever cards flip or quakes shift
    const base = this.baseEls?.length === els.length ? this.baseEls : els
    const ups = G.stackElements(els), cols = G.snakeColors(els, G.snakeColors(base))
    this.elMeshes = els.map((e, i) => {
      const m = new THREE.Mesh(G.elementGeometry(e, i, { up: ups[i], color: cols[i] }), this.mat.paper)
      m.userData = { el: i, path: G.elementPath(e, i, ups[i]), flipped: mods.includes(i) }
      this.elGroup.add(m)
      return m
    })
    let portal = 0
    this.mkMeshes = []
    for (const m of mk) {
      for (const c of m.c) {
        const mesh = new THREE.Mesh(G.markerGeometry(m.k, c, portal), this.mat.paper)
        mesh.userData = { mk: m.k, cell: c }
        this.mkGroup.add(mesh)
        this.mkMeshes.push(mesh)
      }
      if (m.k === 'po') portal++
    }
    this.applyHighlight()
  }

  /** Little number badges: turns left on flipped elements and markers. */
  updateBadges(s) {
    for (const b of this.badges) { this.root.remove(b); b.material.map.dispose(); b.material.dispose() }
    this.badges = []
    const add = (pos, n, color) => {
      const { c, g } = P.canvas(64, 64)
      g.fillStyle = color; g.beginPath(); g.arc(32, 32, 28, 0, Math.PI * 2); g.fill()
      g.strokeStyle = '#ffffff'; g.lineWidth = 5; g.stroke()
      g.fillStyle = '#ffffff'; g.font = `bold 34px ${P.FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle'
      g.fillText(String(n), 32, 34)
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: P.texture(c), depthTest: false }))
      sp.scale.set(0.34, 0.34, 1)
      sp.position.copy(pos)
      sp.renderOrder = 5
      this.root.add(sp)
      this.badges.push(sp)
    }
    const els = effectiveElements(s)
    for (const m of s.mods) add(G.cellPos(els[m.i][1]).add(new THREE.Vector3(0.38, 0.35, 0)), m.t, '#e65100')
    for (const m of s.mk) for (const c of m.c) add(G.cellPos(c).add(new THREE.Vector3(0.36, 0.3, -0.3)), m.t, m.k === 'sw' ? '#5d7d22' : m.k === 'tr' ? '#1e6fb3' : '#7b1fa2')
  }

  buildTokens(s, players) {
    for (const t of this.tokens) this.tokGroup.remove(t.group)
    const geo = this.pawnGeo ||= G.pawnGeometry()
    this.tokens = s.pl.map((p, i) => {
      const group = new THREE.Group()
      const color = P.PLAYER_COLORS[p.c % 6]
      const pivot = new THREE.Group()
      group.add(pivot)
      const body = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color, roughness: 0.35 }))
      body.renderOrder = RING_ORDER + 1
      pivot.add(body)
      // the ring under a piece: blended, but drawn with the opaque things after all of them, so that lit for a
      // choice it shows through the cut-outs in front (no depth test) while its own piece, drawn after it, covers it
      const ring = new THREE.Mesh(new THREE.RingGeometry(0.24, 0.31, 28).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({
        color: '#ffffff', opacity: 0.0, depthWrite: false,
        blending: THREE.CustomBlending, blendSrc: THREE.SrcAlphaFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
      }))
      ring.renderOrder = RING_ORDER
      ring.position.y = 0.012
      group.add(ring)
      const shadow = new THREE.Mesh(new THREE.CircleGeometry(0.2, 20).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#000000', transparent: true, opacity: 0.18, depthWrite: false }))
      shadow.position.y = 0.006
      group.add(shadow)
      const hit = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.75, 8), new THREE.MeshBasicMaterial({ visible: false }))
      hit.position.y = 0.37
      hit.userData.player = i
      group.add(hit)
      const label = new THREE.Sprite(new THREE.SpriteMaterial({ depthTest: false, transparent: true }))
      label.renderOrder = 6
      label.position.y = 0.95
      group.add(label)
      this.tokGroup.add(group)
      const tok = { group, pivot, body, ring, shadow, hit, label, pos: p.pos, at: new THREE.Vector3(), anim: null, color, avatarId: null, yaw: 0, prev: new THREE.Vector3(), moving: 0 }
      const sessionPlayer = players && p.id != null ? players.get(p.id) : null
      if (sessionPlayer?.avatar) this.loadAvatar(tok, sessionPlayer.id)
      return tok
    })
  }

  async loadAvatar(tok, id) {
    try {
      const bytes = await this.p0.avatars.load(id)
      if (!bytes) return
      const gltf = await new GLTFLoader().parseAsync(bytes, '')
      const model = gltf.scene
      const box = new THREE.Box3().setFromObject(model)
      const h = box.max.y - box.min.y || 1
      const k = 0.62 / h
      model.scale.setScalar(k)
      model.position.y = -box.min.y * k
      model.traverse(o => { if (o.isMesh) { o.frustumCulled = false; o.renderOrder = RING_ORDER + 1 } })
      const mixer = new THREE.AnimationMixer(model)
      const idleClip = THREE.AnimationClip.findByName(gltf.animations, 'idle')
      const flyClip = THREE.AnimationClip.findByName(gltf.animations, 'fly')
      const idle = idleClip ? mixer.clipAction(idleClip) : null
      const fly = flyClip ? mixer.clipAction(flyClip) : null
      idle?.play()
      await this.p0.renderer.compileAsync(model, this.p0.camera)
      tok.body.visible = false
      tok.pivot.add(model)
      tok.avatar = { model, mixer, idle, fly, flying: false }
      tok.avatarId = id
    } catch (e) { this.p0.log('avatar failed', String(e)) }
  }

  /** Where each piece stands: the slots of its cell, so several on one cell do not overlap. */
  slotPositions() {
    const groups = new Map()
    this.tokens.forEach((t, i) => {
      if (!t.group.visible || t.anim) return
      const k = t.pos
      if (!groups.has(k)) groups.set(k, [])
      groups.get(k).push(i)
    })
    const out = new Map()
    for (const [cell, list] of groups) {
      list.forEach((i, k) => {
        const p = G.cellPos(cell)
        const [sx, sz] = list.length === 1 ? [0, 0] : SLOTS[k % 6]
        out.set(i, p.add(new THREE.Vector3(sx, 0, sz)))
      })
    }
    return out
  }
  layoutTokens(snap = false) {
    const pos = this.slotPositions()
    for (const [i, p] of pos) {
      const t = this.tokens[i]
      t.home = p
      if (snap) { t.at.copy(p); t.group.position.copy(p) }
    }
  }

  /**
   * The name tags over the pieces. The tag of the player whose turn it is (from the turn's start, before the
   * table is still again) is filled with their colour, a little arrow under it, and drawn over the others.
   */
  refreshLabels() {
    const s = this.state
    if (!s) return
    const cur = s.ph === 'over' ? -1 : this.turnOf ?? s.cur
    s.pl.forEach((p, i) => {
      const t = this.tokens[i]
      if (!t) return
      const fx = Object.keys(p.fx).filter(k => FX[k])
      const on = cur === i
      const key = JSON.stringify([p.n, fx.map(k => [k, p.fx[k].t ?? 0]), on])
      if (key === t.labelKey) return
      t.labelKey = key
      t.labelOn = on
      const W = 320, H = 128
      const { c, g } = P.canvas(W, H)
      g.font = `bold 34px ${P.FONT}`
      const w = Math.min(W - 8, g.measureText(p.n).width + 40)
      g.fillStyle = on ? t.color : 'rgba(255,255,255,0.88)'
      P.roundRect(g, (W - w) / 2, 4, w, 50, 25); g.fill()
      g.strokeStyle = on ? '#ffffff' : t.color; g.lineWidth = on ? 5 : 4; g.stroke()
      if (on && !fx.length) {
        // the arrow down to the piece: it starts inside the tag, over its white rim, so the two are one colour
        g.fillStyle = t.color; g.beginPath(); g.moveTo(W / 2 - 21, 46); g.lineTo(W / 2 + 21, 46); g.lineTo(W / 2, 72); g.closePath(); g.fill()
      }
      g.fillStyle = on ? P.inkOn(t.color) : P.INK; g.textAlign = 'center'; g.textBaseline = 'middle'
      g.fillText(p.n, W / 2, 31, W - 30)
      const n = fx.length
      fx.forEach((k, j) => {
        const x = W / 2 + (j - (n - 1) / 2) * 50, y = 92
        g.fillStyle = '#ffffff'; g.beginPath(); g.arc(x, y, 22, 0, Math.PI * 2); g.fill()
        g.strokeStyle = P.CAT_COLORS[FX[k].card[0]]; g.lineWidth = 4; g.stroke()
        P.drawIcon(g, FX[k].card, x, y, 30, P.CAT_COLORS[FX[k].card[0]])
        if (p.fx[k].t) { g.fillStyle = '#333'; g.beginPath(); g.arc(x + 16, y - 15, 11, 0, Math.PI * 2); g.fill(); g.fillStyle = '#fff'; g.font = `bold 16px ${P.FONT}`; g.fillText(String(p.fx[k].t), x + 16, y - 14) }
      })
      t.label.material.map?.dispose()
      t.label.material.map = P.texture(c)
      t.label.material.needsUpdate = true
      t.label.renderOrder = on ? 7 : 6
      t.label.position.y = n ? 0.92 : 0.98
    })
  }

  // ---------- events ----------
  get busy() { return this.tasks.length > 0 }
  /** Animates the rules' events, then shows `final` exactly. Where a piece's move ends the camera rests on it a moment. */
  play(events, final, opts = {}) {
    let moved = null
    for (const e of events) {
      if (moved != null && (e.e === 'turn' || e.e === 'finish' || e.e === 'over')) { if (e.e === 'turn') this.holdTask(moved); moved = null }
      this.queueEvent(e, opts)
      if (MOVER[e.e]) moved = MOVER[e.e](e)
    }
    if (moved != null) this.holdTask(moved)
    this.tasks.push({ dur: 0, start: () => { this.setState(final, opts); this.emit('settled') } })
  }
  /** The camera stays on a piece that has just stopped, unless the player looks around themselves. */
  holdTask(p) {
    this.tasks.push({ dur: HOLD, start: () => this.focusOn(p), update: () => { const t = this.tokens[p]; if (t) this.follow(t.home || t.group.position) } })
  }
  wait(dur, update, start, end) { this.tasks.push({ dur, update, start, end }) }

  queueEvent(e, opts) {
    const s = () => this.state
    const tok = i => this.tokens[i]
    switch (e.e) {
      case 'log': this.tasks.push({ dur: 0, start: () => this.emit('log', e.text) }); break
      case 'turn': this.tasks.push({ dur: 0.05, start: () => { this.manual = 0; this.focusOn(e.p); this.turnOf = e.p; this.refreshLabels(); this.emit('turn', e) } }); break
      case 'draw': this.tasks.push({ dur: 0.35, start: () => this.emit('draw', e) }); break
      case 'discard': this.tasks.push({ dur: 0.5, start: () => this.emit('discard', e) }); break
      case 'mustdisc': this.tasks.push({ dur: 0, start: () => this.emit('mustdisc', e) }); break
      case 'play': {
        // Echo shows the card it plays again (its card turns over) before that card's target lights up
        const id = e.echo || e.card, tg = e.echo ? e.etg : e.tg
        const aim = () => { if (typeof tg === 'number' && ['any', 'other', 'leader'].includes(CARD[id].tgt)) { this.focusOn(tg); this.pointAt(tg, 1.6); this.sfx('target') } }
        if (!e.echo) { this.tasks.push({ dur: 1.25, start: () => { this.emit('play', e); aim() } }); break }
        this.tasks.push({ dur: 1.0, start: () => this.emit('play', e) })
        this.tasks.push({ dur: 1.0, start: aim })
        break
      }
      case 'roll': this.queueRoll(e); if (e.back) this.cardPopup(e.p, 'H4', 'skip'); break
      case 'pick': this.queuePick(e); if (e.back) this.cardPopup(e.p, 'H4', 'skip'); break
      case 'offer': this.tasks.push({ dur: 0.35, start: () => this.emit('offer', e) }); break
      case 'move': {
        let from = null
        this.tasks.push({ dur: 0, start: () => { from = tok(e.p).pos; this.focusOn(e.p) } })
        e.path.forEach((c, k) => {
          let a, b
          this.tasks.push({
            dur: 0.24,
            start: () => {
              const t = tok(e.p); t.anim = true; a = t.group.position.clone(); b = G.cellPos(c); this.sfx('hop')
              if (e.boots?.includes(c)) this.cardPopupNow(b, 'P2', 'boots')
            },
            update: k2 => { const t = tok(e.p); const up = b.y > a.y + 0.1 ? 0.55 : 0.32; t.group.position.lerpVectors(a, b, ease(k2)); t.group.position.y += Math.sin(k2 * Math.PI) * up; this.follow(t.group.position) },
            end: () => { const t = tok(e.p); t.pos = c },
          })
        })
        this.tasks.push({ dur: 0, start: () => { tok(e.p).anim = null; this.layoutTokens() } })
        break
      }
      case 'swamp': this.tasks.push({ dur: 0, start: () => this.emit('swamp', e) }); this.cardPopup(e.p, 'B1', 'swamp'); break
      case 'shield': this.cardPopup(e.p, 'P3', 'shield'); break
      case 'grail': // the camera goes to the piece, its effects burst off it
        this.tasks.push({ dur: 0.35, start: () => this.focusOn(e.p), end: () => this.burst(tok(e.p).group.position, 40) })
        this.cardPopup(e.p, 'P4', 'shield')
        break
      case 'skip': this.cardPopup(e.p, 'H3', 'skip'); break
      case 'frozen': this.cardPopup(e.p, 'H2', 'skip'); break
      case 'ladder': case 'snake': {
        let path = null
        this.tasks.push({
          dur: e.e === 'ladder' ? 1.0 : 1.3,
          start: () => {
            const t = tok(e.p); t.anim = true
            path = this.elMeshes[e.el]?.userData.path || [G.cellPos(e.from), G.cellPos(e.to)]
            if (e.e === 'snake' && e.to !== e.tail) { // parachute: only part of the way
              const f = (e.from - e.to) / Math.max(1, e.from - e.tail)
              path = path.slice(0, Math.max(2, Math.round(path.length * f)))
              path.push(G.cellPos(e.to))
            }
            if (e.para) this.cardPopupNow(t.group.position, 'P1')
            this.sfx(e.e)
            this.emit(e.e, e)
          },
          update: k => {
            const t = tok(e.p)
            const f = (e.e === 'ladder' ? ease(k) : k * k * (3 - 2 * k)) * (path.length - 1)
            const i = Math.min(path.length - 2, Math.floor(f))
            t.group.position.lerpVectors(path[i], path[i + 1], f - i)
            this.follow(t.group.position)
          },
          end: () => { const t = tok(e.p); t.pos = e.to; t.anim = null; this.layoutTokens() },
        })
        break
      }
      case 'tramp': case 'jump':
        if (e.why === 'leap') { this.arcTask(e.p, e.from, e.to, null, 'jump'); this.cardPopup(e.p, 'M5', 'leap'); break }
        this.arcTask(e.p, e.from, e.to, e.e === 'tramp' ? 1.2 : 0.7, e.e === 'tramp' ? 'tramp' : 'jump'); break
      case 'rewind': this.cardPopup(e.p, 'M6', 'rewound'); this.rewindTask(e); break
      case 'portal': this.teleportTask([[e.p, e.to]]); break
      case 'swap': this.teleportTask([[e.a, null, e.b], [e.b, null, e.a]]); break
      case 'finish': this.tasks.push({
        dur: 1.4,
        start: () => { const t = tok(e.p); t.pos = G.B.cells; this.burst(G.cellPos(G.B.cells), 120); this.sfx('win'); this.focusOn(e.p) },
        update: k => { const t = tok(e.p); t.group.rotation.y = k * Math.PI * 4; t.group.position.y = G.cellPos(G.B.cells).y + Math.abs(Math.sin(k * Math.PI * 3)) * 0.5 * (1 - k) },
        end: () => { const t = tok(e.p); t.group.rotation.y = 0; if (s().mode === 'fool') t.group.visible = false; this.layoutTokens() },
      }); break
      case 'board': this.boardTask(e); break
      case 'redraw': case 'steal': case 'swaphands': case 'peek': this.tasks.push({ dur: 0.45, start: () => this.emit(e.e, e) }); break
      case 'over': this.tasks.push({ dur: 0.6, start: () => this.emit('over', e) }); break
    }
  }

  /** The word a card's effect pops up over a piece (cards.config.js), in the card's category colour unless it gives one. */
  cardPopup(p, cardId, sound) {
    const c = CARD[cardId], pop = c.popup || {}
    this.popupTask(p, String(pop.text ?? c.name), pop.color || P.CAT_COLORS[c.cat], sound)
  }
  /** The same word, now and over a given point, not in its own turn of the queue (it pops up as a piece moves on). */
  cardPopupNow(pos, cardId, sound) {
    const c = CARD[cardId], pop = c.popup || {}
    this.popup(pos, String(pop.text ?? c.name), pop.color || P.CAT_COLORS[c.cat])
    if (sound) this.sfx(sound)
  }
  popupTask(p, text, color, sound) {
    this.tasks.push({ dur: 0.7, start: () => { this.popup(this.tokens[p].group.position, text, color); if (sound) this.sfx(sound) } })
  }
  /** A piece flies in an arc; with no height given (a long leap) the arc rises with the distance. */
  arcTask(p, from, to, h, sound) {
    let a, b
    this.tasks.push({
      dur: h == null ? 0.9 : 0.6,
      start: () => {
        const t = this.tokens[p]; t.anim = true; a = t.group.position.clone(); b = G.cellPos(to)
        if (h == null) h = THREE.MathUtils.clamp(a.distanceTo(b) * 0.3, 0.8, 2.4)
        this.focusOn(p); this.sfx(sound)
      },
      update: k => { const t = this.tokens[p]; t.group.position.lerpVectors(a, b, ease(k)); t.group.position.y += Math.sin(k * Math.PI) * h; this.follow(t.group.position) },
      end: () => { const t = this.tokens[p]; t.pos = to; t.anim = null; this.layoutTokens() },
    })
  }
  /**
   * Rewind: the piece fades to a ghost and retraces its moves since its turn began, backwards (down the
   * ladder it climbed, up the snake it slid, back through a portal) under a clock turning back, then comes
   * back solid where its turn began.
   */
  rewindTask(e) {
    let clock = null, t = null, segs = [], total = 0
    const place = (pos, op) => {
      clock.face.position.copy(pos).add(new THREE.Vector3(0, 1.05, 0)); clock.hand.position.copy(clock.face.position)
      clock.face.material.opacity = op; clock.hand.material.opacity = op
    }
    this.tasks.push({
      dur: 0.35,
      start: () => {
        t = this.tokens[e.p]; t.anim = true
        clock = this.makeClock()
        segs = this.rewindPath(e)
        total = segs.reduce((a, s) => a + s.dur, 0)
        this.focusOn(e.p); this.sfx('rewind')
      },
      update: k => { this.ghostToken(t, 1 - 0.7 * k); place(t.group.position, k); clock.hand.material.rotation = k * Math.PI },
    })
    // the whole way back takes 0.8 to 2.8 s, each move its share
    const dur = () => THREE.MathUtils.clamp(total, 0.8, 2.8)
    let task
    this.tasks.push(task = {
      dur: 2,
      start: () => { task.dur = dur() },
      update: k => {
        let at = k * total, i = 0
        while (i < segs.length - 1 && at > segs[i].dur) { at -= segs[i].dur; i++ }
        const sg = segs[i], u = Math.min(1, at / sg.dur)
        if (sg.blink) { // a portal or a swap: gone here, back there
          t.group.position.copy(u < 0.5 ? sg.pts[0] : sg.pts[1])
          t.pivot.scale.setScalar(Math.max(0.05, Math.abs(1 - 2 * u)))
        } else {
          t.pivot.scale.setScalar(1)
          alongPath(sg, sg.walk ? u : ease(u), t.group.position)
          if (sg.walk) t.group.position.y += 0.1 * Math.abs(Math.sin(u * Math.PI * Math.max(1, sg.pts.length - 1)))
        }
        place(t.group.position, 1)
        clock.hand.material.rotation = Math.PI + k * Math.PI * 6 // anticlockwise: time running back
        this.follow(t.group.position)
      },
    })
    this.tasks.push({
      dur: 0.35,
      start: () => { t.pivot.scale.setScalar(1); t.group.position.copy(G.cellPos(e.to)) },
      update: k => { this.ghostToken(t, 0.3 + 0.7 * k); place(t.group.position, 1 - k) },
      end: () => {
        this.ghostToken(t, 1)
        this.root.remove(clock.face, clock.hand); clock.face.material.dispose(); clock.hand.material.dispose()
        t.pos = e.to; t.anim = null; this.layoutTokens()
      },
    })
  }
  /** The ways back of a Rewind: its trail's moves, last first, each turned round, as points in the world with their share of the time. */
  rewindPath(e) {
    const tr = Array.isArray(e.tr) ? e.tr : []
    // a trail that does not join where the piece is and where it goes back to: straight back along the cells
    const joined = tr.length && tr[0][1] === e.to && tr[tr.length - 1][2] === e.from && tr.every((s, i) => !i || tr[i - 1][2] === s[1])
    const list = joined ? [...tr].reverse() : [['m', e.to, e.from]]
    const els = this.state ? effectiveElements(this.state) : []
    const elPath = (type, from) => {
      const i = els.findIndex(x => x[0] === type && x[1] === from)
      const path = this.elMeshes[i]?.userData.path
      return path && path.length > 1 ? { path: path.map(v => v.clone()), el: els[i] } : null
    }
    return list.map(([k, from, to]) => {
      // forward this went from -> to; the rewind goes to -> from
      if (k === 'm') {
        const n = Math.abs(to - from), dir = Math.sign(from - to) || 1, step = Math.max(1, Math.ceil(n / 40))
        const cells = []
        for (let c = 0; c < n; c += step) cells.push(to + dir * c)
        cells.push(from)
        return seg(cells.map(c => G.cellPos(c)), Math.max(0.25, 0.06 * n), { walk: true })
      }
      if (k === 'l' || k === 's') {
        const f = elPath(k === 'l' ? 1 : 0, from)
        let pts = f ? f.path : [G.cellPos(from), G.cellPos(to)]
        if (f && k === 's' && to !== f.el[2]) { // a parachute stopped it part of the way
          const part = (from - to) / Math.max(1, from - f.el[2])
          pts = pts.slice(0, Math.max(2, Math.round(pts.length * part)))
          pts.push(G.cellPos(to))
        }
        return seg(pts.reverse(), 0.6)
      }
      if (k === 't' || k === 'j') {
        const a = G.cellPos(to), b = G.cellPos(from), h = THREE.MathUtils.clamp(a.distanceTo(b) * 0.3, 0.6, 2.2), pts = []
        for (let i = 0; i <= 16; i++) { const v = new THREE.Vector3().lerpVectors(a, b, i / 16); v.y += Math.sin(i / 16 * Math.PI) * h; pts.push(v) }
        return seg(pts, 0.5)
      }
      return seg([G.cellPos(to), G.cellPos(from)], 0.45, { blink: true })
    })
  }
  /** A clock face and its hand (sprites; the hand turns with its material's rotation). */
  makeClock() {
    if (!this.clockTex) {
      const face = P.canvas(128, 128), hand = P.canvas(128, 128)
      let g = face.g
      g.fillStyle = 'rgba(255,255,255,0.92)'; g.beginPath(); g.arc(64, 64, 56, 0, Math.PI * 2); g.fill()
      g.strokeStyle = '#2b7fd6'; g.lineWidth = 9; g.stroke()
      g.lineWidth = 5; g.lineCap = 'round'
      for (let i = 0; i < 12; i++) { const a = i * Math.PI / 6, r0 = i % 3 ? 42 : 36; g.beginPath(); g.moveTo(64 + Math.cos(a) * r0, 64 + Math.sin(a) * r0); g.lineTo(64 + Math.cos(a) * 48, 64 + Math.sin(a) * 48); g.stroke() }
      g = hand.g
      g.strokeStyle = '#174a8c'; g.lineWidth = 8; g.lineCap = 'round'
      g.beginPath(); g.moveTo(64, 70); g.lineTo(64, 20); g.stroke()
      g.fillStyle = '#174a8c'; g.beginPath(); g.arc(64, 64, 8, 0, Math.PI * 2); g.fill()
      this.clockTex = { face: P.texture(face.c), hand: P.texture(hand.c) }
    }
    const sprite = (map, order) => {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map, depthTest: false, transparent: true, opacity: 0 }))
      sp.scale.set(0.5, 0.5, 1); sp.renderOrder = order
      this.root.add(sp)
      return sp
    }
    return { face: sprite(this.clockTex.face, 8), hand: sprite(this.clockTex.hand, 9) }
  }
  /** A piece seen through (op < 1) or solid again. */
  ghostToken(t, op) {
    t.pivot.traverse(o => {
      if (!o.isMesh) return
      for (const m of [].concat(o.material)) {
        if (m.userData.solid == null) { m.userData.solid = m.transparent; m.userData.op0 = m.opacity }
        const see = op < 0.999
        if (m.transparent !== (see || m.userData.solid)) { m.transparent = see || m.userData.solid; m.needsUpdate = true }
        m.opacity = op * m.userData.op0
      }
    })
  }
  teleportTask(list) {
    // list: [player, toCell] or [player, null, otherPlayer] (swap)
    let targets = []
    this.tasks.push({
      dur: 0.3,
      start: () => {
        targets = list.map(([p, c, o]) => (c != null ? c : this.tokens[o].pos))
        list.forEach(([p]) => { this.tokens[p].anim = true; this.burst(this.tokens[p].group.position, 30) })
        this.sfx('portal')
      },
      update: k => list.forEach(([p]) => this.tokens[p].group.scale.setScalar(1 - k)),
      end: () => list.forEach(([p], i) => { const t = this.tokens[p]; t.pos = targets[i]; t.group.position.copy(G.cellPos(targets[i])); this.burst(t.group.position, 30) }),
    })
    this.tasks.push({
      dur: 0.3,
      update: k => list.forEach(([p]) => this.tokens[p].group.scale.setScalar(easeOut(k))),
      end: () => { list.forEach(([p]) => { this.tokens[p].anim = null; this.tokens[p].group.scale.setScalar(1) }); this.layoutTokens(); this.focusOn(list[0][0]) },
    })
  }
  boardTask(e) {
    // the old cut-outs fold away, the new ones unfold
    const quake = e.why === 'quake'
    let changed = []
    this.tasks.push({
      dur: quake ? 0.9 : 0.35,
      start: () => {
        const key = JSON.stringify([e.els, e.mk.map(m => [m[0], m[1]]), e.mods])
        if (key === this.boardKey) { changed = []; return }
        if (e.why === 'flip') changed = [this.elMeshes[e.flip]]
        else if (quake) changed = [...this.elMeshes]
        else changed = this.mkMeshes.filter(m => !e.mk.some(k => k[0] === m.userData.mk && k[1].includes(m.userData.cell)))
        this.sfx(quake ? 'quake' : 'boardChange')
        if (quake) this.shake = 0.9
      },
      update: k => { for (const m of changed) if (m) m.scale.set(1, Math.max(0.02, 1 - k), 1) },
    })
    this.tasks.push({
      dur: 0.4,
      start: () => {
        const before = new Set([...this.elMeshes, ...this.mkMeshes])
        this.buildBoard(e.els, e.mk.map(([k, c, t]) => ({ k, c, t })), e.mods)
        this.boardKey = JSON.stringify([e.els, e.mk.map(m => [m[0], m[1]]), e.mods])
        changed = e.why === 'flip' ? [this.elMeshes[e.flip]] : quake ? [...this.elMeshes] : this.mkMeshes.filter(m => !this.prevMarkerKeys?.has(m.userData.mk + m.userData.cell))
        this.prevMarkerKeys = new Set(this.mkMeshes.map(m => m.userData.mk + m.userData.cell))
        for (const m of changed) m.scale.set(1, 0.02, 1)
        if (changed.length && !quake && e.why !== 'expire') {
          const c = changed[0].userData.cell ?? (changed[0].userData.path ? null : null)
          if (c) this.follow(G.cellPos(c))
        }
        void before
      },
      update: k => { for (const m of changed) m.scale.set(1, Math.max(0.02, easeOut(k)), 1) },
      end: () => { for (const m of changed) m.scale.set(1, 1, 1) },
    })
  }

  queueRoll(e) {
    // the dice tumble in the tray in the corner, then rest on the board's pad
    const n = e.dice.length
    // a chosen value (Golden Die, Choose a Face) is the first die and is set down, not thrown; an Extra Die
    // beside it is rolled
    const set = i => e.chosen && i === 0, allSet = e.chosen && n === 1
    let starts = [], tossed = false, landed = false
    this.tasks.push({
      dur: allSet ? 0.7 : ROLL_DUR,
      start: () => {
        // dice lying in the tray (it always shows the last roll) are tossed up from where they lie
        tossed = (this.trayPrompt > 0 || this.trayDice[0].visible) && !allSet
        this.trayRolling = true
        this.trayVisible = 3.2
        this.trayLabel = ''
        this.trayGold = e.chosen && e.dice[0] > 3
        starts = e.dice.map((v, i) => {
          const m = this.trayDice[i]
          const end = trayRest(i, n)
          const startPos = set(i) ? end.clone().add(new THREE.Vector3(0, 0.35, 0)) : tossed ? (m.visible ? m.position.clone() : new THREE.Vector3(end.x * 0.6, 0.23, end.z)) : new THREE.Vector3(1.8, 1.2 + i * 0.2, 0.9 - i * 0.6)
          m.visible = true
          m.material = this.trayGold && set(i) ? this.mat.gold : this.mat.dice
          const qEnd = P.dieQuaternion(v, (Math.random() - 0.5) * 0.8)
          // it tumbles head over heels about a level axis and turns over sideways about the one across it, so
          // its faces go round whatever it rolls (about a near-upright axis the face up would stay up the
          // whole time: the same number as the last roll did not seem to roll at all)
          const a = Math.random() * Math.PI * 2
          const axis = new THREE.Vector3(Math.cos(a), 0, Math.sin(a)), across = new THREE.Vector3(-Math.sin(a), 0.35, Math.cos(a)).normalize()
          const spin = set(i) ? Math.PI : 10 + Math.random() * 4, spin2 = set(i) ? 0 : (Math.random() < 0.5 ? -1 : 1) * (5 + Math.random() * 3)
          return { m, end, startPos, qEnd, axis, across, spin, spin2, set: set(i) }
        })
        for (let i = n; i < this.trayDice.length; i++) this.trayDice[i].visible = false
        // the sounds go on a timeline from here: when the dice land is known now
        if (e.chosen) this.sfx('faceChosen')
        if (!allSet) this.emit('rollsound', ROLL_LAND * ROLL_DUR / this.speed)
        this.emit('roll', e)
      },
      update: t => {
        const k = allSet ? t : Math.min(1, t / ROLL_LAND)
        for (const d of starts) {
          if (d.set) {
            d.m.position.lerpVectors(d.startPos, d.end, easeOut(k))
          } else {
            d.m.position.x = d.startPos.x + (d.end.x - d.startPos.x) * easeOut(k)
            d.m.position.z = d.startPos.z + (d.end.z - d.startPos.z) * easeOut(k)
            // tossed up from the tray, or thrown in from its corner
            if (tossed) d.m.position.y = d.startPos.y + (d.end.y - d.startPos.y) * k + Math.abs(Math.sin(k * Math.PI * 2.5)) * Math.pow(1 - k, 1.6) * 0.75
            else d.m.position.y = d.end.y + Math.abs(Math.cos(k * Math.PI * 2.5)) * (1 - k) * (1 - k) * 1.1
          }
          const left = Math.pow(1 - k, 2)
          const q = new THREE.Quaternion().setFromAxisAngle(d.axis, d.spin * left)
          q.multiply(new THREE.Quaternion().setFromAxisAngle(d.across, d.spin2 * left))
          d.m.quaternion.copy(q.multiply(d.qEnd))
        }
        if (allSet || landed) return
        // how long until they land, as the frames go (a slow one puts it off: the sound of it follows)
        this.emit('rollwhen', (ROLL_LAND - t) * ROLL_DUR / this.speed)
        if (t >= ROLL_LAND - LAND_LEAD * this.speed / ROLL_DUR) { landed = true; this.emit('rolland') }
      },
      end: () => {
        const total = e.total
        this.trayLabel = e.pick ? '' : rollLabel(e.dice.reduce((a, b) => a + b, 0), total, e.dice.length > 1, e.slowed, e.back)
        this.padDice.forEach((m, i) => {
          m.visible = i < n
          if (i < n) { m.position.x = G.B.dice.x + padX(i, n); m.quaternion.copy(P.dieQuaternion(e.dice[i], 0.3 + i)) }
        })
        this.trayRolling = false
      },
    })
    this.tasks.push({ dur: 0.25 })
  }

  /** Choose Your Roll: the picked die hops to the middle of the tray, the others sink away. */
  queuePick(e) {
    let a, rest, from
    this.tasks.push({
      dur: 0.55,
      start: () => {
        this.trayVisible = 3.2
        this.trayLabel = ''
        a = this.trayDice[e.i]; rest = this.trayDice.filter(m => m !== a)
        // (another player's bonus roll: the dice may not lie in the tray yet)
        if (!a.visible) { a.visible = true; a.position.copy(trayRest(e.i, e.dice.length)); a.quaternion.copy(P.dieQuaternion(e.dice[e.i], 0)) }
        from = a.position.clone()
        this.sfx('dieChosen')
      },
      update: k => {
        a.position.lerpVectors(from, new THREE.Vector3(0, 0.23, 0), easeOut(k))
        a.position.y += Math.sin(k * Math.PI) * 0.35
        for (const b of rest) b.scale.setScalar(Math.max(0.01, 1 - easeOut(k)))
      },
      end: () => {
        for (const b of rest) { b.visible = false; b.scale.setScalar(1) }
        this.trayLabel = rollLabel(e.dice[e.i], e.total, false, e.slowed, e.back)
        this.padDice.forEach((m, i) => { m.visible = i === 0 })
        this.padDice[0].position.x = G.B.dice.x + padX(0, 2); this.padDice[0].quaternion.copy(P.dieQuaternion(e.dice[e.i], 0.3))
      },
    })
    this.tasks.push({ dur: 0.2 })
  }

  // ---------- effects ----------
  popup(pos, text, color) {
    const { c, g } = P.canvas(256, 80)
    g.font = `bold 44px ${P.FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle'
    g.lineWidth = 8; g.strokeStyle = '#ffffff'; g.strokeText(text, 128, 42, 240)
    g.fillStyle = color; g.fillText(text, 128, 42, 240)
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: P.texture(c), depthTest: false, transparent: true }))
    sp.scale.set(1.2, 0.375, 1)
    sp.renderOrder = 8
    sp.position.copy(pos).add(new THREE.Vector3(0, 1.3, 0))
    this.root.add(sp)
    this.popups.push({ sp, t: 0 })
  }
  burst(pos, n) {
    for (let k = 0; k < n; k++) {
      if (this.bits.length >= 220) this.bits.shift()
      const a = Math.random() * Math.PI * 2, v = 1 + Math.random() * 2.5
      this.bits.push({ p: pos.clone().add(new THREE.Vector3(0, 0.4, 0)), v: new THREE.Vector3(Math.cos(a) * v * 0.6, 2 + Math.random() * 3, Math.sin(a) * v * 0.6), r: new THREE.Euler(Math.random() * 6, Math.random() * 6, 0), life: 1.2 + Math.random() * 0.8 })
    }
  }
  sfx(name) { this.emit('sfx', name) }

  // ---------- camera ----------
  focusOn(i) {
    const t = this.tokens[i]
    if (t) this.follow(t.group.position)
  }
  /** The camera goes after a point, unless the player is moving it about themselves. */
  follow(p) { if (this.manual <= 0) { this.focusWant.copy(p); this.aim = p } }
  /** The whole board in view: its middle, from further away on a big board. */
  overview() {
    const fewer = 10 - G.B.tiers
    const z = 0.2 + fewer * G.B.tierD / 2
    this.focusWant.set(0, Math.max(0.6, 1.5 - fewer * 0.15), z)
    this.distWant = 12.5 - fewer * 0.6
    this.aim = null
    this.dodgeWant.set(0, 0)
  }
  zoom(f) { this.distWant = THREE.MathUtils.clamp(this.distWant * f, 3.5, 13) }
  pan(dx, dy) {
    // drag the board under the pointer
    const k = this.dist * 0.0016
    this.focusWant.x = THREE.MathUtils.clamp(this.focusWant.x - dx * k, -5, 5)
    this.focusWant.z = THREE.MathUtils.clamp(this.focusWant.z - dy * k * 1.2, G.backZ() + 0.1, 7.5)
    this.focusWant.y = G.drapeY(this.focusWant.z) - 0.1
    this.manual = 4
  }

  updateCamera(dt) {
    const cam = this.p0.camera
    const aspect = this.p0.width / Math.max(1, this.p0.height)
    const f = 1 - Math.exp(-3.5 * dt)
    this.focus.lerp(this.focusWant, f)
    this.dist += (this.distWant - this.dist) * (1 - Math.exp(-5 * dt))
    // keep about 9 m of board across on narrow screens
    const want = 2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(27)) * Math.max(1, 1.45 / aspect))
    cam.fov = THREE.MathUtils.clamp(THREE.MathUtils.radToDeg(want), 50, 100)
    cam.aspect = aspect
    const p = new THREE.Vector3(this.focus.x, this.focus.y + Math.cos(TILT) * this.dist, this.focus.z + Math.sin(TILT) * this.dist)
    // inside the lot's box, so the game fills the screen
    const L = this.p0.lot
    p.x = THREE.MathUtils.clamp(p.x, -L.width / 2 + 0.3, L.width / 2 - 0.3)
    p.y = Math.min(p.y, L.height - 0.25)
    p.z = THREE.MathUtils.clamp(p.z, -L.depth / 2 + 0.3, L.depth / 2 - 0.3)
    if (this.shake > 0) { p.x += (Math.random() - 0.5) * this.shake * 0.25; p.z += (Math.random() - 0.5) * this.shake * 0.25; this.shake = Math.max(0, this.shake - dt) }
    cam.position.copy(p)
    cam.lookAt(this.focus.x, this.focus.y, this.focus.z - 0.6)
    cam.near = 0.1; cam.far = 80
    const fr = this.aside, k = 1 - Math.exp(-4 * dt)
    fr.sideNow += (fr.side - fr.sideNow) * k
    fr.scaleNow += (fr.scale - fr.scaleNow) * k
    if (Math.abs(fr.sideNow) < 0.001 && Math.abs(fr.scaleNow - 1) < 0.001) { fr.sideNow = 0; fr.scaleNow = 1 }
    cam.zoom = fr.scaleNow
    this.viewOffset(0, 0)
    cam.updateProjectionMatrix()
    cam.updateMatrixWorld()
    // the picture rises for the tier under the aim, worked out from where things stand without it; then it moves
    // aside for the hand and the panels, worked out from where things stand risen
    if (this.aim && this.manual <= 0) this.liftWant = this.liftFor(this.aim)
    else if (!this.aim) this.liftWant = 0
    this.lift += (this.liftWant - this.lift) * (1 - Math.exp(-8 * dt))
    if (!this.liftWant && this.lift < 0.5) this.lift = 0
    if (this.aim && this.manual <= 0) {
      if (this.liftWant) this.viewOffset(0, -this.liftWant)
      this.dodgeFor(this.aim)
    }
    this.dodge.lerp(this.dodgeWant, 1 - Math.exp(-8 * dt))
    if (!this.dodgeWant.x && !this.dodgeWant.y && this.dodge.lengthSq() < 0.25) this.dodge.set(0, 0)
    this.viewOffset(this.dodge.x, this.dodge.y - this.lift)
    this.p0.me.position.set(THREE.MathUtils.clamp(p.x, -5, 5), Math.min(p.y, L.height - 1), THREE.MathUtils.clamp(p.z, -8.5, 8.5))
  }

  /** The picture moves right by the menus' aside (and a little up, the tray below out of sight), and by dx, dy px. */
  viewOffset(dx, dy) {
    const cam = this.p0.camera, W = this.p0.width, H = this.p0.height, side = this.aside.sideNow
    if (side || dx || dy) cam.setViewOffset(W, H, -side * W - dx, side * 0.22 * H - dy, W, H)
    else if (cam.view) cam.clearViewOffset()
  }
  /**
   * How far the picture rises (px) so the tier under the piece standing at p shows whole above my hand: none
   * when it already does, never so far that the piece goes up among the panels. Steady like dodgeFor: worked
   * out on the picture without it.
   */
  liftFor(p) {
    const floor = this.floor?.()
    if (floor == null) return 0
    const z = Math.min(p.z + G.B.tierD, G.tierZ(0)) + G.B.tileD / 2 // the front edge of its tiles (the bottom tier's own)
    const below = this.screenOf(new THREE.Vector3(p.x, G.drapeY(z), z)), head = this.screenOf(p.clone().add(new THREE.Vector3(0, 0.85, 0)))
    if (!below || !head) return 0
    return THREE.MathUtils.clamp(below.y + 6 - floor, 0, Math.max(0, head.y - this.p0.height * 0.2))
  }
  /**
   * The least shift of the picture that puts the piece standing at p clear of the cover (the hand, the
   * tray, the panels) and inside the screen; none when it already is. Steady: it is worked out on the
   * picture without the shift, so the shift never moves what it is worked out from.
   */
  dodgeFor(p) {
    const cam = this.p0.camera, W = this.p0.width, H = this.p0.height, want = this.dodgeWant
    const rects = this.cover?.() || []
    if (!rects.length) { want.set(0, 0); return }
    const scr = v => { v.project(cam); return { x: (v.x + 1) / 2 * W, y: (1 - v.y) / 2 * H, front: v.z < 1 } }
    const feet = scr(p.clone()), head = scr(p.clone().add(new THREE.Vector3(0, 0.85, 0)))
    if (!feet.front || !head.front) { want.set(0, 0); return }
    const r = THREE.MathUtils.clamp(Math.abs(feet.y - head.y) * 0.45, 12, 60)
    const box = { x0: Math.min(feet.x, head.x) - r, x1: Math.max(feet.x, head.x) + r, y0: head.y - r * 0.4, y1: feet.y + r * 0.5 }
    const M = 10
    const hits = ([dx, dy]) => rects.filter(c => box.x0 + dx < c.x + c.w + M && box.x1 + dx > c.x - M && box.y0 + dy < c.y + c.h + M && box.y1 + dy > c.y - M)
    const fits = ([dx, dy]) => box.x0 + dx >= M && box.x1 + dx <= W - M && box.y0 + dy >= M && box.y1 + dy <= H - M && Math.abs(dx) <= W * 0.4 && Math.abs(dy) <= H * 0.4
    // into the screen first, then out of whatever still covers it, one rectangle and one way at a time
    const inX = box.x0 < M ? M - box.x0 : box.x1 > W - M ? W - M - box.x1 : 0
    const inY = box.y0 < M ? M - box.y0 : box.y1 > H - M ? H - M - box.y1 : 0
    let tries = [[0, 0], [inX, inY]], best = null, cost = Infinity
    for (let depth = 0; depth < 3 && tries.length; depth++) {
      const next = []
      for (const d of tries) {
        const over = hits(d)
        if (!over.length) {
          if (!fits(d)) continue
          const k = Math.hypot(d[0], d[1]) + 0.5 * Math.hypot(d[0] - want.x, d[1] - want.y) // and near the last one, so it doesn't flip
          if (k < cost) { cost = k; best = d }
          continue
        }
        for (const c of over) next.push([d[0], c.y - M - box.y1], [d[0], c.y + c.h + M - box.y0], [c.x - M - box.x1, d[1]], [c.x + c.w + M - box.x0, d[1]])
      }
      tries = next
    }
    if (best) want.set(best[0], best[1])
    else want.set(0, 0) // nowhere clear within reach: the picture as it is
  }

  // ---------- picking and highlights ----------
  /**
   * What is under the pointer: { player, players }, { el } or { cell }. Pieces sharing a cell overlap, so
   * `players` lists every one under the pointer, nearest first, for a choice to skip those it can't take.
   */
  pick(x, y) {
    const ray = new THREE.Raycaster()
    ray.setFromCamera(new THREE.Vector2(x / this.p0.width * 2 - 1, -(y / this.p0.height) * 2 + 1), this.p0.camera)
    const hits = ray.intersectObjects(this.tokens.filter(t => t.group.visible).map(t => t.hit), false)
    if (hits.length) { const players = [...new Set(hits.map(h => h.object.userData.player))]; return { player: players[0], players } }
    const h = this.highlight
    if (h && (h.kind === 'ladder' || h.kind === 'snake')) {
      const eh = ray.intersectObjects(this.elMeshes, false)
      if (eh.length) return { el: eh[0].object.userData.el }
    }
    // the board's cells: intersect with each tier's top plane
    for (let t = G.B.tiers - 1; t >= 0; t--) {
      const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -(G.tierTop(t) + G.B.tileH))
      const p = ray.ray.intersectPlane(plane, new THREE.Vector3())
      if (!p) continue
      const c = G.cellAt(p.x, p.z)
      if (c && Math.floor((c - 1) / 10) === t) return { cell: c, point: p }
    }
    return null
  }

  /** A point share f of the way along snake or ladder i as it stands now (from where a piece steps on it), in the world, or null. */
  elPoint(i, f = 0.5) { const path = this.elMeshes[i]?.userData.path; return path?.length ? path[Math.min(path.length - 1, Math.round((path.length - 1) * f))].clone() : null }
  /** The camera goes to cell c (or to the middle of snake or ladder i) as it goes after a piece: a tip points there. */
  focusCell(c) { this.manual = 0; this.follow(G.cellPos(c).clone()) }
  focusEl(i, f) { const p = this.elPoint(i, f); if (p) { this.manual = 0; this.follow(p) } }
  /** Where a world point is on the screen now (CSS px), or null when it is behind the camera. */
  screenOf(p) {
    const v = p.clone().project(this.p0.camera)
    if (v.z > 1) return null
    return { x: (v.x + 1) / 2 * this.p0.width, y: (1 - v.y) / 2 * this.p0.height }
  }
  cellScreen(c) { return this.screenOf(G.cellPos(c)) }
  elScreen(i, f) { const p = this.elPoint(i, f); return p ? this.screenOf(p) : null }
  /** Where piece i stands on the screen, feet to head (CSS px), or null. */
  pieceBox(i) {
    const t = this.tokens[i]
    if (!t?.group.visible) return null
    const a = this.screenOf(t.group.position), b = this.screenOf(t.group.position.clone().add(new THREE.Vector3(0, 0.85, 0)))
    if (!a || !b) return null
    const r = Math.max(14, Math.abs(a.y - b.y) * 0.45)
    return { x: Math.min(a.x, b.x) - r, y: b.y - r * 0.4, w: Math.abs(a.x - b.x) + r * 2, h: a.y - b.y + r * 0.9 }
  }

  /** Points the arrow at a player: for a moment (secs) or until cleared (pointAt(null)). */
  pointAt(i, secs = Infinity) { this.pointerFor = i; this.pointerUntil = secs === Infinity ? Infinity : this.time + secs }

  /** kind: 'cell' (cells: list), 'ladder' / 'snake' (els: list), 'player' (players: list) or null */
  setHighlight(h) { this.highlight = h; this.applyHighlight() }
  applyHighlight() {
    const h = this.highlight
    this.elMeshes.forEach((m, i) => {
      m.material = h && (h.kind === 'ladder' || h.kind === 'snake') ? (h.els.includes(i) ? (h.sel === i ? this.mat.hot : this.mat.paper) : this.mat.dim) : this.mat.paper
    })
    const cells = h && h.kind === 'cell' ? h.cells : []
    this.frames.count = cells.length
    const m4 = new THREE.Matrix4()
    cells.forEach((c, i) => {
      const p = G.cellPos(c)
      m4.makeTranslation(p.x, p.y, p.z)
      this.frames.setMatrixAt(i, m4)
      this.frames.setColorAt(i, new THREE.Color(h.sel && h.sel.includes(c) ? '#ff3d00' : '#ffc400'))
    })
    this.frames.instanceMatrix.needsUpdate = true
    if (this.frames.instanceColor) this.frames.instanceColor.needsUpdate = true
  }

  // ---------- frame ----------
  update(dt) {
    this.time += dt
    const sdt = dt * this.speed
    // tasks
    let budget = sdt
    for (let guard = 0; guard < 200 && this.tasks.length; guard++) {
      const t = this.tasks[0]
      try {
        if (!t.begun) { t.begun = true; t.t = 0; t.start?.() }
        if (t.dur <= 0 || this.speed >= 50) { t.update?.(1); t.end?.(); this.tasks.shift(); continue }
        if (budget <= 0) break
        const step = Math.min(budget, t.dur - t.t)
        t.t += step
        budget -= step
        t.update?.(Math.min(1, t.t / t.dur))
        if (t.t >= t.dur - 1e-6) { t.end?.(); this.tasks.shift() } else break
      } catch (err) {
        // a step that fails is dropped: the queue must not stall, or the game waits for it forever
        this.p0.log('animation', String(err?.stack || err))
        if (this.tasks[0] === t) this.tasks.shift()
      }
    }
    // pieces glide to their slots
    this.tokens.forEach((t, i) => {
      if (!t.anim && t.home) t.group.position.lerp(t.home, 1 - Math.exp(-12 * dt))
      const active = this.state && this.state.cur === i && this.state.ph !== 'over'
      const valid = this.highlight?.kind === 'player' && this.highlight.players.includes(i)
      const chosen = this.pointer.visible && this.pointerFor === i
      t.ring.material.opacity = chosen ? 0.95 : valid ? 0.55 + Math.sin(this.time * 6) * 0.3 : active ? 0.55 : 0
      t.ring.material.color.set(chosen ? '#2ecc40' : valid ? '#8fe39a' : t.color)
      t.ring.scale.setScalar(chosen ? 1.25 + Math.sin(this.time * 8) * 0.06 : 1)
      t.ring.material.depthTest = !(chosen || valid) // lit for a choice it shows through whatever stands in front
      // the name tag of the player whose turn it is: bigger, and it breathes
      const lk = t.labelOn ? 1.16 + Math.sin(this.time * 4) * 0.04 : 1
      t.label.scale.set(1.15 * lk, 0.46 * lk, 1)
      // face where the piece goes; standing, turn back to the camera
      const dx = t.group.position.x - t.prev.x, dz = t.group.position.z - t.prev.z
      t.prev.copy(t.group.position)
      if (t.anim && Math.hypot(dx, dz) > 0.002) { t.moving = 0.25; t.wantYaw = Math.atan2(dx, dz) }
      else if ((t.moving -= dt) <= 0) { const c = this.p0.camera.position; t.wantYaw = Math.atan2(c.x - t.group.position.x, c.z - t.group.position.z) }
      let d = (t.wantYaw ?? 0) - t.yaw
      d = Math.atan2(Math.sin(d), Math.cos(d))
      t.yaw += d * (1 - Math.exp(-10 * dt))
      t.pivot.rotation.y = t.yaw
      const av = t.avatar
      if (av) {
        const fly = t.moving > 0
        if (fly !== av.flying && av.fly && av.idle) { av.flying = fly; (fly ? av.fly : av.idle).reset().fadeIn(0.2).play(); (fly ? av.idle : av.fly).fadeOut(0.2) }
        av.mixer.update(dt)
      }
    })
    // the arrow over a chosen player
    const pt = this.pointerFor != null ? this.tokens[this.pointerFor] : null
    this.pointer.visible = !!pt && pt.group.visible && (this.pointerUntil === Infinity || this.time < this.pointerUntil)
    if (this.pointer.visible) {
      // upright on the screen and exactly over the piece there: straight up in the world leans aside in
      // perspective towards the edges of the screen, so the arrow takes the screen height of the point h over
      // the piece, the piece's own screen x, and goes along that view ray to the height h over the board
      const cam = this.p0.camera, feet = pt.group.position
      const h = 1.25 + Math.abs(Math.sin(this.time * 5)) * 0.16
      const f = feet.clone().project(cam), o = feet.clone().add(new THREE.Vector3(0, h, 0)).project(cam)
      const dir = new THREE.Vector3(f.x, o.y, o.z).unproject(cam).sub(cam.position)
      const t = dir.y < -1e-4 ? (feet.y + h - cam.position.y) / dir.y : -1
      if (t > 0) this.pointer.position.copy(cam.position).addScaledVector(dir, t)
      else this.pointer.position.copy(feet).y += h
      this.pointer.quaternion.copy(cam.quaternion)
    }
    // highlights pulse
    this.mat.frame.opacity = 0.8 + Math.sin(this.time * 5) * 0.2
    this.mat.hot.emissiveIntensity = 0.3 + Math.sin(this.time * 5) * 0.2
    // popups and confetti
    for (const p of this.popups) { p.t += dt; p.sp.position.y += dt * 0.5; p.sp.material.opacity = Math.max(0, 1 - Math.max(0, p.t - 0.7) / 0.5) }
    for (const p of this.popups.filter(p => p.t > 1.2)) { this.root.remove(p.sp); p.sp.material.map.dispose(); p.sp.material.dispose() }
    this.popups = this.popups.filter(p => p.t <= 1.2)
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), one = new THREE.Vector3(1, 1, 1)
    this.bits = this.bits.filter(b => (b.life -= dt) > 0)
    this.bits.forEach((b, i) => {
      b.v.y -= 6 * dt; b.v.multiplyScalar(1 - dt * 1.2)
      b.p.addScaledVector(b.v, dt)
      b.r.x += dt * 7; b.r.y += dt * 5
      this.confetti.setMatrixAt(i, m4.compose(b.p, q.setFromEuler(b.r), one))
    })
    this.confetti.count = this.bits.length
    this.confetti.instanceMatrix.needsUpdate = true
    if (this.manual > 0) this.manual -= dt
    this.trayVisible = Math.max(0, this.trayVisible - dt)
    this.idleDice(dt)
    this.pickDice(dt)
    this.zoomTray(dt)
    this.updateCamera(dt)
  }

  /** The dice lying in the tray while it waits for my click: now and then they hop, asking to be rolled. */
  idleDice(dt) {
    const n = this.trayPrompt
    if (!n || this.trayRolling) { this.idleQ = null; return }
    if (!this.idleQ) {
      this.trayLabel = ''
      this.idleQ = this.trayDice.map((m, i) => (m.visible ? m.quaternion.clone() : P.dieQuaternion(i ? 2 : 5, 0.35 - i * 0.7)))
      this.idleT = 0
    }
    this.idleT += dt
    this.trayDice.forEach((m, i) => {
      if (i >= n) { m.visible = false; return }
      if (!m.visible) { m.visible = true; m.position.copy(trayRest(i, n)) }
      m.material = this.mat.dice
      const rest = trayRest(i, n)
      // a hop every 2.4 s, the second die a little later
      const ph = (this.idleT + 1.6 - i * 0.18) % 2.4, k = ph < 0.55 ? ph / 0.55 : 0
      const hop = Math.sin(k * Math.PI)
      m.position.lerp(rest.setY(rest.y + hop * 0.32), 1 - Math.exp(-18 * dt))
      const tilt = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0.6).normalize(), hop * 0.5 * Math.sin(k * Math.PI * 2))
      m.quaternion.copy(tilt.multiply(this.idleQ[i]))
    })
  }

  /** The two dice of Choose Your Roll wait in the tray: they bob in turn, the one under the pointer stands up, golden. */
  pickDice(dt) {
    const h = this.trayPick
    if (h == null || this.trayRolling || this.busy) return
    this.trayDice.forEach((m, i) => {
      if (!m.visible) return
      const bob = Math.max(0, Math.sin(this.time * 4 - i * 1.6)) * 0.06
      const want = 0.23 + (i === h ? 0.3 : bob)
      m.material = i === h ? this.mat.gold : this.mat.dice
      m.position.y += (want - m.position.y) * (1 - Math.exp(-14 * dt))
    })
  }

  /**
   * The tray camera's distance: as on a computer, or (a phone's small tray) as close as shows the dice lying
   * there whole, one die closer than two; it glides when their number changes.
   */
  zoomTray(dt) {
    const fit = this.trayFit
    let want = 1
    if (fit) {
      const n = this.trayDice.filter(m => m.visible).length, t = Math.tan(THREE.MathUtils.degToRad(this.trayCam.fov / 2))
      const d = Math.max((n > 2 ? 1.2 : n > 1 ? 0.92 : 0.45) / (t * fit.aspect), (n > 1 ? 0.55 : 0.5) / t)
      want = THREE.MathUtils.clamp(d / this.trayAway.length(), 0.5, 1.2)
    }
    this.trayZoom += (want - this.trayZoom) * (1 - Math.exp(-7 * dt))
    this.trayCam.position.copy(this.trayAim).addScaledVector(this.trayAway, this.trayZoom)
  }

  /** Draws the dice tray into a corner rectangle (CSS px) after the main scene; `rect.close` frames the dice closer. */
  renderTray(renderer, rect) {
    if (!rect) return
    this.trayFit = rect.close ? { aspect: rect.w / rect.h } : null
    const { x, y, w, h } = rect
    const H = this.p0.height
    renderer.setScissorTest(true)
    renderer.setViewport(x, H - y - h, w, h)
    renderer.setScissor(x, H - y - h, w, h)
    this.trayCam.aspect = w / h
    this.trayCam.updateProjectionMatrix()
    renderer.render(this.tray, this.trayCam)
    renderer.setScissorTest(false)
    renderer.setViewport(0, 0, this.p0.width, this.p0.height)
  }
}
