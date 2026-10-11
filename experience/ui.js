// The screen layer: a 2D canvas (panels, buttons, log, menus) drawn over the board, plus the hand of
// cards as textured planes so they can slide, lift and fly without redrawing the canvas.
import * as THREE from 'three'
import * as P from './paper.js'
import { CARD, CARDS, CATEGORY, FX, RARITY, targetsFor, whyNot, CFG, SIZES } from './rules.js'
import { T } from './strings.js'

const CARD_VS = 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }'
const CARD_FS = `
uniform sampler2D map; uniform float time; uniform float legendary; uniform float dim; uniform float opacity; uniform float lift;
varying vec2 vUv;
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
  gl_FragColor = vec4(c.rgb, c.a * opacity);
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
    this.resize()
    this.makeBanner()
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
    if (this.layer) { this.scene.remove(this.layer); this.layer.material.map.dispose(); this.layer.geometry.dispose() }
    const { c, g } = P.canvas(Math.max(2, Math.round(W * this.dpr)), Math.max(2, Math.round(H * this.dpr)))
    this.cv = c; this.g = g
    const tex = new THREE.CanvasTexture(c)
    tex.colorSpace = THREE.SRGBColorSpace
    tex.generateMipmaps = false
    tex.minFilter = THREE.LinearFilter
    this.tex = tex
    this.layer = new THREE.Mesh(new THREE.PlaneGeometry(W, H), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false }))
    this.layer.position.set(W / 2, H / 2, 0)
    this.layer.renderOrder = 0
    this.scene.add(this.layer)
    this.dirty = true
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
      uniforms: { map: { value: this.cardTexture(id) }, time: { value: 0 }, legendary: { value: id !== 'back' && CARD[id].rar === 'L' ? 1 : 0 }, dim: { value: 0 }, opacity: { value: 1 }, lift: { value: 0 } },
      vertexShader: CARD_VS, fragmentShader: CARD_FS, transparent: true, depthTest: false, depthWrite: false,
    })
    const mesh = new THREE.Mesh(this.cardGeo ||= new THREE.PlaneGeometry(1, 1.4), mat)
    mesh.renderOrder = 10
    this.scene.add(mesh)
    return mesh
  }
  dropCard(mesh) { this.scene.remove(mesh); mesh.material.dispose() }

  /** Compiles every UI shader now (a card of each kind, offscreen). */
  warm(renderer) {
    const a = this.makeCard('M1'), b = this.makeCard('M4')
    a.position.set(-500, -500, 0); b.position.set(-500, -500, 0)
    renderer.compile(this.scene, this.cam)
    this.dropCard(a); this.dropCard(b)
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
    if (inGame && this.target) { text = T.chooseWhat(CARD[this.target.card].tgt); sub = T.targetHint(this.target.kind) }
    else if (inGame && b.turn > 0) text = b.turnText
    if (text && (text !== b.text || sub !== b.sub)) { this.drawBanner(text, sub); b.text = text; b.sub = sub; b.pop = 0 }
    const want = text ? 1 : 0
    b.op += (want - b.op) * (1 - Math.exp(-(want ? 12 : 5) * dt))
    b.pop = Math.min(1, b.pop + dt * 4)
    const k = this.u * 32 / 64 // the 64 px letters show about 32 px tall
    const sc = 1024 * k * (0.9 + 0.1 * (1 - Math.pow(1 - b.pop, 3))) * (this.target ? 1 + 0.012 * Math.sin(this.time * 3) : 1)
    b.mesh.scale.set(sc, sc, 1)
    b.mesh.position.set(this.W / 2, this.H * 0.64, 1)
    b.mesh.material.opacity = b.op * 0.95
    b.mesh.visible = b.op > 0.01
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
    const g = this.g, W = this.W, H = this.H
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0)
    g.clearRect(0, 0, W, H)
    this.hits = []
    this.trayRect = null
    const app = this.app
    if (app.screen === 'menu') this.drawMenu()
    else if (app.screen === 'lobby') this.drawLobby()
    else if (app.screen === 'help') this.drawHelp()
    else if (app.screen === 'game') this.drawGame()
    if (app.screen !== 'lobby') this.picker = false
    if (this.picker) this.drawPicker()
    if (app.invite) this.drawInvite()
    if (this.toast) {
      const t = this.toast
      g.font = this.font(16 * this.u)
      const w = g.measureText(t.text).width + 40 * this.u
      this.panel((W - w) / 2, H * 0.42, w, 40 * this.u, { fill: 'rgba(43,38,34,0.88)', stroke: null, r: 18 })
      this.text(t.text, W / 2, H * 0.42 + 20 * this.u, { color: '#ffffff', align: 'center' })
    }
    this.tex.needsUpdate = true
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

  /** A label with − value + buttons, `w` wide from x. */
  stepper(key, label, x, y, w, value, dec, inc, canDec, canInc) {
    const u = this.u, b = 38 * u, lw = w - 2 * b - 34 * u
    this.text(label, x, y + 19 * u, { size: 15, max: lw - 4 * u })
    this.button(key + '-', '−', x + lw, y, b, b, () => { dec(); this.dirty = true }, { disabled: !canDec })
    this.text(String(value), x + lw + b + 17 * u, y + 19 * u, { size: 20, align: 'center' })
    this.button(key + '+', '+', x + lw + b + 34 * u, y, b, b, () => { inc(); this.dirty = true }, { disabled: !canInc })
  }

  drawMenu() {
    const W = this.W, H = this.H, u = this.u, app = this.app, c = app.cfg
    const web = this.p0.web, room = web?.room // the browser build: online rooms stand in for the lot
    const pw = Math.min(W - 24 * u, 460 * u), ph = (web ? (room ? 590 : 540) : 566) * u
    const x = (W - pw) / 2, y = Math.max(10 * u, (H - ph) / 2)
    this.panel(x, y, pw, ph, { fill: 'rgba(255,253,248,0.94)' })
    this.drawLogo(W / 2, y + 52 * u, Math.min(1, pw / (440 * u)))
    this.text(T.tagline, W / 2, y + 140 * u, { size: 14, align: 'center', bold: false, color: '#5b544c', max: pw - 30 * u })
    let yy = y + 170 * u
    const bw = pw - 60 * u, bx = x + 30 * u
    this.text(T.playHere, bx, yy, { size: 15 }); yy += 22 * u
    // mode: Fool needs three on the board
    const minTotal = () => (c.mode === 'fool' ? 3 : 2)
    const fill = () => { const lack = minTotal() - c.humans - c.bots; if (lack > 0) c.bots += lack }
    const modes = [['champion', 'Champion'], ['fool', 'Fool']]
    modes.forEach(([m, label], i) => this.button('mode' + m, label, bx + i * (bw / 2 + 4 * u), yy, bw / 2 - 4 * u, 38 * u, () => { c.mode = m; fill(); this.dirty = true }, { selected: c.mode === m, size: 15 }))
    yy += 46 * u
    this.text(c.humans > 1 ? T.hotseatHint : c.mode === 'fool' ? T.foolHint : T.championHint, W / 2, yy + 4 * u, { size: 12.5, align: 'center', bold: false, color: '#5b544c', max: bw })
    yy += 22 * u
    // players at this computer and bots: 2 to 6 on the board
    const total = c.humans + c.bots, half = bw / 2 - 8 * u
    this.stepper('hum', T.players, bx, yy, half, c.humans,
      () => { c.humans--; fill() }, () => { c.humans++; if (c.humans + c.bots > 6) c.bots-- },
      c.humans > 1, c.humans < 6 && (total < 6 || c.bots > 0))
    this.stepper('bots', T.bots, bx + bw / 2 + 8 * u, yy, half, c.bots,
      () => { c.bots-- }, () => { c.bots++ },
      c.bots > 0 && total - 1 >= minTotal(), total < 6)
    yy += 46 * u
    const levels = [[1, 'Easy'], [2, 'Medium'], [3, 'Hard']]
    levels.forEach(([l, label], i) => this.button('lvl' + l, label, bx + i * (bw / 3 + 2 * u), yy, bw / 3 - 4 * u, 36 * u, () => { c.level = l; this.dirty = true }, { selected: c.level === l && c.bots > 0, disabled: !c.bots, size: 14 }))
    yy += 46 * u
    // the board's size
    this.sizeButtons('size', bx, yy, bw, c.size, n => { c.size = n; this.dirty = true }, true)
    yy += 48 * u
    this.button('start', T.start, bx, yy, bw, 50 * u, () => app.startSolo(), { primary: true, size: 20 })
    yy += 64 * u
    const openHelp = () => { app.screen = 'help'; this.helpPage = 0; this.dirty = true }
    if (web && !room) {
      this.button('online', T.playOnline, bx, yy, bw / 2 - 4 * u, 42 * u, () => web.online(), { size: 15, primary: true, color: '#2d3a6b' })
      this.button('help', T.howToPlay, bx + bw / 2 + 4 * u, yy, bw / 2 - 4 * u, 42 * u, openHelp, { size: 15 })
    } else {
      this.button('table', T.sharedTable, bx, yy, bw / 2 - 4 * u, 42 * u, () => app.openLobby(), { size: 15, primary: !!room, color: '#2d3a6b' })
      this.button('help', T.howToPlay, bx + bw / 2 + 4 * u, yy, bw / 2 - 4 * u, 42 * u, openHelp, { size: 15 })
      yy += 54 * u
      if (room) {
        this.text(T.roomLine(room.code, app.sessionCount()), bx, yy + 18 * u, { size: 14, max: bw * 0.4 - 6 * u })
        this.button('share', T.shareLink, bx + bw * 0.4, yy, bw * 0.3 - 4 * u, 36 * u, () => this.shareRoom(), { size: 13.5 })
        this.button('leaveroom', T.leaveRoom, bx + bw * 0.7 + 4 * u, yy, bw * 0.3 - 4 * u, 36 * u, () => web.leave(), { size: 13.5 })
      } else {
        const others = app.sessionCount() - 1
        this.text(others > 0 ? T.othersHere(others) : T.aloneHere, W / 2, yy + 6 * u, { size: 12.5, align: 'center', bold: false, color: '#5b544c', max: bw })
      }
    }
    // the week's table, beside the panel when there is room
    const table = this.p0.table || []
    if (table.length && W > pw + 520 * u) {
      const tx = x + pw + 20 * u, tw = 230 * u
      this.panel(tx, y, tw, 60 * u + table.length * 26 * u)
      this.text(T.weekTable, tx + tw / 2, y + 26 * u, { size: 15, align: 'center' })
      table.slice(0, 10).forEach((r, i) => {
        const ry = y + 58 * u + i * 26 * u
        this.text(`${i + 1}. ${r.name}${r.owner ? ' *' : ''}`, tx + 14 * u, ry, { size: 13, bold: !!r.you, max: tw - 80 * u })
        this.text(String(r.score), tx + tw - 14 * u, ry, { size: 13, align: 'right' })
      })
    }
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
    // players panel
    const pw = this.narrow ? Math.min(W - 16 * u, 340 * u) : 236 * u
    const rowH = this.narrow ? 34 * u : 48 * u
    const cols = this.narrow ? 2 : 1
    const colW = (pw - (cols - 1) * 6 * u) / cols
    const px = 10 * u, py = 10 * u
    const tgtPlayers = this.target && this.target.kind === 'player' ? this.target.list : null
    s.pl.forEach((p, i) => {
      const cx = px + (i % cols) * (colW + 6 * u), cy = py + Math.floor(i / cols) * (rowH + 5 * u)
      const active = s.cur === i && s.ph !== 'over'
      const valid = tgtPlayers && tgtPlayers.includes(i)
      const sel = valid && this.target.sel === i
      this.panel(cx, cy, colW, rowH, { fill: sel ? '#fff1c4' : valid ? '#fffbe9' : p.d ? 'rgba(240,240,236,0.9)' : 'rgba(255,255,255,0.93)', stroke: active ? P.PLAYER_COLORS[p.c % 6] : valid ? '#e0a400' : 'rgba(43,38,34,0.16)', lw: active || valid ? 3 : 1.5, r: 10 })
      const g = this.g
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
    // corner buttons: menu, speed, zoom
    const cb = 40 * u
    const rx = W - cb - 10 * u
    this.button('menu', '☰', rx, 10 * u, cb, cb, () => app.openGameMenu(), { size: 18 })
    this.button('speed', `${app.speedLabel()}`, rx - cb - 8 * u, 10 * u, cb + 10 * u, cb, () => app.cycleSpeed(), { size: 14 })
    const zy = this.narrow ? panelBottom + 54 * u : 64 * u
    this.button('zin', '+', rx, zy, cb, cb, () => app.view.zoom(0.8), { size: 20 })
    this.button('zout', '−', rx, zy + cb + 6 * u, cb, cb, () => app.view.zoom(1.25), { size: 20 })
    this.button('zall', '⤢', rx, zy + 2 * (cb + 6 * u), cb, cb, () => app.view.overview(), { size: 18 })
    // log
    this.drawLog()
    // action buttons
    const bw = this.narrow ? 132 * u : 170 * u, bh = 50 * u
    const bx = W - bw - 12 * u
    let by = H - bh - 12 * u
    const handTop = H - this.handHeight()
    if (this.narrow) by = handTop - bh - 10 * u
    if (s.ph !== 'over' && curtain < 0) {
      const pmy = me >= 0 ? s.pl[me] : null
      if (this.target) {
        this.button('cancel', T.cancel, bx, by, bw, bh, () => this.cancelTarget(), { size: 18 })
      } else if (myTurn && s.ph === 'disc') {
        // a click on a card discards it
      } else if (myTurn) {
        if (!s.rolled) {
          const choose = pmy.fx.gd ? 6 : pmy.fx.cf ? 3 : 0
          if (choose) {
            const n = choose, w = Math.min((W - 24 * u) / n - 6 * u, 54 * u)
            const total = n * (w + 6 * u)
            const x0 = this.narrow ? W - total - 8 * u : bx + bw - total
            this.text(T.chooseValue, x0 + total / 2, by - 16 * u, { size: 14, align: 'center' })
            for (let v = 1; v <= n; v++) this.button('v' + v, String(v), x0 + (v - 1) * (w + 6 * u), by, w, bh, () => app.act({ t: 'roll', v }), { primary: true, disabled: busy, color: pmy.fx.gd ? '#c99400' : '#7b5ce0', size: 20 })
          } else this.button('roll', T.roll, bx, by, bw, bh, () => app.act({ t: 'roll' }), { primary: true, disabled: busy, size: 19 })
        } else this.button('end', T.endTurn, bx, by, bw, bh, () => app.act({ t: 'end' }), { primary: true, color: '#2d3a6b', disabled: busy, size: 18 })
      }
    }
    // the dice tray rectangle (the view draws the dice into it)
    const tw = this.narrow ? 150 * u : 190 * u, th = tw * 0.66
    const tx = this.narrow ? 10 * u : W - tw - 12 * u
    const ty = this.narrow ? handTop - th - 10 * u : by - th - 34 * u
    if (app.view.trayVisible > 0) {
      this.panel(tx - 4 * u, ty - 4 * u, tw + 8 * u, th + 8 * u, { fill: 'rgba(127,178,240,0.9)', r: 12 })
      this.trayRect = { x: tx, y: ty, w: tw, h: th }
      if (app.view.trayLabel) this.text(app.view.trayLabel, tx + tw / 2, ty + th + 16 * u, { size: 16, align: 'center' })
    }
    if (this.peekRect) {
      const r = this.peekRect
      this.panel(r.x - 12 * u, r.y - 34 * u, r.w + 24 * u, r.h + 46 * u, { fill: 'rgba(255,253,248,0.92)' })
      this.text(T.handOf(s.pl[s.peek.tg].n), r.x + r.w / 2, r.y - 17 * u, { size: 14, align: 'center' })
    }
    if (curtain >= 0) this.drawCurtain(s.pl[curtain])
    if (s.ph === 'over' && !busy) this.drawResults(s, me)
    if (app.menuOpen) {
      const web = !!this.p0.web
      const mw = Math.min(W - 20 * u, 320 * u), mh = (web ? 252 : 300) * u
      const mx = (W - mw) / 2, my = (H - mh) / 2
      this.panel(mx, my, mw, mh, { fill: 'rgba(255,253,248,0.97)' })
      this.text(T.menuTitle, W / 2, my + 30 * u, { size: 20, align: 'center' })
      this.button('resume', T.resume, mx + 24 * u, my + 60 * u, mw - 48 * u, 44 * u, () => app.openGameMenu(), { primary: true })
      this.button('speed2', `Speed: ${app.speedLabel()}`, mx + 24 * u, my + 112 * u, mw - 48 * u, 40 * u, () => app.cycleSpeed(), { size: 15 })
      this.button('leave', T.leaveGame, mx + 24 * u, my + 160 * u, mw - 48 * u, 40 * u, () => app.toMenu(), { size: 15 })
      if (!web) this.button('exitcity', T.exitCity, mx + 24 * u, my + 208 * u, mw - 48 * u, 40 * u, () => { app.menuOpen = false; this.p0.exit() }, { size: 15, primary: true, color: '#d64545' })
      this.text(T.menuKeys, W / 2, my + (web ? 224 : 272) * u, { size: 11.5, align: 'center', bold: false, color: '#5b544c', max: mw - 30 * u })
    }
  }

  /** Several players at one computer: the next one takes it before their hand shows. */
  drawCurtain(p) {
    const W = this.W, H = this.H, u = this.u, g = this.g
    this.hits = this.hits.filter(h => h.key === 'menu')
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

  measure(t, size) { this.g.font = this.font(size * this.u); return this.g.measureText(t).width }
  handHeight() { return this.cardW() * 1.4 * 0.86 + 14 * this.u }
  cardW() { return this.narrow ? Math.min(150, (this.W - 16) / 2.55) : 150 * this.u }

  drawLog() {
    const u = this.u, H = this.H
    const lines = this.logOpen ? this.logLines.slice(-16) : this.logLines.slice(-5)
    if (!lines.length) return
    if (this.narrow && !this.logOpen) {
      this.button('log', T.log, 10 * u, H - this.handHeight() - 56 * u - (this.app.view.trayVisible > 0 ? 110 * u : 0), 70 * u, 34 * u, () => { this.logOpen = true; this.dirty = true }, { size: 13 })
      return
    }
    const w = this.narrow ? this.W - 20 * u : 330 * u
    const lh = 19 * u
    const h = lines.length * lh + 16 * u
    const x = 10 * u, y = this.narrow ? 120 * u : H - h - 12 * u
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
    if (app.screen === 'game' && s && s.peek && s.peek.by === me && me >= 0 && s.cur === me && !hide) {
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
    hand.forEach((c, k) => {
      const gap = cw * (this.narrow ? 0.76 : 0.92)
      const x = W / 2 + (k - (n - 1) / 2) * gap
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
    })
    const peek = this.cards.filter(c => c.kind === 'peek')
    if (peek.length) {
      const pw = cw * 0.7
      const x0 = W / 2 - (peek.length - 1) / 2 * pw * 1.05
      const y = H * 0.38
      peek.forEach((c, k) => { c.tx = x0 + k * pw * 1.05; c.ty = y; c.ts = pw; c.rot = 0; c.dim = 0; c.lift = 0 })
      this.peekRect = { x: x0 - pw / 2, y: y - pw * 0.7, w: (peek.length - 1) * pw * 1.05 + pw, h: pw * 1.4 }
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
      m.time.value = this.time
    }
    // cards flying to the middle of the screen when played
    for (const fl of this.flyers.filter(f => f.drop)) {
      fl.t += dt
      const k = Math.min(1, (fl.t - 1.0) / 0.25)
      fl.mesh.position.set(fl.x0, H - (fl.y0 + k * 160 * u), 40)
      fl.mesh.scale.set(fl.s0 * (1 - k * 0.3), fl.s0 * (1 - k * 0.3), 1)
      fl.mesh.material.uniforms.opacity.value = 1 - k
    }
    for (const fl of this.flyers) {
      if (fl.drop) continue
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
    for (const fl of this.flyers.filter(f => f.t > 1.25)) this.dropCard(fl.mesh)
    this.flyers = this.flyers.filter(f => f.t <= 1.25)
  }

  /** A card goes to the middle of the screen for everyone (my own already flew from my hand). */
  showPlayed(e) {
    const me = this.app.mySeat()
    if (e.p === me && this.flyers.some(f => f.mine && f.card === e.card)) return
    let x0 = this.W / 2, y0 = -100 * this.u, s0 = 60 * this.u
    if (e.p === me) { y0 = this.H - 80 * this.u; s0 = this.cardW() }
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
      this.hidden = { i: c.i, seq: s.seq }
      this.cards = this.cards.filter(k => k !== c)
      this.flyers.push({ mesh: c.mesh, t: 1.0, x0: c.x, y0: c.y, s0: c.s, card: c.id, drop: true })
      app.sfx('fold', 0.4)
      if (app.act({ t: 'disc', i: c.i }) === false) this.hidden = null
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
      const i = panelPlayer ?? hit?.player ?? null
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
    if (hit.player != null && t.kind === 'player') return this.chooseTarget(hit.player)
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
    this.layoutCards(dt)
    this.updateBanner(dt)
    if (this.dirty) this.draw()
  }
}
