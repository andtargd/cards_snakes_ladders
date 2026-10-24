// The screen layer: a 2D canvas (panels, buttons, log, menus) drawn over the board, plus the hand of
// cards as textured planes so they can slide, lift and fly without redrawing the canvas.
import * as THREE from 'three'
import * as P from './paper.js'
import { CARD, CARDS, CATEGORY, FX, targetsFor, whyNot, warded, choiceMax, diceThrown, CFG, SIZES, SELF } from './rules.js'
import { T } from './strings.js'

/** The cards page of How to Play: by category, and within one from Common to Legendary. */
const CATALOG = [...CARDS].sort((a, b) => Object.keys(CATEGORY).indexOf(a.cat) - Object.keys(CATEGORY).indexOf(b.cat) || 'CURL'.indexOf(a.rar) - 'CURL'.indexOf(b.rar))
/** How long a played card stays in the middle: Echo longer, while it turns over to the card it plays again. */
const flyerLife = fl => (fl.echo ? 2.0 : 1.25)
/** How a card's target is picked on the screen. */
const kindOf = tgt => ({ cell: 'cell', cell2: 'cell2', ladder: 'ladder', snake: 'snake' })[tgt] || 'player'

// tilt turns a card, flat and whole, about its centre: the corner under the pointer goes away (radians about
// y and x). Seen in perspective from in front of the card; w carries it, so the picture on it stays true
const CARD_VS = `
uniform vec2 tilt;
varying vec2 vUv; varying float vNear;
void main() {
  vUv = uv;
  vec3 p = position;
  float cx = cos(tilt.y), sx = sin(tilt.y), cy = cos(tilt.x), sy = sin(tilt.x);
  p = vec3(p.x, p.y * cx - p.z * sx, p.y * sx + p.z * cx);
  p = vec3(p.x * cy + p.z * sy, p.y, -p.x * sy + p.z * cy);
  vNear = p.z;
  vec4 c = projectionMatrix * modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0);
  vec4 q = projectionMatrix * modelViewMatrix * vec4(p.xy, 0.0, 1.0);
  float w = 1.0 - p.z / 4.0; // the eye 4 card widths away
  gl_Position = vec4(c.xy * w + (q.xy - c.xy), q.z * w, w);
}`
const CARD_FS = `
uniform sampler2D map; uniform float time; uniform float legendary; uniform float dim; uniform float opacity; uniform float lift;
uniform float burn; uniform float heat; uniform float seed;
varying vec2 vUv; varying float vNear;
float h21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h21(i), h21(i + vec2(1.0, 0.0)), f.x), mix(h21(i + vec2(0.0, 1.0)), h21(i + vec2(1.0, 1.0)), f.x), f.y);
}
float fbm(vec2 p) { return vnoise(p) * 0.55 + vnoise(p * 2.1 + 3.7) * 0.3 + vnoise(p * 4.3 + 7.1) * 0.15; }
void main() {
  vec4 c = texture2D(map, vUv);
  if (legendary > 0.5) {
    float d = vUv.x + vUv.y * 0.7 - mod(time * 0.45, 2.6) + 0.4;
    c.rgb += smoothstep(0.09, 0.0, abs(d)) * vec3(1.0, 0.86, 0.45) * 0.55;
    float edge = 1.0 - smoothstep(0.0, 0.05, min(min(vUv.x, 1.0 - vUv.x), min(vUv.y, 1.0 - vUv.y) * 1.4));
    c.rgb += edge * (0.22 + 0.2 * sin(time * 3.0 + (vUv.x - vUv.y) * 12.0)) * vec3(1.0, 0.8, 0.3);
  }
  c.rgb = mix(c.rgb, vec3(0.62), dim * 0.6);
  c.rgb += lift * 0.06;
  c.rgb *= 1.0 + vNear * 0.35; // the side leaning out catches the light
  float a = c.a * opacity;
  if (burn > 0.0 || heat > 0.0) {
    // a discarded card smoulders away from its lower edge: charred paper, a glowing rim, then nothing
    float n = fbm(vUv * vec2(5.0, 7.0) + seed) * 0.62 + vUv.y * 0.38;
    float e = n - (burn * 1.25 - 0.12);
    float on = step(0.001, burn);
    c.rgb = mix(c.rgb, vec3(0.16, 0.09, 0.05), (1.0 - smoothstep(0.0, 0.1, e)) * 0.85 * on);
    c.rgb += (1.0 - smoothstep(0.0, 0.045, e)) * vec3(1.0, 0.55, 0.12) * 1.4 * on;
    a *= smoothstep(-0.012, 0.012, e);
    // while a card may be discarded, embers flicker along its border
    float edge = 1.0 - smoothstep(0.0, 0.06, min(min(vUv.x, 1.0 - vUv.x), min(vUv.y, 1.0 - vUv.y) * 1.4));
    c.rgb += heat * edge * (0.55 + 0.45 * sin(time * 5.0 + n * 14.0)) * vec3(1.0, 0.45, 0.1) * 0.6;
  }
  gl_FragColor = vec4(c.rgb, a);
}`

const BURN_SECS = 0.8
// text never gets smaller than this (CSS px) on a small screen, nor smaller than it is drawn at full size
const MIN_TEXT = 12
// on a touch screen a button takes a tap this close to it (CSS px across), however small it is drawn
const TOUCH_HIT = 40
// the game's name on the menu, in the covers' three lines and colours, and how tall it stands (units)
const LOGO = [[{ t: 'Cards,', c: '#ffcf4a' }], [{ t: 'Snakes', c: '#7ed46a' }, { t: '&', c: '#fffdf8' }], [{ t: 'Ladders', c: '#f39a4f' }]]
const LOGO_H = 150
// a card this wide (CSS px) shows its text 12.5 px tall (paper.js draws it 16.5 / 256 of the card's width):
// a card held up to read is at least this big
const CARD_READ = 12.5 * 256 / 16.5

// the gold frame round the dice tray when it is my roll: a shine runs round it and rings go out, asking for a click
const FRAME_VS = 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }'
const FRAME_FS = `
uniform vec2 size; uniform vec2 inner; uniform float radius; uniform float bw; uniform float u;
uniform float time; uniform float hover; uniform float opacity;
varying vec2 vUv;
float sdBox(vec2 p, vec2 b, float r) { vec2 q = abs(p) - b + r; return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r; }
void main() {
  vec2 p = (vUv - 0.5) * size;
  float d = sdBox(p, inner + radius * 0.3, radius);
  float band = smoothstep(-1.0, 0.0, d) * (1.0 - smoothstep(bw - 0.75, bw + 0.75, d));
  float m = clamp(d / bw, 0.0, 1.0);
  vec3 gold = mix(vec3(1.0, 0.88, 0.5), vec3(0.78, 0.52, 0.06), smoothstep(0.2, 1.0, m));
  float ang = atan(p.y / inner.y, p.x / inner.x);
  gold += pow(max(0.0, cos(ang - time * 1.9)), 26.0) * 0.6;
  gold *= 1.0 + hover * 0.15;
  float rim = smoothstep(bw - 1.8 * u, bw - 0.6 * u, d);
  gold = mix(gold, vec3(0.47, 0.3, 0.04), rim * 0.65);
  float od = max(d - bw, 0.0);
  float pulse = 0.5 + 0.5 * sin(time * 3.4);
  float glow = exp(-od / ((4.0 + 5.0 * pulse) * u)) * (0.3 + 0.3 * pulse + 0.3 * hover);
  float ph = fract(time * 0.62);
  float ring = (1.0 - smoothstep(0.0, 2.2 * u, abs(od - ph * 17.0 * u))) * (1.0 - ph) * 0.75;
  float ga = max(glow, ring) * step(bw, d);
  vec3 col = mix(vec3(1.0, 0.8, 0.28), gold, band);
  gl_FragColor = vec4(col, max(band, ga) * opacity);
}`

export class UI {
  constructor(p0, app) {
    this.p0 = p0
    this.app = app
    this.scene = new THREE.Scene()
    this.cam = new THREE.OrthographicCamera(0, 1, 1, 0, -100, 100)
    this.hits = []
    this.hover = null
    this.dirty = true
    this.time = 0
    this.cardTex = new Map()
    this.cards = [] // hand meshes { mesh, id, key }
    this.flyers = [] // cards flying to the centre
    this.toast = null
    this.logOpen = false
    this.logLines = []
    this.logScroll = 0 // the log scrolled back this many lines (0: it shows the newest)
    this.logScrollF = 0
    this.target = null // { i, card, kind, list, sel }
    this.selected = -1
    this.fxOpen = null // a player's effects shown as their cards: { gid, p, keys, x, y } (openFx)
    this.helpPage = 0
    this.picker = false // the Shared Table's invite list is open
    this.rows = new Map() // the players panel: where each player's row stands now, sliding to its place
    this.rowRect = []
    this.promptN = 0 // dice waiting in the tray for my click
    this.fields = new Set()
    this.editing = null // the text field being typed into, and the input over it (p0.web.editText)
    this.editHandle = null
    this.joinCode = '' // the Online screen: the room code typed, and a word about the name
    this.nameNote = ''
    this.resize()
    this.makeBanner()
    this.makeTrayFrame()
    this.makeTip()
  }

