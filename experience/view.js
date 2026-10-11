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
const TILT = 22 * Math.PI / 180

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
    this.padDice = [0, 1].map(i => {
      const m = new THREE.Mesh(this.dieGeo, this.mat.dice)
      m.position.set(G.B.dice.x - 0.4 + i * 0.8, G.B.base + 0.045 + 0.23, G.B.dice.z)
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
    // the dice tray: its own little scene, drawn in a corner of the screen
    this.tray = new THREE.Scene()
    this.tray.background = new THREE.Color('#dcebfa')
    this.tray.add(new THREE.HemisphereLight(0xffffff, 0x9a9a96, 2.2))
    const tl = new THREE.DirectionalLight(0xffffff, 1.2); tl.position.set(-2, 6, 3); this.tray.add(tl)
    const pad = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.1, 2.2), new THREE.MeshStandardMaterial({ color: '#f6fbff', map: this.fibre, roughness: 0.95 }))
    pad.position.y = -0.05
    this.tray.add(pad)
    const rim = new THREE.Mesh(new THREE.BoxGeometry(3.5, 0.08, 2.5), new THREE.MeshStandardMaterial({ color: '#7fb2f0', roughness: 0.95 }))
    rim.position.y = -0.1
    this.tray.add(rim)
    this.trayDice = [0, 1].map(() => { const m = new THREE.Mesh(this.dieGeo, this.mat.dice); m.visible = false; this.tray.add(m); return m })
    this.trayCam = new THREE.PerspectiveCamera(35, 1.4, 0.1, 50)
    this.trayCam.position.set(0, 2.5, 1.55)
    this.trayCam.lookAt(0, 0, 0.1)
    this.trayVisible = 0
    this.trayLabel = ''
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
    this.refreshLabels()
  }

  buildBoard(els, mk, mods) {
    for (const m of this.elMeshes) { m.geometry.dispose(); this.elGroup.remove(m) }
    for (const m of this.mkMeshes) { m.geometry.dispose(); this.mkGroup.remove(m) }
    this.elMeshes = els.map((e, i) => {
      const m = new THREE.Mesh(G.elementGeometry(e, i), this.mat.paper)
      m.userData = { el: i, path: G.elementPath(e, i), flipped: mods.includes(i) }
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
    if (s.quake) add(new THREE.Vector3(4.9, G.tierTop(G.B.tiers - 1) + 0.6, G.backZ() + 0.3), s.quake.t, '#6d4c41')
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
      pivot.add(body)
      const ring = new THREE.Mesh(new THREE.RingGeometry(0.24, 0.31, 28).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.0, depthWrite: false }))
      ring.position.y = 0.012
      group.add(ring)
      const shadow = new THREE.Mesh(new THREE.CircleGeometry(0.2, 20).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#000000', transparent: true, opacity: 0.18, depthWrite: false }))
      shadow.position.y = 0.006
      group.add(shadow)
      const hit = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.75, 8), new THREE.MeshBasicMaterial({ visible: false }))
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
      model.traverse(o => { if (o.isMesh) o.frustumCulled = false })
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

  refreshLabels() {
    const s = this.state
    if (!s) return
    s.pl.forEach((p, i) => {
      const t = this.tokens[i]
      if (!t) return
      const fx = Object.keys(p.fx).filter(k => FX[k])
      const key = JSON.stringify([p.n, fx.map(k => [k, p.fx[k].t ?? 0]), s.cur === i])
      if (key === t.labelKey) return
      t.labelKey = key
      const W = 320, H = 128
      const { c, g } = P.canvas(W, H)
      g.font = `bold 34px ${P.FONT}`
      const w = Math.min(W - 8, g.measureText(p.n).width + 40)
      g.fillStyle = s.cur === i ? '#ffffff' : 'rgba(255,255,255,0.88)'
      P.roundRect(g, (W - w) / 2, 4, w, 50, 25); g.fill()
      g.strokeStyle = t.color; g.lineWidth = s.cur === i ? 7 : 4; g.stroke()
      g.fillStyle = P.INK; g.textAlign = 'center'; g.textBaseline = 'middle'
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
      t.label.scale.set(1.15, 0.46, 1)
      t.label.position.y = n ? 0.92 : 0.98
    })
  }

  // ---------- events ----------
  get busy() { return this.tasks.length > 0 }
  /** Animates the rules' events, then shows `final` exactly. */
  play(events, final, opts = {}) {
    for (const e of events) this.queueEvent(e, opts)
    this.tasks.push({ dur: 0, start: () => { this.setState(final, opts); this.emit('settled') } })
  }
  wait(dur, update, start, end) { this.tasks.push({ dur, update, start, end }) }

  queueEvent(e, opts) {
    const s = () => this.state
    const tok = i => this.tokens[i]
    switch (e.e) {
      case 'log': this.tasks.push({ dur: 0, start: () => this.emit('log', e.text) }); break
      case 'turn': this.tasks.push({ dur: 0.05, start: () => { this.manual = 0; this.focusOn(e.p); this.emit('turn', e) } }); break
      case 'draw': this.tasks.push({ dur: 0.35, start: () => this.emit('draw', e) }); break
      case 'discard': this.tasks.push({ dur: 0.25, start: () => this.emit('discard', e) }); break
      case 'play': this.tasks.push({ dur: 1.25, start: () => { this.emit('play', e); if (typeof e.tg === 'number' && ['any', 'other', 'leader'].includes(CARD[e.card].tgt)) { this.focusOn(e.tg); this.pointAt(e.tg, 1.6); this.sfx('target', 0.5) } } }); break
      case 'roll': this.queueRoll(e); break
      case 'move': {
        let from = null
        this.tasks.push({ dur: 0, start: () => { from = tok(e.p).pos; this.focusOn(e.p) } })
        e.path.forEach((c, k) => {
          let a, b
          this.tasks.push({
            dur: 0.24,
            start: () => { const t = tok(e.p); t.anim = true; a = t.group.position.clone(); b = G.cellPos(c); this.sfx('hop', 0.3) },
            update: k2 => { const t = tok(e.p); const up = b.y > a.y + 0.1 ? 0.55 : 0.32; t.group.position.lerpVectors(a, b, ease(k2)); t.group.position.y += Math.sin(k2 * Math.PI) * up; this.focusWant.copy(t.group.position) },
            end: () => { const t = tok(e.p); t.pos = c },
          })
        })
        this.tasks.push({ dur: 0, start: () => { tok(e.p).anim = null; this.layoutTokens() } })
        break
      }
      case 'swamp': this.popupTask(e.p, 'Stuck!', '#5d7d22', 'swamp'); break
      case 'shield': this.popupTask(e.p, 'Shield!', '#2b8fd6', 'shield'); break
      case 'skip': this.popupTask(e.p, 'Skips', '#d64545', 'skip'); break
      case 'frozen': this.popupTask(e.p, 'Frozen', '#2b8fd6', 'freeze'); break
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
            this.sfx(e.e, 0.5)
          },
          update: k => {
            const t = tok(e.p)
            const f = (e.e === 'ladder' ? ease(k) : k * k * (3 - 2 * k)) * (path.length - 1)
            const i = Math.min(path.length - 2, Math.floor(f))
            t.group.position.lerpVectors(path[i], path[i + 1], f - i)
            this.focusWant.copy(t.group.position)
          },
          end: () => { const t = tok(e.p); t.pos = e.to; t.anim = null; this.layoutTokens() },
        })
        break
      }
      case 'tramp': case 'jump': this.arcTask(e.p, e.from, e.to, e.e === 'tramp' ? 1.2 : 0.7, e.e === 'tramp' ? 'tramp' : 'jump'); break
      case 'portal': this.teleportTask([[e.p, e.to]]); break
      case 'swap': this.teleportTask([[e.a, null, e.b], [e.b, null, e.a]]); break
      case 'finish': this.tasks.push({
        dur: 1.4,
        start: () => { const t = tok(e.p); t.pos = G.B.cells; this.burst(G.cellPos(G.B.cells), 120); this.sfx('win', 0.6); this.focusOn(e.p) },
        update: k => { const t = tok(e.p); t.group.rotation.y = k * Math.PI * 4; t.group.position.y = G.cellPos(G.B.cells).y + Math.abs(Math.sin(k * Math.PI * 3)) * 0.5 * (1 - k) },
        end: () => { const t = tok(e.p); t.group.rotation.y = 0; if (s().mode === 'fool') t.group.visible = false; this.layoutTokens() },
      }); break
      case 'board': this.boardTask(e); break
      case 'redraw': case 'steal': case 'swaphands': case 'peek': this.tasks.push({ dur: 0.45, start: () => this.emit(e.e, e) }); break
      case 'over': this.tasks.push({ dur: 0.6, start: () => this.emit('over', e) }); break
    }
  }

  popupTask(p, text, color, sound) {
    this.tasks.push({ dur: 0.7, start: () => { this.popup(this.tokens[p].group.position, text, color); this.sfx(sound, 0.5) } })
  }
  arcTask(p, from, to, h, sound) {
    let a, b
    this.tasks.push({
      dur: 0.6,
      start: () => { const t = this.tokens[p]; t.anim = true; a = t.group.position.clone(); b = G.cellPos(to); this.focusOn(p); this.sfx(sound, 0.5) },
      update: k => { const t = this.tokens[p]; t.group.position.lerpVectors(a, b, ease(k)); t.group.position.y += Math.sin(k * Math.PI) * h; this.focusWant.copy(t.group.position) },
      end: () => { const t = this.tokens[p]; t.pos = to; t.anim = null; this.layoutTokens() },
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
        this.sfx('portal', 0.5)
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
        this.sfx(quake ? 'quake' : 'fold', 0.5)
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
          if (c) this.focusWant.copy(G.cellPos(c))
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
    let starts = []
    this.tasks.push({
      dur: e.chosen ? 0.7 : 1.05,
      start: () => {
        this.trayVisible = 3.2
        this.trayLabel = ''
        this.trayGold = e.chosen && e.dice[0] > 3
        starts = e.dice.map((v, i) => {
          const m = this.trayDice[i]
          m.visible = true
          m.material = this.trayGold ? this.mat.gold : this.mat.dice
          const end = new THREE.Vector3(n === 1 ? 0 : (i ? 0.5 : -0.5), 0.23, i ? 0.15 : -0.1)
          const startPos = e.chosen ? end.clone().add(new THREE.Vector3(0, 0.35, 0)) : new THREE.Vector3(1.8, 1.2 + i * 0.2, 0.9 - i * 0.6)
          const qEnd = P.dieQuaternion(v, (Math.random() - 0.5) * 0.8)
          const axis = new THREE.Vector3(Math.random() - 0.5, Math.random() * 0.4, Math.random() - 0.5).normalize()
          return { m, end, startPos, qEnd, axis, spin: e.chosen ? Math.PI : 9 + Math.random() * 4 }
        })
        for (let i = n; i < 2; i++) this.trayDice[i].visible = false
        this.sfx(e.chosen ? 'fold' : 'roll', 0.7)
        this.emit('roll', e)
      },
      update: k => {
        for (const d of starts) {
          if (e.chosen) {
            d.m.position.lerpVectors(d.startPos, d.end, easeOut(k))
          } else {
            d.m.position.x = d.startPos.x + (d.end.x - d.startPos.x) * easeOut(k)
            d.m.position.z = d.startPos.z + (d.end.z - d.startPos.z) * easeOut(k)
            d.m.position.y = d.end.y + Math.abs(Math.cos(k * Math.PI * 2.5)) * (1 - k) * (1 - k) * 1.1
          }
          const q = new THREE.Quaternion().setFromAxisAngle(d.axis, d.spin * Math.pow(1 - k, 2))
          d.m.quaternion.copy(q.multiply(d.qEnd))
        }
      },
      end: () => {
        const total = e.total
        this.trayLabel = e.dice.length > 1 || e.slowed ? (e.slowed ? `${e.dice.reduce((a, b) => a + b, 0)} → ${total}` : `= ${total}`) : ''
        e.dice.forEach((v, i) => { this.padDice[i].visible = true; this.padDice[i].quaternion.copy(P.dieQuaternion(v, 0.3 + i)) })
        this.padDice[1].visible = e.dice.length > 1
      },
    })
    this.tasks.push({ dur: 0.25 })
  }

  // ---------- effects ----------
  popup(pos, text, color) {
    const { c, g } = P.canvas(256, 80)
    g.font = `bold 44px ${P.FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle'
    g.lineWidth = 8; g.strokeStyle = '#ffffff'; g.strokeText(text, 128, 42)
    g.fillStyle = color; g.fillText(text, 128, 42)
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
  sfx(name, volume) { this.emit('sfx', name, volume) }

  // ---------- camera ----------
  focusOn(i) {
    const t = this.tokens[i]
    if (!t) return
    if (this.manual > 0) return
    this.focusWant.copy(t.group.position)
  }
  /** The whole board in view: its middle, from further away on a big board. */
  overview() {
    const fewer = 10 - G.B.tiers
    const z = 0.2 + fewer * G.B.tierD / 2
    this.focusWant.set(0, Math.max(0.6, 1.5 - fewer * 0.15), z)
    this.distWant = 12.5 - fewer * 0.6
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
    cam.updateProjectionMatrix()
    this.p0.me.position.set(THREE.MathUtils.clamp(p.x, -5, 5), Math.min(p.y, L.height - 1), THREE.MathUtils.clamp(p.z, -8.5, 8.5))
  }

  // ---------- picking and highlights ----------
  /** What is under the pointer: { player }, { el } or { cell }. */
  pick(x, y) {
    const ray = new THREE.Raycaster()
    ray.setFromCamera(new THREE.Vector2(x / this.p0.width * 2 - 1, -(y / this.p0.height) * 2 + 1), this.p0.camera)
    const hits = ray.intersectObjects(this.tokens.filter(t => t.group.visible).map(t => t.hit), false)
    if (hits.length) return { player: hits[0].object.userData.player }
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
      if (!t.begun) { t.begun = true; t.t = 0; t.start?.() }
      if (t.dur <= 0 || this.speed >= 50) { t.update?.(1); t.end?.(); this.tasks.shift(); continue }
      if (budget <= 0) break
      const step = Math.min(budget, t.dur - t.t)
      t.t += step
      budget -= step
      t.update?.(Math.min(1, t.t / t.dur))
      if (t.t >= t.dur - 1e-6) { t.end?.(); this.tasks.shift() } else break
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
      this.pointer.position.copy(pt.group.position).add(new THREE.Vector3(0, 1.25 + Math.abs(Math.sin(this.time * 5)) * 0.16, 0))
      // face the camera, leaning towards it so the arrow reads from above
      this.pointer.quaternion.copy(this.p0.camera.quaternion)
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
    this.updateCamera(dt)
  }

  /** Draws the dice tray into a corner rectangle (CSS px) after the main scene. */
  renderTray(renderer, rect) {
    if (this.trayVisible <= 0 || !rect) return
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
