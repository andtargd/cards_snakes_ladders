// The screen layer: a 2D canvas (panels, buttons, log, menus) drawn over the board, plus the hand of
// cards as textured planes so they can slide, lift and fly without redrawing the canvas.
import * as THREE from 'three'
import * as P from './paper.js'
import { CARD, CARDS, FX, targetsFor, whyNot, choiceMax, CFG, SIZES } from './rules.js'
import { T } from './strings.js'

const CARD_VS = 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }'
const CARD_FS = `
uniform sampler2D map; uniform float time; uniform float legendary; uniform float dim; uniform float opacity; uniform float lift;
uniform float burn; uniform float heat; uniform float seed;
varying vec2 vUv;
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

// the gold frame round the dice tray when it is my roll: a shine runs round it and rings go out, asking for a click
const FRAME_VS = CARD_VS
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
    this.target = null // { i, card, kind, list, sel }
    this.selected = -1
    this.helpPage = 0
    this.picker = false // the Shared Table's invite list is open
    this.rows = new Map() // the players panel: where each player's row stands now, sliding to its place
    this.rowRect = []
    this.promptN = 0 // dice waiting in the tray for my click
    this.resize()
    this.makeBanner()
    this.makeTrayFrame()
  }

  // ---------- canvas layer ----------
  resize() {
    const W = this.p0.width, H = this.p0.height
    this.W = W; this.H = H
    this.dpr = Math.min(this.p0.pixelRatio || 1, 2)
    this.u = THREE.MathUtils.clamp(Math.min(W / 1100, H / 680), 0.58, 1.6)
    this.narrow = W < 720
    this.cam.left = 0; this.cam.right = W; this.cam.top = H; this.cam.bottom = 0
    this.cam.updateProjectionMatrix()
    // the screen goes under the cards; the windows over it (menu, results, invitations) go over them
    this.base = this.makeLayer(this.base, 0)
    this.over = this.makeLayer(this.over, 50)
    this.g = this.base.g
    this.dirty = true
  }
  makeLayer(old, order) {
    const W = this.W, H = this.H
    if (old) { this.scene.remove(old.mesh); old.tex.dispose(); old.mesh.geometry.dispose(); old.mesh.material.dispose() }
    const { c, g } = P.canvas(Math.max(2, Math.round(W * this.dpr)), Math.max(2, Math.round(H * this.dpr)))
    const tex = new THREE.CanvasTexture(c)
    tex.colorSpace = THREE.SRGBColorSpace
    tex.generateMipmaps = false
    tex.minFilter = THREE.LinearFilter
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(W, H), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false }))
    mesh.position.set(W / 2, H / 2, order)
    mesh.renderOrder = order
    this.scene.add(mesh)
    return { c, g, tex, mesh, used: true }
  }

  cardTexture(id) {
    if (this.cardTex.has(id)) return this.cardTex.get(id)
    const { c, g } = P.canvas(288, 403)
    if (id === 'back') P.drawCardBack(g, 288, 403); else P.drawCard(g, id, 288, 403)
    const t = new THREE.CanvasTexture(c)
    t.colorSpace = THREE.NoColorSpace
    t.anisotropy = 4
    this.cardTex.set(id, t)
    return t
  }
  makeCard(id) {
    const mat = new THREE.ShaderMaterial({
      uniforms: { map: { value: this.cardTexture(id) }, time: { value: 0 }, legendary: { value: id !== 'back' && CARD[id].rar === 'L' ? 1 : 0 }, dim: { value: 0 }, opacity: { value: 1 }, lift: { value: 0 }, burn: { value: 0 }, heat: { value: 0 }, seed: { value: Math.random() * 50 } },
      vertexShader: CARD_VS, fragmentShader: CARD_FS, transparent: true, depthTest: false, depthWrite: false,
    })
    const mesh = new THREE.Mesh(this.cardGeo ||= new THREE.PlaneGeometry(1, 1.4), mat)
    mesh.renderOrder = 10
    this.scene.add(mesh)
    return mesh
  }
  dropCard(mesh) { this.scene.remove(mesh); mesh.material.dispose() }

  /** Draws the layers under the dice tray (top = false) or over it (the windows and what stands on them). */
  render(renderer, top) {
    const shown = []
    for (const o of this.scene.children) if (o.visible && (o.renderOrder >= 50) !== top) { o.visible = false; shown.push(o) }
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
    const want = (this.promptN || this.trayMode === 'end') && r ? 1 : 0
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
  /** How many dice wait in the tray for my click (0 when it is not my roll, or the roll is a chosen value). */
  rollPrompt() {
    const app = this.app, s = app.view.state, me = app.mySeat()
    if (app.screen !== 'game' || !s || me < 0 || s.cur !== me || s.ph !== 'main' || s.rolled) return 0
    // (it stays up while my roll is on its way to the table's host, so the dice are tossed from where they lie)
    if (app.view.busy || app.curtain() >= 0 || app.menuOpen || app.invite) return 0
    const fx = s.pl[me].fx
    return fx.gd || fx.cf ? 0 : fx.x ? 2 : 1
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
    if (inGame && this.target) { text = T.chooseWhat(CARD[this.target.card].tgt); sub = T.targetHint(this.target.kind) }
    else if (discard) { text = T.discardTitle; sub = T.discardHint(s.pl[me].h.length - CFG.hand) }
    else if (inGame && b.turn > 0) text = b.turnText
    if (text && (text !== b.text || sub !== b.sub)) { this.drawBanner(text, sub); b.text = text; b.sub = sub; b.pop = 0 }
    const want = text ? 1 : 0
    b.op += (want - b.op) * (1 - Math.exp(-(want ? 12 : 5) * dt))
    b.pop = Math.min(1, b.pop + dt * 4)
    const k = this.u * 32 / 64 // the 64 px letters show about 32 px tall
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
    return this.narrow ? (this.panelBottom || 0) + 50 * u : 72 * u
  }

  // ---------- drawing helpers ----------
  font(px, bold = true) { return `${bold ? 'bold ' : ''}${Math.round(px)}px ${P.FONT}` }
  text(t, x, y, { size = 16, color = P.INK, align = 'left', bold = true, max } = {}) {
    const g = this.g
    g.font = this.font(size * this.u, bold)
    g.fillStyle = color
    g.textAlign = align
    g.textBaseline = 'middle'
    if (max) g.fillText(t, x, y, max); else g.fillText(t, x, y)
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
    if (!disabled) this.hits.push({ key, x, y, w, h, action })
  }

  // ---------- main draw ----------
  draw() {
    const W = this.W, H = this.H
    let g = this.g = this.base.g
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0)
    g.clearRect(0, 0, W, H)
    this.hits = []
    this.modal = false // a window is open over the cards: they take no clicks
    this.trayRect = null // the tray on screen
    this.trayDice = null // where the view draws the dice: the tray, unless it shows End Turn or values to choose
    this.trayMode = null // 'roll', 'end', 'choose' or 'show'
    const app = this.app
    // the board stands in the middle, unless a title screen moves it aside
    app.view.aside.side = 0; app.view.aside.scale = 1
    // the title screens stand beside the board when the screen is wide; on a phone they fill it, in bigger type
    const u0 = this.u
    this.menuWide = W >= 720 && W / u0 >= 980
    if (app.screen === 'menu' || app.screen === 'local') {
      if (!this.menuWide) this.u = Math.max(u0, Math.min(W / 440, H / 760, 1.2))
      if (app.screen === 'menu') this.drawMenu(); else this.drawLocal()
      this.u = u0
    } else if (app.screen === 'lobby') this.drawLobby()
    else if (app.screen === 'help') this.drawHelp()
    else if (app.screen === 'game') this.drawGame()
    if (app.screen !== 'lobby') this.picker = false
    this.base.tex.needsUpdate = true
    // the windows, on the layer over the cards
    const ov = this.over
    g = this.g = ov.g
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0)
    if (ov.used) g.clearRect(0, 0, W, H)
    if (app.screen === 'game') this.drawGameWindows()
    if (this.picker) this.drawPicker()
    if (app.invite) this.drawInvite()
    if (this.toast) {
      const t = this.toast
      g.font = this.font(16 * this.u)
      const w = g.measureText(t.text).width + 40 * this.u
      // in a game it stands at the top, under the message there, clear of the board
      const ty = app.screen === 'game' ? this.bannerTop() + (this.banner.op > 0.05 ? 84 : 4) * this.u : H * 0.42
      this.panel((W - w) / 2, ty, w, 40 * this.u, { fill: 'rgba(43,38,34,0.88)', stroke: null, r: 18 })
      this.text(t.text, W / 2, ty + 20 * this.u, { color: '#ffffff', align: 'center' })
    }
    const used = this.modal || !!this.toast || !!this.peekRect
    if (used || ov.used) ov.tex.needsUpdate = true
    ov.used = used
    this.g = this.base.g
    this.dirty = false
  }

  drawLogo(cx, y, scale = 1) {
    const g = this.g, u = this.u * scale
    const line = (t, yy, size, colors) => {
      g.font = this.font(size * u)
      g.textAlign = 'center'; g.textBaseline = 'middle'
      colors.forEach((c, i) => { g.fillStyle = c; g.fillText(t, cx + (colors.length - 1 - i) * 3 * u, yy + (colors.length - 1 - i) * 3 * u) })
    }
    // navy letters on the cream panel, over a yellow / orange paper offset
    line('Cards,', y, 40, ['rgba(45,58,107,0.18)', '#f2c14e', '#2d3a6b'])
    line('Snakes & Ladders', y + 50 * u, 52, ['rgba(45,58,107,0.18)', '#e8743b', '#2d3a6b'])
  }

  /**
   * The title screens stand in a column of paper on the left, the board rests on the right; on a narrow
   * screen the paper covers it all. `cw` is the content's width: the paper is as wide as it needs.
   */
  menuLayout(cw) {
    const W = this.W, H = this.H, u = this.u
    const wide = this.menuWide
    const fr = this.app.view.aside
    if (!wide) {
      const w = Math.min(cw, W - 32 * u)
      this.g.fillStyle = 'rgba(243,238,229,0.9)'; this.g.fillRect(0, 0, W, H)
      return { wide, x: (W - w) / 2, w }
    }
    const zone = Math.min(W * 0.66, Math.max(W * 0.5, cw + 120 * u))
    fr.side = zone / (2 * W)
    fr.scale = THREE.MathUtils.clamp((W - zone) / W * 1.45, 0.45, 0.8)
    const g = this.g, gr = g.createLinearGradient(0, 0, zone * 1.15, 0)
    gr.addColorStop(0, 'rgba(243,238,229,1)'); gr.addColorStop(0.8, 'rgba(243,238,229,0.97)'); gr.addColorStop(1, 'rgba(243,238,229,0.3)')
    g.fillStyle = gr; g.fillRect(0, 0, zone * 1.15, H)
    // a light veil keeps the board quiet behind the buttons
    g.fillStyle = 'rgba(243,238,229,0.3)'; g.fillRect(zone * 1.15, 0, W - zone * 1.15, H)
    return { wide, x: (zone - cw) / 2, w: cw }
  }

  drawMenu() {
    const H = this.H, u = this.u, app = this.app
    const web = this.p0.web, room = web?.room // the browser build: online rooms stand in for the lot
    const { x, w } = this.menuLayout(400 * u)
    const table = this.p0.table || []
    const ch = (room ? 470 : 430) * u, cx = x + w / 2
    let y = Math.max(16 * u, (H - ch - (table.length ? 90 * u : 0)) / 2)
    this.drawLogo(cx, y + 30 * u, Math.min(1, w / (440 * u)))
    this.text(T.tagline, cx, y + 116 * u, { size: 14, align: 'center', bold: false, color: '#5b544c', max: w })
    y += 156 * u
    this.bigButton('local', T.playLocally, T.playLocallySub, x, y, w, 76 * u, () => { app.screen = 'local'; this.dirty = true }, '#e8743b')
    y += 92 * u
    const online = web && !room ? () => web.online() : () => app.openLobby()
    this.bigButton('online', web ? T.playOnline : T.sharedTable, web ? T.playOnlineSub : T.sharedTableSub, x, y, w, 76 * u, online, '#2d3a6b')
    y += 88 * u
    if (room) {
      this.text(T.roomLine(room.code, app.sessionCount()), x + 4 * u, y + 16 * u, { size: 13.5, max: w * 0.4 - 8 * u })
      this.button('share', T.shareLink, x + w * 0.4, y, w * 0.3 - 4 * u, 32 * u, () => this.shareRoom(), { size: 13 })
      this.button('leaveroom', T.leaveRoom, x + w * 0.7 + 4 * u, y, w * 0.3 - 4 * u, 32 * u, () => web.leave(), { size: 13 })
      y += 44 * u
    } else if (!web) {
      const others = app.sessionCount() - 1
      this.text(others > 0 ? T.othersHere(others) : T.aloneHere, cx, y + 2 * u, { size: 12, align: 'center', bold: false, color: '#7a7268', max: w })
      y += 22 * u
    }
    this.ghostButton('help', T.howToPlay, cx - 80 * u, y + 6 * u, 160 * u, 36 * u, () => { app.screen = 'help'; this.helpPage = 0; this.dirty = true })
    y += 58 * u
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

  /** Play Locally: the mode, big; the table's settings beside it, quiet; and Play. */
  drawLocal() {
    const H = this.H, u = this.u, app = this.app, c = app.cfg
    const save = fn => () => { fn(); app.saveSettings(); this.dirty = true }
    const minTotal = () => (c.mode === 'fool' ? 3 : 2)
    const fill = () => { const lack = minTotal() - c.humans - c.bots; if (lack > 0) c.bots += lack }
    const sideW = 220 * u, gap = 26 * u
    const L = this.menuLayout(640 * u)
    const side = L.wide // the settings stand beside the modes, or under them
    const mw = side ? L.w - sideW - gap : L.w
    const cardW = (mw - 16 * u) / 2, cardH = Math.min(side ? 240 * u : 210 * u, cardW * 1.25)
    const setH = 236 * u
    const blockH = 44 * u + cardH + 18 * u + 66 * u + (side ? 0 : 20 * u + setH)
    const x = L.x
    let y = Math.max(14 * u, (H - blockH) / 2)
    this.ghostButton('back', '← ' + T.back, x - 8 * u, y, 96 * u, 32 * u, () => { app.screen = 'menu'; this.dirty = true })
    this.text(T.chooseMode, x + mw / 2, y + 16 * u, { size: 18, align: 'center', color: '#2d3a6b' })
    y += 44 * u
    const top = y
    const pick = m => save(() => { if (c.mode !== m) app.playSound('select', 0.35); c.mode = m; fill() })
    this.modeCard('champion', x, y, cardW, cardH, c.mode === 'champion', pick('champion'))
    this.modeCard('fool', x + cardW + 16 * u, y, cardW, cardH, c.mode === 'fool', pick('fool'))
    y += cardH + 18 * u
    this.playButton(x, y, mw, 66 * u, () => app.startSolo())
    y += 66 * u
    // the settings: who plays, how well the bots play, the board's size
    const sx = side ? x + mw + gap : x, sy = side ? top : y + 20 * u, sw = side ? sideW : mw
    const sh = side ? y - top : setH
    this.panel(sx, sy, sw, sh, { fill: 'rgba(255,253,248,0.6)', stroke: 'rgba(43,38,34,0.1)', r: 14 })
    const ix = sx + 16 * u, iw = sw - 32 * u
    let yy = sy + 14 * u
    const rowGap = Math.max(0, (sh - 24 * u - 4 * 52 * u) / 3)
    const total = c.humans + c.bots
    const label = (t, extra) => {
      this.text(t, ix, yy + 8 * u, { size: 12.5, color: '#7a7268' })
      if (extra) this.text(extra, ix + iw, yy + 8 * u, { size: 11, align: 'right', bold: false, color: '#9a948a', max: iw * 0.62 })
    }
    label(T.players, c.humans > 1 ? T.hotseatShort : '')
    this.miniStepper('hum', ix, yy + 20 * u, iw, c.humans, save(() => { c.humans--; fill() }), save(() => { c.humans++; if (c.humans + c.bots > 6) c.bots-- }),
      c.humans > 1, c.humans < 6 && (total < 6 || c.bots > 0))
    yy += 52 * u + rowGap
    label(T.bots)
    this.miniStepper('bots', ix, yy + 20 * u, iw, c.bots, save(() => { c.bots-- }), save(() => { c.bots++ }), c.bots > 0 && total - 1 >= minTotal(), total < 6)
    yy += 52 * u + rowGap
    label(T.level)
    this.segmented('lvl', ix, yy + 20 * u, iw, [1, 2, 3], T.levels, c.level, l => save(() => { c.level = l })(), !c.bots)
    yy += 52 * u + rowGap
    label(T.board)
    this.segmented('size', ix, yy + 20 * u, iw, SIZES, SIZES.map(String), c.size, n => save(() => { c.size = n })())
    this.soundControl()
  }

  /** A big button for the title screen: a label and a line under it, on a paper offset. */
  bigButton(key, label, sub, x, y, w, h, action, color) {
    const g = this.g, u = this.u, hov = this.hover === key, lift = hov ? 3 * u : 0, r = 16 * u
    g.fillStyle = 'rgba(43,38,34,0.16)'; P.roundRect(g, x, y + 5 * u, w, h, r); g.fill()
    g.fillStyle = color; P.roundRect(g, x, y - lift, w, h, r); g.fill()
    g.strokeStyle = 'rgba(0,0,0,0.18)'; g.lineWidth = 1.5 * u; g.stroke()
    this.text(label, x + w / 2, y - lift + h * 0.4, { size: 23, align: 'center', color: '#ffffff', max: w - 24 * u })
    this.text(sub, x + w / 2, y - lift + h * 0.72, { size: 12.5, align: 'center', bold: false, color: 'rgba(255,255,255,0.82)', max: w - 24 * u })
    this.hits.push({ key, x, y: y - lift, w, h: h + lift, action })
  }
  /** A quiet button: no fill until the pointer is on it. */
  ghostButton(key, label, x, y, w, h, action) {
    const g = this.g, hov = this.hover === key
    if (hov) { g.fillStyle = 'rgba(43,38,34,0.07)'; P.roundRect(g, x, y, w, h, h / 2); g.fill() }
    this.text(label, x + w / 2, y + h / 2 + 1, { size: 15, align: 'center', color: hov ? P.INK : '#5b544c', max: w - 8 })
    this.hits.push({ key, x, y, w, h, action })
  }
  /** Champion in gold, Fool in gloom: a big card to pick the mode by. */
  modeCard(mode, x, y, w, h, selected, action) {
    const g = this.g, u = this.u, key = 'mode' + mode, hov = this.hover === key
    const champ = mode === 'champion'
    const lift = selected ? 4 * u : hov ? 2 * u : 0
    y -= lift
    const r = 18 * u
    g.save()
    if (!selected) g.globalAlpha = hov ? 0.9 : 0.72
    // the frame's glow, then the card
    g.save()
    g.shadowColor = champ ? 'rgba(255,186,40,0.75)' : 'rgba(34,18,48,0.6)'
    g.shadowBlur = (selected ? 22 : 0) * u
    g.shadowOffsetY = (selected ? 4 : 0) * u
    g.fillStyle = champ ? (selected ? '#fffaf0' : '#fffdf8') : (selected ? '#f1ecf5' : '#fffdf8')
    P.roundRect(g, x, y, w, h, r); g.fill()
    g.restore()
    const gr = g.createLinearGradient(x, y, x + w, y + h)
    if (champ) { gr.addColorStop(0, '#ffe08a'); gr.addColorStop(0.4, '#d29a12'); gr.addColorStop(0.65, '#fff0b3'); gr.addColorStop(1, '#b8800a') }
    else { gr.addColorStop(0, '#5a4470'); gr.addColorStop(0.45, '#241830'); gr.addColorStop(0.7, '#6e5a82'); gr.addColorStop(1, '#1c1226') }
    g.strokeStyle = gr; g.lineWidth = (selected ? 5 : 2.5) * u
    P.roundRect(g, x, y, w, h, r); g.stroke()
    if (selected) {
      // a thin inner line, as on the gold cards
      g.strokeStyle = champ ? 'rgba(210,154,18,0.45)' : 'rgba(60,40,80,0.35)'; g.lineWidth = 1.2 * u
      P.roundRect(g, x + 8 * u, y + 8 * u, w - 16 * u, h - 16 * u, r - 6 * u); g.stroke()
    }
    const s = Math.min(w * 0.42, h * 0.36)
    if (champ) this.crown(x + w / 2, y + h * 0.31, s)
    else this.jesterCap(x + w / 2, y + h * 0.31, s)
    this.text(champ ? T.champion : T.fool, x + w / 2, y + h * 0.6, { size: Math.min(26, w / u / 7.5), align: 'center', color: champ ? '#9a6b00' : '#3a2a4c' })
    g.font = this.font(12.5 * u, false)
    const lines = P.wrapText(g, champ ? T.championDesc : T.foolDesc, w - 36 * u).slice(0, 2)
    lines.forEach((l, i) => this.text(l, x + w / 2, y + h * 0.79 + (i - (lines.length - 1) / 2) * 17 * u, { size: 12.5, align: 'center', bold: false, color: '#5b544c' }))
    g.restore()
    this.hits.push({ key, x, y, w, h: h + lift, action })
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
  /** The big Play: orange into gold, on its paper offset, with a warm glow. */
  playButton(x, y, w, h, action) {
    const g = this.g, u = this.u, hov = this.hover === 'play', lift = hov ? 3 * u : 0, r = 18 * u
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
    g.strokeStyle = 'rgba(255,255,255,0.45)'; g.lineWidth = 1.5 * u; P.roundRect(g, x + 5 * u, y + 4 * u, w - 10 * u, h * 0.45, r - 5 * u); g.stroke()
    g.save()
    g.shadowColor = 'rgba(120,50,0,0.45)'; g.shadowOffsetY = 2 * u; g.shadowBlur = 3 * u
    this.text(T.play, x + w / 2, y + h / 2 + 2 * u, { size: 32, align: 'center', color: '#ffffff' })
    g.restore()
    this.hits.push({ key: 'play', x, y, w, h: h + lift, action })
  }
  /** − value + in a small row, `w` wide. */
  miniStepper(key, x, y, w, value, dec, inc, canDec, canInc) {
    const u = this.u, b = 30 * u
    this.button(key + '-', '−', x, y, b, b, dec, { disabled: !canDec, size: 16 })
    this.text(String(value), x + w / 2, y + b / 2 + 1, { size: 17, align: 'center' })
    this.button(key + '+', '+', x + w - b, y, b, b, inc, { disabled: !canInc, size: 16 })
  }
  /** A row of quiet choices: the chosen one in white with a navy line. */
  segmented(key, x, y, w, values, labels, current, pick, disabled = false) {
    const g = this.g, u = this.u, h = 30 * u, n = values.length, sw = w / n
    g.fillStyle = 'rgba(43,38,34,0.06)'; P.roundRect(g, x, y, w, h, 9 * u); g.fill()
    values.forEach((v, i) => {
      const k = key + v, on = v === current, hov = this.hover === k && !disabled
      const bx = x + i * sw
      if (on && !disabled) {
        g.fillStyle = '#ffffff'; P.roundRect(g, bx + 2 * u, y + 2 * u, sw - 4 * u, h - 4 * u, 7 * u); g.fill()
        g.strokeStyle = 'rgba(45,58,107,0.55)'; g.lineWidth = 1.3 * u; g.stroke()
      } else if (hov) { g.fillStyle = 'rgba(255,255,255,0.6)'; P.roundRect(g, bx + 2 * u, y + 2 * u, sw - 4 * u, h - 4 * u, 7 * u); g.fill() }
      this.text(labels[i], bx + sw / 2, y + h / 2 + 1, { size: 12.5, align: 'center', bold: on, color: disabled ? '#b5afa5' : on ? '#2d3a6b' : '#7a7268', max: sw - 6 * u })
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
    this.hits.push({ key, x: x - 10 * u, y, w: w + 20 * u, h, action: () => {}, drag: px => app.setVolume((px - x) / w), end: () => { app.saveSettings(); app.playSound('select', 0.5) } })
  }
  /** The title screens' corner: the slider, then the speaker. */
  soundControl() {
    const u = this.u, s = 36 * u, x = this.W - s - 14 * u, y = 14 * u
    this.soundButton('snd', x, y, s)
    if (this.W >= 320) this.volumeSlider('vol', x - 122 * u, y, 104 * u, s)
  }

  /** The web build: send the online room's link. */
  shareRoom() {
    this.p0.web.share().then(r => { if (r === 'copied') this.say(T.linkCopied, 3); else if (r === 'failed') this.say(T.linkFailed, 3) })
  }

  /** "Board" and a button per size (50, 70, 100 cells). */
  sizeButtons(key, x, y, w, current, pick, enabled) {
    const u = this.u, lw = 70 * u, gap = 6 * u, bw = (w - lw - gap * (SIZES.length - 1)) / SIZES.length
    this.text(T.board, x, y + 18 * u, { size: 15 })
    SIZES.forEach((n, i) => this.button(key + n, String(n), x + lw + i * (bw + gap), y, bw, 36 * u, () => pick(n), { selected: current === n, disabled: !enabled && current !== n, size: 15 }))
  }

  drawHelp() {
    const W = this.W, H = this.H, u = this.u, app = this.app
    const pw = Math.min(W - 20 * u, 780 * u), ph = Math.min(H - 20 * u, 600 * u)
    const x = (W - pw) / 2, y = (H - ph) / 2
    this.panel(x, y, pw, ph, { fill: 'rgba(255,253,248,0.96)' })
    this.text(this.helpPage === 0 ? T.howToPlay : T.theCards, W / 2, y + 30 * u, { size: 22, align: 'center' })
    if (this.helpPage === 0) {
      const g = this.g
      g.font = this.font(14.5 * u, false)
      let yy = y + 66 * u
      for (const para of T.rules) {
        const lines = P.wrapText(g, para, pw - 60 * u)
        for (const l of lines) { this.text(l, x + 30 * u, yy, { size: 14.5, bold: false }); yy += 20 * u }
        yy += 8 * u
        if (yy > y + ph - 70 * u) break
      }
    }
    this.button('helpback', T.back, x + 20 * u, y + ph - 56 * u, 130 * u, 40 * u, () => { app.screen = 'menu'; this.dirty = true })
    this.button('helpnext', this.helpPage === 0 ? T.theCards + ' →' : '← ' + T.rulesShort, x + pw - 200 * u, y + ph - 56 * u, 180 * u, 40 * u, () => { this.helpPage = 1 - this.helpPage; this.dirty = true }, { primary: true })
  }

  drawLobby() {
    const W = this.W, H = this.H, u = this.u, app = this.app
    const lob = app.lobby()
    const isHost = this.p0.room.isHost
    const pw = Math.min(W - 20 * u, 520 * u), ph = Math.min(H - 20 * u, 634 * u)
    const x = (W - pw) / 2, y = (H - ph) / 2
    this.panel(x, y, pw, ph, { fill: 'rgba(255,253,248,0.95)' })
    this.text(T.sharedTable, W / 2, y + 30 * u, { size: 22, align: 'center' })
    const room = this.p0.web?.room, hostLine = isHost ? T.youHost : T.hostIs(app.nameOf(this.p0.room.host))
    this.text(room ? `${T.roomCode(room.code)} · ${hostLine}` : hostLine, W / 2, y + 56 * u, { size: 13, align: 'center', bold: false, color: '#5b544c' })
    const bx = x + 24 * u, bw = pw - 48 * u
    let yy = y + 76 * u
    const modes = [['champion', 'Champion'], ['fool', 'Fool']]
    modes.forEach(([m, label], i) => this.button('lmode' + m, label, bx + i * (bw / 2 + 4 * u), yy, bw / 2 - 4 * u, 36 * u, () => app.lobbyCmd({ t: 'mode', mode: m }), { selected: lob.mode === m, disabled: !isHost && lob.mode !== m, size: 15 }))
    yy += 44 * u
    this.sizeButtons('lsize', bx, yy, bw, lob.size || 100, n => app.lobbyCmd({ t: 'size', size: n }), isHost)
    yy += 48 * u
    const seats = lob.seats
    for (let i = 0; i < 6; i++) {
      const s = seats[i]
      const ry = yy + i * 44 * u
      this.panel(bx, ry, bw, 38 * u, { fill: s ? '#ffffff' : 'rgba(255,255,255,0.5)', r: 10 })
      this.g.fillStyle = P.PLAYER_COLORS[i]
      this.g.beginPath(); this.g.arc(bx + 20 * u, ry + 19 * u, 9 * u, 0, Math.PI * 2); this.g.fill()
      if (!s) { this.text(T.emptySeat, bx + 40 * u, ry + 19 * u, { size: 14, bold: false, color: '#9a948a' }); continue }
      const label = s.b ? `${s.n} · ${['', 'Easy', 'Medium', 'Hard'][s.b]} bot` : s.n + (s.id === this.p0.me.id ? ` (${T.you})` : '')
      this.text(label, bx + 40 * u, ry + 19 * u, { size: 14.5, max: bw - 170 * u })
      if (isHost && s.b) {
        this.button('lvl' + i, ['', 'Easy', 'Medium', 'Hard'][s.b], bx + bw - 150 * u, ry + 4 * u, 80 * u, 30 * u, () => app.lobbyCmd({ t: 'botlvl', seat: i }), { size: 13 })
        this.button('rm' + i, '✕', bx + bw - 62 * u, ry + 4 * u, 52 * u, 30 * u, () => app.lobbyCmd({ t: 'remove', seat: i }), { size: 13 })
      }
    }
    yy += 6 * 44 * u + 6 * u
    const mine = seats.findIndex(s => s && s.id === this.p0.me.id)
    const full = seats.filter(Boolean).length >= 6
    if (mine < 0) this.button('sit', T.takeSeat, bx, yy, bw / 3 - 4 * u, 40 * u, () => app.lobbyCmd({ t: 'sit' }), { disabled: full, size: 15 })
    else this.button('stand', T.leaveSeat, bx, yy, bw / 3 - 4 * u, 40 * u, () => app.lobbyCmd({ t: 'stand' }), { size: 15 })
    this.button('addbot', T.addBot, bx + bw / 3, yy, bw / 3 - 4 * u, 40 * u, () => app.lobbyCmd({ t: 'bot' }), { disabled: !isHost || full, size: 15 })
    const others = app.notSeated().length
    this.button('invite', T.invite + (others ? ` (${others})` : ''), bx + bw * 2 / 3 + 4 * u, yy, bw / 3 - 4 * u, 40 * u, () => { this.picker = true; this.dirty = true }, { size: 15, primary: others > 0, color: '#2d3a6b' })
    yy += 52 * u
    const n = seats.filter(Boolean).length
    const humans = seats.filter(s => s && !s.b).length
    const can = isHost && n >= 2 && humans >= 1 && (lob.mode !== 'fool' || n >= 3)
    this.button('lback', T.back, bx, yy, 120 * u, 44 * u, () => app.leaveLobby(), { size: 15 })
    if (isHost) this.button('lstart', T.startGame, bx + 130 * u, yy, bw - 130 * u, 44 * u, () => app.lobbyCmd({ t: 'start' }), { primary: true, disabled: !can, size: 18 })
    else this.text(T.waitingHost, bx + 130 * u + (bw - 130 * u) / 2, yy + 22 * u, { size: 14, align: 'center', bold: false, color: '#5b544c' })
    if (isHost && lob.mode === 'fool' && n < 3) this.text(T.foolNeeds3, W / 2, yy + 58 * u, { size: 12, align: 'center', bold: false, color: '#d64545' })
  }

  /** The Shared Table's invite list: everyone in the lot who is not sitting here, and the city's invitation. */
  drawPicker() {
    const W = this.W, H = this.H, u = this.u, app = this.app
    const ids = app.notSeated().slice(0, 6)
    const rows = Math.max(1, ids.length)
    const pw = Math.min(W - 20 * u, 430 * u), ph = (128 + rows * 46 + 64) * u
    const x = (W - pw) / 2, y = Math.max(10 * u, (H - ph) / 2)
    this.modal = true
    this.hits.push({ key: 'block', x: 0, y: 0, w: W, h: H, action: () => {} })
    this.g.fillStyle = 'rgba(30,26,22,0.35)'; this.g.fillRect(0, 0, W, H)
    this.panel(x, y, pw, ph, { fill: 'rgba(255,253,248,0.98)', stroke: '#2d3a6b', lw: 2.5 })
    this.text(T.inviteTitle, W / 2, y + 32 * u, { size: 21, align: 'center', color: '#2d3a6b' })
    const room = this.p0.web?.room
    this.text(room ? T.roomSub : T.inviteSub, W / 2, y + 58 * u, { size: 12.5, align: 'center', bold: false, color: '#5b544c', max: pw - 30 * u })
    const bx = x + 20 * u, bw = pw - 40 * u
    let yy = y + 80 * u
    if (!ids.length) this.text(room ? T.noOneRoom : T.noOneHere, W / 2, yy + 20 * u, { size: 14, align: 'center', bold: false, color: '#9a948a', max: bw })
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
    if (room) this.button('invlink', T.shareLink, bx, by, bw * 0.6 - 4 * u, 42 * u, () => this.shareRoom(), { size: 14, primary: !ids.length, color: '#2d3a6b' })
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
    this.hits.push({ key: 'block', x: 0, y: 0, w: W, h: H, action: () => {} })
    this.g.fillStyle = 'rgba(30,26,22,0.3)'; this.g.fillRect(0, 0, W, H)
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
    const pw = this.narrow ? Math.min(W - 16 * u, 340 * u) : 236 * u
    const rowH = this.narrow ? 34 * u : 48 * u
    const cols = this.narrow ? 2 : 1
    const colW = (pw - (cols - 1) * 6 * u) / cols
    const px = 10 * u, py = 10 * u
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
      g.fillStyle = P.PLAYER_COLORS[p.c % 6]
      g.beginPath(); g.arc(cx + rowH / 2, cy + rowH / 2, rowH * 0.32, 0, Math.PI * 2); g.fill()
      this.text(p.n.slice(0, 1).toUpperCase(), cx + rowH / 2, cy + rowH / 2 + 1, { size: this.narrow ? 13 : 16, color: '#ffffff', align: 'center' })
      const nx = cx + rowH * 0.95
      const sub = p.d ? T.place(p.d) : p.pos <= 0 ? T.atStart : T.cellTier(p.pos)
      if (this.narrow) {
        this.text(p.n + (i === me && !hot ? ' ★' : ''), nx, cy + rowH * 0.33, { size: 12.5, max: colW - rowH - 34 * u })
        this.text(sub, nx, cy + rowH * 0.72, { size: 10.5, bold: false, color: '#5b544c', max: colW - rowH - 34 * u })
      } else {
        this.text(p.n + (i === me && !hot ? ` (${T.you})` : '') + (p.b ? ' · bot' : ''), nx, cy + 16 * u, { size: 14.5, max: colW - rowH - 50 * u })
        this.text(sub, nx, cy + 34 * u, { size: 12, bold: false, color: '#5b544c' })
      }
      // cards in hand and effects
      const hx = cx + colW - 26 * u
      g.fillStyle = '#2d3a6b'
      P.roundRect(g, hx - 8 * u, cy + rowH / 2 - 11 * u, 16 * u, 22 * u, 3 * u); g.fill()
      this.text(String(p.h.length), hx, cy + rowH / 2 + 1, { size: 12, color: '#ffffff', align: 'center' })
      const fx = Object.keys(p.fx).filter(k => FX[k])
      if (!this.narrow) fx.slice(0, 5).forEach((k, j) => {
        const ix = hx - 26 * u - j * 20 * u, iy = cy + 34 * u
        P.drawIcon(g, FX[k].card, ix, iy, 16 * u, P.CAT_COLORS[FX[k].card[0]])
        if (p.fx[k].t) this.text(String(p.fx[k].t), ix + 8 * u, iy - 6 * u, { size: 9 })
      })
      else if (fx.length) this.text('✦' + fx.length, hx - 22 * u, cy + rowH / 2, { size: 11, color: '#7b5ce0', align: 'center' })
      if (valid) this.hits.push({ key: 'pl' + i, x: cx, y: cy, w: colW, h: rowH, action: () => this.chooseTarget(i) })
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
    else if (myTurn && s.frozen && !s.rolled) status = T.cantPlay
    else if (myTurn) status = s.rolled ? T.playOrEnd : hot ? T.turnOf(s.pl[me].n) : T.yourTurn
    else status = T.waitingFor(s.pl[s.cur].n)
    const sw = Math.min(W - 20 * u, Math.max(260 * u, this.measure(status, 17) + 60 * u))
    const sy = this.narrow ? panelBottom + 4 * u : 10 * u
    const sx = this.narrow ? (W - sw) / 2 : Math.max(pw + 20 * u, (W - sw) / 2)
    this.panel(sx, sy, sw, 40 * u, { fill: myTurn ? '#2d3a6b' : 'rgba(255,255,255,0.93)', r: 20 })
    this.text(status, sx + sw / 2, sy + 21 * u, { size: 17, align: 'center', color: myTurn ? '#ffffff' : P.INK, max: sw - 20 * u })
    if (!this.narrow) this.text(T.round(s.round, CFG.roundLimit) + (s.mode === 'fool' ? ' · Fool' : ' · Champion'), sx + sw / 2, sy + 52 * u, { size: 11.5, align: 'center', bold: false, color: '#5b544c' })
    if (app.turnLeft != null && myTurn) this.text(`${Math.ceil(app.turnLeft)} s`, sx + sw - 30 * u, sy + 21 * u, { size: 14, align: 'center', color: app.turnLeft < 10 ? '#ffb4a8' : '#ffffff' })
    // corner buttons: menu, speed, sound, zoom
    const cb = 40 * u
    const rx = W - cb - 10 * u
    this.button('menu', '☰', rx, 10 * u, cb, cb, () => app.openGameMenu(), { size: 18 })
    this.button('speed', `${app.speedLabel()}`, rx - cb - 18 * u, 10 * u, cb + 10 * u, cb, () => app.cycleSpeed(), { size: 14 })
    this.soundButton('snd', rx - 2 * cb - 26 * u, 10 * u, cb)
    const zy = this.narrow ? panelBottom + 54 * u : 64 * u
    this.button('zin', '+', rx, zy, cb, cb, () => app.view.zoom(0.8), { size: 20 })
    this.button('zout', '−', rx, zy + cb + 6 * u, cb, cb, () => app.view.zoom(1.25), { size: 20 })
    this.button('zall', '⤢', rx, zy + 2 * (cb + 6 * u), cb, cb, () => app.view.overview(), { size: 18 })
    // the dice tray (the view draws the dice into it): it shows a roll, waits with a gold frame for my click
    // to roll, offers the values of a chosen roll, and once I have rolled it ends my turn
    const handTop = H - this.handHeight()
    const { x: tx, y: ty, w: tw, h: th } = this.trayBox()
    const pmy = me >= 0 ? s.pl[me] : null
    const ready = myTurn && s.ph === 'main' && curtain < 0 && !busy && !app.menuOpen && !app.invite
    const choose = ready && !s.rolled && !this.target ? choiceMax(pmy.fx) : 0
    const prompt = this.promptN > 0 && s.cur === me
    this.trayMode = prompt ? 'roll' : ready && s.rolled ? 'end' : choose ? 'choose' : 'show' // the tray always stands in its corner
    this.trayTop = null
    if (this.trayMode) {
      const g = this.g, mode = this.trayMode
      this.panel(tx - 4 * u, ty - 4 * u, tw + 8 * u, th + 8 * u, { fill: '#fffdf8', stroke: mode === 'roll' || mode === 'end' ? null : undefined, r: 12 })
      this.trayRect = { x: tx, y: ty, w: tw, h: th }
      if (mode === 'roll' || mode === 'show') this.trayDice = this.trayRect
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
        for (let i = 0; i < 2; i++) this.text(T.endTurn, tx + tw / 2, ty + th / 2 - lift, { size: 40 * k, align: 'center', color: '#2d3a6b', max: tw - 24 * u })
        g.restore()
        if (!this.narrow) pill(T.clickToEnd)
        hit(() => { if (this.target) this.cancelTarget(); app.act({ t: 'end' }) })
      } else if (mode === 'choose') {
        this.text(T.chooseValue, tx + tw / 2, ty + th * 0.24, { size: 20 * k, align: 'center', color: '#2d3a6b' })
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
  }
  /** The peeked hand stays until the roll; I can put it away sooner. */
  peekKey(s) { return s?.peek ? `${s.gid}:${s.turnNo}:${s.peek.tg}` : null }
  closePeek() { if (this.peekRect) { this.peekClosed = this.peekKey(this.app.view.state); this.dirty = true; return true } return false }

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
    const curtain = app.curtain()
    if (curtain >= 0) this.drawCurtain(s.pl[curtain])
    if (s.ph === 'over' && !(app.view.busy || app.waiting)) this.drawResults(s, app.mySeat())
    if (curtain >= 0 || s.ph === 'over' || app.menuOpen) this.modal = true
    if (app.menuOpen) {
      const web = !!this.p0.web
      const mw = Math.min(W - 20 * u, 320 * u)
      // the controls, which used to stand over the players' list, are told here
      this.g.font = this.font(11.5 * u, false)
      const keys = P.wrapText(this.g, T.controls, mw - 36 * u)
      const mh = (web ? 262 : 310) * u + keys.length * 15 * u + 14 * u
      const mx = (W - mw) / 2, my = (H - mh) / 2, bx = mx + 24 * u, bw = mw - 48 * u
      this.panel(mx, my, mw, mh, { fill: 'rgba(255,253,248,0.97)' })
      this.text(T.menuTitle, W / 2, my + 30 * u, { size: 20, align: 'center' })
      this.button('resume', T.resume, bx, my + 60 * u, bw, 44 * u, () => app.openGameMenu(), { primary: true })
      this.button('speed2', `Speed: ${app.speedLabel()}`, bx, my + 112 * u, bw, 40 * u, () => app.cycleSpeed(), { size: 15 })
      // sound: the speaker mutes, the slider sets the volume
      this.soundButton('snd2', bx, my + 160 * u, 40 * u)
      this.volumeSlider('vol2', bx + 58 * u, my + 160 * u, bw - 68 * u, 40 * u)
      this.button('leave', T.leaveGame, bx, my + 208 * u, bw, 40 * u, () => app.toMenu(), { size: 15 })
      if (!web) this.button('exitcity', T.exitCity, bx, my + 256 * u, bw, 40 * u, () => { app.menuOpen = false; this.p0.exit() }, { size: 15, primary: true, color: '#d64545' })
      keys.forEach((l, i) => this.text(l, W / 2, my + (web ? 268 : 316) * u + i * 15 * u, { size: 11.5, align: 'center', bold: false, color: '#5b544c', max: mw - 30 * u }))
    }
  }

  /** Several players at one computer: the next one takes it before their hand shows. */
  drawCurtain(p) {
    const W = this.W, H = this.H, u = this.u, g = this.g
    this.hits = this.hits.filter(h => h.key === 'menu' || h.key === 'snd')
    g.fillStyle = 'rgba(30,26,22,0.42)'; g.fillRect(0, 0, W, H)
    const pw = Math.min(W - 20 * u, 380 * u), ph = 196 * u
    const x = (W - pw) / 2, y = (H - ph) / 2
    const color = P.PLAYER_COLORS[p.c % 6]
    this.panel(x, y, pw, ph, { fill: 'rgba(255,253,248,0.98)', stroke: color, lw: 3.5 })
    g.fillStyle = color
    g.beginPath(); g.arc(W / 2, y + 40 * u, 20 * u, 0, Math.PI * 2); g.fill()
    this.text(p.n.slice(0, 1).toUpperCase(), W / 2, y + 41 * u, { size: 20, align: 'center', color: '#ffffff' })
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
  handHeight() { return this.cardW() * 1.4 * 0.86 + 14 * this.u }
  cardW() { return this.narrow ? Math.min(225, (this.W - 16) / 2.55, this.H * 0.26) : 225 * this.u }
  /** The dice tray: bottom right beside the hand, or on a phone at the left over it. */
  trayBox() {
    const u = this.u, W = this.W, H = this.H
    const w = this.narrow ? THREE.MathUtils.clamp(W * 0.62, 225, 360) : 354 * u, h = w * 0.66
    return { x: this.narrow ? 14 : W - w - 12 * u, y: this.narrow ? H - this.handHeight() - h - 12 * u : H - h - 46 * u, w, h }
  }
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
    const lines = this.logOpen ? this.logLines.slice(-16) : this.logLines.slice(-5)
    if (!lines.length) return
    if (this.narrow && !this.logOpen) {
      this.button('log', T.log, 10 * u, (this.trayTop ?? H - this.handHeight() - 22 * u) - 40 * u, 70 * u, 34 * u, () => { this.logOpen = true; this.dirty = true }, { size: 13 })
      return
    }
    const w = this.narrow ? this.W - 20 * u : 330 * u
    const lh = 19 * u
    const x = 10 * u
    // at the bottom left, or over the hand when the hand reaches there
    const hand = this.cards.filter(c => c.kind === 'hand').length
    const over = !this.narrow && hand && this.handLayout(hand).left < x + w + 8 * u
    if (over) {
      const fit = Math.floor((H - this.handHeight() - 8 * u - (this.panelBottom || 0) - 10 * u - 16 * u) / lh)
      if (fit < 1) return
      lines.splice(0, Math.max(0, lines.length - fit))
    }
    const h = lines.length * lh + 16 * u
    const y = this.narrow ? 120 * u : over ? H - this.handHeight() - h - 8 * u : H - h - 12 * u
    this.panel(x, y, w, h, { fill: 'rgba(255,255,255,0.82)', r: 10 })
    lines.forEach((l, i) => this.text(l, x + 10 * u, y + 8 * u + lh * (i + 0.5), { size: 12.5, bold: false, max: w - 20 * u, color: i === lines.length - 1 ? P.INK : '#4b453e' }))
    this.hits.push({ key: 'logtoggle', x, y, w, h, action: () => { this.logOpen = !this.logOpen; this.dirty = true } })
  }

  drawResults(s, me) {
    const W = this.W, H = this.H, u = this.u, app = this.app
    const pw = Math.min(W - 20 * u, 440 * u), ph = (150 + s.pl.length * 34 + 70) * u
    const x = (W - pw) / 2, y = Math.max(10 * u, (H - ph) / 2 - 40 * u)
    this.panel(x, y, pw, ph, { fill: 'rgba(255,253,248,0.97)' })
    const champ = s.mode === 'champion'
    const title = champ ? T.wins(s.pl[s.res.winner].n) : T.isFool(s.pl[s.res.fool].n)
    this.text(title, W / 2, y + 34 * u, { size: 24, align: 'center', color: champ ? '#c99400' : '#d64545', max: pw - 30 * u })
    if (me >= 0) this.text(champ ? (s.res.winner === me ? T.youWon : T.youFinished(s.res.places[me])) : (s.res.fool === me ? T.youAreFool : T.youFinished(s.res.places[me])), W / 2, y + 66 * u, { size: 15, align: 'center', bold: false })
    if (s.res.limit) this.text(T.roundLimit, W / 2, y + 88 * u, { size: 12, align: 'center', bold: false, color: '#5b544c' })
    const order = s.pl.map((p, i) => i).sort((a, b) => s.res.places[a] - s.res.places[b])
    order.forEach((i, k) => {
      const p = s.pl[i], ry = y + 106 * u + k * 34 * u
      this.g.fillStyle = P.PLAYER_COLORS[p.c % 6]
      this.g.beginPath(); this.g.arc(x + 34 * u, ry + 14 * u, 9 * u, 0, Math.PI * 2); this.g.fill()
      const place = !champ && s.res.fool === i ? 'Fool' : `#${s.res.places[i]}`
      this.text(place, x + 54 * u, ry + 14 * u, { size: 15 })
      this.text(p.n + (i === me ? ` (${T.you})` : ''), x + 110 * u, ry + 14 * u, { size: 15, bold: i === me, max: pw - 220 * u })
      this.text(p.d && !champ ? T.finished : p.pos >= (s.n || 100) ? String(s.n || 100) : T.cellShort(p.pos), x + pw - 30 * u, ry + 14 * u, { size: 13, align: 'right', bold: false })
    })
    let yy = y + 106 * u + s.pl.length * 34 * u + 6 * u
    if (app.reward) { this.text(app.reward, W / 2, yy, { size: 13, align: 'center', bold: false, color: '#2d3a6b', max: pw - 30 * u }); yy += 8 * u }
    const by = y + ph - 58 * u
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
    const peeking = app.screen === 'game' && s && s.peek && s.peek.by === me && me >= 0 && s.cur === me && !hide && !app.menuOpen && this.peekClosed !== this.peekKey(s)
    if (peeking) {
      s.pl[s.peek.tg].h.forEach((id, i) => want.push({ id, key: 'p' + i + id, i, kind: 'peek', n: s.pl[s.peek.tg].h.length }))
    }
    if (app.screen === 'help' && this.helpPage === 1) CARDS.forEach((c, i) => want.push({ id: c.id, key: 'c' + c.id, i, kind: 'catalog' }))
    // keep meshes whose key stays, add new ones, drop the rest
    const next = []
    for (const w of want) {
      let c = this.cards.find(c => c.key === w.key && !next.includes(c))
      if (!c) {
        c = { ...w, mesh: this.makeCard(w.id), x: this.W + 80 * this.u, y: this.H - 60 * this.u, s: 0.4 }
        if (w.kind === 'catalog' || w.kind === 'peek') { c.x = this.W / 2; c.y = this.H / 2; c.s = 0.2 }
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
    hand.forEach((c, k) => {
      const x = cx + (k - (n - 1) / 2) * gap
      const hov = this.hover === 'card' + c.i
      const sel = this.selected === c.i
      const lift = sel ? 0.5 : hov ? 0.32 : 0
      c.tx = x; c.ty = H - cw * 1.4 * 0.42 + 6 * u - lift * cw * 0.7
      c.ts = cw * (sel || hov ? 1.12 : 1)
      c.tx = Math.min(W - c.ts / 2 - 4, Math.max(c.ts / 2 + 4, c.tx))
      c.rot = (k - (n - 1) / 2) * -0.05 * (sel ? 0 : 1)
      const playable = myTurn && (s.ph === 'disc' || !whyNot(s, me, c.id))
      c.dim = myTurn && !playable && s.ph !== 'disc' ? 1 : 0
      c.lift = sel ? 1 : hov ? 0.6 : 0
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
      peek.forEach((c, k) => { c.tx = x0 + k * pw * 1.05; c.ty = y; c.ts = pw; c.rot = 0; c.dim = 0; c.lift = 0; c.z = 60 })
      this.peekRect = { x: x0 - pw / 2, y: y - pw * 0.7, w: (n - 1) * pw * 1.05 + pw, h: pw * 1.4 }
    } else if (peeking) {
      this.peekRect = { x: W / 2 - 90 * u, y: H * 0.38 - 12 * u, w: 180 * u, h: 24 * u, empty: true }
    }
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
        c.ts = cwc * (hov ? 1.9 : 1)
        c.rot = 0; c.dim = 0; c.lift = hov ? 1 : 0
        c.z = hov ? 30 : 10
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
      fl.mesh.position.set(x, H - y, 40)
      fl.mesh.scale.set(sc, sc, 1)
      fl.mesh.rotation.z = (1 - k) * 0.3
      fl.mesh.renderOrder = 40
      const u2 = fl.mesh.material.uniforms
      u2.time.value = this.time
      u2.opacity.value = fl.t > 1.0 ? Math.max(0, 1 - (fl.t - 1.0) / 0.25) : 1
    }
    const gone = f => f.t > (f.burn ? BURN_SECS + 0.05 : 1.25)
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
    this.app.sfx('fold', 0.3)
  }
  /** A card of my hand leaves it and burns where it is. */
  burnCard(c) {
    const s = this.app.view.state
    this.hidden = { i: c.i, seq: s.seq }
    this.cards = this.cards.filter(k => k !== c)
    c.mesh.material.uniforms.dim.value = 0
    const fl = { mesh: c.mesh, burn: true, t: 0, x0: c.x, y0: c.y, s0: c.s, rot: c.mesh.rotation.z, card: c.id }
    this.flyers.push(fl)
    this.app.sfx('fold', 0.4)
    return fl
  }

  /** A card goes to the middle of the screen for everyone (my own already flew from my hand). */
  showPlayed(e) {
    const me = this.app.mySeat()
    if (e.p === me && this.flyers.some(f => f.mine && f.card === e.card)) return
    let x0 = this.W / 2, y0 = -100 * this.u, s0 = 60 * this.u
    const r = this.rowRect[e.p]
    if (e.p === me) { y0 = this.H - 80 * this.u; s0 = this.cardW() }
    else if (r) { x0 = r.x + r.w / 2; y0 = r.y + r.h / 2 }
    else { x0 = 120 * this.u; y0 = 30 * this.u + e.p * 50 * this.u }
    this.flyers.push({ mesh: this.makeCard(e.card), t: 0, x0, y0, s0, card: e.card })
  }

  // ---------- playing a card: a click plays it, or asks for its target first ----------
  cardClicked(c) {
    const app = this.app, s = app.view.state, me = app.mySeat()
    if (!s || me < 0) return
    const myTurn = s.cur === me && s.ph !== 'over'
    if (!myTurn) { this.selected = this.selected === c.i ? -1 : c.i; this.dirty = true; return }
    if (app.view.busy || app.waiting > 0) return
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
    const list = targetsFor(s, me, c.id)
    if (def.tgt === 'none' || def.tgt === 'board' || (def.tgt === 'leader' && list.length === 1)) { this.play(c.i, def.tgt === 'leader' ? list[0] : null, def.tgt === 'leader'); return }
    const kind = def.tgt === 'cell' ? 'cell' : def.tgt === 'cell2' ? 'cell2' : def.tgt === 'ladder' ? 'ladder' : def.tgt === 'snake' ? 'snake' : 'player'
    this.target = { i: c.i, card: c.id, kind, list, sel: kind === 'cell2' ? [] : null }
    this.selected = c.i
    app.sfx('draw', 0.3)
    this.syncHighlight()
    this.dirty = true
  }
  /** The card leaves the hand at once and flies to the middle; the rules follow. */
  play(i, tg, onPlayer = false) {
    const app = this.app, s = app.view.state
    const c = this.cards.find(k => k.kind === 'hand' && k.i === i)
    this.hidden = { i, seq: s.seq }
    let fl = null
    if (c) {
      this.cards = this.cards.filter(k => k !== c)
      fl = { mesh: c.mesh, t: 0, x0: c.x, y0: c.y, s0: c.s, card: c.id, mine: true }
      this.flyers.push(fl)
    }
    this.target = null
    this.selected = -1
    this.syncHighlight()
    if (onPlayer && typeof tg === 'number') app.view.pointAt(tg, 1.8)
    app.sfx('select', 0.45)
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
    if (t.kind === 'cell2') {
      if (t.sel.includes(x)) t.sel = t.sel.filter(c => c !== x)
      else t.sel.push(x)
      if (t.sel.length === 2) { this.play(t.i, [...t.sel]); return true }
      this.app.sfx('select', 0.35)
      this.syncHighlight()
      this.dirty = true
      return true
    }
    this.play(t.i, x, t.kind === 'player')
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
  cancelTarget() { this.target = null; this.selected = -1; this.syncHighlight(); this.dirty = true }

  // ---------- input ----------
  hitAt(x, y) { for (let k = this.hits.length - 1; k >= 0; k--) { const h = this.hits[k]; if (x >= h.x && x <= h.x + h.w && y >= h.y && y <= h.y + h.h) return h } return null }
  cardAt(x, y) {
    if (this.modal) return null
    const list = [...this.cards].sort((a, b) => (b.mesh.renderOrder - a.mesh.renderOrder))
    for (const c of list) {
      const w = c.s, h = c.s * 1.4
      if (Math.abs(x - c.x) <= w / 2 && Math.abs(y - c.y) <= h / 2) return c
    }
    return null
  }
  pointerMove(x, y) {
    const h = this.hitAt(x, y)
    let key = h ? h.key : null
    if (!key) {
      const c = this.cardAt(x, y)
      if (c) key = c.kind === 'hand' ? 'card' + c.i : c.kind === 'catalog' ? 'cat' + this.cards.filter(k => k.kind === 'catalog').indexOf(c) : null
    }
    if (key !== this.hover) { this.hover = key; this.dirty = true }
    if (this.target?.kind === 'player' && key) this.hoverTarget(null, key.startsWith('pl') ? +key.slice(2) : null)
    return !!key
  }
  /** A click: true when the UI used it. A long press on a card only shows it bigger. */
  click(x, y, long = false) {
    const h = this.hitAt(x, y)
    if (h) { h.action(); this.dirty = true; return true }
    const c = this.cardAt(x, y)
    if (c && c.kind === 'hand') {
      if (long) { this.selected = this.selected === c.i ? -1 : c.i; this.dirty = true }
      else this.cardClicked(c)
      return true
    }
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
      return i != null && this.chooseTarget(i)
    }
    if (hit.el != null && (t.kind === 'ladder' || t.kind === 'snake')) return this.chooseTarget(hit.el)
    if (hit.cell != null && (t.kind === 'cell' || t.kind === 'cell2')) return this.chooseTarget(hit.cell)
    return false
  }
  say(text, secs = 1.8) { this.toast = { text, t: secs }; this.dirty = true }
  log(text) { this.logLines.push(text); if (this.logLines.length > 200) this.logLines.shift(); this.dirty = true }

  update(dt) {
    this.time += dt
    if (this.toast) { this.toast.t -= dt; if (this.toast.t <= 0) { this.toast = null; this.dirty = true } }
    if (this.p0.width !== this.W || this.p0.height !== this.H) this.resize()
    const n = this.rollPrompt()
    if (n !== this.promptN) { this.promptN = n; this.dirty = true }
    this.slideRows(dt)
    this.layoutCards(dt)
    this.updateBanner(dt)
    if (this.dirty) this.draw()
    this.app.view.trayPrompt = n && this.trayRect ? n : 0
    this.updateTrayFrame(dt)
  }
}