  // ---------- canvas layer ----------
  resize() {
    // the screen's safe area (a phone's notch, rounded corners and home bar: p0.web.safe): the screen layer
    // is laid out inside it, W x H from (ox, oy); the board and the paper behind the menus fill the whole screen
    const FW = this.p0.width, FH = this.p0.height, sa = this.p0.web?.safe
    const ins = [sa?.left, sa?.top, sa?.right, sa?.bottom].map(v => Math.max(0, Math.round(v || 0)))
    this.FW = FW; this.FH = FH; this.ox = ins[0]; this.oy = ins[1]; this.safeKey = ins.join()
    const W = Math.max(2, FW - ins[0] - ins[2]), H = Math.max(2, FH - ins[1] - ins[3])
    this.W = W; this.H = H
    this.dpr = Math.min(this.p0.pixelRatio || 1, 2)
    // a phone held upright (a small screen on its side keeps the wide layout, only smaller)
    this.narrow = W < 720 && H > W
    // and it gets the menus' bigger unit: the board is under the panels there, not beside them
    this.u = this.narrow ? THREE.MathUtils.clamp(Math.min(W / 440, H / 760), 0.58, 1.2) : THREE.MathUtils.clamp(Math.min(W / 1100, H / 680), 0.58, 1.6)
    this.cam.left = -this.ox; this.cam.right = FW - this.ox; this.cam.top = H + this.oy; this.cam.bottom = H + this.oy - FH
    this.cam.updateProjectionMatrix()
    // the screen goes under the cards; the windows over it (menu, results, invitations) go over them
    this.base = this.makeLayer(this.base, 0)
    this.over = this.makeLayer(this.over, 50)
    this.g = this.base.g
    this.dirty = true
  }
  makeLayer(old, order) {
    const FW = this.FW, FH = this.FH
    if (old) { this.scene.remove(old.mesh); old.tex.dispose(); old.mesh.geometry.dispose(); old.mesh.material.dispose() }
    const { c, g } = P.canvas(Math.max(2, Math.round(FW * this.dpr)), Math.max(2, Math.round(FH * this.dpr)))
    const tex = new THREE.CanvasTexture(c)
    tex.colorSpace = THREE.SRGBColorSpace
    tex.generateMipmaps = false
    tex.minFilter = THREE.LinearFilter
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(FW, FH), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false }))
    mesh.position.set(FW / 2 - this.ox, this.H + this.oy - FH / 2, order)
    mesh.renderOrder = order
    this.scene.add(mesh)
    return { c, g, tex, mesh, used: true }
  }

  cardTexture(id) {
    if (this.cardTex.has(id)) return this.cardTex.get(id)
    const { c, g } = P.canvas(288, 403)
    if (id === 'back') P.drawCardBack(g, 288, 403)
    else if (id.startsWith('ghost:')) P.drawGhostCard(g, id.slice(6), 288, 403) // Echo's copy of a card
    else P.drawCard(g, id, 288, 403)
    const t = new THREE.CanvasTexture(c)
    t.colorSpace = THREE.NoColorSpace
    t.anisotropy = 4
    this.cardTex.set(id, t)
    return t
  }
  makeCard(id) {
    const mat = new THREE.ShaderMaterial({
      uniforms: { map: { value: this.cardTexture(id) }, time: { value: 0 }, legendary: { value: id !== 'back' && CARD[id].rar === 'L' ? 1 : 0 }, dim: { value: 0 }, opacity: { value: 1 }, lift: { value: 0 }, burn: { value: 0 }, heat: { value: 0 }, seed: { value: Math.random() * 50 }, tilt: { value: new THREE.Vector2() } },
      vertexShader: CARD_VS, fragmentShader: CARD_FS, transparent: true, depthTest: false, depthWrite: false,
    })
    const mesh = new THREE.Mesh(this.cardGeo ||= new THREE.PlaneGeometry(1, 1.4), mat)
    mesh.renderOrder = 10
    this.scene.add(mesh)
    return mesh
  }
  dropCard(mesh) { this.scene.remove(mesh); mesh.material.dispose() }

  /**
   * Draws what stands at render orders lo to hi: the screen under the dice tray (0-10), the cards over it
   * (10-50: a card held up to read covers the tray), then the windows and what stands on them (50 up).
   */
  render(renderer, lo, hi = Infinity) {
    const shown = []
    for (const o of this.scene.children) if (o.visible && (o.renderOrder < lo || o.renderOrder >= hi)) { o.visible = false; shown.push(o) }
    renderer.render(this.scene, this.cam)
    for (const o of shown) o.visible = true
  }

  /** Compiles every UI shader now (a card of each kind, offscreen). */
  warm(renderer) {
    const a = this.makeCard('M1'), b = this.makeCard('M4')
    a.position.set(-500, -500, 0); b.position.set(-500, -500, 0)
    renderer.compile(this.scene, this.cam)
    this.dropCard(a); this.dropCard(b)
  }

  // ---------- the dice tray's gold frame while it waits for my roll ----------
  makeTrayFrame() {
    const mat = new THREE.ShaderMaterial({
      uniforms: { size: { value: new THREE.Vector2(1, 1) }, inner: { value: new THREE.Vector2(1, 1) }, radius: { value: 4 }, bw: { value: 6 }, u: { value: 1 }, time: { value: 0 }, hover: { value: 0 }, opacity: { value: 0 } },
      vertexShader: FRAME_VS, fragmentShader: FRAME_FS, transparent: true, depthTest: false, depthWrite: false,
    })
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat)
    mesh.renderOrder = 2 // over the screen layer, under the banner and the cards
    mesh.visible = false
    this.scene.add(mesh)
    this.trayFrame = mesh
  }
  updateTrayFrame(dt) {
    const m = this.trayFrame, un = m.material.uniforms, r = this.trayRect
    const want = (this.promptN || this.trayMode === 'end' || this.trayMode === 'pick') && r ? 1 : 0
    un.opacity.value += (want - un.opacity.value) * (1 - Math.exp(-(want ? 8 : 14) * dt))
    m.visible = un.opacity.value > 0.01 && !!r
    if (!m.visible) return
    const u = this.u, pad = 26 * u
    m.position.set(r.x + r.w / 2, this.H - (r.y + r.h / 2), 2)
    m.scale.set(r.w + pad * 2, r.h + pad * 2, 1)
    un.size.value.set(r.w + pad * 2, r.h + pad * 2)
    un.radius.value = 5 * u
    un.inner.value.set(r.w / 2 - un.radius.value * 0.3, r.h / 2 - un.radius.value * 0.3)
    un.bw.value = 7 * u
    un.u.value = u
    un.time.value = this.time
    un.hover.value += ((this.hover === 'tray' ? 1 : 0) - un.hover.value) * (1 - Math.exp(-12 * dt))
  }
  trayKey() {
    const app = this.app, s = app.view.state
    if (app.screen !== 'game' || !s) return ''
    return [s.gid, s.seq, s.cur, s.ph, s.rolled, s.played, app.mySeat(), app.view.busy, app.waiting > 0, app.curtain(), app.menuOpen, !!app.invite, !!this.target].join()
  }
  /** How many dice wait in the tray for my click (0 when it is not my roll, or the roll is a chosen value). */
  rollPrompt() {
    const app = this.app, s = app.view.state, me = app.mySeat()
    if (app.screen !== 'game' || !s || me < 0 || s.cur !== me || s.ph !== 'main' || s.rolled) return 0
    // (it stays up while my roll is on its way to the table's host, so the dice are tossed from where they lie)
    if (app.view.busy || app.curtain() >= 0 || app.menuOpen || app.invite) return 0
    const fx = s.pl[me].fx
    return fx.gd || fx.cf ? 0 : diceThrown(fx)
  }

  // ---------- the soft message in the middle of the screen: "Your turn", "Choose any player" ----------
  makeBanner() {
    const { c, g } = P.canvas(1024, 224)
    const tex = new THREE.CanvasTexture(c)
    tex.colorSpace = THREE.SRGBColorSpace
    tex.generateMipmaps = false
    tex.minFilter = THREE.LinearFilter
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 224 / 1024), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false, opacity: 0 }))
    mesh.renderOrder = 5 // over the screen layer, under the cards
    mesh.visible = false
    this.scene.add(mesh)
    this.banner = { g, tex, mesh, text: null, sub: null, op: 0, pop: 1, turn: 0, turnKey: null, turnText: '' }
  }
  drawBanner(text, sub) {
    const b = this.banner, g = b.g
    g.clearRect(0, 0, 1024, 224)
    g.font = `bold 64px ${P.FONT}`
    const tw = g.measureText(text).width
    g.font = `28px ${P.FONT}`
    const sw = sub ? g.measureText(sub).width : 0
    const w = Math.min(1012, Math.max(tw, sw) + 110), h = sub ? 152 : 106
    const x = (1024 - w) / 2, y = (224 - h) / 2
    b.w = w; b.h = h
    g.fillStyle = 'rgba(45,58,107,0.78)'
    P.roundRect(g, x, y, w, h, sub ? 34 : h / 2); g.fill()
    g.strokeStyle = 'rgba(255,255,255,0.4)'; g.lineWidth = 3; g.stroke()
    g.textAlign = 'center'; g.textBaseline = 'middle'
    g.fillStyle = '#ffffff'
    g.font = `bold 64px ${P.FONT}`
    g.fillText(text, 512, y + (sub ? 56 : h / 2 + 3), 990)
    if (sub) { g.font = `28px ${P.FONT}`; g.fillStyle = 'rgba(255,255,255,0.82)'; g.fillText(sub, 512, y + 114, 990) }
    b.tex.needsUpdate = true
  }
  /** Fades the message in and out; it never takes clicks, the board under it stays playable. */
  updateBanner(dt) {
    const app = this.app, b = this.banner, s = app.view.state, me = app.mySeat()
    const inGame = app.screen === 'game' && s && !app.menuOpen && !app.invite
    // "Your turn" once at the start of each of my turns, when the board has settled
    if (app.screen === 'game' && s && me >= 0 && s.cur === me && s.ph !== 'over' && app.curtain() < 0 && !app.view.busy) {
      const key = `${s.gid}:${s.turnNo}:${me}`
      if (key !== b.turnKey) { b.turnKey = key; b.turn = 1.8; b.turnText = app.hotseat() ? T.turnOf(s.pl[me].n) : T.yourTurn }
    }
    b.turn = Math.max(0, b.turn - dt)
    let text = null, sub = null
    const discard = inGame && me >= 0 && s.cur === me && s.ph === 'disc' && app.curtain() < 0 && !app.view.busy
    if (inGame && this.target) {
      const t = this.target
      if (t.echo && t.echo.card) { text = T.chooseWhat(CARD[t.echo.card].tgt); sub = T.echoing(CARD[t.echo.card].name, T.targetHint(t.kind)) }
      else { text = T.chooseWhat(CARD[t.card].tgt); sub = T.targetHint(t.echo ? 'echo' : t.kind) }
    }
    else if (discard) { text = T.discardTitle; sub = T.discardHint(s.pl[me].h.length - CFG.hand) }
    else if (inGame && b.turn > 0) text = b.turnText
    if (text && (text !== b.text || sub !== b.sub)) { this.drawBanner(text, sub); b.text = text; b.sub = sub; b.pop = 0 }
    const want = text ? 1 : 0
    b.op += (want - b.op) * (1 - Math.exp(-(want ? 12 : 5) * dt))
    b.pop = Math.min(1, b.pop + dt * 4)
    const k = Math.max(this.u * 32 / 64, MIN_TEXT / 28) // the 64 px letters show about 32 px tall (the 28 px line under them no smaller than MIN_TEXT)
    const sc = 1024 * k * (0.9 + 0.1 * (1 - Math.pow(1 - b.pop, 3))) * (this.target || discard ? 1 + 0.012 * Math.sin(this.time * 3) : 1)
    b.mesh.scale.set(sc, sc, 1)
    // at the top, under the status and beside the players, so the board and its pieces stay clear to click
    const half = (b.w || 600) / 2 * k, left = this.gameLeft || 0, right = this.W - 60 * this.u
    const cx = left + half <= right - half ? THREE.MathUtils.clamp(this.W / 2, left + half, right - half) : (left + right) / 2
    b.mesh.position.set(cx, this.H - this.bannerTop() - (b.h || 106) / 2 * k, 1)
    b.mesh.material.opacity = b.op * 0.95
    b.mesh.visible = b.op > 0.01
  }
  /** Where the messages at the top of the game screen start (CSS px from the top): under the status. */
  bannerTop() {
    const u = this.u
    return this.narrow ? (this.panelBottom || 0) + 6 * u : 72 * u
  }

  // ---------- the First Match's tips: a paper bubble with a line, an arrow at what to click, a veil round it ----------
  makeTip() {
    const mesh = order => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ transparent: true, depthTest: false, depthWrite: false, opacity: 0 }))
      m.renderOrder = order // over the windows and the dice tray
      m.visible = false
      this.scene.add(m)
      return m
    }
    const bubble = mesh(62), arrow = mesh(63)
    // the arrow, orange on a white edge, points down; the mesh turns it
    const { c, g } = P.canvas(96, 120)
    g.beginPath()
    g.moveTo(48, 112); g.lineTo(90, 62); g.lineTo(64, 62); g.lineTo(64, 8); g.lineTo(32, 8); g.lineTo(32, 62); g.lineTo(6, 62); g.closePath()
    g.lineJoin = 'round'; g.lineWidth = 10; g.strokeStyle = '#ffffff'; g.stroke()
    g.fillStyle = '#e8743b'; g.fill()
    arrow.material.map = P.texture(c)
    this.tip = { bubble, arrow, key: null, cur: null, op: 0, w: 1, h: 1, since: 0, kick: -9, tex: null, skipAt: null, skip: null }
  }
  /** A click the tip did not let through: the bubble shakes. */
  kickTip() {
    if (this.time - this.tip.kick > 0.3) this.app.playSound('tip')
    this.tip.kick = this.time
  }
  /** The bubble's picture for a tip: its line, and Skip tutorial quietly under it. */
  drawTipBubble(tip) {
    const t = this.tip, u = Math.max(this.u, 0.92), k = 2 // (its smallest line stays about 12 px on a small screen)
    const font = this.font(17 * u), small = this.font(13 * u, false)
    const m = (this.tipMeasure ||= P.canvas(4, 4).g)
    m.font = font
    const lines = P.wrapText(m, tip.text, Math.min(320 * u, this.W - 40 * u) - 36 * u)
    const tw = Math.max(...lines.map(l => m.measureText(l).width))
    m.font = small
    const sw = m.measureText(T.skipTutorial).width
    const lh = 23 * u, w = Math.ceil(Math.max(tw + 40 * u, sw + 44 * u, 150 * u)), h = Math.ceil(16 * u + lines.length * lh + 34 * u)
    const { c, g } = P.canvas(Math.round(w * k), Math.round(h * k))
    g.scale(k, k)
    const bw = w - 6 * u, bh = h - 6 * u
    g.fillStyle = 'rgba(60,45,30,0.2)'; P.roundRect(g, 4 * u, 5 * u, bw, bh, 14 * u); g.fill()
    g.fillStyle = '#fffdf8'; P.roundRect(g, 1.5 * u, 1.5 * u, bw, bh, 14 * u); g.fill()
    g.strokeStyle = '#e8743b'; g.lineWidth = 3 * u; g.stroke()
    g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#2d3a6b'; g.font = font
    lines.forEach((l, i) => g.fillText(l, 1.5 * u + bw / 2, 14 * u + lh * (i + 0.5)))
    const sx = w - 20 * u, sy = 14 * u + lines.length * lh + 15 * u
    g.font = small; g.fillStyle = '#7a7268'; g.textAlign = 'right'
    g.fillText(T.skipTutorial, sx, sy)
    g.fillRect(sx - sw, sy + 8 * u, sw, Math.max(1, u))
    t.tex?.dispose()
    t.tex = P.texture(c)
    t.tex.generateMipmaps = false; t.tex.minFilter = THREE.LinearFilter
    t.bubble.material.map = t.tex; t.bubble.material.needsUpdate = true
    t.w = w; t.h = h
    t.skipAt = { x: sx - sw - 12 * u, y: sy, w: sw + 24 * u } // in the bubble, around the line it stands on
  }
  /** What a tip points at, as a rectangle on the screen, or null (a line on its own, or nothing there now). */
  tipRect(tip) {
    const u = this.u
    const ofCard = c => ({ x: c.tx - c.ts / 2, y: c.ty - c.ts * 0.7, w: c.ts, h: c.ts * 1.4 })
    switch (tip.at) {
      case 'hero': return this.heroRect || null
      case 'tray': {
        // with its label: under it, or over it on a phone
        const r = this.trayRect, lab = 34 * u
        return r ? { x: r.x - 8 * u, y: r.y - 8 * u - (this.narrow ? lab : 0), w: r.w + 16 * u, h: r.h + 16 * u + lab } : null
      }
      case 'card': { const c = this.cards.find(k => k.kind === 'hand' && k.id === tip.card); return c && c.tx != null ? ofCard(c) : null }
      case 'hand': {
        const hand = this.cards.filter(k => k.kind === 'hand' && k.tx != null).map(ofCard)
        if (!hand.length) return null
        const x0 = Math.min(...hand.map(r => r.x)), x1 = Math.max(...hand.map(r => r.x + r.w)), y0 = Math.min(...hand.map(r => r.y))
        return { x: x0, y: y0, w: x1 - x0, h: this.H - y0 }
      }
      case 'offer': return this.offerRect || null
      case 'cell': { const p = this.app.view.cellScreen(tip.cell); return p ? { x: p.x - this.ox - 12 * u, y: p.y - this.oy - 14 * u, w: 24 * u, h: 22 * u } : null }
      case 'el': { const p = this.app.view.elScreen(tip.el, tip.along); return p ? { x: p.x - this.ox - 12 * u, y: p.y - this.oy - 12 * u, w: 24 * u, h: 24 * u } : null }
    }
    return null
  }
  /**
   * Where the bubble goes for a target rectangle r: above it, else under, left or right of it, with the arrow
   * between ({ bx, by } its corner; d, the anchor ax, ay and the way vx, vy from the target to the bubble).
   * Without a target, a line on its own stands over the hand.
   */
  placeTip(r, w, h) {
    const u = this.u, W = this.W, H = this.H, M = 8 * u, L = 66 * Math.max(u, 0.8) // (room for the arrow)
    const clamp = THREE.MathUtils.clamp
    // the bubble keeps clear of my piece (the camera does not move for it: it would jump as tips come and go)
    const pb = this.app.screen === 'game' ? this.app.view.pieceBox(this.app.mySeat()) : null
    const avoid = pb && { ...pb, x: pb.x - this.ox, y: pb.y - this.oy }
    const free = (bx, by) => !avoid || bx >= avoid.x + avoid.w || bx + w <= avoid.x || by >= avoid.y + avoid.h || by + h <= avoid.y
    const aside = (bx, by) => {
      if (free(bx, by)) return bx
      for (const x of [avoid.x - w - M, avoid.x + avoid.w + M]) { const sx = clamp(x, M, W - w - M); if (free(sx, by)) return sx }
      return null
    }
    if (!r) {
      // over the hand, and over a card lifted from it
      const tops = this.cards.filter(c => c.kind === 'hand' && c.tx != null).map(c => c.ty - c.ts * 0.7)
      const bottom = Math.min(this.narrow ? (this.trayTop ?? H - this.handHeight()) : H - this.handHeight(), ...tops) - 14 * u
      const by = clamp(bottom - h, M, H - h - M), bx = (W - w) / 2
      return { bx: aside(bx, by) ?? bx, by, d: null }
    }
    const cx = r.x + r.w / 2, cy = r.y + r.h / 2
    const ways = [['up', cx, r.y, 0, -1], ['down', cx, r.y + r.h, 0, 1], ['left', r.x, cy, -1, 0], ['right', r.x + r.w, cy, 1, 0]]
    let first = null
    for (const [d, ax, ay, vx, vy] of ways) {
      const bx = vx ? (vx < 0 ? ax - L - w : ax + L) : ax - w / 2
      const by = vy ? (vy < 0 ? ay - L - h : ay + L) : ay - h / 2
      const fits = (!vx || (bx >= M && bx + w <= W - M)) && (!vy || (by >= M && by + h <= H - M))
      const p = { bx: clamp(bx, M, W - w - M), by: clamp(by, M, H - h - M), d, ax, ay, vx, vy }
      first ||= p
      if (!fits) continue
      // moved aside, it still stands over (or under) its arrow
      const sx = aside(p.bx, p.by)
      if (sx != null && (vx || Math.abs(ax - clamp(ax, sx, sx + w)) < 30 * u)) return { ...p, bx: sx }
    }
    return first
  }
  /** Every frame: the tip of the moment fades in or out, the bubble by what it points at, the arrow bobbing. */
  updateTip(dt) {
    const t = this.tip, u = this.u, H = this.H
    const tip = this.app.tipNow?.() || null
    const key = tip ? `${tip.key}|${tip.text}|${u}|${this.W}` : null
    if (key !== t.key) {
      if (tip) { this.drawTipBubble(tip); t.since = this.time }
      t.key = key
      this.dirty = true // the veil and Skip tutorial's place
    }
    if (tip) t.cur = tip
    t.op += ((tip ? 1 : 0) - t.op) * (1 - Math.exp(-(tip ? 10 : 14) * dt))
    t.skip = null
    const show = t.op > 0.01 && t.cur
    t.bubble.visible = !!show; t.arrow.visible = false
    if (!show) return
    const p = this.placeTip(this.tipRect(t.cur), t.w, t.h)
    const kick = Math.max(0, 1 - (this.time - t.kick) / 0.45)
    const shake = Math.sin((this.time - t.kick) * 38) * 7 * u * kick
    const pop = Math.min(1, (this.time - t.since) / 0.25), sc = 0.9 + 0.1 * (1 - Math.pow(1 - pop, 3))
    t.bubble.position.set(p.bx + t.w / 2 + shake, H - (p.by + t.h / 2), 62)
    t.bubble.scale.set(t.w * sc, t.h * sc, 1)
    t.bubble.material.opacity = t.op
    if (tip) { const hh = Math.max(40, 30 * u); t.skip = { x: p.bx + t.skipAt.x, y: p.by + t.skipAt.y - hh / 2, w: t.skipAt.w, h: hh } }
    if (p.d) {
      const au = Math.max(u, 0.8), aw = 34 * au, ah = 42 * au, gap = 6 * u + Math.abs(Math.sin(this.time * 5)) * 8 * u
      // the point of the arrow by the target, the arrow towards the bubble
      const x = p.ax + p.vx * (gap + ah / 2), y = p.ay + p.vy * (gap + ah / 2)
      t.arrow.visible = true
      t.arrow.position.set(x, H - y, 63)
      t.arrow.scale.set(aw, ah, 1)
      t.arrow.rotation.z = p.vy < 0 ? 0 : p.vy > 0 ? Math.PI : p.vx < 0 ? Math.PI / 2 : -Math.PI / 2
      t.arrow.material.opacity = t.op
    }
  }
  /** On a redraw, on the layer over the cards: the veil round what the tip asks for, and Skip tutorial's place to click. */
  drawTip() {
    this.veiled = false
    const tip = this.app.tipNow?.()
    if (!tip) return
    const r = tip.veil ? this.tipRect(tip) : null
    if (r) {
      const g = this.g, u = this.u, pad = 6 * u
      g.save()
      this.fillScreen('rgba(30,26,22,0.46)')
      g.globalCompositeOperation = 'destination-out'
      P.roundRect(g, r.x - pad, r.y - pad, r.w + pad * 2, r.h + pad * 2, 16 * u); g.fill()
      g.restore()
      this.veiled = true
    }
    // (it follows the bubble, which moves between redraws)
    const tp = this.tip
    this.hits.push({ key: 'tipskip', get x() { return tp.skip?.x ?? -1e5 }, get y() { return tp.skip?.y ?? -1e5 }, get w() { return tp.skip?.w ?? 0 }, get h() { return tp.skip?.h ?? 0 }, action: () => this.app.skipTutorial() })
  }

  // ---------- drawing helpers ----------
  /** A font `px` big (a size times the unit), but on a small screen no smaller than MIN_TEXT or its full size. */
  font(px, bold = true) { return `${bold ? 'bold ' : ''}${this.textPx(px)}px ${P.FONT}` }
  textPx(px) { return Math.round(Math.max(px, Math.min(px / this.u, MIN_TEXT))) }
  /** The line height for text of a size: `pitch` units, or more where the text is kept bigger than the unit. */
  lineH(size, pitch) { return Math.max(pitch * this.u, this.textPx(size * this.u) * 1.3) }
  /** The whole screen in the layer's units: under the notch and the home bar as well (they are outside W x H). */
  fillScreen(style) { this.g.fillStyle = style; this.g.fillRect(-this.ox, -this.oy, this.FW, this.FH) }
  blockScreen() { this.hits.push({ key: 'block', x: -this.ox, y: -this.oy, w: this.FW, h: this.FH, action: () => {} }) }
  text(t, x, y, { size = 16, color = P.INK, align = 'left', bold = true, max } = {}) {
    const g = this.g
    g.font = this.font(size * this.u, bold)
    g.fillStyle = color
    g.textAlign = align
    g.textBaseline = 'middle'
    if (max) g.fillText(t, x, y, max); else g.fillText(t, x, y)
  }
  /** Player `id`'s picture on the site (their avatar, the web build's), or null: then the game draws its own. */
  picture(id) { return id == null ? null : this.p0.web?.picture?.(id) || null }
  /** A picture in a disc of radius r, in a ring of the player's colour. */
  pictureDisc(img, x, y, r, color) {
    const g = this.g
    g.fillStyle = color
    g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill()
    const ir = r - 2 * this.u
    g.save()
    g.beginPath(); g.arc(x, y, ir, 0, Math.PI * 2); g.clip()
    g.drawImage(img, x - ir, y - ir, 2 * ir, 2 * ir)
    g.restore()
  }
  /** A name's first letter, or the emoji it starts with, white in its round badge centred at x, y. */
  initial(name, x, y, size) {
    const { ch, emoji } = P.initial(name)
    if (!emoji) { this.text(ch, x, y, { size, align: 'center', color: '#ffffff' }); return }
    // an emoji's picture sits off the line of letters: it goes by its own box, a little smaller
    const g = this.g
    g.font = this.font(size * 0.9 * this.u, false)
    g.textAlign = 'center'; g.textBaseline = 'alphabetic'; g.fillStyle = '#ffffff'
    const m = g.measureText(ch)
    g.fillText(ch, x - (m.actualBoundingBoxRight - m.actualBoundingBoxLeft) / 2, y + (m.actualBoundingBoxAscent - m.actualBoundingBoxDescent) / 2)
  }
  panel(x, y, w, h, { fill = 'rgba(255,255,255,0.92)', stroke = 'rgba(43,38,34,0.18)', r = 12, lw = 1.5 } = {}) {
    const g = this.g
    g.fillStyle = 'rgba(60,45,30,0.12)'
    P.roundRect(g, x + 2 * this.u, y + 3 * this.u, w, h, r * this.u); g.fill()
    g.fillStyle = fill
    P.roundRect(g, x, y, w, h, r * this.u); g.fill()
    if (stroke) { g.strokeStyle = stroke; g.lineWidth = lw * this.u; g.stroke() }
  }
  button(key, label, x, y, w, h, action, { primary = false, disabled = false, color = null, size = 17, selected = false } = {}) {
    const hov = this.hover === key && !disabled
    const fill = disabled ? '#e4e0d8' : selected ? (color || '#2d3a6b') : primary ? (color || '#e8743b') : '#ffffff'
    this.panel(x, y - (hov ? 2 * this.u : 0), w, h, { fill, stroke: disabled ? null : selected || primary ? 'rgba(0,0,0,0.25)' : 'rgba(43,38,34,0.3)', r: Math.min(14, h / 2.4) })
    this.text(label, x + w / 2, y + h / 2 - (hov ? 2 * this.u : 0) + 1, { size, align: 'center', color: disabled ? '#9a948a' : primary || selected ? '#ffffff' : P.INK, max: w - 10 })
    if (!disabled) this.hits.push({ key, x, y, w, h, action, go: primary })
  }

  // ---------- main draw ----------
  draw() {
    const W = this.W, H = this.H
    let g = this.g = this.base.g
    g.setTransform(this.dpr, 0, 0, this.dpr, this.ox * this.dpr, this.oy * this.dpr)
    g.clearRect(-this.ox, -this.oy, this.FW, this.FH)
    this.hits = []
    this.modal = false // a window is open over the cards: they take no clicks
    this.fxTip = false // an effect's tip by its icon in the players panel
    this.trayRect = null // the tray on screen
    this.trayDice = null // where the view draws the dice (screen px): the tray, unless it shows End Turn or values to choose
    this.trayMode = null // 'roll', 'end', 'choose', 'pick' (one of two dice) or 'show'
    this.heroRect = null // the menu's big button, for a tip
    const app = this.app
    // the board stands in the middle, unless a title screen moves it aside
    app.view.aside.side = 0; app.view.aside.scale = 1
    // the title screens stand beside the board when the screen is wide; on a phone they fill it, in bigger type
    const u0 = this.u
    this.menuWide = W >= 720 && W / u0 >= 980
    this.fields = new Set() // the text fields on screen
    if (['menu', 'solo', 'pass', 'online', 'lobby'].includes(app.screen)) {
      if (!this.menuWide) this.u = Math.max(u0, Math.min(W / 440, H / 760, 1.2))
      if (app.screen === 'menu') this.drawMenu()
      else if (app.screen === 'solo') this.drawSolo()
      else if (app.screen === 'pass') this.drawPass()
      else if (app.screen === 'online') this.drawOnline()
      else this.drawLobby()
      this.u = u0
    } else if (app.screen === 'help') this.drawHelp()
    else if (app.screen === 'game') this.drawGame()
    if (app.screen !== 'lobby') this.picker = false
    // a field being typed into that is not on screen any more keeps what was typed
    if (this.editing && !this.fields.has(this.editing)) this.editHandle?.close(true)
    this.base.tex.needsUpdate = true
    // the windows, on the layer over the cards
    const ov = this.over
    g = this.g = ov.g
    g.setTransform(this.dpr, 0, 0, this.dpr, this.ox * this.dpr, this.oy * this.dpr)
    if (ov.used) g.clearRect(-this.ox, -this.oy, this.FW, this.FH)
    if (app.screen === 'game') this.drawGameWindows()
    this.drawTip()
    if (this.picker) this.drawPicker()
    if (app.invite) this.drawInvite()
    const st = this.p0.web?.status
    if (st) this.drawOnlineStatus(st)
    if (this.toast) {
      const t = this.toast
      g.font = this.font(16 * this.u)
      const w = g.measureText(t.text).width + 40 * this.u
      // in a game it stands at the top, under the message there, clear of the board
      const ty = app.screen === 'game' ? this.bannerTop() + (this.banner.op > 0.05 ? 84 : 4) * this.u : H * 0.42
      this.panel((W - w) / 2, ty, w, 40 * this.u, { fill: 'rgba(43,38,34,0.88)', stroke: null, r: 18 })
      this.text(t.text, W / 2, ty + 20 * this.u, { color: '#ffffff', align: 'center' })
    }
    const used = this.modal || !!this.toast || !!this.peekRect || !!this.offerRect || this.veiled || this.fxTip
    if (used || ov.used) ov.tex.needsUpdate = true
    ov.used = used
    this.g = this.base.g
    this.dirty = false
  }

  /**
   * The game's name as on the covers (tools/cover.js): thick letters in the cards' gold, the snakes' green
   * and the ladders' wood, a navy rim and a paper-thick edge under them, in three lines. `y` is its top;
   * it is LOGO_H units tall.
   */
  drawLogo(cx, y, scale = 1) {
    const g = this.g, u = this.u * scale
    const size = 50 * u, lead = size * 1.02, rim = size * 0.15, depth = Math.max(3, size * 0.09)
    g.save()
    g.font = `900 ${size}px "Arial Black", "Segoe UI Black", ${P.FONT}`
    g.textAlign = 'left'; g.textBaseline = 'alphabetic'
    g.lineJoin = 'round'; g.miterLimit = 2
    const space = g.measureText(' ').width * 0.9
    LOGO.forEach((line, li) => {
      const widths = line.map(w => g.measureText(w.t).width)
      let x = cx - (widths.reduce((a, b) => a + b, 0) + space * (line.length - 1)) / 2
      const at = line.map((w, i) => { const x0 = x; x += widths[i] + space; return x0 })
      const by = y + size * 0.78 + li * lead
      // the edge: the rim pushed down a few times; then the rim, then the letters
      g.fillStyle = g.strokeStyle = '#1f2850'; g.lineWidth = rim
      for (let d = depth; d > 0; d -= Math.max(1, depth / 8)) line.forEach((w, i) => { g.strokeText(w.t, at[i], by + d); g.fillText(w.t, at[i], by + d) })
      g.strokeStyle = '#2d3a6b'
      line.forEach((w, i) => g.strokeText(w.t, at[i], by))
      line.forEach((w, i) => { g.fillStyle = w.c; g.fillText(w.t, at[i], by) })
    })
    g.restore()
  }

  /**
   * The title screens stand in a column of paper on the left, the board rests on the right; on a narrow
   * screen the paper covers it all. `cw` is the content's width: the paper is as wide as it needs.
   * `paint` false only measures.
   */
  menuLayout(cw, paint = true) {
    const W = this.W, H = this.H, u = this.u
    const wide = this.menuWide
    const fr = this.app.view.aside
    if (!wide) {
      const w = Math.min(cw, W - 32 * u)
      if (paint) this.fillScreen('rgba(243,238,229,0.9)')
      return { wide, x: (W - w) / 2, w }
    }
    const zone = Math.min(W * 0.66, Math.max(W * 0.5, cw + 120 * u))
    if (!paint) return { wide, x: (zone - cw) / 2, w: cw }
    fr.side = (zone + this.ox) / (2 * this.FW)
    fr.scale = THREE.MathUtils.clamp((W - zone) / W * 1.45, 0.45, 0.8)
    const g = this.g, gr = g.createLinearGradient(0, 0, zone * 1.15, 0), x0 = -this.ox, y0 = -this.oy
    gr.addColorStop(0, 'rgba(243,238,229,1)'); gr.addColorStop(0.8, 'rgba(243,238,229,0.97)'); gr.addColorStop(1, 'rgba(243,238,229,0.3)')
    g.fillStyle = gr; g.fillRect(x0, y0, zone * 1.15 - x0, this.FH)
    // a light veil keeps the board quiet behind the buttons
    g.fillStyle = 'rgba(243,238,229,0.3)'; g.fillRect(zone * 1.15, y0, this.FW + x0 - zone * 1.15, this.FH)
    return { wide, x: (zone - cw) / 2, w: cw }
  }

  /**
   * A title screen's width for one `w` units wide: on a small screen beside the board it takes more of the
   * width (up to 60%), as its text is kept bigger there than the unit.
   */
  menuW(w) { return Math.max(w * this.u, Math.min(this.W * 0.6, w * 0.8)) }

  /** The main menu: Quick Match on top, then Solo Play, Pass & Play and Online; How to Play under them. */
  drawMenu() {
    const H = this.H, u = this.u, app = this.app
    if (app.channel()) { this.drawChannelMenu(); return }
    const web = this.p0.web, room = web?.room // the browser build: online rooms stand in for the lot
    const { x, w } = this.menuLayout(this.menuW(440))
    const table = this.p0.table || []
    const heroH = 92 * u, cx = x + w / 2
    // the tiles: their lines, kept big on a small screen, may need a third line, and the tiles grow for it
    const gap = 12 * u, tw = (w - gap * 2) / 3
    const onlineSub = web ? (room ? T.inRoom(room.code) : web.invited ? T.invitedShort(web.invited) : T.onlineSub) : T.sharedTableSub
    const subLines = Math.max(...[T.soloSub, T.passSub, onlineSub].map(t => this.wrap(t, 11.5, tw - 28 * u, false).length))
    const lh = this.lineH(11.5, 15), tileH = Math.max(124 * u, 124 * u * 0.6 + this.tileGap() + (Math.min(3, subLines) - 1) * lh + 0.5 * lh + 4 * u)
    // (the web build's line about its online room is always room taken: the menu does not move when it comes or goes)
    const headH = LOGO_H + 44
    const ch = headH * u + heroH + 14 * u + tileH + 14 * u + (web ? 0 : 22) * u + 48 * u + (web ? 36 : 0) * u
    let y = Math.max(16 * u, (H - ch - (table.length ? 90 * u : 0)) / 2)
    this.drawLogo(cx, y, Math.min(1, w / (440 * u)))
    this.text(T.tagline, cx, y + (LOGO_H + 18) * u, { size: 14, align: 'center', bold: false, color: '#5b544c', max: w })
    y += headH * u
    // one click into a game: players online (Project 0: the bots at once); the web build's first time, the First Match
    const mode = app.online.mode === 'fool' ? T.fool : T.champion
    if (app.firstDue()) this.heroButton('quick', T.firstMatch, T.firstMatchSub, x, y, w, heroH, () => app.startFirstMatch())
    else this.heroButton('quick', web ? T.quickMatch : T.quickGame, web ? T.quickMatchSub(mode, app.online.size) : T.quickGameSub, x, y, w, heroH, () => app.quickMatch())
    this.heroRect = { x, y, w, h: heroH }
    y += heroH + 14 * u
    this.tile('solo', 'bot', T.soloPlay, T.soloSub, x, y, tw, tileH, '#7b5ce0', () => app.toScreen('solo'))
    this.tile('pass', 'pair', T.passPlay, T.passSub, x + tw + gap, y, tw, tileH, '#d64545', () => app.toScreen('pass'))
    if (web) this.tile('online', 'globe', T.online, onlineSub, x + (tw + gap) * 2, y, tw, tileH, '#2d3a6b', room ? () => app.openLobby() : () => app.toScreen('online'))
    else this.tile('online', 'group', T.sharedTable, onlineSub, x + (tw + gap) * 2, y, tw, tileH, '#2d3a6b', () => app.openLobby())
    y += tileH + 14 * u
    if (!web) {
      const others = app.sessionCount() - 1
      this.text(others > 0 ? T.othersHere(others) : T.aloneHere, cx, y + 2 * u, { size: 12, align: 'center', bold: false, color: '#7a7268', max: w })
      y += 22 * u
    }
    this.ghostButton('help', T.howToPlay, cx - 168 * u, y, 160 * u, 36 * u, () => { app.toScreen('help'); this.helpPage = 0 })
    this.ghostButton('cards', T.theCards, cx + 8 * u, y, 160 * u, 36 * u, () => { app.toScreen('help'); this.helpPage = 1 })
    y += 48 * u
    // the online room this tab is in, at the bottom: its code, sending it to friends, leaving it
    if (room) {
      this.text(T.roomLine(room.code, app.sessionCount()), x + 4 * u, y + 16 * u, { size: 13.5, max: w * 0.4 - 8 * u })
      this.button('share', room.link ? T.shareLink : T.shareCode, x + w * 0.4, y, w * 0.3 - 4 * u, 32 * u, () => this.shareRoom(), { size: 13 })
      this.button('leaveroom', T.leaveRoom, x + w * 0.7 + 4 * u, y, w * 0.3 - 4 * u, 32 * u, () => web.leave(), { size: 13 })
    }
    if (web) y += 36 * u
    // the week's table, quietly under the buttons
    if (table.length && y + 40 * u < H) {
      this.text(T.weekTable, cx, y + 8 * u, { size: 13, align: 'center', color: '#5b544c' })
      table.slice(0, 5).forEach((r, i) => {
        const ry = y + 30 * u + i * 20 * u
        if (ry > H - 10 * u) return
        this.text(`${i + 1}. ${r.name}${r.owner ? ' *' : ''}`, x + w * 0.2, ry, { size: 12, bold: !!r.you, color: '#5b544c', max: w * 0.45 })
        this.text(String(r.score), x + w * 0.8, ry, { size: 12, align: 'right', color: '#5b544c' })
      })
    }
    this.soundControl()
  }

  /**
   * The menu where the site has a table of its own (Discord's channel), seen only while out of its room
   * (it could not be reached, or a game against bots ended): the way back to it, the bots, the rules.
   */
  drawChannelMenu() {
    const H = this.H, u = this.u, app = this.app
    const { x, w } = this.menuLayout(this.menuW(440))
    const heroH = 92 * u, cx = x + w / 2, headH = LOGO_H + 44
    let y = Math.max(16 * u, (H - headH * u - heroH - 14 * u - 46 * u - 14 * u - 36 * u) / 2)
    this.drawLogo(cx, y, Math.min(1, w / (440 * u)))
    this.text(T.tagline, cx, y + (LOGO_H + 18) * u, { size: 14, align: 'center', bold: false, color: '#5b544c', max: w })
    y += headH * u
    this.heroButton('quick', T.joinTable, T.channelSub, x, y, w, heroH, () => app.enterChannel())
    this.heroRect = { x, y, w, h: heroH }
    y += heroH + 14 * u
    this.button('solo', T.playBots, x, y, w, 46 * u, () => app.startSolo(), { size: 16 })
    y += 46 * u + 14 * u
    this.ghostButton('help', T.howToPlay, cx - 168 * u, y, 160 * u, 36 * u, () => { app.toScreen('help'); this.helpPage = 0 })
    this.ghostButton('cards', T.theCards, cx + 8 * u, y, 160 * u, 36 * u, () => { app.toScreen('help'); this.helpPage = 1 })
    this.soundControl()
  }

  // ---------- the setup screens: Solo Play, Pass & Play, Online ----------
  /**
   * Where a setup screen's parts go: the mode cards and the big button on the left, the settings panel
   * (`sideW` wide, `panelH` tall at most: the screen stays put while it grows) beside them; on a
   * narrow screen the panel goes under them and the cards give up height first. `mid` is room between
   * the cards and the big button (midY), `under` room under the button for a line about it; `paint`
   * false only measures.
   */
  setupLayout(sideW, panelH, { mid = 0, under = 0, paint = true } = {}) {
    const u = this.u, H = this.H
    const L = this.menuLayout(this.menuW(660), paint)
    const side = L.wide, gap = 24 * u, headH = 76 * u, playH = 64 * u
    const mw = side ? L.w - sideW - gap : L.w
    const cardW = (mw - 14 * u) / 2
    let cardH = Math.min(side ? 236 * u : 200 * u, cardW * 1.22)
    if (!side) cardH = Math.max(96 * u, Math.min(cardH, H - 28 * u - headH - 16 * u - mid - playH - under - 18 * u - panelH))
    const leftH = cardH + 16 * u + mid + playH + under
    const blockH = headH + (side ? Math.max(leftH, panelH) : leftH + 18 * u + panelH)
    const x = L.x, y = Math.max(14 * u, (H - blockH) / 2), top = y + headH
    return { x, y, w: L.w, mw, cardW, cardH, top, midY: top + cardH + 16 * u, playY: top + cardH + 16 * u + mid, playH,
      px: side ? x + mw + gap : x, py: side ? top : top + leftH + 18 * u, pw: side ? sideW : L.w, ph: panelH }
  }
  /** The top of a setup screen: a round Back (none without `back`), the title and a line under it. */
  pageHead(x, y, w, title, sub, back) {
    const u = this.u, b = 38 * u, tx = back ? x + b + 14 * u : x
    if (back) this.roundButton('back', x, y + 2 * u, b, back, () => this.arrow(x + b / 2, y + 2 * u + b / 2, -b * 0.42, P.INK))
    this.text(title, tx, y + 18 * u, { size: 27, color: '#2d3a6b', max: w - (tx - x) })
    if (sub) this.text(sub, tx, y + 46 * u, { size: 13, bold: false, color: '#5b544c', max: w - (tx - x) })
  }
  /** Champion and Fool side by side for `c.mode`; `set(fn)` runs fn and keeps the change. */
  modeCards(c, S, set) {
    const pick = m => set(() => { if (c.mode !== m) this.app.playSound('option'); c.mode = m })
    this.modeCard('champion', S.x, S.top, S.cardW, S.cardH, c.mode === 'champion', pick('champion'))
    this.modeCard('fool', S.x + S.cardW + 14 * this.u, S.top, S.cardW, S.cardH, c.mode === 'fool', pick('fool'))
  }
  /** The settings panel's paper. */
  setupPanel(S) { this.panel(S.px, S.py, S.pw, S.ph, { fill: 'rgba(255,253,248,0.6)', stroke: 'rgba(43,38,34,0.1)', r: 14 }) }
  /** A setting's name in the panel, and a quiet word on the right. */
  setLabel(t, x, y, w, extra) {
    const u = this.u
    this.text(t, x, y + 8 * u, { size: 12.5, color: '#7a7268' })
    if (extra) this.text(extra, x + w, y + 8 * u, { size: 11.5, align: 'right', bold: false, color: '#9a948a', max: w * 0.62 })
  }
  /** The bots, how well they play and the board, `pitch` apart: the end of Solo Play's and Pass & Play's panels. */
  tableSettings(c, ix, y, iw, humans, set, pitch = 56 * this.u) {
    const u = this.u, total = humans + c.bots
    this.setLabel(T.bots, ix, y, iw)
    this.miniStepper('bots', ix, y + 20 * u, iw, c.bots, set(() => { c.bots-- }), set(() => { c.bots++ }), c.bots > 0 && total - 1 >= (c.mode === 'fool' ? 3 : 2), total < 6)
    y += pitch
    this.setLabel(T.level, ix, y, iw)
    this.segmented('lvl', ix, y + 20 * u, iw, [1, 2, 3], T.levels, c.level, l => set(() => { c.level = l })(), !c.bots)
    y += pitch
    this.setLabel(T.board, ix, y, iw)
    this.segmented('size', ix, y + 20 * u, iw, SIZES, SIZES.map(String), c.size, n => set(() => { c.size = n })())
  }

  /** Solo Play: me against the bots. */
  drawSolo() {
    const u = this.u, app = this.app, c = app.solo
    const set = fn => () => { fn(); app.setupChanged(c) }
    // beside the cards the rows take some of the room there is
    const M = this.setupLayout(236 * u, 28 * u + 2 * 56 * u + 50 * u, { paint: false })
    const pitch = M.px !== M.x ? Math.max(56 * u, Math.min(80 * u, (M.playY + M.playH - M.top - 78 * u) / 2)) : 56 * u
    const S = this.setupLayout(236 * u, 28 * u + 2 * pitch + 50 * u)
    this.pageHead(S.x, S.y, S.w, T.soloPlay, T.soloHead, () => app.toScreen('menu'))
    this.modeCards(c, S, set)
    this.playButton(S.x, S.playY, S.mw, S.playH, () => app.startSolo())
    this.setupPanel(S)
    this.tableSettings(c, S.px + 16 * u, S.py + 14 * u, S.pw - 32 * u, 1, set, pitch)
    this.soundControl()
  }

  /** Pass & Play: players at this computer by name, and bots if they like. */
  drawPass() {
    const u = this.u, app = this.app, c = app.pass, n = c.names.length
    const set = fn => () => { fn(); app.setupChanged(c) }
    const rowH = 34 * u, row = rowH + 6 * u
    // the screen is laid out for six players: one more only adds a row to the panel
    const panelH = k => 14 * u + 22 * u + k * row + (k < 6 ? row : 0) + 10 * u + 3 * 56 * u - 6 * u + 14 * u
    const S = this.setupLayout(272 * u, Math.max(panelH(5), panelH(6)))
    S.ph = panelH(n)
    this.pageHead(S.x, S.y, S.w, T.passPlay, T.passHead, () => app.toScreen('menu'))
    this.modeCards(c, S, set)
    this.playButton(S.x, S.playY, S.mw, S.playH, () => app.startPass())
    this.setupPanel(S)
    const ix = S.px + 16 * u, iw = S.pw - 32 * u
    let y = S.py + 14 * u
    this.setLabel(T.players, ix, y, iw, String(n))
    y += 22 * u
    for (let i = 0; i < n; i++) {
      const g = this.g, b = rowH, fx = ix + 20 * u, fw = iw - 20 * u - (b + 4 * u) * (n > 2 ? 2 : 1)
      g.fillStyle = P.PLAYER_COLORS[i]; g.beginPath(); g.arc(ix + 7 * u, y + rowH / 2, 7 * u, 0, Math.PI * 2); g.fill()
      this.field('pn' + i, fx, y, fw, rowH, app.passName(i), v => app.setPassName(i, v), { size: 14 })
      this.iconButton('pnr' + i, fx + fw + 4 * u, y, b, () => app.setPassName(i, app.randomName()), (cx, cy, s, col) => this.glyph('die', cx, cy, s, col))
      if (n > 2) this.iconButton('pnx' + i, fx + fw + b + 8 * u, y, b, () => app.removePassPlayer(i), (cx, cy, s, col) => this.cross(cx, cy, s * 0.55, col))
      y += row
    }
    if (n < 6) { this.dashedButton('addp', T.addPlayer, ix, y, iw, rowH, () => app.addPassPlayer()); y += row }
    this.tableSettings(c, ix, y + 10 * u, iw, n, set)
    this.soundControl()
  }

  /** Online (the web build): the mode, then Quick Match, a room of my own or a friend's room by its code. */
  drawOnline() {
    const u = this.u, app = this.app, web = this.p0.web, c = app.online
    if (!web) { app.toScreen('menu'); return }
    const set = fn => () => { fn(); app.saveSettings(); this.dirty = true }
    const site = web.siteName, invited = web.invited
    // the word about privacy at the panel's foot, where the site asks for one (its height in the narrowest panel)
    const openPrivacy = () => web.openPrivacy()
    const privH = web.privacy ? 12 * u + this.linkNote('olprivacy', T.onlinePrivacy, T.privacy, 0, 0, 244 * u, openPrivacy, false) : 0
    // (laid out with room for the invitation and a word about the name, so they do not move the screen)
    const panelH = (inv, note) => 14 * u + (inv ? 26 * u : 0) + 20 * u + 40 * u + (note ? 18 * u : 0) + 18 * u + 46 * u + 22 * u + 34 * u + 44 * u + privH + 16 * u
    // (the line under Quick Match goes on two where its text is kept big for a small screen)
    const note = this.wrap(T.quickTable(app.quickSeats(c.size)), 12, this.setupLayout(276 * u, panelH(true, true), { paint: false }).mw, false).slice(0, 2)
    const S = this.setupLayout(276 * u, panelH(true, true), { mid: 46 * u, under: 12 * u + note.length * this.lineH(12, 14) })
    S.ph = panelH(invited, this.nameNote)
    this.pageHead(S.x, S.y, S.w, T.online, T.onlineHead, () => app.toScreen('menu'))
    this.modeCards(c, S, set)
    // the board: Quick Match looks for a table of this mode and board, and a new room starts with them
    const lw = 64 * u
    this.text(T.board, S.x + 2 * u, S.midY + 16 * u, { size: 14, color: '#7a7268' })
    this.segmented('olsize', S.x + lw, S.midY + 1 * u, S.mw - lw, SIZES, SIZES.map(String), c.size, n => set(() => { c.size = n })())
    this.playButton(S.x, S.playY, S.mw, S.playH, () => app.quickMatch(), { label: T.quickMatch, key: 'olquick', size: 28 })
    note.forEach((l, i) => this.text(l, S.x + S.mw / 2, S.playY + S.playH + 18 * u + i * this.lineH(12, 14), { size: 12, align: 'center', bold: false, color: '#7a7268', max: S.mw }))
    this.setupPanel(S)
    const ix = S.px + 16 * u, iw = S.pw - 32 * u
    let y = S.py + 14 * u
    if (invited) { this.text(T.invitedRoom(invited), ix + iw / 2, y + 8 * u, { size: 13.5, align: 'center', color: '#e8743b', max: iw }); y += 26 * u }
    // the name the others see: the site's own, or one typed here (a die for a random one)
    this.setLabel(T.yourName, ix, y, iw)
    y += 20 * u
    if (site) this.text(T.playingAs(site), ix, y + 18 * u, { size: 15, max: iw })
    else {
      const b = 36 * u
      this.field('olname', ix, y, iw - b - 6 * u, b, web.name, v => { this.nameNote = web.setName(v) || '' }, { size: 15 })
      this.iconButton('olrandom', ix + iw - b, y, b, () => { this.nameNote = ''; web.setName(web.randomName()) }, (cx, cy, s, col) => this.glyph('die', cx, cy, s, col))
    }
    y += 40 * u
    if (this.nameNote) { this.text(this.nameNote, ix, y + 6 * u, { size: 11.5, bold: false, color: '#5b544c', max: iw }); y += 18 * u }
    y += 18 * u
    // a room of my own: its code (and link) for friends
    this.button('olcreate', T.createRoom, ix, y, iw, 46 * u, () => app.createRoom(), { primary: true, color: '#2d3a6b', size: 16 })
    y += 46 * u
    this.text(T.createSub(web.links), ix + iw / 2, y + 11 * u, { size: 11.5, align: 'center', bold: false, color: '#7a7268', max: iw })
    y += 22 * u
    // or a friend's room by its code
    const g = this.g
    g.font = this.font(12 * u, false)
    const ow = g.measureText(T.orJoin).width + 16 * u
    g.fillStyle = 'rgba(43,38,34,0.15)'
    g.fillRect(ix, y + 17 * u, (iw - ow) / 2, 1.5 * u); g.fillRect(ix + (iw + ow) / 2, y + 17 * u, (iw - ow) / 2, 1.5 * u)
    this.text(T.orJoin, ix + iw / 2, y + 17 * u, { size: 12, align: 'center', bold: false, color: '#7a7268' })
    y += 34 * u
    const jw = 92 * u, join = () => app.joinRoom(this.joinCode)
    this.field('olcode', ix, y, iw - jw - 8 * u, 44 * u, this.joinCode, (v, how) => { this.joinCode = v; if (how === 'enter' && v.length >= 3) join() }, { size: 18, max: 5, align: 'center', code: true, hint: T.codeHint })
    this.button('oljoin', T.join, ix + iw - jw, y, jw, 44 * u, join, { primary: !!invited || this.joinCode.length >= 3, size: 16 })
    // who sees what online, and the policy in a new tab (at the panel's foot: a wider panel takes fewer lines)
    if (web.privacy) {
      const nh = this.linkNote('olprivacy', T.onlinePrivacy, T.privacy, 0, 0, iw, openPrivacy, false)
      this.linkNote('olprivacy', T.onlinePrivacy, T.privacy, ix + iw / 2, S.py + S.ph - 14 * u - nh, iw, openPrivacy)
    }
    this.soundControl()
  }

  /** The web build's online attempt, over everything: what it is doing (with Cancel), or what went wrong. */
  drawOnlineStatus(st) {
    const W = this.W, H = this.H, u = this.u, g = this.g, web = this.p0.web
    this.modal = true
    this.blockScreen()
    this.fillScreen('rgba(30,26,22,0.35)')
    const pw = Math.min(W - 20 * u, 420 * u)
    g.font = this.font(15 * u, false)
    const lines = st.busy ? [] : P.wrapText(g, st.error || '', pw - 48 * u).slice(0, 5)
    const ph = st.busy ? 156 * u : 98 * u + lines.length * this.lineH(15, 21) + (st.detail ? 22 : 0) * u
    const x = (W - pw) / 2, y = Math.max(10 * u, (H - ph) / 2)
    this.panel(x, y, pw, ph, { fill: 'rgba(255,253,248,0.99)', stroke: st.busy ? '#2d3a6b' : '#d64545', lw: 2.5 })
    if (st.busy) {
      // a turning arc while it works
      const cx = W / 2, cy = y + 38 * u, r = 13 * u, a = this.time * 5
      g.lineWidth = 3.5 * u; g.lineCap = 'round'
      g.strokeStyle = 'rgba(45,58,107,0.15)'; g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.stroke()
      g.strokeStyle = '#2d3a6b'; g.beginPath(); g.arc(cx, cy, r, a, a + Math.PI * 1.4); g.stroke()
      this.text(st.busy, W / 2, y + 76 * u, { size: 16, align: 'center', max: pw - 30 * u })
      this.button('olcancel', T.cancel, W / 2 - 70 * u, y + ph - 58 * u, 140 * u, 42 * u, () => web.cancel(), { size: 15 })
      return
    }
    let yy = y + 32 * u
    for (const l of lines) { this.text(l, W / 2, yy, { size: 15, align: 'center', bold: false, max: pw - 30 * u }); yy += this.lineH(15, 21) }
    if (st.detail) this.text(st.detail, W / 2, yy + 6 * u, { size: 11.5, align: 'center', bold: false, color: '#9a948a', max: pw - 30 * u })
    const by = y + ph - 58 * u
    // the channel's table could not be reached: again, or the bots meanwhile
    if (st.kind === 'channel') {
      const bw = (pw - 52 * u) / 2
      this.button('olretry', T.tryAgain, x + 20 * u, by, bw, 42 * u, () => { web.dismiss(); this.app.enterChannel() }, { primary: true, size: 15 })
      this.button('olbots', T.playBots, x + 32 * u + bw, by, bw, 42 * u, () => { web.dismiss(); this.app.startSolo() }, { size: 15 })
    // Quick Match found no one to play: the bots are always there
    } else if (st.kind === 'quick') {
      const bw = (pw - 52 * u) / 2
      this.button('olbots', T.playBots, x + 20 * u, by, bw, 42 * u, () => { web.dismiss(); this.app.startSolo() }, { primary: true, size: 15 })
      this.button('olok', T.ok, x + 32 * u + bw, by, bw, 42 * u, () => web.dismiss(), { size: 15 })
    } else this.button('olok', T.ok, W / 2 - 70 * u, by, 140 * u, 42 * u, () => web.dismiss(), { primary: true, color: '#2d3a6b', size: 15 })
  }

  // ---------- buttons and fields of the menus ----------
  /** The orange-into-gold plate of Play and Quick Match, on its paper offset; returns where its top is now (it lifts under the pointer). */
  goldPlate(key, x, y, w, h, shine = true) {
    const g = this.g, u = this.u, hov = this.hover === key, lift = hov ? 3 * u : 0, r = 18 * u
    g.fillStyle = 'rgba(150,70,10,0.3)'; P.roundRect(g, x, y + 6 * u, w, h, r); g.fill()
    y -= lift
    g.save()
    g.shadowColor = 'rgba(255,170,40,0.7)'; g.shadowBlur = (hov ? 26 : 16) * u
    const gr = g.createLinearGradient(0, y, 0, y + h)
    gr.addColorStop(0, '#ffd166'); gr.addColorStop(0.5, '#f7a03c'); gr.addColorStop(1, '#e8743b')
    g.fillStyle = gr; P.roundRect(g, x, y, w, h, r); g.fill()
    g.restore()
    const rim = g.createLinearGradient(x, y, x + w, y + h)
    rim.addColorStop(0, '#fff0b3'); rim.addColorStop(0.5, '#c58a0a'); rim.addColorStop(1, '#ffe08a')
    g.strokeStyle = rim; g.lineWidth = 3 * u; P.roundRect(g, x, y, w, h, r); g.stroke()
    if (shine) { g.strokeStyle = 'rgba(255,255,255,0.45)'; g.lineWidth = 1.5 * u; P.roundRect(g, x + 5 * u, y + 4 * u, w - 10 * u, h * 0.45, r - 5 * u); g.stroke() }
    return y
  }
  /** White letters with a warm shadow, for the gold plate. */
  plateText(t, x, y, size, opts = {}) {
    const g = this.g, u = this.u
    g.save()
    g.shadowColor = 'rgba(120,50,0,0.45)'; g.shadowOffsetY = 2 * u; g.shadowBlur = 3 * u
    this.text(t, x, y, { size, color: '#ffffff', ...opts })
    g.restore()
  }
  /** The menu's Quick Match: the gold plate with a bolt in a ring, its name and a line under it. */
  heroButton(key, title, sub, x, y, w, h, action) {
    const u = this.u, g = this.g, y0 = y
    y = this.goldPlate(key, x, y, w, h, false)
    const ir = h * 0.3, icx = x + 20 * u + ir, icy = y + h / 2
    g.fillStyle = 'rgba(255,255,255,0.3)'; g.beginPath(); g.arc(icx, icy, ir, 0, Math.PI * 2); g.fill()
    this.glyph('bolt', icx, icy, ir * 1.25, '#ffffff')
    const tx = icx + ir + 16 * u, tw = x + w - tx - 40 * u
    this.plateText(title, tx, y + h * 0.4, 28, { max: tw })
    this.plateText(sub, tx, y + h * 0.71, 13, { bold: false, max: tw })
    this.arrow(x + w - 26 * u, y + h / 2, 18 * u, '#ffffff')
    this.hits.push({ key, x, y, w, h: h + (y0 - y), action, go: true })
  }
  /** A tile of the main menu: an icon in a ring, its name and a line or two under it, on a paper offset. */
  tile(key, icon, title, sub, x, y, w, h, color, action) {
    const g = this.g, u = this.u, hov = this.hover === key, lift = hov ? 3 * u : 0, r = 16 * u
    g.fillStyle = 'rgba(43,38,34,0.16)'; P.roundRect(g, x, y + 5 * u, w, h, r); g.fill()
    y -= lift
    g.fillStyle = color; P.roundRect(g, x, y, w, h, r); g.fill()
    // a lighter round in the corner, as the light catches the paper
    g.save()
    P.roundRect(g, x, y, w, h, r); g.clip()
    g.fillStyle = 'rgba(255,255,255,0.09)'; g.beginPath(); g.arc(x + w * 0.92, y + h * 0.08, h * 0.6, 0, Math.PI * 2); g.fill()
    g.restore()
    g.strokeStyle = 'rgba(0,0,0,0.18)'; g.lineWidth = 1.5 * u; P.roundRect(g, x, y, w, h, r); g.stroke()
    const pad = 14 * u, ir = 19 * u
    g.fillStyle = 'rgba(255,255,255,0.22)'; g.beginPath(); g.arc(x + pad + ir, y + pad + ir, ir, 0, Math.PI * 2); g.fill()
    this.glyph(icon, x + pad + ir, y + pad + ir, ir * 1.2, '#ffffff', color)
    this.text(title, x + pad, y + 124 * u * 0.6, { size: 19, color: '#ffffff', max: w - pad * 2 })
    g.font = this.font(11.5 * u, false)
    // (the title stands where it does on a tile of two lines; a third goes under them)
    const ty = y + 124 * u * 0.6
    P.wrapText(g, sub, w - pad * 2).slice(0, 3).forEach((l, i) => this.text(l, x + pad, ty + this.tileGap() + i * this.lineH(11.5, 15), { size: 11.5, bold: false, color: 'rgba(255,255,255,0.86)', max: w - pad * 2 }))
    this.hits.push({ key, x, y, w, h: h + lift, action, go: true })
  }
  /** From a tile's title down to its first line: more where their text is kept bigger than the unit. */
  tileGap() { return Math.max(21 * this.u, this.textPx(19 * this.u) / 2 + this.lineH(11.5, 15) * 0.6) }
  /** A round white button with a drawn mark (`mark(cx, cy)`), as Back. */
  roundButton(key, x, y, s, action, mark) {
    const g = this.g, u = this.u, hov = this.hover === key, lift = hov ? 2 * u : 0
    g.fillStyle = 'rgba(60,45,30,0.12)'; g.beginPath(); g.arc(x + s / 2 + 1 * u, y + s / 2 + 3 * u, s / 2, 0, Math.PI * 2); g.fill()
    g.fillStyle = '#ffffff'; g.beginPath(); g.arc(x + s / 2, y + s / 2 - lift, s / 2, 0, Math.PI * 2); g.fill()
    g.strokeStyle = hov ? 'rgba(43,38,34,0.45)' : 'rgba(43,38,34,0.25)'; g.lineWidth = 1.5 * u; g.stroke()
    g.save(); g.translate(0, -lift); mark(); g.restore()
    this.hits.push({ key, x, y: y - lift, w: s, h: s + lift, action })
  }
  /** A small square white button with a drawn mark: `mark(cx, cy, size, color)`. */
  iconButton(key, x, y, s, action, mark) {
    const hov = this.hover === key
    this.button(key, '', x, y, s, s, action)
    mark(x + s / 2, y + s / 2 - (hov ? 2 * this.u : 0), s * 0.5, hov ? P.INK : '#5b544c')
  }
  /** A quiet button with a dashed edge, for adding one more of something. */
  dashedButton(key, label, x, y, w, h, action) {
    const g = this.g, u = this.u, hov = this.hover === key
    g.save()
    g.fillStyle = hov ? 'rgba(255,255,255,0.8)' : 'rgba(255,255,255,0.35)'; P.roundRect(g, x, y, w, h, 10 * u); g.fill()
    g.setLineDash([5 * u, 4 * u]); g.strokeStyle = hov ? '#2d3a6b' : 'rgba(45,58,107,0.45)'; g.lineWidth = 1.5 * u; g.stroke()
    g.restore()
    this.text(label, x + w / 2, y + h / 2 + 1, { size: 13.5, align: 'center', color: '#2d3a6b', max: w - 10 * u })
    this.hits.push({ key, x, y, w, h, action })
  }
  /**
   * A text field: a white box with its text (and a pencil). A click puts a real input over it (the web
   * build's p0.web.editText: a phone's keyboard, paste, any layout), and `done(value, how)` gets what was
   * typed, how being 'enter', 'tab' or 'blur'. Without one (Project 0) it only shows the text.
   */
  field(key, x, y, w, h, value, done, { size = 15, max = 14, align = 'left', code = false, hint = '' } = {}) {
    const g = this.g, u = this.u, can = !!this.p0.web?.editText, on = this.editing === key, hov = this.hover === key && can
    this.fields.add(key)
    g.fillStyle = '#ffffff'; P.roundRect(g, x, y, w, h, 10 * u); g.fill()
    g.strokeStyle = on ? '#2d3a6b' : hov ? 'rgba(43,38,34,0.45)' : 'rgba(43,38,34,0.25)'; g.lineWidth = (on ? 2 : 1.5) * u; g.stroke()
    const pad = 12 * u
    if (on) {
      g.strokeStyle = 'rgba(45,58,107,0.18)'; g.lineWidth = 3 * u; P.roundRect(g, x - 3 * u, y - 3 * u, w + 6 * u, h + 6 * u, 12 * u); g.stroke()
      this.editHandle?.move(x + this.ox, y + this.oy, w, h)
      return
    }
    const pen = can && !code ? 20 * u : 0
    this.text(value || hint, align === 'center' ? x + w / 2 : x + pad, y + h / 2 + 1, { size, align, bold: !!value, color: value ? P.INK : '#b5afa5', max: w - pad * 2 - pen })
    if (pen) this.glyph('pencil', x + w - pad - 5 * u, y + h / 2, 13 * u, hov ? P.INK : '#9a948a')
    if (can) this.hits.push({ key, x, y, w, h, action: () => this.startEdit(key, { x, y, w, h }, value, done, { size, max, align, code, pad }) })
  }
  startEdit(key, r, value, done, o) {
    this.editHandle?.close(true)
    this.editing = key
    this.editHandle = this.p0.web.editText({
      ...r, x: r.x + this.ox, y: r.y + this.oy, value, max: o.max, size: Math.round(o.size * this.u), pad: o.pad, align: o.align, code: o.code, font: P.FONT, color: P.INK,
      onDone: (v, how) => {
        if (this.editing === key) { this.editing = null; this.editHandle = null }
        if (v != null) done(v, how)
        this.dirty = true
      },
    })
    this.dirty = true
  }

  // ---------- the menus' line icons ----------
  /** A drawn icon `s` across: bolt, bot, pair, group, globe, pencil, die. `bg` keeps one figure in front of another. */
  glyph(kind, cx, cy, s, color, bg = null) {
    const g = this.g
    g.save()
    g.strokeStyle = color; g.fillStyle = color; g.lineWidth = Math.max(1, s * 0.085); g.lineCap = 'round'; g.lineJoin = 'round'
    const pt = (a, b) => [cx + a * s, cy + b * s]
    const shape = pts => { g.beginPath(); pts.forEach(([a, b], i) => (i ? g.lineTo(...pt(a, b)) : g.moveTo(...pt(a, b)))); g.closePath() }
    const person = (dx, dy, k) => {
      // head and shoulders, filled with the background so a figure in front hides the one behind
      for (const draw of [() => g.arc(...pt(dx, dy - 0.17 * k), 0.15 * k * s, 0, Math.PI * 2), () => { g.arc(...pt(dx, dy + 0.36 * k), 0.27 * k * s, Math.PI, 0); g.closePath() }]) {
        g.beginPath(); draw()
        if (bg) { g.fillStyle = bg; g.fill() }
        g.stroke()
      }
    }
    if (kind === 'bolt') { shape([[0.1, -0.5], [-0.28, 0.06], [-0.02, 0.06], [-0.1, 0.5], [0.28, -0.08], [0.02, -0.08]]); g.fill() }
    else if (kind === 'bot') {
      g.beginPath(); g.moveTo(...pt(0, -0.26)); g.lineTo(...pt(0, -0.4)); g.stroke()
      g.beginPath(); g.arc(...pt(0, -0.44), 0.06 * s, 0, Math.PI * 2); g.fill()
      P.roundRect(g, cx - 0.38 * s, cy - 0.26 * s, 0.76 * s, 0.6 * s, 0.15 * s); g.stroke()
      for (const d of [-1, 1]) { g.beginPath(); g.arc(...pt(d * 0.16, 0.01), 0.07 * s, 0, Math.PI * 2); g.fill() }
      g.beginPath(); g.moveTo(...pt(-0.12, 0.18)); g.lineTo(...pt(0.12, 0.18)); g.stroke()
    } else if (kind === 'pair') { person(0.17, -0.05, 0.85); person(-0.13, 0.04, 1) }
    else if (kind === 'group') { person(-0.26, -0.03, 0.78); person(0.26, -0.03, 0.78); person(0, 0.05, 0.95) }
    else if (kind === 'globe') {
      g.beginPath(); g.arc(cx, cy, 0.42 * s, 0, Math.PI * 2); g.stroke()
      g.beginPath(); g.ellipse(cx, cy, 0.18 * s, 0.42 * s, 0, 0, Math.PI * 2); g.stroke()
      g.beginPath(); g.moveTo(...pt(-0.42, 0)); g.lineTo(...pt(0.42, 0)); g.moveTo(...pt(-0.36, -0.21)); g.lineTo(...pt(0.36, -0.21)); g.moveTo(...pt(-0.36, 0.21)); g.lineTo(...pt(0.36, 0.21)); g.stroke()
    } else if (kind === 'pencil') {
      g.translate(cx, cy); g.rotate(-Math.PI / 4)
      g.strokeRect(-0.42 * s, -0.11 * s, 0.6 * s, 0.22 * s)
      g.beginPath(); g.moveTo(0.18 * s, -0.11 * s); g.lineTo(0.44 * s, 0); g.lineTo(0.18 * s, 0.11 * s); g.closePath(); g.stroke()
    } else if (kind === 'die') {
      P.roundRect(g, cx - 0.4 * s, cy - 0.4 * s, 0.8 * s, 0.8 * s, 0.17 * s); g.stroke()
      for (const [a, b] of [[-0.18, -0.18], [0, 0], [0.18, 0.18]]) { g.beginPath(); g.arc(...pt(a, b), 0.075 * s, 0, Math.PI * 2); g.fill() }
    }
    g.restore()
  }
  /** An arrow pointing right (`s` long), or left with a negative s. */
  arrow(cx, cy, s, color) {
    const g = this.g
    g.save()
    g.strokeStyle = color; g.lineWidth = Math.max(1.5, Math.abs(s) * 0.13); g.lineCap = 'round'; g.lineJoin = 'round'
    g.beginPath(); g.moveTo(cx - s / 2, cy); g.lineTo(cx + s / 2, cy)
    g.moveTo(cx + s / 2 - s * 0.38, cy - Math.abs(s) * 0.36); g.lineTo(cx + s / 2, cy); g.lineTo(cx + s / 2 - s * 0.38, cy + Math.abs(s) * 0.36)
    g.stroke()
    g.restore()
  }
  /** ✕, `s` across. */
  cross(cx, cy, s, color) {
    const g = this.g
    g.save()
    g.strokeStyle = color; g.lineWidth = Math.max(1.5, s * 0.16); g.lineCap = 'round'
    g.beginPath(); g.moveTo(cx - s / 2, cy - s / 2); g.lineTo(cx + s / 2, cy + s / 2); g.moveTo(cx + s / 2, cy - s / 2); g.lineTo(cx - s / 2, cy + s / 2); g.stroke()
    g.restore()
  }

  /** A word or two that open a page beside the game: ink blue and underlined. Returns its width. */
  link(key, t, x, y, action, { size = 11.5, align = 'left' } = {}) {
    const g = this.g, u = this.u, color = this.hover === key ? P.INK : '#2d3a6b'
    g.font = this.font(size * u, false)
    const w = g.measureText(t).width, x0 = align === 'right' ? x - w : align === 'center' ? x - w / 2 : x
    this.text(t, x0, y, { size, bold: false, color })
    g.fillStyle = color; g.fillRect(x0, y + this.textPx(size * u) * 0.58, w, Math.max(1, u))
    this.hits.push({ key, x: x0 - 6 * u, y: y - 13 * u, w: w + 12 * u, h: 26 * u, action })
    return w
  }
  /** A quiet note centred on `cx`, `w` wide, whose last word is a link; from `y` down. Returns its height (`draw` false only measures). */
  linkNote(key, text, link, cx, y, w, action, draw = true) {
    const size = 11.5, lh = this.lineH(size, 15), lines = this.wrap(text + ' ' + link, size, w, false)
    if (draw) lines.forEach((l, i) => {
      const ly = y + lh / 2 + i * lh
      if (i < lines.length - 1) { this.text(l, cx, ly, { size, align: 'center', bold: false, color: '#7a7268', max: w }); return }
      // the last line: the words before the link, then the link, centred together
      const head = l.slice(0, -link.length), g = this.g
      g.font = this.font(size * this.u, false)
      const hw = head ? g.measureText(head).width : 0, x0 = cx - (hw + g.measureText(link).width) / 2
      if (head) this.text(head, x0, ly, { size, bold: false, color: '#7a7268' })
      this.link(key, link, x0 + hw, ly, action, { size })
    })
    return lines.length * lh
  }

  /** A quiet button: no fill until the pointer is on it. */
  ghostButton(key, label, x, y, w, h, action) {
    const g = this.g, hov = this.hover === key
    if (hov) { g.fillStyle = 'rgba(43,38,34,0.07)'; P.roundRect(g, x, y, w, h, h / 2); g.fill() }
    this.text(label, x + w / 2, y + h / 2 + 1, { size: 15, align: 'center', color: hov ? P.INK : '#5b544c', max: w - 8 })
    this.hits.push({ key, x, y, w, h, action })
  }
  /**
   * Champion in gold, Fool in gloom: a big card to pick the mode by. A low one (a table's lobby) lies
   * on its side, the picture beside the words; with no `action` it only shows the mode.
   */
  modeCard(mode, x, y, w, h, selected, action) {
    const g = this.g, u = this.u, key = 'mode' + mode, hov = this.hover === key && !!action
    const champ = mode === 'champion', low = h < 150 * u
    const lift = selected ? (low ? 2 : 4) * u : hov ? 2 * u : 0
    y -= lift
    const r = (low ? 14 : 18) * u
    g.save()
    if (!selected) g.globalAlpha = hov ? 0.9 : action ? 0.72 : 0.42
    // the frame's glow, then the card
    g.save()
    g.shadowColor = champ ? 'rgba(255,186,40,0.75)' : 'rgba(34,18,48,0.6)'
    g.shadowBlur = (selected ? (low ? 14 : 22) : 0) * u
    g.shadowOffsetY = (selected ? (low ? 2 : 4) : 0) * u
    g.fillStyle = champ ? (selected ? '#fffaf0' : '#fffdf8') : (selected ? '#f1ecf5' : '#fffdf8')
    P.roundRect(g, x, y, w, h, r); g.fill()
    g.restore()
    const gr = g.createLinearGradient(x, y, x + w, y + h)
    if (champ) { gr.addColorStop(0, '#ffe08a'); gr.addColorStop(0.4, '#d29a12'); gr.addColorStop(0.65, '#fff0b3'); gr.addColorStop(1, '#b8800a') }
    else { gr.addColorStop(0, '#5a4470'); gr.addColorStop(0.45, '#241830'); gr.addColorStop(0.7, '#6e5a82'); gr.addColorStop(1, '#1c1226') }
    g.strokeStyle = gr; g.lineWidth = (selected ? (low ? 3.5 : 5) : 2.5) * u
    P.roundRect(g, x, y, w, h, r); g.stroke()
    if (selected && !low) {
      // a thin inner line, as on the gold cards
      g.strokeStyle = champ ? 'rgba(210,154,18,0.45)' : 'rgba(60,40,80,0.35)'; g.lineWidth = 1.2 * u
      P.roundRect(g, x + 8 * u, y + 8 * u, w - 16 * u, h - 16 * u, r - 6 * u); g.stroke()
    }
    if (low) {
      const s = h * 0.62, tx = x + h * 0.55 + s * 0.62 + 10 * u
      if (champ) this.crown(x + h * 0.55, y + h * 0.52, s)
      else this.jesterCap(x + h * 0.55, y + h * 0.5, s)
      // the line under the name goes on two when it is long
      const tw = x + w - tx - 10 * u
      g.font = this.font(11.5 * u, false)
      const lines = P.wrapText(g, champ ? T.championDesc : T.foolDesc, tw).slice(0, 2), two = lines.length > 1
      this.text(champ ? T.champion : T.fool, tx, y + h * (two ? 0.3 : 0.38), { size: Math.min(19, h / u / 3.4), color: champ ? '#9a6b00' : '#3a2a4c', max: tw })
      lines.forEach((l, i) => this.text(l, tx, y + h * (two ? 0.58 + i * 0.22 : 0.68), { size: 11.5, bold: false, color: '#5b544c', max: tw }))
      g.restore()
      if (action) this.hits.push({ key, x, y, w, h: h + lift, action })
      return
    }
    // (the line under the name, kept big on a small screen, may go on three: the picture and the name go up for it)
    g.font = this.font(12.5 * u, false)
    const lines = P.wrapText(g, champ ? T.championDesc : T.foolDesc, w - 36 * u).slice(0, 3), three = lines.length > 2
    const s = Math.min(w * 0.42, h * (three ? 0.3 : 0.36)), lh = this.lineH(12.5, 17)
    if (champ) this.crown(x + w / 2, y + h * (three ? 0.25 : 0.31), s)
    else this.jesterCap(x + w / 2, y + h * (three ? 0.25 : 0.31), s)
    this.text(champ ? T.champion : T.fool, x + w / 2, y + h * (three ? 0.5 : 0.6), { size: Math.min(26, w / u / 7.5), align: 'center', color: champ ? '#9a6b00' : '#3a2a4c' })
    lines.forEach((l, i) => this.text(l, x + w / 2, (three ? y + h * 0.5 + 1.05 * lh + i * lh : y + h * 0.79 + (i - (lines.length - 1) / 2) * lh), { size: 12.5, align: 'center', bold: false, color: '#5b544c' }))
    g.restore()
    if (action) this.hits.push({ key, x, y, w, h: h + lift, action })
  }
  crown(cx, cy, s) {
    const g = this.g
    const pts = [[-0.5, 0.28], [-0.5, -0.16], [-0.25, 0.04], [0, -0.34], [0.25, 0.04], [0.5, -0.16], [0.5, 0.28]]
    const path = () => { g.beginPath(); pts.forEach(([a, b], i) => (i ? g.lineTo(cx + a * s, cy + b * s) : g.moveTo(cx + a * s, cy + b * s))); g.closePath() }
    g.save()
    g.shadowColor = 'rgba(255,190,40,0.6)'; g.shadowBlur = s * 0.18
    const gr = g.createLinearGradient(cx, cy - s * 0.4, cx, cy + s * 0.3)
    gr.addColorStop(0, '#ffe28a'); gr.addColorStop(0.55, '#f2b632'); gr.addColorStop(1, '#c58a0a')
    g.fillStyle = gr; path(); g.fill()
    g.restore()
    g.strokeStyle = '#9a6b00'; g.lineWidth = s * 0.035; g.lineJoin = 'round'
    path(); g.stroke()
    g.fillStyle = '#b8800a'; g.fillRect(cx - s * 0.5, cy + s * 0.14, s, s * 0.05)
    for (const [a, b] of [[-0.5, -0.16], [0, -0.34], [0.5, -0.16]]) { g.fillStyle = '#fff0b3'; g.beginPath(); g.arc(cx + a * s, cy + b * s - s * 0.04, s * 0.07, 0, Math.PI * 2); g.fill(); g.stroke() }
    g.fillStyle = '#d64545'; g.beginPath(); g.arc(cx, cy + s * 0.04, s * 0.06, 0, Math.PI * 2); g.fill()
  }
  jesterCap(cx, cy, s) {
    const g = this.g
    g.save()
    g.shadowColor = 'rgba(34,18,48,0.45)'; g.shadowBlur = s * 0.15
    g.lineJoin = 'round'; g.lineWidth = s * 0.035; g.strokeStyle = '#1c1226'
    // two points drooping to the sides, one standing up, then the band
    for (const d of [-1, 1]) {
      g.fillStyle = '#4a3560'
      g.beginPath(); g.moveTo(cx + d * 0.1 * s, cy + 0.18 * s)
      g.quadraticCurveTo(cx + d * 0.3 * s, cy - 0.42 * s, cx + d * 0.58 * s, cy + 0.02 * s)
      g.quadraticCurveTo(cx + d * 0.4 * s, cy + 0.02 * s, cx + d * 0.46 * s, cy + 0.18 * s)
      g.closePath(); g.fill(); g.stroke()
    }
    g.fillStyle = '#6b5480'
    g.beginPath(); g.moveTo(cx - 0.3 * s, cy + 0.18 * s)
    g.quadraticCurveTo(cx - 0.12 * s, cy - 0.3 * s, cx + 0.06 * s, cy - 0.5 * s)
    g.quadraticCurveTo(cx + 0.14 * s, cy - 0.1 * s, cx + 0.3 * s, cy + 0.18 * s)
    g.closePath(); g.fill(); g.stroke()
    g.restore()
    g.fillStyle = '#2e2140'; g.strokeStyle = '#1c1226'; g.lineWidth = s * 0.035
    P.roundRect(g, cx - 0.5 * s, cy + 0.16 * s, s, 0.16 * s, 0.06 * s); g.fill(); g.stroke()
    for (const [a, b] of [[-0.58, 0.06], [0.58, 0.06], [0.06, -0.5]]) {
      g.fillStyle = '#a99bb6'; g.beginPath(); g.arc(cx + a * s, cy + b * s, s * 0.07, 0, Math.PI * 2); g.fill(); g.stroke()
    }
    for (const a of [-0.3, 0, 0.3]) { g.fillStyle = '#8a7a99'; g.beginPath(); g.arc(cx + a * s, cy + 0.24 * s, s * 0.035, 0, Math.PI * 2); g.fill() }
  }
  /** The big Play (or Start Game, Quick Match): orange into gold, on its paper offset, with a warm glow; grey while it cannot go. */
  playButton(x, y, w, h, action, { label = T.play, key = 'play', size = 32, disabled = false } = {}) {
    const g = this.g, u = this.u
    if (disabled) {
      g.fillStyle = '#e4e0d8'; P.roundRect(g, x, y, w, h, 18 * u); g.fill()
      this.text(label, x + w / 2, y + h / 2 + 2 * u, { size: size * 0.85, align: 'center', color: '#9a948a', max: w - 20 * u })
      return
    }
    const y1 = this.goldPlate(key, x, y, w, h)
    this.plateText(label, x + w / 2, y1 + h / 2 + 2 * u, size, { align: 'center', max: w - 20 * u })
    this.hits.push({ key, x, y: y1, w, h: h + (y - y1), action, go: true })
  }
  /** − value + in a small row, `w` wide. */
  miniStepper(key, x, y, w, value, dec, inc, canDec, canInc) {
    const u = this.u, b = 30 * u
    this.button(key + '-', '−', x, y, b, b, dec, { disabled: !canDec, size: 16 })
    this.text(String(value), x + w / 2, y + b / 2 + 1, { size: 17, align: 'center' })
    this.button(key + '+', '+', x + w - b, y, b, b, inc, { disabled: !canInc, size: 16 })
  }
  /** A row of quiet choices: the chosen one in white with a navy line (only shown, faintly, while it cannot change). */
  segmented(key, x, y, w, values, labels, current, pick, disabled = false) {
    const g = this.g, u = this.u, h = 30 * u, n = values.length, sw = w / n
    g.fillStyle = 'rgba(43,38,34,0.06)'; P.roundRect(g, x, y, w, h, 9 * u); g.fill()
    values.forEach((v, i) => {
      const k = key + v, on = v === current, hov = this.hover === k && !disabled
      const bx = x + i * sw
      if (on) {
        g.fillStyle = disabled ? 'rgba(255,255,255,0.55)' : '#ffffff'; P.roundRect(g, bx + 2 * u, y + 2 * u, sw - 4 * u, h - 4 * u, 7 * u); g.fill()
        if (!disabled) { g.strokeStyle = 'rgba(45,58,107,0.55)'; g.lineWidth = 1.3 * u; g.stroke() }
      } else if (hov) { g.fillStyle = 'rgba(255,255,255,0.6)'; P.roundRect(g, bx + 2 * u, y + 2 * u, sw - 4 * u, h - 4 * u, 7 * u); g.fill() }
      this.text(labels[i], bx + sw / 2, y + h / 2 + 1, { size: 12.5, align: 'center', bold: on, color: disabled ? (on ? '#8a847a' : '#b5afa5') : on ? '#2d3a6b' : '#7a7268', max: sw - 6 * u })
      if (!disabled) this.hits.push({ key: k, x: bx, y, w: sw, h, action: () => pick(v) })
    })
  }

  // ---------- sound: a speaker that mutes, a slider for the volume ----------
  speaker(cx, cy, s, color) {
    const g = this.g, snd = this.app.sound, on = snd.on && snd.vol > 0.02
    g.save()
    g.fillStyle = color; g.strokeStyle = color; g.lineCap = 'round'; g.lineJoin = 'round'; g.lineWidth = s * 0.09
    g.beginPath()
    g.moveTo(cx - s * 0.42, cy - s * 0.14); g.lineTo(cx - s * 0.22, cy - s * 0.14); g.lineTo(cx + s * 0.02, cy - s * 0.36)
    g.lineTo(cx + s * 0.02, cy + s * 0.36); g.lineTo(cx - s * 0.22, cy + s * 0.14); g.lineTo(cx - s * 0.42, cy + s * 0.14)
    g.closePath(); g.fill()
    if (!on) {
      g.beginPath(); g.moveTo(cx + s * 0.16, cy - s * 0.14); g.lineTo(cx + s * 0.42, cy + s * 0.14); g.moveTo(cx + s * 0.42, cy - s * 0.14); g.lineTo(cx + s * 0.16, cy + s * 0.14); g.stroke()
    } else {
      const waves = snd.vol > 0.66 ? 3 : snd.vol > 0.33 ? 2 : 1
      for (let i = 0; i < waves; i++) { g.beginPath(); g.arc(cx + s * 0.04, cy, s * (0.2 + i * 0.14), -0.8, 0.8); g.stroke() }
    }
    g.restore()
  }
  soundButton(key, x, y, s) {
    const hov = this.hover === key
    this.button(key, '', x, y, s, s, () => this.app.toggleSound(), { size: 14 })
    this.speaker(x + s / 2, y + s / 2 - (hov ? 2 * this.u : 0), s * 0.62, P.INK)
  }
  volumeSlider(key, x, y, w, h) {
    const g = this.g, u = this.u, app = this.app, snd = app.sound, v = snd.on ? snd.vol : 0
    const cy = y + h / 2, tr = 3 * u
    g.fillStyle = 'rgba(43,38,34,0.14)'; P.roundRect(g, x, cy - tr, w, tr * 2, tr); g.fill()
    if (v > 0) { g.fillStyle = '#e8743b'; P.roundRect(g, x, cy - tr, Math.max(tr * 2, w * v), tr * 2, tr); g.fill() }
    const kx = x + w * v, hov = this.hover === key || this.drag?.key === key
    g.fillStyle = '#ffffff'; g.strokeStyle = hov ? '#e8743b' : 'rgba(43,38,34,0.35)'; g.lineWidth = 1.5 * u
    g.beginPath(); g.arc(kx, cy, (hov ? 9 : 8) * u, 0, Math.PI * 2); g.fill(); g.stroke()
    this.hits.push({ key, x: x - 10 * u, y, w: w + 20 * u, h, action: () => {}, drag: px => app.setVolume((px - this.ox - x) / w), end: () => { app.saveSettings(); app.playSound('soundOn') } })
  }
  /** The title screens' corner: the slider, then the speaker. */
  soundControl() {
    const u = this.u, s = 36 * u, x = this.W - s - 14 * u, y = 14 * u
    this.soundButton('snd', x, y, s)
    if (this.W >= 320) this.volumeSlider('vol', x - 122 * u, y, 104 * u, s)
  }

  /** The web build: send the online room's link, or only its code where rooms have no links. */
  shareRoom() {
    const room = this.p0.web.room
    if (!room) return
    this.p0.web.share().then(r => {
      if (r === 'copied') this.say(room.link ? T.linkCopied : T.codeCopied(room.code), 4)
      else if (r === 'failed') this.say(T.copyFailed(room.code), 5)
    })
  }

  drawHelp() {
    const W = this.W, H = this.H, u = this.u, app = this.app
    const pw = Math.min(W - 20 * u, 780 * u), ph = Math.min(H - 20 * u, 600 * u)
    const x = (W - pw) / 2, y = (H - ph) / 2
    this.panel(x, y, pw, ph, { fill: 'rgba(255,253,248,0.96)' })
    this.text(this.helpPage === 0 ? T.howToPlay : T.theCards, W / 2, y + 30 * u, { size: 22, align: 'center' })
    // the web build's privacy policy, quietly in the corner (it opens in a new tab)
    if (this.helpPage === 0 && this.p0.web?.privacy) this.link('privacy', T.privacy, x + pw - 24 * u, y + 30 * u, () => this.p0.web.openPrivacy(), { size: 12, align: 'right' })
    // the web build: the First Match again, tips and all, between the buttons or (a narrow screen) over them
    const replay = this.helpPage === 0 && !!this.p0.web, rw = Math.min(180 * u, pw - 390 * u), beside = rw > 90 * u
    if (this.helpPage === 0) {
      const g = this.g
      let yy = y + 74 * u
      for (const [head, para] of T.rules) {
        this.text(head, x + 30 * u, yy, { size: 16, color: '#e8743b' }); yy += this.lineH(16, 23)
        g.font = this.font(15 * u, false)
        const lines = P.wrapText(g, para, pw - 60 * u)
        for (const l of lines) { this.text(l, x + 30 * u, yy, { size: 15, bold: false }); yy += this.lineH(15, 21) }
        yy += 12 * u
        if (yy > y + ph - (replay && !beside ? 108 : 70) * u) break
      }
    }
    this.button('helpback', T.back, x + 20 * u, y + ph - 56 * u, 130 * u, 40 * u, () => { app.screen = 'menu'; this.dirty = true })
    if (replay && beside) this.ghostButton('replay', T.replayTutorial, x + 160 * u + (pw - 370 * u - rw) / 2, y + ph - 54 * u, rw, 36 * u, () => app.startFirstMatch())
    else if (replay) this.ghostButton('replay', T.replayTutorial, W / 2 - 90 * u, y + ph - 98 * u, 180 * u, 36 * u, () => app.startFirstMatch())
    this.button('helpnext', this.helpPage === 0 ? T.theCards + ' →' : '← ' + T.rulesShort, x + pw - 200 * u, y + ph - 56 * u, 180 * u, 40 * u, () => { this.helpPage = 1 - this.helpPage; this.dirty = true }, { primary: true })
  }

  /**
   * A table's lobby: an online room, a Quick Match table or Project 0's Shared Table. The mode and the
   * seats on the left with Start under them; the table's settings (board, bots) beside them. The host
   * sets the table up. A Quick Match table plays as it was found and is here only for a moment: its
   * game starts at once. The channel's table (Discord) is the only one there is: no code, link or Back.
   */
  drawLobby() {
    const H = this.H, u = this.u, app = this.app, me = this.p0.me.id
    const lob = app.lobby(), isHost = this.p0.room.isHost, room = this.p0.web?.room
    const quick = app.quick(), channel = !!room?.channel
    const setUp = isHost && !quick
    const seats = lob.seats, n = seats.filter(Boolean).length, humans = seats.filter(s => s && !s.b).length
    const bots = seats.map((s, i) => (s?.b && !s.q ? i : -1)).filter(i => i >= 0)
    const L = this.menuLayout(this.menuW(660))
    const side = L.wide, gap = 24 * u, sideW = 230 * u
    const mw = side ? L.w - sideW - gap : L.w
    const cols = mw >= 400 * u ? 2 : 1, rowH = 42 * u, rowGap = 8 * u
    const seatsH = Math.ceil(6 / cols) * (rowH + rowGap)
    const modeH = 64 * u, headH = 76 * u
    const leftH = modeH + 16 * u + 32 * u + seatsH + 6 * u + 58 * u + 36 * u
    const pitch = 66 * u, panelH = 28 * u + (quick ? 0 : 2 * pitch) + 50 * u
    const blockH = headH + (side ? Math.max(leftH, panelH) : leftH + 12 * u + panelH)
    const x = L.x
    let y = Math.max(14 * u, (H - blockH) / 2)
    // the table's name, its room and host; on the right the way to bring friends
    const hostLine = isHost ? T.youHost : T.hostIs(app.nameOf(this.p0.room.host))
    const bw = Math.min(150 * u, L.w * 0.32)
    this.pageHead(x, y, L.w - bw - 8 * u, quick ? T.quickMatch : channel ? T.channelTable : room ? T.onlineRoom : T.sharedTable, room && !channel ? T.roomHead(room.code, hostLine) : hostLine, channel ? null : () => app.leaveLobby())
    if (room && !quick && !channel) this.button('share', room.link ? T.shareLink : T.shareCode, x + L.w - bw, y + 4 * u, bw, 38 * u, () => this.shareRoom(), { primary: true, color: '#2d3a6b', size: 14 })
    else if (!room) {
      const others = app.notSeated().length
      this.button('invite', T.invite + (others ? ` (${others})` : ''), x + L.w - bw, y + 4 * u, bw, 38 * u, () => { this.picker = true; this.dirty = true }, { size: 14, primary: others > 0, color: '#2d3a6b' })
    }
    y += headH
    const top = y
    // the mode: the host picks it; a quick table plays the one it was found for
    const cw = (mw - 14 * u) / 2
    const pick = m => (setUp ? () => { if (lob.mode !== m) app.playSound('option'); app.lobbyCmd({ t: 'mode', mode: m }) } : null)
    this.modeCard('champion', x, y, cw, modeH, lob.mode === 'champion', pick('champion'))
    this.modeCard('fool', x + cw + 14 * u, y, cw, modeH, lob.mode === 'fool', pick('fool'))
    y += modeH + 16 * u
    // the seats, and (at the Shared Table, where watching is fine) taking one or getting up
    this.text(T.seatsN(n), x, y + 13 * u, { size: 15, color: '#2d3a6b' })
    if (!room) {
      const mine = seats.some(s => s && s.id === me), sw = 128 * u
      if (!mine) this.button('sit', T.takeSeat, x + mw - sw, y, sw, 28 * u, () => app.lobbyCmd({ t: 'sit' }), { disabled: n >= 6, size: 13 })
      else this.button('stand', T.leaveSeat, x + mw - sw, y, sw, 28 * u, () => app.lobbyCmd({ t: 'stand' }), { size: 13 })
    }
    y += 32 * u
    const sw = (mw - (cols - 1) * 12 * u) / cols
    for (let i = 0; i < 6; i++) this.seatRow(i, seats[i], x + (i % cols) * (sw + 12 * u), y + Math.floor(i / cols) * (rowH + rowGap), sw, rowH, quick, setUp)
    y += seatsH + 6 * u
    // Start (the host), or a quick table's game on its way, or waiting for the host
    // (at the channel's table bots make up the players the game needs)
    const can = humans >= 1 && (channel || (n >= 2 && (lob.mode !== 'fool' || n >= 3)))
    if (quick) this.text(T.quickStarting, x + mw / 2, y + 27 * u, { size: 18, align: 'center', color: '#2d3a6b', max: mw })
    else if (isHost) this.playButton(x, y, mw, 54 * u, () => app.lobbyCmd({ t: 'start' }), { label: T.startGame, key: 'lstart', size: 24, disabled: !can })
    else this.text(T.waitingHost, x + mw / 2, y + 27 * u, { size: 15, align: 'center', color: '#5b544c', max: mw })
    y += 58 * u
    if (isHost && channel && n < (lob.mode === 'fool' ? 3 : 2)) this.text(T.botsMakeUp, x + mw / 2, y + 8 * u, { size: 12.5, align: 'center', bold: false, color: '#5b544c' })
    else if (isHost && !quick && lob.mode === 'fool' && n < 3) this.text(T.foolNeeds3, x + mw / 2, y + 8 * u, { size: 12.5, align: 'center', bold: false, color: '#d64545' })
    // the table: its board, and the bots (not at a quick table, where they sit as players)
    const px = side ? x + mw + gap : x, py = side ? top : top + leftH + 12 * u, pw = side ? sideW : L.w
    this.panel(px, py, pw, panelH, { fill: 'rgba(255,253,248,0.6)', stroke: 'rgba(43,38,34,0.1)', r: 14 })
    const ix = px + 16 * u, iw = pw - 32 * u
    let yy = py + 14 * u
    this.setLabel(T.board, ix, yy, iw)
    const size = lob.size || 100
    this.segmented('lsize', ix, yy + 20 * u, iw, SIZES, SIZES.map(String), size, s => app.lobbyCmd({ t: 'size', size: s }), !setUp)
    if (quick) { this.soundControl(); return }
    yy += pitch
    this.setLabel(T.bots, ix, yy, iw)
    this.miniStepper('lbots', ix, yy + 20 * u, iw, bots.length, () => app.lobbyCmd({ t: 'remove', seat: bots[bots.length - 1] }), () => app.lobbyCmd({ t: 'bot' }), setUp && bots.length > 0, setUp && n < 6)
    yy += pitch
    this.setLabel(T.level, ix, yy, iw)
    const level = lob.level || seats[bots[0]]?.b || 2
    this.segmented('llvl', ix, yy + 20 * u, iw, [1, 2, 3], T.levels, level, b => app.lobbyCmd({ t: 'level', b }), !setUp || !bots.length)
    this.soundControl()
  }
  /** A seat at the table: its colour, who sits there (a bot says so, except a quick table's) and, for the host, ✕ for a bot. */
  seatRow(i, s, x, y, w, h, quick, setUp) {
    const g = this.g, u = this.u, mine = s && s.id === this.p0.me.id
    this.panel(x, y, w, h, { fill: s ? '#ffffff' : 'rgba(255,255,255,0.4)', stroke: mine ? 'rgba(232,116,59,0.8)' : 'rgba(43,38,34,0.16)', r: 12, lw: mine ? 2 : 1.5 })
    const cx = x + 20 * u, cy = y + h / 2
    // (a player's avatar where the site has one, in their colour)
    const pic = s && !s.b ? this.picture(s.id) : null
    if (pic) this.pictureDisc(pic, cx, cy, 13 * u, P.PLAYER_COLORS[i])
    else {
      g.beginPath(); g.arc(cx, cy, 8 * u, 0, Math.PI * 2)
      if (s) { g.fillStyle = P.PLAYER_COLORS[i]; g.fill() } else { g.strokeStyle = P.PLAYER_COLORS[i]; g.lineWidth = 2 * u; g.setLineDash([3 * u, 3 * u]); g.stroke(); g.setLineDash([]) }
    }
    if (!s) { this.text(quick ? T.waitingSeat : T.openSeat, x + 38 * u, cy, { size: 13.5, bold: false, color: '#9a948a', max: w - 48 * u }); return }
    const bot = s.b && !s.q, host = !s.b && s.id === this.p0.room.host
    const tag = bot ? T.botTag(T.levels[s.b - 1] || '') : host ? T.hostTag : ''
    const rm = setUp && bot ? 30 * u : 0
    let right = x + w - 8 * u - (rm ? rm + 4 * u : 0)
    if (tag) {
      g.font = this.font(11.5 * u)
      const tw = g.measureText(tag).width + 14 * u
      g.fillStyle = bot ? 'rgba(45,58,107,0.1)' : 'rgba(42,168,118,0.14)'; P.roundRect(g, right - tw, cy - 10 * u, tw, 20 * u, 10 * u); g.fill()
      this.text(tag, right - tw / 2, cy + 1, { size: 11.5, align: 'center', color: bot ? '#2d3a6b' : '#1f7a55' })
      right -= tw + 6 * u
    }
    this.text(mine ? T.mine(s.n) : s.n, x + 38 * u, cy + 1, { size: 14.5, max: right - x - 38 * u })
    if (rm) this.iconButton('rm' + i, x + w - 8 * u - rm, cy - rm / 2, rm, () => this.app.lobbyCmd({ t: 'remove', seat: i }), (mx, my, sz, col) => this.cross(mx, my, sz * 0.55, col))
  }

  /** The Shared Table's invite list: everyone in the lot who is not sitting here, and the city's invitation. */
  drawPicker() {
    const W = this.W, H = this.H, u = this.u, app = this.app
    const ids = app.notSeated().slice(0, 6)
    const rows = Math.max(1, ids.length)
    const pw = Math.min(W - 20 * u, 430 * u), ph = (128 + rows * 46 + 64) * u
    const x = (W - pw) / 2, y = Math.max(10 * u, (H - ph) / 2)
    this.modal = true
    this.blockScreen()
    this.fillScreen('rgba(30,26,22,0.35)')
    this.panel(x, y, pw, ph, { fill: 'rgba(255,253,248,0.98)', stroke: '#2d3a6b', lw: 2.5 })
    this.text(T.inviteTitle, W / 2, y + 32 * u, { size: 21, align: 'center', color: '#2d3a6b' })
    const room = this.p0.web?.room
    this.text(room ? T.roomSub : T.inviteSub, W / 2, y + 58 * u, { size: 12.5, align: 'center', bold: false, color: '#5b544c', max: pw - 30 * u })
    const bx = x + 20 * u, bw = pw - 40 * u
    let yy = y + 80 * u
    if (!ids.length) this.text(room ? (room.link ? T.noOneRoom : T.noOneRoomCode(room.code)) : T.noOneHere, W / 2, yy + 20 * u, { size: 14, align: 'center', bold: false, color: '#9a948a', max: bw })
    ids.forEach((id, i) => {
      const ry = yy + i * 46 * u
      this.panel(bx, ry, bw, 40 * u, { fill: '#ffffff', r: 10 })
      const p = this.p0.players.get(id)
      this.g.fillStyle = p?.color || '#9a948a'
      this.g.beginPath(); this.g.arc(bx + 20 * u, ry + 20 * u, 8 * u, 0, Math.PI * 2); this.g.fill()
      this.text(app.nameOf(id), bx + 38 * u, ry + 14 * u, { size: 14.5, max: bw - 160 * u })
      const st = app.status.get(id)
      if (st && T.status[st]) this.text(T.status[st], bx + 38 * u, ry + 29 * u, { size: 11.5, bold: false, color: '#5b544c', max: bw - 160 * u })
      const last = app.invSent.get(id), sent = last != null && this.p0.time - last < 8
      this.button('inv' + id, sent ? T.inviteSentShort : T.inviteOne, bx + bw - 110 * u, ry + 5 * u, 100 * u, 30 * u, () => { app.invitePlayer(id); this.dirty = true }, { primary: !sent, disabled: sent, size: 14 })
    })
    const by = y + ph - 56 * u
    if (room) this.button('invlink', room.link ? T.shareLink : T.shareCode, bx, by, bw * 0.6 - 4 * u, 42 * u, () => this.shareRoom(), { size: 14, primary: !ids.length, color: '#2d3a6b' })
    else this.button('invcity', T.inviteCity, bx, by, bw * 0.6 - 4 * u, 42 * u, () => { try { this.p0.invite({ kind: 'team', note: T.inviteNote }) } catch { /* the city's own button does it */ } this.say(T.inviteHint, 4) }, { size: 14 })
    this.button('invclose', T.close, bx + bw * 0.6 + 4 * u, by, bw * 0.4 - 4 * u, 42 * u, () => { this.picker = false; this.dirty = true }, { size: 15 })
  }

  /** An invitation to the Shared Table from someone in the lot, over whatever is on screen. */
  drawInvite() {
    const W = this.W, H = this.H, u = this.u, app = this.app
    const inv = app.invite
    const ending = app.screen === 'game' && app.table?.kind === 'solo' && app.table.s.ph !== 'over'
    const pw = Math.min(W - 20 * u, 400 * u), ph = (ending ? 196 : 174) * u
    const x = (W - pw) / 2, y = Math.max(10 * u, H * 0.3 - ph / 2)
    this.modal = true
    this.blockScreen()
    this.fillScreen('rgba(30,26,22,0.3)')
    this.panel(x, y, pw, ph, { fill: 'rgba(255,253,248,0.99)', stroke: '#e8743b', lw: 3 })
    const p = this.p0.players.get(inv.from)
    this.g.fillStyle = p?.color || '#2d3a6b'
    this.g.beginPath(); this.g.arc(W / 2, y + 2 * u, 16 * u, 0, Math.PI * 2); this.g.fill()
    this.text('✉', W / 2, y + 3 * u, { size: 16, align: 'center', color: '#ffffff' })
    this.text(T.invitedBy(app.nameOf(inv.from)), W / 2, y + 42 * u, { size: 20, align: 'center', color: '#2d3a6b', max: pw - 30 * u })
    this.text(T.invitedTo, W / 2, y + 70 * u, { size: 14, align: 'center', bold: false, max: pw - 30 * u })
    if (ending) this.text(T.inviteEnds, W / 2, y + 94 * u, { size: 12.5, align: 'center', bold: false, color: '#d64545', max: pw - 30 * u })
    const by = y + ph - 58 * u, bw = (pw - 52 * u) / 2
    this.button('invyes', T.joinTable, x + 20 * u, by, bw + 20 * u, 44 * u, () => app.acceptInvite(), { primary: true, size: 16 })
    this.button('invno', T.notNow, x + 32 * u + bw + 20 * u, by, bw - 20 * u, 44 * u, () => app.declineInvite(), { size: 15 })
  }

  // ---------- the game screen ----------
  drawGame() {
    const app = this.app, view = app.view
    const s = view.state
    if (!s) return
    const W = this.W, H = this.H, u = this.u
    const me = app.mySeat()
    const myTurn = me >= 0 && s.cur === me && s.ph !== 'over'
    const busy = view.busy || app.waiting
    const hot = app.hotseat()
    const curtain = app.curtain()
    // players panel: the highest on the board at the top, the rows slide when places change
    // (on a small screen no narrower or lower than its text, kept big there, needs)
    const pw = this.narrow ? W - 20 * u : Math.max(236 * u, 186)
    const rowH = this.narrow ? 38 * u : Math.max(48 * u, 38)
    const cols = this.narrow ? 2 : 1
    const colW = (pw - (cols - 1) * 6 * u) / cols
    // (on a phone held upright the status stands at the top beside the corner buttons, the players under them)
    const cb = Math.max(40 * u, 32), rx = W - cb - 10 * u, cornerX = rx - 2 * cb - 26 * u
    const px = 10 * u, py = this.narrow ? 58 * u : 10 * u
    const tgtPlayers = this.target && this.target.kind === 'player' ? this.target.list : null
    const { order, leader, last } = this.standing(s)
    if (this.rowsGid !== s.gid || this.rowsCols !== cols) { this.rows.clear(); this.rowsGid = s.gid; this.rowsCols = cols }
    order.forEach((i, k) => {
      const want = [k % cols, Math.floor(k / cols)]
      const at = this.rows.get(i)
      if (!at) this.rows.set(i, { at: [...want], want })
      else at.want = want
    })
    // rows that slide are drawn under the ones in place
    const drawOrder = [...order].sort((a, b) => (this.rows.get(a).at[1] === this.rows.get(a).want[1] ? 1 : 0) - (this.rows.get(b).at[1] === this.rows.get(b).want[1] ? 1 : 0))
    this.rowRect = []
    drawOrder.forEach(i => {
      const p = s.pl[i], at = this.rows.get(i).at
      const cx = px + at[0] * (colW + 6 * u), cy = py + at[1] * (rowH + 5 * u)
      this.rowRect[i] = { x: cx, y: cy, w: colW, h: rowH }
      const active = s.cur === i && s.ph !== 'over'
      const valid = tgtPlayers && tgtPlayers.includes(i)
      const sel = valid && this.target.sel === i
      this.panel(cx, cy, colW, rowH, { fill: sel ? '#fff1c4' : valid ? '#fffbe9' : p.d ? 'rgba(240,240,236,0.9)' : 'rgba(255,255,255,0.93)', stroke: active ? P.PLAYER_COLORS[p.c % 6] : valid ? '#e0a400' : 'rgba(43,38,34,0.16)', lw: active || valid ? 3 : 1.5, r: 10 })
      const g = this.g
      if (i === leader) this.rowHalo(cx, cy, colW, rowH, 'gold')
      else if (i === last) this.rowHalo(cx, cy, colW, rowH, 'gloom')
      // the player's avatar where the site has one (not while a bot plays the seat), else their initial
      const pic = p.b ? null : this.picture(p.id)
      if (pic) this.pictureDisc(pic, cx + rowH / 2, cy + rowH / 2, rowH * 0.32, P.PLAYER_COLORS[p.c % 6])
      else {
        g.fillStyle = P.PLAYER_COLORS[p.c % 6]
        g.beginPath(); g.arc(cx + rowH / 2, cy + rowH / 2, rowH * 0.32, 0, Math.PI * 2); g.fill()
        this.initial(p.n, cx + rowH / 2, cy + rowH / 2 + 1, this.narrow ? 13 : 16)
      }
      const nx = cx + rowH * 0.95
      const sub = p.d ? T.place(p.d) : p.pos <= 0 ? T.atStart : T.cellTier(p.pos)
      if (this.narrow) {
        this.text(p.n + (i === me && !hot ? ' ★' : ''), nx, cy + rowH * 0.32, { size: 13.5, max: colW - rowH - 34 * u })
        this.text(sub, nx, cy + rowH * 0.71, { size: 11.5, bold: false, color: '#5b544c', max: colW - rowH - 34 * u })
      } else {
        // (a Quick Match table's bots, keeping their seats for players, sit there as players do)
        this.text((i === me && !hot ? T.mine(p.n) : p.n) + (p.b && !p.f ? ' · bot' : ''), nx, cy + rowH / 3, { size: 14.5, max: colW - rowH - 50 * u })
        // the cell and tier, or only the cell where the text (kept big on a small screen) would run into the effects
        const nfx = Math.min(5, Object.keys(p.fx).filter(k => FX[k]).length)
        const room = cx + colW - 26 * u - (nfx ? 34 * u + (nfx - 1) * 20 * u : 12 * u) - 4 * u - nx
        g.font = this.font(12 * u, false)
        const fits = g.measureText(sub).width <= room
        this.text(fits || p.d || p.pos <= 0 ? sub : T.cellShort(p.pos), nx, cy + rowH * 0.71, { size: 12, bold: false, color: '#5b544c', max: room })
      }
      // cards in hand and effects
      const hx = cx + colW - 26 * u
      g.fillStyle = '#2d3a6b'
      P.roundRect(g, hx - 8 * u, cy + rowH / 2 - 11 * u, 16 * u, 22 * u, 3 * u); g.fill()
      this.text(String(p.h.length), hx, cy + rowH / 2 + 1, { size: 12, color: '#ffffff', align: 'center' })
      const fx = Object.keys(p.fx).filter(k => FX[k])
      // (an effect under the pointer tells what it does, a click shows its card; not while a card waits for its target)
      const fxHits = []
      if (!this.narrow) fx.slice(0, 5).forEach((k, j) => {
        const ix = hx - 26 * u - j * 20 * u, iy = cy + rowH * 0.71, key = 'fx' + i + k
        if (this.hover === key) { g.fillStyle = 'rgba(123,92,224,0.16)'; g.beginPath(); g.arc(ix, iy, 11 * u, 0, Math.PI * 2); g.fill() }
        P.drawIcon(g, FX[k].card, ix, iy, 16 * u, P.CAT_COLORS[FX[k].card[0]])
        if (p.fx[k].t) this.text(String(p.fx[k].t), ix + 8 * u, iy - 6 * u, { size: 10 })
        fxHits.push({ key, x: ix - 10 * u, y: iy - 11 * u, w: 20 * u, h: 22 * u, fx: { p: i, k }, action: () => this.openFx(i, [k], ix, iy) })
      })
      else if (fx.length) {
        // on a phone the count stands for them: a tap shows them all
        this.text('✦' + fx.length, hx - 22 * u, cy + rowH / 2, { size: 12, color: '#7b5ce0', align: 'center' })
        fxHits.push({ key: 'fx' + i, x: hx - 36 * u, y: cy, w: 28 * u, h: rowH, action: () => this.openFx(i, fx, hx - 22 * u, cy + rowH / 2) })
      }
      if (valid) this.hits.push({ key: 'pl' + i, x: cx, y: cy, w: colW, h: rowH, action: () => this.chooseTarget(i) })
      else if (this.wardedAt(i)) this.hits.push({ key: 'ward' + i, x: cx, y: cy, w: colW, h: rowH, action: () => this.sayWarded(i) })
      if (!this.target) this.hits.push(...fxHits)
    })
    const panelBottom = py + Math.ceil(s.pl.length / cols) * (rowH + 5 * u)
    this.panelBottom = panelBottom
    this.gameLeft = this.narrow ? 0 : px + pw + 10 * u // the messages at the top keep clear of the players
    // status
    let status
    if (s.ph === 'over') status = s.mode === 'champion' ? T.wins(s.pl[s.res.winner].n) : T.isFool(s.pl[s.res.fool].n)
    else if (curtain >= 0) status = T.passTo(s.pl[curtain].n)
    else if (this.target) status = this.target.kind === 'cell2' ? T.chooseTwoCells : T.chooseTarget
    else if (myTurn && s.ph === 'disc') status = T.chooseDiscard
    else if (myTurn && s.ph === 'pick') status = T.chooseDie
    else if (myTurn && s.ph === 'take') status = T.chooseCard
    else if (myTurn && s.frozen && !s.rolled) status = T.cantPlay
    else if (myTurn) status = s.rolled ? T.playOrEnd : hot ? T.turnOf(s.pl[me].n) : T.yourTurn
    else status = T.waitingFor(s.pl[s.cur].n)
    const sw = this.narrow ? cornerX - 20 * u : Math.min(W - 20 * u, Math.max(260 * u, this.measure(status, 17) + 60 * u))
    const sy = 10 * u
    const sx = this.narrow ? 10 * u : Math.max(pw + 20 * u, (W - sw) / 2)
    this.panel(sx, sy, sw, 40 * u, { fill: myTurn ? '#2d3a6b' : 'rgba(255,255,255,0.93)', r: 20 })
    this.statusRect = { x: sx, y: sy, w: sw, h: 40 * u }
    this.text(status, sx + sw / 2, sy + 21 * u, { size: 17, align: 'center', color: myTurn ? '#ffffff' : P.INK, max: sw - 20 * u })
    if (!this.narrow) this.text(T.round(s.round, CFG.roundLimit) + (s.mode === 'fool' ? ' · Fool' : ' · Champion'), sx + sw / 2, sy + 52 * u, { size: 11.5, align: 'center', bold: false, color: '#5b544c' })
    if (app.turnLeft != null && myTurn) this.text(`${Math.ceil(app.turnLeft)} s`, sx + sw - 30 * u, sy + 21 * u, { size: 14, align: 'center', color: app.turnLeft < 10 ? '#ffb4a8' : '#ffffff' })
    // corner buttons: menu, speed, sound, zoom
    this.button('menu', '☰', rx, 10 * u, cb, cb, () => app.openGameMenu(), { size: 18 })
    this.button('speed', `${app.speedLabel()}`, rx - cb - 18 * u, 10 * u, cb + 10 * u, cb, () => app.cycleSpeed(), { size: 14 })
    this.soundButton('snd', rx - 2 * cb - 26 * u, 10 * u, cb)
    const zy = this.narrow ? panelBottom + 6 * u : 24 * u + cb
    this.button('zin', '+', rx, zy, cb, cb, () => app.view.zoom(0.8), { size: 20 })
    this.button('zout', '−', rx, zy + cb + 6 * u, cb, cb, () => app.view.zoom(1.25), { size: 20 })
    this.button('zall', '⤢', rx, zy + 2 * (cb + 6 * u), cb, cb, () => app.view.overview(), { size: 18 })
    this.zoomX = rx; this.zoomW = cb; this.zoomBottom = zy + 3 * cb + 12 * u // (the log's button goes under them where the log has no room)
    // the dice tray (the view draws the dice into it): it shows a roll, waits with a gold frame for my click
    // to roll, offers the values of a chosen roll, and once I have rolled it ends my turn
    const handTop = H - this.handHeight()
    const { x: tx, y: ty, w: tw, h: th } = this.trayBox()
    const pmy = me >= 0 ? s.pl[me] : null
    const ready = myTurn && s.ph === 'main' && curtain < 0 && !busy && !app.menuOpen && !app.invite
    const choose = ready && !s.rolled && !this.target ? choiceMax(pmy.fx) : 0
    const prompt = this.promptN > 0 && s.cur === me
    const picking = myTurn && s.ph === 'pick' && s.pick && curtain < 0 && !busy && !app.menuOpen && !app.invite
    this.trayMode = prompt ? 'roll' : picking ? 'pick' : ready && s.rolled ? 'end' : choose ? 'choose' : 'show' // the tray always stands in its corner
    this.trayTop = null
    if (this.trayMode) {
      const g = this.g, mode = this.trayMode
      this.panel(tx - 4 * u, ty - 4 * u, tw + 8 * u, th + 8 * u, { fill: '#fffdf8', stroke: mode === 'roll' || mode === 'end' ? null : undefined, r: 12 })
      this.trayRect = { x: tx, y: ty, w: tw, h: th }
      if (mode === 'roll' || mode === 'show' || mode === 'pick') this.trayDice = { x: tx + this.ox, y: ty + this.oy, w: tw, h: th, close: this.narrow }
      const k = tw / (354 * u) // the tray's size against the desktop one
      // labels go under the tray, or over it on a phone where the hand is under it
      const ly = this.narrow ? ty - 22 * u : ty + th + 18 * u
      const pill = label => {
        const lw = this.measure(label, 14) + 30 * u
        this.panel(tx + tw / 2 - lw / 2, ly - 13 * u, lw, 26 * u, { fill: '#2d3a6b', stroke: null, r: 13 })
        this.text(label, tx + tw / 2, ly + 1, { size: 14, align: 'center', color: '#ffffff' })
      }
      const hit = action => this.hits.push({ key: 'tray', x: tx - 10 * u, y: ty - 10 * u, w: tw + 20 * u, h: th + 20 * u, action })
      if (mode === 'roll') {
        pill(this.narrow ? T.tapToRoll : T.clickToRoll)
        hit(() => { if (this.target) this.cancelTarget(); app.act({ t: 'roll' }) })
      } else if (mode === 'end') {
        // no dice: the paper itself says End Turn, glowing
        g.save()
        g.shadowColor = 'rgba(255,184,40,0.95)'; g.shadowBlur = 22 * u * k
        const lift = this.hover === 'tray' ? 2 * u : 0
        const es = this.narrow ? tw / u / 5.4 : 40 * k
        for (let i = 0; i < 2; i++) this.text(T.endTurn, tx + tw / 2, ty + th / 2 - lift, { size: es, align: 'center', color: '#2d3a6b', max: tw - 16 * u })
        g.restore()
        if (!this.narrow) pill(T.clickToEnd)
        hit(() => { if (this.target) this.cancelTarget(); app.act({ t: 'end' }) })
      } else if (mode === 'pick') {
        // Choose Your Roll: the dice lie in the tray side by side (two, three with an Extra Die), each takes a click
        pill(this.narrow ? T.tapDie : T.pickDie)
        const n = s.pick.d.length, dw = (tw + 20 * u) / n
        for (let i = 0; i < n; i++) this.hits.push({ key: 'die' + i, x: tx - 10 * u + i * dw, y: ty - 10 * u, w: dw, h: th + 20 * u, action: () => this.choose('pick', i) })
      } else if (mode === 'choose' && this.narrow) {
        // the small tray says what to do; the values stand in a grid beside it, big enough for a finger
        const n = choose, lines = this.wrap(pmy.fx.bk ? T.chooseBack : T.chooseValue, 15, tw - 16 * u)
        lines.forEach((l, i) => this.text(l, tx + tw / 2, ty + th / 2 + (i - (lines.length - 1) / 2) * this.lineH(15, 19), { size: 15, align: 'center', color: '#2d3a6b', max: tw - 12 * u }))
        const gx = tx + tw + 12 * u, gw = W - 10 * u - gx, rows = n > 3 ? 2 : 1, cols = Math.ceil(n / rows), gap = 8 * u
        const bw = (gw - gap * (cols - 1)) / cols, bh = Math.min(56 * u, (th - gap * (rows - 1)) / rows), gy = ty + (th - rows * bh - (rows - 1) * gap) / 2
        for (let v = 1; v <= n; v++) this.button('v' + v, String(v), gx + ((v - 1) % cols) * (bw + gap), gy + Math.floor((v - 1) / cols) * (bh + gap), bw, bh, () => app.act({ t: 'roll', v }), { primary: true, color: pmy.fx.gd ? '#c99400' : '#7b5ce0', size: 22 })
      } else if (mode === 'choose') {
        this.text(pmy.fx.bk ? T.chooseBack : T.chooseValue, tx + tw / 2, ty + th * 0.24, { size: 20 * k, align: 'center', color: '#2d3a6b' })
        const n = choose, gap = 6 * u, w = Math.min((tw - 16 * u) / n - gap, 64 * u * k), bh = Math.min(th * 0.44, 62 * u * k)
        const x0 = tx + (tw - n * (w + gap) + gap) / 2
        for (let v = 1; v <= n; v++) this.button('v' + v, String(v), x0 + (v - 1) * (w + gap), ty + th * 0.42, w, bh, () => app.act({ t: 'roll', v }), { primary: true, color: pmy.fx.gd ? '#c99400' : '#7b5ce0', size: 24 * k })
      } else if (app.view.trayLabel) this.text(app.view.trayLabel, tx + tw / 2, ly, { size: 16, align: 'center' })
      this.trayTop = this.narrow ? ly - 16 * u : ty - 6 * u
    }
    // Cancel while a card waits for its target: over the tray, or by the hand on a phone
    if (s.ph !== 'over' && curtain < 0 && this.target) {
      const bw = this.narrow ? 132 * u : 170 * u, bh = 50 * u
      this.button('cancel', T.cancel, W - bw - 12 * u, this.narrow ? handTop - bh - 10 * u : ty - bh - 36 * u, bw, bh, () => this.cancelTarget(), { size: 18 })
    }
    // log
    this.drawLog()
    // back at the Shared Table while a bot plays my seat: the way to take it back
    const back = app.seatToTakeBack()
    if (back >= 0 && !app.menuOpen && !app.invite) this.drawTakeBack(s.pl[back])
    else if (app.watching() && !app.menuOpen && !app.invite) this.drawWatching()
  }
  /** A box `ph` tall at the bottom, where my hand goes: clear of the log and the dice tray. */
  handBox(ph) {
    const W = this.W, H = this.H, u = this.u
    const left = !this.narrow && this.logRect ? this.logRect.x + this.logRect.w + 10 * u : 10 * u
    const right = this.narrow ? W - 10 * u : this.trayBox().x - 14 * u
    const pw = Math.min(380 * u, right - left)
    return { x: THREE.MathUtils.clamp((W - pw) / 2, left, right - pw), y: H - ph - (this.narrow ? 12 * u : 46 * u), pw, ph }
  }
  /** Watching the channel's game with no seat in it: a word where my hand would be that the next game has one. */
  drawWatching() {
    const u = this.u, { x, y, pw, ph } = this.handBox(66 * this.u)
    this.panel(x, y, pw, ph, { fill: 'rgba(255,253,248,0.94)', stroke: 'rgba(45,58,107,0.35)', lw: 2 })
    this.text(T.watching, x + pw / 2, y + 24 * u, { size: 15.5, align: 'center', max: pw - 24 * u })
    this.text(T.watchingNext, x + pw / 2, y + 46 * u, { size: 12.5, align: 'center', bold: false, color: '#5b544c', max: pw - 24 * u })
  }
  /** At the bottom, where my hand goes once the seat is mine again: clear of the log and the dice tray. */
  drawTakeBack(p) {
    const u = this.u, app = this.app
    const { x, y, pw, ph } = this.handBox(108 * u)
    const color = P.PLAYER_COLORS[p.c % 6]
    this.panel(x, y, pw, ph, { fill: 'rgba(255,253,248,0.97)', stroke: color, lw: 3 })
    this.text(T.botPlaysForYou, x + pw / 2, y + 27 * u, { size: 16, align: 'center', max: pw - 24 * u })
    this.button('takeback', T.continuePlaying, x + 20 * u, y + 50 * u, pw - 40 * u, 44 * u, () => app.takeSeatBack(), { primary: true, color, disabled: app.waiting > 0, size: 18 })
  }
  /** The peeked hand stays until the end of the turn; I can put it away sooner, and then the turn ends after the roll as usual. */
  peekKey(s) { return s?.peek ? `${s.gid}:${s.turnNo}:${s.peek.tg}` : null }
  closePeek() { if (this.peekRect) { this.peekClosed = this.peekKey(this.app.view.state); this.dirty = true; this.sendUnpeek(); return true } return false }
  /** A player's effects (keys of fx) shown as their cards, coming from x, y (the icon clicked) until ✕ or a click beside them. */
  openFx(p, keys, x, y) {
    const s = this.app.view.state
    if (!s || !keys.length) return
    this.fxOpen = { gid: s.gid, p, keys, x, y }
    this.app.sfx('effects')
    this.dirty = true
  }
  closeFx() { if (this.fxOpen) { this.fxOpen = null; this.dirty = true; return true } return false }
  /** The effects window on screen: it goes with its game, a hand passed on or the game over; it waits under the menu. */
  fxShown() {
    const f = this.fxOpen, app = this.app, s = app.view.state
    if (!f) return null
    if (app.screen !== 'game' || !s || s.gid !== f.gid || s.ph === 'over' || app.curtain() >= 0) { this.fxOpen = null; this.dirty = true; return null }
    return app.menuOpen || app.invite ? null : f
  }
  /** Tells the rules the peeked hand is put away, once the table is still (it may be busy when the window closes). */
  sendUnpeek() {
    const app = this.app, s = app.view.state, me = app.mySeat()
    if (!s?.peek || s.peek.by !== me || s.cur !== me || this.peekClosed !== this.peekKey(s) || this.unpeekSent === this.peekClosed) return
    if (app.view.busy || app.waiting > 0) return
    this.unpeekSent = this.peekClosed
    app.act({ t: 'unpeek' })
  }

  /** The game's windows over the cards: whose turn it is at one computer, the results, the game menu. */
  drawGameWindows() {
    const app = this.app, s = app.view.state
    if (!s) return
    const W = this.W, H = this.H, u = this.u
    // another player's hand, seen with Peek: over everything, the cards over the window
    if (this.peekRect && s.peek) {
      const r = this.peekRect
      this.panel(r.x - 12 * u, r.y - 34 * u, r.w + 24 * u, r.h + 46 * u, { fill: 'rgba(255,253,248,0.96)', stroke: 'rgba(43,38,34,0.25)' })
      this.text(T.handOf(s.pl[s.peek.tg].n), r.x + r.w / 2, r.y - 17 * u, { size: 15, align: 'center' })
      if (r.empty) this.text(T.noCards, r.x + r.w / 2, r.y + r.h / 2, { size: 14, align: 'center', bold: false, color: '#5b544c' })
      const cb = 34 * u
      this.button('peekx', '✕', r.x + r.w + 12 * u - cb - 2 * u, r.y - 34 * u + 2 * u, cb, cb, () => this.closePeek(), { size: 15 })
    }
    if (this.offerRect && s.ph === 'take') {
      const r = this.offerRect, head = this.offerHead(), t1 = this.lineH(17, 19), top = r.y - head + Math.max(6 * u, (head - t1 - this.lineH(12, 19)) / 2)
      this.panel(r.x - 14 * u, r.y - head, r.w + 28 * u, r.h + head + 14 * u, { fill: 'rgba(255,253,248,0.96)', stroke: P.CAT_COLORS.C, lw: 3 })
      this.text(T.chooseCard, r.x + r.w / 2, top + t1 / 2, { size: 17, align: 'center', color: '#2d3a6b' })
      this.text(T.chooseCardHint, r.x + r.w / 2, top + t1 + this.lineH(12, 19) / 2, { size: 12, align: 'center', bold: false, color: '#5b544c', max: r.w + 20 * u })
    }
    const fr = this.fxShown() && this.fxRect
    if (fr) this.drawFxWindow(fr)
    else if (!this.touch && !app.menuOpen) {
      const h = this.hits.find(h => h.fx && h.key === this.hover)
      if (h) this.drawFxTip(h)
    }
    const curtain = app.curtain()
    if (curtain >= 0) this.drawCurtain(s.pl[curtain])
    if (s.ph === 'over' && !(app.view.busy || app.waiting)) this.drawResults(s, app.mySeat())
    if (curtain >= 0 || s.ph === 'over' || app.menuOpen) this.modal = true
    if (app.menuOpen && app.confirmSkip) {
      // leaving the First Match: its tips go for good
      const mw = Math.min(W - 20 * u, 340 * u), mh = 168 * u
      const mx = (W - mw) / 2, my = (H - mh) / 2, bw = (mw - 60 * u) / 2
      this.panel(mx, my, mw, mh, { fill: 'rgba(255,253,248,0.97)' })
      this.text(T.skipTitle, W / 2, my + 34 * u, { size: 20, align: 'center', max: mw - 30 * u })
      this.text(T.skipText, W / 2, my + 66 * u, { size: 14, align: 'center', bold: false, color: '#5b544c', max: mw - 30 * u })
      this.button('keepplaying', T.keepPlaying, mx + 20 * u, my + mh - 64 * u, bw, 44 * u, () => { app.confirmSkip = false; app.menuOpen = false; this.dirty = true }, { primary: true, size: 16 })
      this.button('skiptut', T.skip, mx + 40 * u + bw, my + mh - 64 * u, bw, 44 * u, () => { app.skipTutorial(); app.toMenu() }, { size: 16 })
    } else if (app.menuOpen) {
      const web = !!this.p0.web
      // at the channel's table there is nowhere else to go: the host can end the game (back to the lobby), the others play on
      const channel = app.atChannel() && app.table?.kind === 'shared', leave = !channel || this.p0.room.isHost
      const top = (web ? 262 : 310) - (leave ? 0 : 48)
      const mw = Math.min(W - 20 * u, Math.max(320 * u, 300))
      // the controls, which used to stand over the players' list, are told here
      const keys = this.wrap(T.controls, 11.5, mw - 36 * u, false), klh = this.lineH(11.5, 15)
      const mh = top * u + keys.length * klh + 14 * u
      const mx = (W - mw) / 2, my = (H - mh) / 2, bx = mx + 24 * u, bw = mw - 48 * u
      this.panel(mx, my, mw, mh, { fill: 'rgba(255,253,248,0.97)' })
      this.text(T.menuTitle, W / 2, my + 30 * u, { size: 20, align: 'center' })
      this.button('resume', T.resume, bx, my + 60 * u, bw, 44 * u, () => app.openGameMenu(), { primary: true })
      this.button('speed2', `Speed: ${app.speedLabel()}`, bx, my + 112 * u, bw, 40 * u, () => app.cycleSpeed(), { size: 15 })
      // sound: the speaker mutes, the slider sets the volume
      this.soundButton('snd2', bx, my + 160 * u, 40 * u)
      this.volumeSlider('vol2', bx + 58 * u, my + 160 * u, bw - 68 * u, 40 * u)
      if (leave) this.button('leave', channel ? T.endGame : T.leaveGame, bx, my + 208 * u, bw, 40 * u, () => app.leaveGame(), { size: 15 })
      if (!web) this.button('exitcity', T.exitCity, bx, my + 256 * u, bw, 40 * u, () => { app.menuOpen = false; this.p0.exit() }, { size: 15, primary: true, color: '#d64545' })
      keys.forEach((l, i) => this.text(l, W / 2, my + (top + 6) * u + i * klh, { size: 11.5, align: 'center', bold: false, color: '#5b544c', max: mw - 30 * u }))
    }
  }

  /** A player's effects as their cards (the cards themselves go over it, see layoutCards): ✕ or a click beside it closes it. */
  drawFxWindow(r) {
    const s = this.app.view.state, u = this.u
    this.modal = true
    this.hits.push({ key: 'block', x: -this.ox, y: -this.oy, w: this.FW, h: this.FH, action: () => this.closeFx() })
    this.fillScreen('rgba(30,26,22,0.3)')
    const x = r.x - 16 * u, y = r.y - r.head, w = r.w + 32 * u, h = r.head + r.h + r.foot
    this.panel(x, y, w, h, { fill: 'rgba(255,253,248,0.97)', stroke: 'rgba(43,38,34,0.25)' })
    this.hits.push({ key: 'block', x, y, w, h, action: () => {} }) // (a click on the window itself leaves it open)
    const cb = 34 * u
    this.text(T.effectsOf(s.pl[r.p].n, r.notes.length), x + w / 2, y + r.head / 2, { size: 16, align: 'center', max: w - 2 * cb - 16 * u })
    r.notes.forEach((t, k) => {
      const cx = r.x + r.pw / 2 + k * r.pw * r.gap
      let ly = r.y + r.h + 10 * u + r.lh / 2
      for (const l of t.lines) { this.text(l, cx, ly, { size: 13, align: 'center', bold: false, color: '#5b544c' }); ly += r.lh }
      if (t.left) this.text(t.left, cx, ly, { size: 13, align: 'center', color: t.gone ? '#9a948a' : '#7b5ce0', max: r.pw * 1.04 })
    })
    this.button('fxclose', '✕', x + w - cb - 6 * u, y + 6 * u, cb, cb, () => this.closeFx(), { size: 15 })
  }
  /** The effect under the pointer in the players panel: its card's name, what it does to the player, the turns it has left. */
  drawFxTip(h) {
    const s = this.app.view.state, u = this.u, { p, k } = h.fx, v = s.pl[p].fx[k]
    if (!v) return
    const card = CARD[FX[k].card], pad = 10 * u
    const tw = Math.min(this.W - 12 * u, 240 * u)
    const lines = this.wrap(T.fxHint[k](card), 12.5, tw - 2 * pad, false), lh = this.lineH(12.5, 16)
    const left = v.t && k !== 'gr' ? T.turnsLeft(v.t) : null
    const th = pad * 2 + this.lineH(14.5, 19) + (lines.length + (left ? 1 : 0)) * lh + this.lineH(11.5, 16) + 4 * u
    // under the icon, kept on the screen; over it where there is no room under it
    const tx = THREE.MathUtils.clamp(h.x + h.w / 2 - tw / 2, 6 * u, this.W - tw - 6 * u)
    const below = h.y + h.h + 4 * u
    const ty = below + th <= this.H - 6 * u ? below : Math.max(6 * u, h.y - th - 4 * u)
    this.panel(tx, ty, tw, th, { fill: 'rgba(255,253,248,0.98)', stroke: P.CAT_COLORS[card.id[0]], lw: 2, r: 10 })
    let y = ty + pad + this.lineH(14.5, 19) / 2
    P.drawIcon(this.g, card.id, tx + pad + 8 * u, y, 16 * u, P.CAT_COLORS[card.id[0]])
    this.text(card.name, tx + pad + 22 * u, y, { size: 14.5, max: tw - 2 * pad - 22 * u })
    y += this.lineH(14.5, 19) / 2 + lh / 2
    for (const l of lines) { this.text(l, tx + pad, y, { size: 12.5, bold: false, color: P.INK }); y += lh }
    if (left) { this.text(left, tx + pad, y, { size: 12.5, color: '#7b5ce0' }); y += lh }
    this.text(T.fxSeeCard, tx + pad, y - lh / 2 + 4 * u + this.lineH(11.5, 16) / 2, { size: 11.5, bold: false, color: '#8a8378' })
    this.fxTip = true
  }

  /** Several players at one computer: the next one takes it before their hand shows. */
  drawCurtain(p) {
    const W = this.W, H = this.H, u = this.u, g = this.g
    this.hits = this.hits.filter(h => h.key === 'menu' || h.key === 'snd')
    this.fillScreen('rgba(30,26,22,0.42)')
    const pw = Math.min(W - 20 * u, 380 * u), ph = 196 * u
    const x = (W - pw) / 2, y = (H - ph) / 2
    const color = P.PLAYER_COLORS[p.c % 6]
    this.panel(x, y, pw, ph, { fill: 'rgba(255,253,248,0.98)', stroke: color, lw: 3.5 })
    g.fillStyle = color
    g.beginPath(); g.arc(W / 2, y + 40 * u, 20 * u, 0, Math.PI * 2); g.fill()
    this.initial(p.n, W / 2, y + 41 * u, 20)
    this.text(T.passTo(p.n), W / 2, y + 82 * u, { size: 22, align: 'center', max: pw - 30 * u })
    this.text(T.passHint, W / 2, y + 108 * u, { size: 13.5, align: 'center', bold: false, color: '#5b544c', max: pw - 30 * u })
    this.button('reveal', T.showCards, x + 40 * u, y + ph - 62 * u, pw - 80 * u, 46 * u, () => this.app.reveal(), { primary: true, color, size: 18 })
  }

  /** A soft frame round a player's row: gold for the Champion's leader, a gloomy one for whoever risks being the Fool. */
  rowHalo(x, y, w, h, kind) {
    const g = this.g, u = this.u, o = 3.5 * u
    g.save()
    if (kind === 'gold') {
      const gr = g.createLinearGradient(x, y, x + w, y + h)
      gr.addColorStop(0, '#ffe08a'); gr.addColorStop(0.45, '#d29a12'); gr.addColorStop(0.7, '#fff0b3'); gr.addColorStop(1, '#c58a0a')
      g.shadowColor = 'rgba(255,190,40,0.85)'; g.shadowBlur = 12 * u
      g.strokeStyle = gr; g.lineWidth = 3 * u
    } else {
      g.shadowColor = 'rgba(30,16,44,0.7)'; g.shadowBlur = 10 * u
      g.strokeStyle = 'rgba(66,46,82,0.8)'; g.lineWidth = 2.2 * u
    }
    P.roundRect(g, x - o, y - o, w + 2 * o, h + 2 * o, 10 * u + o); g.stroke()
    g.restore()
  }
  /**
   * The players from the highest on the board down (in Fool those who finished first, by place). The
   * Champion's leader is a single player furthest up; the Fool's candidate the single one lowest down.
   */
  standing(s) {
    const key = i => (s.mode === 'fool' && s.pl[i].d ? 1000 - s.pl[i].d : s.pl[i].pos)
    const order = s.pl.map((p, i) => i).sort((a, b) => key(b) - key(a) || a - b)
    let leader = -1, last = -1
    if (s.mode === 'champion' && key(order[0]) > 0 && key(order[0]) > key(order[1])) leader = order[0]
    if (s.mode === 'fool') {
      const live = order.filter(i => !s.pl[i].d)
      const n = live.length
      if (n === 1 || (n > 1 && key(live[n - 1]) < key(live[n - 2]))) last = live[n - 1]
    }
    return { order, leader, last }
  }
  /** Rows of the players panel slide to their new places. */
  slideRows(dt) {
    const f = 1 - Math.exp(-9 * dt)
    for (const r of this.rows.values()) {
      for (let k = 0; k < 2; k++) {
        const d = r.want[k] - r.at[k]
        if (!d) continue
        r.at[k] = Math.abs(d) < 0.01 ? r.want[k] : r.at[k] + d * f
        this.dirty = true
      }
    }
  }

  measure(t, size) { this.g.font = this.font(size * this.u); return this.g.measureText(t).width }
  /** Text of a size broken into lines `w` wide. */
  wrap(t, size, w, bold = true) { this.g.font = this.font(size * this.u, bold); return P.wrapText(this.g, t, w) }
  handHeight() { return this.cardW() * 1.4 * 0.86 + 14 * this.u - this.handSink() }
  /** How much lower my hand rests on a short screen on its side (a phone's): the cards' text shows as one rises to read. */
  handSink() { return !this.narrow && this.H < 440 ? this.cardW() * 0.4 : 0 }
  cardW() { return this.narrow ? Math.min(225, (this.W - 16) / 2.55, this.H * 0.26) : 225 * this.u }
  /**
   * The dice tray: bottom right beside the hand; on a phone held upright a small, squarer one at the left
   * over the hand, well short of the middle of the screen (the view frames the dice closer in it).
   */
  trayBox() {
    const u = this.u, W = this.W, H = this.H
    if (this.narrow) {
      const w = Math.round(THREE.MathUtils.clamp(W * 0.36, 112, 190)), h = Math.round(w * 0.82)
      return { x: 10 * u, y: H - this.handHeight() - h - 10 * u, w, h }
    }
    const w = 354 * u, h = w * 0.66
    return { x: W - w - 12 * u, y: H - h - 46 * u, w, h }
  }
  /**
   * What stands over the board in a game, as screen rectangles: my hand at rest, the dice tray with its label,
   * the players panel, the status and the log. The camera keeps the piece it follows clear of them.
   */
  cover() {
    if (this.app.screen !== 'game' || !this.app.view.state) return []
    const u = this.u, out = []
    const n = this.cards.filter(c => c.kind === 'hand').length
    if (n) {
      const cw = this.cardW(), { left, right } = this.handLayout(n)
      const top = this.H - cw * 1.4 * 0.42 + 6 * u - cw * 0.7 - 6 * u + this.handSink() // the fanned cards lean a little higher
      out.push({ x: left, y: top, w: right - left, h: this.H - top })
    }
    if (this.trayTop != null && this.trayRect) {
      const r = this.trayRect, bottom = this.narrow ? r.y + r.h + 4 * u : r.y + r.h + 32 * u
      out.push({ x: r.x - 4 * u, y: this.trayTop, w: r.w + 8 * u, h: bottom - this.trayTop })
    }
    for (const r of this.rowRect) if (r) out.push(r)
    if (this.statusRect) out.push(this.statusRect)
    if (this.logRect) out.push(this.logRect)
    // (the tips' bubbles are not cover: they keep clear of the pieces themselves, the camera would jump as they come and go)
    return out.map(r => ({ x: r.x + this.ox, y: r.y + this.oy, w: r.w, h: r.h }))
  }
  /** A point (screen px) over the hand, the tray, the panels or the log (see cover). */
  overCover(x, y) { return this.cover().some(r => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) }
  /** Where n cards of my hand go: centred, but clear of the tray, closer together when they don't fit. */
  handLayout(n) {
    const u = this.u, cw = this.cardW()
    const left = this.narrow ? 4 : 10 * u, right = this.narrow ? this.W - 4 : this.trayBox().x - 16 * u
    let gap = cw * (this.narrow ? 0.76 : 0.92)
    const room = right - left
    if (n > 1 && gap * (n - 1) + cw > room) gap = Math.max(cw * 0.3, (room - cw) / (n - 1))
    const span = gap * Math.max(0, n - 1) + cw
    const cx = span >= room ? (left + right) / 2 : THREE.MathUtils.clamp(this.W / 2, left + span / 2, right - span / 2)
    return { cx, gap, left: cx - span / 2, right: cx + span / 2 }
  }

  drawLog() {
    const u = this.u, H = this.H
    this.logRect = null
    const all = this.logLines.slice(this.logOpen ? -16 : -5) // (at most as many lines show at once; the rest scroll)
    if (!all.length) return
    const lh = this.lineH(12.5, 19)
    let x = 10 * u, w = this.narrow ? this.W - 70 * u : 330 * u // (on a phone, clear of the zoom buttons)
    // at the bottom left, or over the hand when the hand reaches there; on a phone, or where that leaves no
    // room for a line (a small screen: the players and the hand fill the left), a button opens it under the status
    const hand = this.cards.filter(c => c.kind === 'hand').length
    const over = !this.narrow && hand && this.handLayout(hand).left < x + w + 8 * u
    let top = (this.panelBottom || 0) + 10 * u
    let bottom = over ? H - this.handHeight() - 8 * u : H - 12 * u
    const compact = this.narrow || bottom - top - 16 * u < lh
    if (compact && !this.logOpen) {
      const open = () => { this.logOpen = true; this.dirty = true }
      if (this.narrow) this.button('log', T.log, 10 * u, (this.trayTop ?? H - this.handHeight() - 22 * u) - 40 * u, 70 * u, 34 * u, open, { size: 13 })
      else this.button('log', T.log, this.zoomX, this.zoomBottom + 6 * u, this.zoomW, this.zoomW, open, { size: 12 })
      return
    }
    if (compact && this.narrow) { top = this.bannerTop(); bottom = (this.trayTop ?? H - this.handHeight()) - 48 * u }
    else if (compact) { x = this.gameLeft || x; w = Math.min(430 * u, this.zoomX - 10 * u - x); top = this.bannerTop(); bottom = H - this.handHeight() - 8 * u }
    const fit = Math.min(all.length, Math.floor((bottom - top - 16 * u) / lh))
    if (fit < 1) return
    // scrolled back, the lines that many before the newest
    const lines = this.logLines, more = lines.length - fit
    const back = this.logScroll = THREE.MathUtils.clamp(this.logScroll, 0, Math.max(0, more))
    const shown = lines.slice(lines.length - fit - back, lines.length - back).map(l => /^(\d+)\. (.*)$/.exec(l) || [l, '', l])
    const h = shown.length * lh + 16 * u
    const y = compact ? top : bottom - h
    this.panel(x, y, w, h, { fill: compact ? 'rgba(255,255,255,0.92)' : 'rgba(255,255,255,0.82)', r: 10 })
    this.logRect = { x, y, w, h }
    // the turn's number in a column of its own, then what happened
    const numW = Math.max(0, ...shown.map(m => (m[1] ? this.measure(m[1] + '.', 12.5) : 0)))
    const tx = x + 10 * u + (numW ? numW + 6 * u : 0), bar = more > 0 ? 8 * u : 0
    shown.forEach(([, n, l], i) => {
      const ly = y + 8 * u + lh * (i + 0.5), last = i === shown.length - 1 && !back
      if (n) this.text(n + '.', x + 10 * u + numW, ly, { size: 12.5, align: 'right', color: '#9a8f80' })
      this.text(l, tx, ly, { size: 12.5, bold: false, max: x + w - 10 * u - bar - tx, color: last ? P.INK : '#4b453e' })
    })
    // more lines than it shows: where these stand among them
    if (more > 0) {
      const g = this.g, tw = 4 * u, th = h - 16 * u, kh = Math.max(14 * u, th * fit / lines.length)
      const ky = y + 8 * u + (th - kh) * (1 - back / more)
      g.fillStyle = 'rgba(43,38,34,0.08)'; P.roundRect(g, x + w - 6 * u - tw, y + 8 * u, tw, th, tw / 2); g.fill()
      g.fillStyle = 'rgba(43,38,34,0.32)'; P.roundRect(g, x + w - 6 * u - tw, ky, tw, kh, tw / 2); g.fill()
    }
    this.hits.push({ key: 'logtoggle', x, y, w, h, action: () => { this.logOpen = !this.logOpen; this.dirty = true } })
  }
  /** The log goes back `n` lines (forward when negative); the fractions a drag or a touchpad gives add up. */
  scrollLog(n) {
    this.logScrollF += n
    const k = Math.trunc(this.logScrollF)
    if (!k) return
    this.logScrollF -= k
    this.logScroll = Math.max(0, this.logScroll + k) // (the drawing keeps it to the lines there are)
    this.dirty = true
  }
  /** A drag of `dy` px over the log: its lines follow it. */
  dragLog(dy) { this.scrollLog(dy / this.lineH(12.5, 19)) }
  /** A point (screen px) over the log. */
  overLog(x, y) { const r = this.logRect; x -= this.ox; y -= this.oy; return !!r && x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h }

  drawResults(s, me) {
    const W = this.W, H = this.H, u = this.u, app = this.app
    const first = !!app.table?.cfg?.first // the First Match: what to play next
    const pw = Math.min(W - 20 * u, 440 * u), ph = (150 + s.pl.length * 34 + 70 + (first ? 54 : 0)) * u
    const x = (W - pw) / 2, y = Math.max(10 * u, (H - ph) / 2 - 40 * u)
    this.panel(x, y, pw, ph, { fill: 'rgba(255,253,248,0.97)' })
    const champ = s.mode === 'champion'
    const title = champ ? T.wins(s.pl[s.res.winner].n) : T.isFool(s.pl[s.res.fool].n)
    // (a title that already speaks to this screen's player, "You win!", needs no line under it: it takes that line's place too)
    const toMe = me >= 0 && (champ ? s.res.winner : s.res.fool) === me && s.pl[me].n === SELF
    this.text(title, W / 2, y + (toMe ? 50 : 34) * u, { size: 24, align: 'center', color: champ ? '#c99400' : '#d64545', max: pw - 30 * u })
    if (me >= 0 && !toMe) this.text(champ ? (s.res.winner === me ? T.youWon : T.youFinished(s.res.places[me])) : (s.res.fool === me ? T.youAreFool : T.youFinished(s.res.places[me])), W / 2, y + 66 * u, { size: 15, align: 'center', bold: false })
    if (s.res.limit) this.text(T.roundLimit, W / 2, y + 88 * u, { size: 12, align: 'center', bold: false, color: '#5b544c' })
    const order = s.pl.map((p, i) => i).sort((a, b) => s.res.places[a] - s.res.places[b])
    order.forEach((i, k) => {
      const p = s.pl[i], ry = y + 106 * u + k * 34 * u
      this.g.fillStyle = P.PLAYER_COLORS[p.c % 6]
      this.g.beginPath(); this.g.arc(x + 34 * u, ry + 14 * u, 9 * u, 0, Math.PI * 2); this.g.fill()
      const place = !champ && s.res.fool === i ? 'Fool' : `#${s.res.places[i]}`
      this.text(place, x + 54 * u, ry + 14 * u, { size: 15 })
      this.text(i === me ? T.mine(p.n) : p.n, x + 110 * u, ry + 14 * u, { size: 15, bold: i === me, max: pw - 220 * u })
      this.text(p.d && !champ ? T.finished : p.pos >= (s.n || 100) ? String(s.n || 100) : T.cellShort(p.pos), x + pw - 30 * u, ry + 14 * u, { size: 13, align: 'right', bold: false })
    })
    let yy = y + 106 * u + s.pl.length * 34 * u + 6 * u
    if (app.reward) { this.text(app.reward, W / 2, yy, { size: 13, align: 'center', bold: false, color: '#2d3a6b', max: pw - 30 * u }); yy += 8 * u }
    const by = y + ph - 58 * u
    if (first) {
      // Play Again (Medium bots, nothing set up), or something new: Fool, the bigger board
      const bw = (pw - 52 * u) / 3
      this.button('rematch', T.playAgain, x + 20 * u, by - 54 * u, pw - 40 * u, 46 * u, () => app.playAgain(), { primary: true, size: 19 })
      this.button('tryfool', T.tryFool, x + 20 * u, by, bw, 42 * u, () => app.playAgain('fool'), { size: 14 })
      this.button('bigboard', T.biggerBoard, x + 26 * u + bw, by, bw, 42 * u, () => app.playAgain('big'), { size: 14 })
      this.button('mainmenu', T.mainMenu, x + 32 * u + bw * 2, by, bw, 42 * u, () => app.toMenu(), { size: 14 })
      return
    }
    if (app.atChannel() && app.table?.kind === 'shared') {
      if (!this.p0.room.isHost) { this.text(T.waitingRematch, W / 2, by + 22 * u, { size: 15, align: 'center', bold: false, color: '#5b544c', max: pw - 30 * u }); return }
      this.button('rematch', T.rematch, x + 20 * u, by, pw / 2 - 26 * u, 44 * u, () => app.rematch(), { primary: true, size: 17 })
      this.button('mainmenu', T.backToLobby, x + pw / 2 + 6 * u, by, pw / 2 - 26 * u, 44 * u, () => app.toMenu(), { size: 17 })
      return
    }
    const canRematch = app.table?.kind === 'solo' || (app.table?.kind === 'shared' && this.p0.room.isHost)
    this.button('rematch', T.rematch, x + 20 * u, by, pw / 2 - 26 * u, 44 * u, () => app.rematch(), { primary: true, disabled: !canRematch, size: 17 })
    this.button('mainmenu', T.mainMenu, x + pw / 2 + 6 * u, by, pw / 2 - 26 * u, 44 * u, () => app.toMenu(), { size: 17 })
  }

  // ---------- the hand ----------
  /** Places the card meshes: my hand at the bottom, a peeked hand above it, flying cards. */
  layoutCards(dt) {
    const app = this.app, s = app.view.state
    const want = []
    const me = app.mySeat()
    const hide = app.curtain() >= 0 || !!app.invite
    // a player's effects shown as their cards (openFx): over everything, the peeked hand and the offer wait under it
    const fxOn = this.fxShown()
    if (app.screen === 'game' && s && me >= 0 && !hide && !(s.mode === 'fool' && s.pl[me].d)) {
      // keyed by card and occurrence, so the rest keep their meshes when one leaves
      const seen = {}
      s.pl[me].h.forEach((id, i) => {
        const n = (seen[id] = (seen[id] || 0) + 1)
        if (this.hidden && this.hidden.seq === s.seq && this.hidden.i === i) return
        want.push({ id, key: 'h' + id + n, i, kind: 'hand' })
      })
    }
    this.peekRect = null
    const peeking = app.screen === 'game' && s && s.peek && s.peek.by === me && me >= 0 && s.cur === me && !hide && !app.menuOpen && !fxOn && this.peekClosed !== this.peekKey(s)
    if (peeking) {
      s.pl[s.peek.tg].h.forEach((id, i) => want.push({ id, key: 'p' + i + id, i, kind: 'peek', n: s.pl[s.peek.tg].h.length }))
    }
    // Choose Your Card: the cards offered, in a window over the hand
    const offering = app.screen === 'game' && s && s.ph === 'take' && s.offer && me >= 0 && s.cur === me && !hide && !app.menuOpen && !fxOn && !(this.took && this.took.seq === s.seq && this.time - this.took.at < 3)
    if (offering) s.offer.forEach((id, i) => want.push({ id, key: 'o' + i + id, i, kind: 'offer' }))
    // Echo: the card each player played last, by their row in the players panel
    const echoing = app.screen === 'game' && s && this.target?.echo && !this.target.echo.card && !hide && !app.menuOpen
    if (echoing) s.pl.forEach((p, i) => { if (p.lc && !p.d && this.rowRect[i]) want.push({ id: p.lc, key: 'e' + i + p.lc, i, kind: 'echo' }) })
    if (app.screen === 'help' && this.helpPage === 1) CATALOG.forEach((c, i) => want.push({ id: c.id, key: 'c' + c.id, i, kind: 'catalog' }))
    if (fxOn) fxOn.keys.forEach((k, i) => want.push({ id: FX[k].card, key: 'f' + i + k, i, kind: 'fx' }))
    // keep meshes whose key stays, add new ones, drop the rest
    const next = []
    for (const w of want) {
      let c = this.cards.find(c => c.key === w.key && !next.includes(c))
      if (!c) {
        c = { ...w, mesh: this.makeCard(w.id), x: this.W + 80 * this.u, y: this.H - 60 * this.u, s: 0.4 }
        if (w.kind === 'catalog' || w.kind === 'peek' || w.kind === 'offer') { c.x = this.W / 2; c.y = this.H / 2; c.s = 0.2 }
        if (w.kind === 'echo') { const r = this.rowRect[w.i]; c.x = r.x + r.w; c.y = r.y + r.h / 2; c.s = 0.2 }
        if (w.kind === 'fx') { c.x = fxOn.x; c.y = fxOn.y; c.s = 16 * this.u } // (it grows out of the icon clicked)
        // the card kept from an offer comes down from where it lay
        if (w.kind === 'hand' && this.took && this.took.id === w.id && this.time - this.took.at < 3) { c.x = this.took.x; c.y = this.took.y; c.s = this.took.s; this.took = null }
      }
      Object.assign(c, w)
      next.push(c)
    }
    for (const c of this.cards) if (!next.includes(c)) this.dropCard(c.mesh)
    this.cards = next
    const u = this.u, W = this.W, H = this.H
    const cw = this.cardW()
    const hand = this.cards.filter(c => c.kind === 'hand')
    const n = hand.length
    const myTurn = s && me >= 0 && s.cur === me && s.ph !== 'over'
    const { cx, gap } = this.handLayout(n)
    // while a First Match tip points at the board, the card chosen stays down in the hand: the board is to see
    const down = ['cell', 'el'].includes(app.tut?.now?.at)
    // (a card under the pointer or held up grows to read, on a small screen more, and stays on the screen)
    const read = Math.min(Math.max(1.12, CARD_READ / cw), (H - 8 * u) / 1.4 / cw)
    hand.forEach((c, k) => {
      const x = cx + (k - (n - 1) / 2) * gap
      const hov = this.hover === 'card' + c.i
      const sel = this.selected === c.i && !down
      const lift = sel ? 0.5 : hov ? 0.32 : 0
      c.tx = x; c.ty = H - cw * 1.4 * 0.42 + 6 * u - lift * cw * 0.7 + (lift ? 0 : this.handSink())
      c.ts = cw * (sel || hov ? read : 1)
      if (sel || hov) c.ty = Math.min(c.ty, H - c.ts * 0.7 - 4 * u)
      // a card waiting for its target stands clear of the players' panel, whose rows take the target too
      if (sel && this.target && !this.narrow && this.gameLeft && c.ty - c.ts * 0.7 < (this.panelBottom || 0)) c.tx = Math.max(c.tx, this.gameLeft + c.ts / 2)
      c.tx = Math.min(W - c.ts / 2 - 4, Math.max(c.ts / 2 + 4, c.tx))
      c.rot = (k - (n - 1) / 2) * -0.05 * (sel ? 0 : 1)
      const playable = myTurn && (s.ph === 'disc' || !whyNot(s, me, c.id))
      c.dim = myTurn && !playable && s.ph !== 'disc' ? 1 : 0
      c.lift = sel || this.selected === c.i ? 1 : hov ? 0.6 : 0
      c.heat = myTurn && s.ph === 'disc' && !app.view.busy ? (hov ? 1 : 0.35) : 0
    })
    const peek = this.cards.filter(c => c.kind === 'peek')
    if (peek.length) {
      // as big as my own cards, as far as the screen lets them; the window stands over everything
      const n = peek.length
      const pw = Math.min(cw, (W - 40 * u) / (n * 1.05), (H - 80 * u) / 1.4)
      const ph = pw * 1.4 + 46 * u
      const top = Math.max(8 * u, (H - ph) / 2 - 30 * u)
      const x0 = W / 2 - (n - 1) / 2 * pw * 1.05
      const y = top + 34 * u + pw * 0.7
      peek.forEach((c, k) => {
        // the one under the pointer (or tapped) grows to read
        const hov = this.hover === 'peek' + c.i
        c.tx = x0 + k * pw * 1.05; c.ty = y; c.ts = hov ? Math.min(Math.max(pw * 1.06, CARD_READ), (H - 8 * u) / 1.4) : pw; c.rot = 0; c.dim = 0; c.lift = hov ? 0.6 : 0; c.z = hov ? 62 : 60
        if (hov) { c.tx = Math.min(W - c.ts / 2 - 4 * u, Math.max(c.ts / 2 + 4 * u, c.tx)); c.ty = Math.min(H - c.ts * 0.7 - 4 * u, Math.max(c.ts * 0.7 + 4 * u, c.ty)) }
      })
      this.peekRect = { x: x0 - pw / 2, y: y - pw * 0.7, w: (n - 1) * pw * 1.05 + pw, h: pw * 1.4 }
    } else if (peeking) {
      this.peekRect = { x: W / 2 - 90 * u, y: H * 0.38 - 12 * u, w: 180 * u, h: 24 * u, empty: true }
    }
    const offer = this.cards.filter(c => c.kind === 'offer')
    this.offerRect = null
    if (offer.length) {
      const n = offer.length
      // over the board, clear of the status at the top and of my hand at the bottom
      const room = H - cw * 1.4 * 0.62 - this.bannerTop() - 8 * u
      const head = this.offerHead()
      const pw = Math.min(cw * 0.95, (W - 40 * u) / (n * 1.08), (room - head - 26 * u) / 1.4)
      const top = this.bannerTop() + Math.max(0, (room - pw * 1.4 - head - 18 * u) / 2)
      const x0 = W / 2 - (n - 1) / 2 * pw * 1.08
      const y = top + head + pw * 0.7
      offer.forEach((c, k) => {
        const hov = this.hover === 'offer' + c.i
        c.tx = x0 + k * pw * 1.08; c.ty = y - (hov ? 8 * u : 0); c.ts = hov ? Math.min(Math.max(pw * 1.06, CARD_READ), (H - 8 * u) / 1.4) : pw; c.rot = 0; c.dim = 0; c.lift = hov ? 0.6 : 0; c.z = hov ? 62 : 60
        if (hov) { c.tx = Math.min(W - c.ts / 2 - 4 * u, Math.max(c.ts / 2 + 4 * u, c.tx)); c.ty = Math.min(H - c.ts * 0.7 - 4 * u, Math.max(c.ts * 0.7 + 4 * u, c.ty)) }
      })
      this.offerRect = { x: x0 - pw / 2, y: y - pw * 0.7, w: (n - 1) * pw * 1.08 + pw, h: pw * 1.4 }
    }
    for (const c of this.cards.filter(c => c.kind === 'echo')) {
      // beside the row (over its right end on a phone), bigger under the pointer; dimmed when Echo can't play it now
      const r = this.rowRect[c.i]
      if (!r) continue
      const hov = this.hover === 'pl' + c.i
      const w0 = r.h * 1.3 / 1.4, w = hov ? Math.max(w0, Math.min(w0 * 3, 150 * u)) : w0
      c.tx = Math.min(W - w / 2 - 4 * u, this.narrow ? r.x + r.w - w / 2 - 3 * u : r.x + r.w + 8 * u + w / 2)
      c.ty = Math.max(w * 0.7 + 4 * u, r.y + r.h / 2)
      c.ts = w; c.rot = hov ? 0 : 0.05; c.dim = this.target?.list.includes(c.i) ? 0 : 1; c.lift = hov ? 0.6 : 0; c.z = hov ? 30 : 14
    }
    const fxc = this.cards.filter(c => c.kind === 'fx')
    this.fxRect = null
    if (fxc.length) {
      // big enough to read, side by side as far as the screen lets them; under each, what it does to the player
      const n = fxc.length, head = 46 * u, lh = this.lineH(13, 17), gap = 1.1
      const pw = Math.min(Math.max(cw, CARD_READ) * 1.1, (W - 48 * u) / (n * gap), (H - head - 5 * lh - 40 * u) / 1.4)
      const p = s.pl[fxOn.p]
      const notes = fxOn.keys.map(k => ({
        lines: this.wrap(T.fxHint[k](CARD[FX[k].card]), 13, pw * 1.04, false),
        // (the Grail's ward says itself how long it lasts)
        left: !p.fx[k] ? T.fxGone : p.fx[k].t && k !== 'gr' ? T.turnsLeft(p.fx[k].t) : null,
        gone: !p.fx[k],
      }))
      const foot = Math.max(...notes.map(t => t.lines.length + (t.left ? 1 : 0))) * lh + 20 * u
      const top = Math.max(8 * u, (H - head - pw * 1.4 - foot) / 2)
      const x0 = W / 2 - (n - 1) / 2 * pw * gap, y = top + head + pw * 0.7
      fxc.forEach((c, k) => { c.tx = x0 + k * pw * gap; c.ty = y; c.ts = pw; c.rot = 0; c.dim = notes[c.i].gone ? 1 : 0; c.lift = 0; c.z = 70 })
      this.fxRect = { x: x0 - pw / 2, y: y - pw * 0.7, w: (n - 1) * pw * gap + pw, h: pw * 1.4, head, foot, lh, pw, gap, notes, p: fxOn.p }
    }
    // the window behind the cards is drawn only on a redraw: one when it moves (a resize)
    const offerKey = this.offerRect ? [this.offerRect.x, this.offerRect.y, this.offerRect.w].map(Math.round).join() : ''
    if (offerKey !== this.offerKey) { this.offerKey = offerKey; this.dirty = true }
    const fxKey = this.fxRect ? [this.fxRect.x, this.fxRect.y, this.fxRect.w, this.fxRect.foot].map(Math.round).join() + this.fxRect.notes.map(t => t.left).join() : ''
    if (fxKey !== this.fxKey) { this.fxKey = fxKey; this.dirty = true }
    const cat = this.cards.filter(c => c.kind === 'catalog')
    if (cat.length) {
      const pw = Math.min(W - 20 * u, 780 * u), ph = Math.min(H - 20 * u, 600 * u)
      const cols = this.narrow ? 5 : 9, rows = Math.ceil(cat.length / cols)
      const areaW = pw - 30 * u, areaH = ph - 130 * u
      const cwc = Math.min(areaW / cols * 0.94, areaH / rows / 1.4 * 0.94)
      cat.forEach((c, k) => {
        const col = k % cols, row = Math.floor(k / cols)
        const hov = this.hover === 'cat' + k
        c.tx = W / 2 + (col - (cols - 1) / 2) * (areaW / cols)
        c.ty = (H - ph) / 2 + 66 * u + (row + 0.5) * (areaH / rows)
        c.ts = hov ? Math.min(Math.max(cwc * 2.28, CARD_READ * 1.05), (H - 8 * u) / 1.4, W - 8 * u) : cwc
        // the big card stays on the screen
        if (hov) { c.tx = Math.min(W - c.ts / 2 - 4 * u, Math.max(c.ts / 2 + 4 * u, c.tx)); c.ty = Math.min(H - c.ts * 0.7 - 4 * u, Math.max(c.ts * 0.7 + 4 * u, c.ty)) }
        c.rot = 0; c.dim = 0; c.lift = hov ? 1 : 0
        c.z = hov ? 30 : 10
        // it leans towards the pointer: the corner under it goes away
        const pt = this.pointer, lean = (v, r) => Math.max(-1, Math.min(1, v / r)) * 0.24
        c.tilt = hov && pt ? [lean(pt.x - c.x, c.s / 2), lean(pt.y - c.y, c.s * 0.7)] : null
      })
    }
    const f = 1 - Math.exp(-14 * dt)
    for (const c of this.cards) {
      c.x += (c.tx - c.x) * f; c.y += (c.ty - c.y) * f; c.s += (c.ts - c.s) * f
      c.mesh.position.set(c.x, H - c.y, c.z || 10)
      c.mesh.scale.set(c.s, c.s, 1)
      c.mesh.rotation.z = c.rot || 0
      c.mesh.renderOrder = c.z || (c.lift ? 12 : 10)
      const m = c.mesh.material.uniforms
      m.dim.value += (c.dim - m.dim.value) * f
      m.lift.value = c.lift
      m.heat.value += ((c.heat || 0) - m.heat.value) * f
      m.tilt.value.x += ((c.tilt?.[0] || 0) - m.tilt.value.x) * f
      m.tilt.value.y += ((c.tilt?.[1] || 0) - m.tilt.value.y) * f
      m.time.value = this.time
    }
    // discarded cards burn where they are, rising a little
    for (const fl of this.flyers.filter(f => f.burn)) {
      fl.t += dt
      const k = Math.min(1, fl.t / BURN_SECS)
      const sc = fl.s0 * (1 + 0.06 * Math.sin(Math.min(1, k * 1.5) * Math.PI / 2))
      fl.mesh.position.set(fl.x0, H - (fl.y0 - k * 26 * u), 40)
      fl.mesh.scale.set(sc, sc, 1)
      fl.mesh.rotation.z = fl.rot * (1 - k * 0.5)
      fl.mesh.renderOrder = 40
      const un = fl.mesh.material.uniforms
      un.burn.value = k * (0.75 + 0.25 * k)
      un.heat.value = 0
      un.lift.value = 0
      un.time.value = this.time
    }
    for (const fl of this.flyers) {
      if (fl.burn) continue
      fl.t += dt
      const k = Math.min(1, fl.t / 0.35)
      const big = Math.min(W * 0.42, 250 * u)
      const x = fl.x0 + (W / 2 - fl.x0) * k, y = fl.y0 + (H * 0.42 - fl.y0) * k
      const sc = fl.s0 + (big - fl.s0) * k
      const life = flyerLife(fl)
      fl.mesh.position.set(x, H - y, 40)
      fl.mesh.scale.set(sc, sc, 1)
      fl.mesh.rotation.z = (1 - k) * 0.3
      fl.mesh.renderOrder = 40
      const u2 = fl.mesh.material.uniforms
      u2.time.value = this.time
      u2.opacity.value = fl.t > life - 0.25 ? Math.max(0, 1 - (fl.t - life + 0.25) / 0.25) : 1
      if (fl.echo) {
        // Echo turns over: its back is a ghost of the card it plays again
        const f = THREE.MathUtils.clamp((fl.t - 0.55) / 0.5, 0, 1)
        if (f >= 0.5 && !fl.flipped) {
          fl.flipped = true
          u2.map.value = this.cardTexture('ghost:' + fl.echo)
          u2.legendary.value = CARD[fl.echo].rar === 'L' ? 1 : 0
        }
        fl.mesh.scale.set(sc * Math.max(0.02, Math.abs(Math.cos(f * Math.PI))), sc * (1 + 0.08 * Math.sin(f * Math.PI)), 1)
        if (fl.flipped) { u2.opacity.value *= 0.82 + 0.1 * Math.sin(this.time * 7); fl.mesh.position.y += Math.sin(this.time * 3) * 3 * u }
      }
    }
    const gone = f => f.t > (f.burn ? BURN_SECS + 0.05 : flyerLife(f))
    for (const fl of this.flyers.filter(gone)) this.dropCard(fl.mesh)
    this.flyers = this.flyers.filter(f => !gone(f))
  }

  /** A card someone discarded burns away: mine from my hand (unless I already lit it), the others' backs by their row. */
  burnDiscard(e) {
    const me = this.app.mySeat(), u = this.u
    if (e.p === me) {
      if (this.lit && this.time - this.lit.at < 6 && this.lit.card === e.card) { this.lit = null; return }
      const c = this.cards.find(k => k.kind === 'hand' && k.id === e.card)
      if (c) { this.burnCard(c); return }
    }
    const r = this.rowRect[e.p]
    const mesh = this.makeCard('back')
    const s0 = (this.narrow ? 38 : 52) * u
    this.flyers.push({ mesh, burn: true, t: 0, x0: r ? r.x + r.w + s0 * 0.7 : this.W / 2, y0: r ? r.y + r.h / 2 : this.H * 0.3, s0, rot: -0.12, card: 'back' })
    this.app.sfx('burn')
  }
  /** A die of Choose Your Roll ('pick') or a card that Choose Your Card offers ('take'): the others burn. */
  choose(kind, i) {
    const app = this.app, s = app.view.state
    if (!s || app.view.busy || app.waiting > 0 || s.ph !== kind) return
    if (kind === 'pick') { if (s.pick && i < s.pick.d.length) { app.sfx('take'); app.act({ t: 'pick', i }) } return }
    const offer = this.cards.filter(c => c.kind === 'offer'), c = offer.find(k => k.i === i)
    if (!c) return
    if (app.act({ t: 'take', i }) === false) return
    this.took = { id: c.id, x: c.x, y: c.y, s: c.s, seq: s.seq, at: this.time }
    for (const k of offer) {
      this.cards = this.cards.filter(x => x !== k)
      if (k === c) this.dropCard(k.mesh)
      else this.flyers.push({ mesh: k.mesh, burn: true, t: 0, x0: k.x, y0: k.y, s0: k.s, rot: 0, card: k.id })
    }
    app.sfx('take')
    this.dirty = true
  }
  /** A card of my hand leaves it and burns where it is. */
  burnCard(c) {
    const s = this.app.view.state
    this.hidden = { i: c.i, seq: s.seq }
    this.cards = this.cards.filter(k => k !== c)
    c.mesh.material.uniforms.dim.value = 0
    const fl = { mesh: c.mesh, burn: true, t: 0, x0: c.x, y0: c.y, s0: c.s, rot: c.mesh.rotation.z, card: c.id }
    this.flyers.push(fl)
    this.app.sfx('discard')
    return fl
  }

  /** A card goes to the middle of the screen for everyone (my own already flew from my hand). */
  showPlayed(e) {
    const me = this.app.mySeat()
    const mine = e.p === me && this.flyers.find(f => f.mine && f.card === e.card)
    if (mine) { if (e.echo) mine.echo = e.echo; return }
    let x0 = this.W / 2, y0 = -100 * this.u, s0 = 60 * this.u
    const r = this.rowRect[e.p]
    if (e.p === me) { y0 = this.H - 80 * this.u; s0 = this.cardW() }
    else if (r) { x0 = r.x + r.w / 2; y0 = r.y + r.h / 2 }
    else { x0 = 120 * this.u; y0 = 30 * this.u + e.p * 50 * this.u }
    this.flyers.push({ mesh: this.makeCard(e.card), t: 0, x0, y0, s0, card: e.card, echo: e.echo || null })
  }

  // ---------- playing a card: a click plays it, or asks for its target first ----------
  cardClicked(c) {
    const app = this.app, s = app.view.state, me = app.mySeat()
    if (!s || me < 0) return
    const myTurn = s.cur === me && s.ph !== 'over'
    if (!myTurn) { this.selected = this.selected === c.i ? -1 : c.i; this.dirty = true; return }
    if (app.view.busy || app.waiting > 0) return
    // the First Match's forced tips: only the card they ask for
    if (app.tut && !app.tut.allowsCard(c)) { app.nudge(); return }
    if (s.ph === 'disc') {
      const fl = this.burnCard(c)
      this.lit = { card: c.id, at: this.time }
      if (app.act({ t: 'disc', i: c.i }) === false) { this.hidden = null; this.lit = null; this.dropCard(fl.mesh); this.flyers = this.flyers.filter(f => f !== fl) }
      this.selected = -1
      return
    }
    if (this.target && this.target.i === c.i) { this.cancelTarget(); return }
    const why = whyNot(s, me, c.id)
    if (why) { this.cancelTarget(); this.say(why); return }
    const def = CARD[c.id]
    const all = targetsFor(s, me, c.id), list = app.tut ? app.tut.targets(c.id, all) : all
    if (def.tgt === 'self') { this.play(c.i, me); return }
    if (def.tgt === 'none' || def.tgt === 'board' || (def.tgt === 'leader' && list.length === 1)) { this.play(c.i, def.tgt === 'leader' ? list[0] : null, def.tgt === 'leader'); return }
    const kind = kindOf(def.tgt)
    // Echo: first the player whose last card it plays again (shown by their names), then that card's target
    this.target = { i: c.i, card: c.id, seat: me, kind, list, sel: kind === 'cell2' ? [] : null, echo: def.tgt === 'echo' ? {} : null }
    this.selected = c.i
    app.sfx('aim')
    this.syncHighlight()
    this.dirty = true
  }
  /** The card leaves the hand at once and flies to the middle; the rules follow. */
  play(i, tg, onPlayer = false) {
    const app = this.app, s = app.view.state, me = app.mySeat()
    // only my own card, on my own turn
    if (!s || me < 0 || !s.pl[me].h[i] || whyNot(s, me, s.pl[me].h[i])) { this.cancelTarget(); return }
    const c = this.cards.find(k => k.kind === 'hand' && k.i === i)
    this.hidden = { i, seq: s.seq }
    let fl = null
    const echo = s.pl[me].h[i] === 'C6' && Array.isArray(tg) ? s.pl[tg[0]].lc : null
    if (c) {
      this.cards = this.cards.filter(k => k !== c)
      fl = { mesh: c.mesh, t: 0, x0: c.x, y0: c.y, s0: c.s, card: c.id, mine: true, echo }
      this.flyers.push(fl)
    }
    this.target = null
    this.selected = -1
    this.syncHighlight()
    const at = echo ? tg[1] : tg
    if (onPlayer && typeof at === 'number') app.view.pointAt(at, 1.8)
    app.sfx('play')
    if (app.act({ t: 'play', i, tg }) === false) {
      this.hidden = null
      if (fl) { this.dropCard(fl.mesh); this.flyers = this.flyers.filter(f => f !== fl) }
    }
    this.dirty = true
  }
  syncHighlight() {
    const t = this.target, v = this.app.view
    if (!t) { v.setHighlight(null); v.pointAt(null); return }
    const hov = t.hov != null ? [t.hov] : []
    if (t.kind === 'cell' || t.kind === 'cell2') v.setHighlight({ kind: 'cell', cells: t.list, sel: [...(t.kind === 'cell2' ? t.sel : []), ...hov] })
    else if (t.kind === 'ladder' || t.kind === 'snake') v.setHighlight({ kind: t.kind, els: t.list, sel: t.hov })
    else v.setHighlight({ kind: 'player', players: t.list })
  }
  chooseTarget(x) {
    const t = this.target
    if (!t || !t.list.includes(x)) return false
    if (t.echo && !t.echo.card) return this.echoFrom(x)
    // Echo's target goes with the player whose card it plays again
    const send = (tg, onPlayer) => this.play(t.i, t.echo ? [t.echo.src, tg] : tg, onPlayer)
    if (t.kind === 'cell2') {
      if (t.sel.includes(x)) t.sel = t.sel.filter(c => c !== x)
      else t.sel.push(x)
      if (t.sel.length === 2) { send([...t.sel]); return true }
      this.app.sfx('firstCell')
      this.syncHighlight()
      this.dirty = true
      return true
    }
    send(x, t.kind === 'player')
    return true
  }
  /** Echo plays again the last card of player src: played at once, or that card's target is chosen next. */
  echoFrom(src) {
    const app = this.app, s = app.view.state, me = app.mySeat(), t = this.target
    const id = s.pl[src].lc, def = CARD[id], list = targetsFor(s, me, id)
    if (def.tgt === 'none' || def.tgt === 'board') { this.play(t.i, [src, null]); return true }
    if (def.tgt === 'self') { this.play(t.i, [src, me]); return true }
    if (def.tgt === 'leader' && list.length === 1) { this.play(t.i, [src, list[0]], true); return true }
    const kind = kindOf(def.tgt)
    this.target = { ...t, kind, list, sel: kind === 'cell2' ? [] : null, hov: null, echo: { src, card: id } }
    app.view.pointAt(null)
    app.sfx('aim')
    this.syncHighlight()
    this.dirty = true
    return true
  }
  /** While choosing: the arrow over the player under the pointer, a lit cell or cut-out. */
  hoverTarget(hit, panelPlayer = null) {
    const t = this.target
    if (!t) return
    if (t.kind === 'player') {
      const i = panelPlayer ?? (hit?.players || []).find(i => t.list.includes(i)) ?? null
      this.app.view.pointAt(i != null && t.list.includes(i) ? i : null)
      return
    }
    const x = t.kind === 'ladder' || t.kind === 'snake' ? hit?.el : hit?.cell
    const hov = x != null && t.list.includes(x) ? x : null
    if (hov !== t.hov) { t.hov = hov; this.syncHighlight() }
  }
  /** A player the card being aimed can't go to because the Holy Grail is over them (a click on them says so). */
  wardedAt(i) {
    const t = this.target, s = this.app.view.state
    if (!t || !s || t.kind !== 'player' || (t.echo && !t.echo.card) || t.list.includes(i)) return false
    return warded(s, t.seat, t.echo?.card || t.card, i)
  }
  sayWarded(i) { this.say(T.protectedBy(this.app.view.state.pl[i].n, CARD.P4.name)) }
  cancelTarget() { this.target = null; this.selected = -1; this.syncHighlight(); this.dirty = true }
  /** A card being aimed is put back once it can no longer be played: the turn moved on, the hand changed. */
  checkTarget() {
    const t = this.target, app = this.app, s = app.view.state, me = app.mySeat()
    if (!t) return
    if (app.screen !== 'game' || !s || me < 0 || t.seat !== me || s.pl[me].h[t.i] !== t.card || whyNot(s, me, t.card)) this.cancelTarget()
  }

  // ---------- input ----------
  /** The height of Choose Your Card's window over its cards: its title and the line under it. */
  offerHead() { return Math.max(52 * this.u, this.lineH(17, 19) + this.lineH(12, 19) + 12 * this.u) }
  /** The hover key of a card on screen (as pointerMove sets it). */
  cardKey(c) { return c.kind === 'hand' ? 'card' + c.i : c.kind === 'offer' ? 'offer' + c.i : c.kind === 'peek' ? 'peek' + c.i : c.kind === 'echo' ? 'pl' + c.i : c.kind === 'catalog' ? 'cat' + this.cards.filter(k => k.kind === 'catalog').indexOf(c) : null }
  /**
   * What takes a click at x, y (screen px): the topmost button there; on a touch screen, else the nearest one
   * within TOUCH_HIT across of it (a small button takes a finger that lands beside it).
   */
  hitAt(x, y, near = true) {
    x -= this.ox; y -= this.oy
    let k = this.hits.length - 1
    while (k >= 0) { const h = this.hits[k]; if (x >= h.x && x <= h.x + h.w && y >= h.y && y <= h.y + h.h) break; k-- }
    const on = k >= 0 ? this.hits[k] : null
    if (!near || !this.touch || (on && on.key !== 'block')) return on
    // (only the buttons of a window open over the rest: those after the 'block' under it)
    let best = null, bd = Infinity
    for (let i = k + 1; i < this.hits.length; i++) {
      const h = this.hits[i]
      if (h.key === 'block' || (h.w >= TOUCH_HIT && h.h >= TOUCH_HIT)) continue
      const mx = Math.max(0, (TOUCH_HIT - h.w) / 2), my = Math.max(0, (TOUCH_HIT - h.h) / 2)
      const dx = Math.max(h.x - x, 0, x - h.x - h.w), dy = Math.max(h.y - y, 0, y - h.y - h.h)
      if (dx <= mx && dy <= my && dx + dy < bd) { bd = dx + dy; best = h }
    }
    return best || on
  }
  cardAt(x, y) {
    if (this.modal) return null
    x -= this.ox; y -= this.oy
    const list = [...this.cards].sort((a, b) => (b.mesh.renderOrder - a.mesh.renderOrder))
    for (const c of list) {
      const w = c.s, h = c.s * 1.4
      if (Math.abs(x - c.x) <= w / 2 && Math.abs(y - c.y) <= h / 2) return c
    }
    return null
  }
  pointerMove(x, y) {
    this.pointer = { x: x - this.ox, y: y - this.oy }
    const h = this.hitAt(x, y)
    let key = h ? h.key : null
    if (!key) {
      const c = this.cardAt(x, y)
      if (c) key = this.cardKey(c)
    }
    if (key !== this.hover) { this.hover = key; this.dirty = true }
    if (this.target?.kind === 'player' && key) this.hoverTarget(null, key.startsWith('pl') ? +key.slice(2) : null)
    return !!key
  }
  /** A button of the menus and the game's windows clicks: a ding going on, a lower one going back, a bubble for a choice. */
  menuSound(h) {
    const app = this.app
    if (h.drag || h.key === 'snd' || h.key === 'block') return
    if (app.screen === 'game' && !this.modal && h.key !== 'menu') return // the game's own buttons have their sounds
    const name = /back|leave|mainmenu|resume|cancel|close|invno|stand|exit/i.test(h.key) ? 'back' : h.go ? 'menu' : 'tick'
    app.playSound(name)
  }
  /** A click: true when the UI used it. A long press on a card only shows it bigger. */
  click(x, y, long = false) {
    // a button, else a card; a button near the finger only where there is no card
    const h = this.hitAt(x, y, false) || (this.cardAt(x, y) ? null : this.hitAt(x, y))
    // (while a tip asks for one thing, the rest waits)
    if (h && !this.app.allowsHit(h.key)) { this.app.nudge(); return true }
    if (h) { this.menuSound(h); h.action(); this.dirty = true; return true }
    const c = this.cardAt(x, y)
    // held, an offered card grows to read instead (a finger has no pointer to rest on it); a tap takes it
    if (c && c.kind === 'offer' && long) { this.hover = this.cardKey(c); this.dirty = true; return true }
    if (c && c.kind === 'offer') { this.choose('take', c.i); return true }
    if (c && c.kind === 'echo') { this.chooseTarget(c.i); return true }
    if (c && c.kind === 'hand') {
      if (long) { this.selected = this.selected === c.i ? -1 : c.i; this.dirty = true }
      else this.cardClicked(c)
      return true
    }
    // a card of the catalogue or a peeked hand: a tap shows it big, another puts it back
    if (c && this.touch) { const k = this.cardKey(c); this.hover = this.hover === k ? null : k; this.dirty = true }
    if (c) return true
    return false
  }
  /** A click on the board while choosing a target. */
  boardClick(hit) {
    const t = this.target
    if (!t || !hit) return false
    if (hit.player != null && t.kind === 'player') {
      // pieces on one cell overlap: take the nearest one the card can go to
      const i = hit.players.find(i => t.list.includes(i))
      const ward = i == null ? hit.players.find(i => this.wardedAt(i)) : null
      if (ward != null) { this.sayWarded(ward); return true }
      return i != null && this.chooseTarget(i)
    }
    if (hit.el != null && (t.kind === 'ladder' || t.kind === 'snake')) return this.chooseTarget(hit.el)
    if (hit.cell != null && (t.kind === 'cell' || t.kind === 'cell2')) return this.chooseTarget(hit.cell)
    return false
  }
  say(text, secs = 1.8) { this.toast = { text, t: secs }; this.dirty = true }
  log(text) {
    this.logLines.push(text)
    if (this.logLines.length > 200) this.logLines.shift()
    else if (this.logScroll > 0) this.logScroll++ // scrolled back, the lines on show stay
    this.dirty = true
  }

  update(dt) {
    this.time += dt
    if (this.toast) { this.toast.t -= dt; if (this.toast.t <= 0) { this.toast = null; this.dirty = true } }
    if (this.p0.width !== this.FW || this.p0.height !== this.FH || [this.p0.web?.safe?.left, this.p0.web?.safe?.top, this.p0.web?.safe?.right, this.p0.web?.safe?.bottom].map(v => Math.max(0, Math.round(v || 0))).join() !== this.safeKey) this.resize()
    const n = this.rollPrompt()
    if (n !== this.promptN) { this.promptN = n; this.dirty = true }
    // the tray (End Turn, the dice, the values to choose) follows whose turn it is and whether the table is busy:
    // redraw whenever any of that changes, not only when an event says so
    const trayKey = this.trayKey()
    if (trayKey !== this.trayKeyWas) { this.trayKeyWas = trayKey; this.dirty = true }
    // an online attempt under way: its arc turns
    if (this.p0.web?.status?.busy) { const k = Math.floor(this.time * 20); if (k !== this.spinTick) { this.spinTick = k; this.dirty = true } }
    this.slideRows(dt)
    this.checkTarget()
    this.sendUnpeek()
    this.layoutCards(dt)
    this.updateBanner(dt)
    if (this.dirty) this.draw()
    this.updateTip(dt)
    this.app.view.trayPrompt = n && this.trayRect ? n : 0
    this.app.view.trayPick = this.trayMode === 'pick' ? (/^die\d$/.test(this.hover || '') ? +this.hover.slice(3) : -1) : null
    this.updateTrayFrame(dt)
  }
}
