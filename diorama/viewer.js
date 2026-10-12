// The diorama viewer: studio lights and soft shadows, orbit controls, camera presets, a tilt-shift
// miniature look, the lot's 12 x 19 x 12 m volume, a PNG snapshot and a GLB download.
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js'
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js'
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js'
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js'
import { HorizontalTiltShiftShader } from 'three/addons/shaders/HorizontalTiltShiftShader.js'
import { VerticalTiltShiftShader } from 'three/addons/shaders/VerticalTiltShiftShader.js'
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js'
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js'
import { buildDiorama, LOT } from './diorama.js'

const q = new URLSearchParams(location.search)
const $ = id => document.getElementById(id)
const status = t => { $('label').textContent = t }
const BG = '#f1e8d8'
// the window can be 0 x 0 while hidden: never size render targets to nothing
const W = () => Math.max(1, innerWidth), H = () => Math.max(1, innerHeight)

const CAMS = {
  hero: { pos: [12.5, 13.2, 28.5], at: [0.3, 4.7, 1.4], label: '¾ view' },
  front: { pos: [0, 6.8, 33], at: [0, 5.8, 0], label: 'Front' },
  side: { pos: [34, 7.5, 1], at: [0, 5.2, 0], label: 'Side' },
  top: { pos: [0, 44, 3.5], at: [0, 0, 0.3], label: 'Top' },
  snake: { pos: [0.2, 12.2, 9.2], at: [-3.4, 10.2, 0.8], label: 'Snake' },
  cards: { pos: [0.6, 4.6, 16], at: [-2.6, 1.9, 7.0], label: 'Cards' },
  dice: { pos: [7.6, 4.4, 15.5], at: [2.4, 1.7, 7.2], label: 'Dice' },
}

/** A preset's camera position, moved back on narrow (portrait) screens so the whole diorama fits. */
function camPos(c) {
  const k = Math.min(2.4, Math.max(1, 1.3 / (W() / H())))
  const at = new THREE.Vector3(...c.at)
  return new THREE.Vector3(...c.pos).sub(at).multiplyScalar(k).add(at)
}

async function loadFonts() {
  status('Loading fonts…')
  const want = ['italic 900 80px Nunito', '800 16px Nunito']
  await Promise.race([Promise.all(want.map(f => document.fonts.load(f))), new Promise(r => setTimeout(r, 4000))])
}

async function main() {
  await loadFonts()
  status('Cutting the cardboard…')
  await new Promise(r => setTimeout(r, 30))

  const canvas = $('c')
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: q.has('shot') })
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2))
  renderer.setSize(W(), H(), false)
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFShadowMap
  renderer.toneMapping = THREE.NeutralToneMapping
  renderer.toneMappingExposure = 1.0

  const scene = new THREE.Scene()
  scene.background = new THREE.Color(BG)
  scene.fog = new THREE.Fog(BG, 60, 140)
  const pmrem = new THREE.PMREMGenerator(renderer)
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture
  scene.environmentIntensity = 0.3

  // warm studio light: a soft key from the front left, a cool fill, a sky dome
  scene.add(new THREE.HemisphereLight('#fff7ea', '#d4c2a5', 0.85))
  const key = new THREE.DirectionalLight('#fff0db', 3.3)
  key.position.set(-9, 19, 14)
  key.target.position.set(0, 4, -1)
  key.castShadow = true
  key.shadow.mapSize.set(4096, 4096)
  Object.assign(key.shadow.camera, { left: -16, right: 16, top: 16, bottom: -16, near: 1, far: 70 })
  key.shadow.bias = -0.0004
  key.shadow.normalBias = 0.035
  key.shadow.radius = 5
  scene.add(key, key.target)
  const fill = new THREE.DirectionalLight('#e6efff', 0.55); fill.position.set(14, 7, 10); scene.add(fill)
  const rim = new THREE.DirectionalLight('#ffe9cf', 0.5); rim.position.set(4, 14, -16); scene.add(rim)

  // the studio floor
  const floor = new THREE.Mesh(new THREE.CircleGeometry(120, 64).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: '#ecdfca', roughness: 1 }))
  floor.position.y = -0.002
  floor.receiveShadow = true
  scene.add(floor)

  const t0 = performance.now()
  const d = buildDiorama()
  scene.add(d.root)
  const built = performance.now() - t0

  // the lot's volume
  const bounds = new THREE.Group(); bounds.visible = q.get('bounds') === '1'
  const boxGeo = new THREE.BoxGeometry(LOT.width, LOT.height, LOT.depth); boxGeo.translate(0, LOT.height / 2, 0)
  const lines = new THREE.LineSegments(new THREE.EdgesGeometry(boxGeo), new THREE.LineDashedMaterial({ color: '#2d3a6b', dashSize: 0.4, gapSize: 0.25, transparent: true, opacity: 0.75 }))
  lines.computeLineDistances(); bounds.add(lines)
  const tag = (text, x, y, z) => { const el = document.createElement('div'); el.className = 'dim'; el.textContent = text; const o = new CSS2DObject(el); o.position.set(x, y, z); bounds.add(o) }
  tag(`${LOT.width} m`, 0, 0, LOT.depth / 2)
  tag(`${LOT.depth} m`, LOT.width / 2, 0, 0)
  tag(`${LOT.height} m`, LOT.width / 2, LOT.height / 2, LOT.depth / 2)
  scene.add(bounds)

  const camera = new THREE.PerspectiveCamera(35, W() / H(), 0.1, 400)
  const controls = new OrbitControls(camera, canvas)
  controls.enableDamping = true
  controls.dampingFactor = 0.08
  controls.minDistance = 4
  controls.maxDistance = 80
  controls.maxPolarAngle = Math.PI / 2 - 0.03
  controls.autoRotateSpeed = 0.6
  const startCam = CAMS[q.get('cam')] || CAMS.hero
  camera.position.copy(camPos(startCam)); controls.target.set(...startCam.at); controls.update()

  const labels = new CSS2DRenderer({ element: $('labels') })
  labels.setSize(W(), H())

  // post: ambient occlusion between the layers, tilt-shift blur, tone mapping
  const composer = new EffectComposer(renderer)
  composer.setPixelRatio(renderer.getPixelRatio())
  composer.setSize(W(), H())
  composer.addPass(new RenderPass(scene, camera))
  const ao = new GTAOPass(scene, camera, W(), H())
  ao.updateGtaoMaterial({ radius: 0.7, distanceExponent: 1.4, thickness: 1.2, scale: 1.0, samples: 16 })
  ao.blendIntensity = 0.85
  composer.addPass(ao)
  const tiltH = new ShaderPass(HorizontalTiltShiftShader), tiltV = new ShaderPass(VerticalTiltShiftShader)
  composer.addPass(tiltH); composer.addPass(tiltV)
  composer.addPass(new OutputPass())
  const fx = { tilt: q.get('tilt') !== '0', ao: q.get('ao') !== '0', anim: q.get('anim') !== '0', spin: false }
  function sizeTilt() {
    const k = 1.6 * renderer.getPixelRatio()
    tiltH.uniforms.h.value = k / (W() * renderer.getPixelRatio())
    tiltV.uniforms.v.value = k / (H() * renderer.getPixelRatio())
    tiltH.uniforms.r.value = tiltV.uniforms.r.value = 0.5
  }
  sizeTilt()
  const applyFx = () => { tiltH.enabled = tiltV.enabled = fx.tilt; ao.enabled = fx.ao; controls.autoRotate = fx.spin; if (!fx.anim) d.rest() }
  applyFx()

  // camera moves between presets
  let fly = null
  function goTo(name) {
    const c = CAMS[name]
    fly = { t: 0, p0: camera.position.clone(), a0: controls.target.clone(), p1: camPos(c), a1: new THREE.Vector3(...c.at) }
    document.querySelectorAll('[data-cam]').forEach(b => b.setAttribute('aria-pressed', b.dataset.cam === name))
  }

  // the panel
  const camBar = $('cams')
  for (const [name, c] of Object.entries(CAMS)) {
    const b = document.createElement('button'); b.type = 'button'; b.dataset.cam = name; b.textContent = c.label
    b.setAttribute('aria-pressed', c === startCam)
    b.onclick = () => goTo(name)
    camBar.appendChild(b)
  }
  const toggle = (id, getter, setter) => {
    const b = $(id); const sync = () => b.setAttribute('aria-pressed', getter())
    b.onclick = () => { setter(!getter()); sync(); applyFx() }; sync()
  }
  toggle('t-anim', () => fx.anim, v => { fx.anim = v })
  toggle('t-spin', () => fx.spin, v => { fx.spin = v })
  toggle('t-tilt', () => fx.tilt, v => { fx.tilt = v })
  toggle('t-ao', () => fx.ao, v => { fx.ao = v })
  toggle('t-bounds', () => bounds.visible, v => { bounds.visible = v })
  $('b-shot').onclick = () => {
    render()
    canvas.toBlob(b => download(b, 'snakes-ladders-diorama.png'), 'image/png')
  }
  $('b-glb').onclick = async () => {
    const btn = $('b-glb'); btn.disabled = true; btn.textContent = 'Exporting…'
    try {
      d.rest()
      const glb = await new GLTFExporter().parseAsync(d.root, { binary: true })
      download(new Blob([glb], { type: 'model/gltf-binary' }), 'snakes-ladders-diorama.glb')
    } finally { btn.disabled = false; btn.textContent = 'Download GLB' }
  }
  if (matchMedia('(max-width: 640px)').matches) { $('panel').classList.add('collapsed'); $('b-panel').setAttribute('aria-expanded', false) }
  $('b-panel').onclick = () => { const p = $('panel'); const open = p.classList.toggle('collapsed'); $('b-panel').setAttribute('aria-expanded', !open) }

  // facts: the measured box of everything that was built
  const box = new THREE.Box3().setFromObject(d.root)
  const size = box.getSize(new THREE.Vector3())
  const inside = box.min.x >= -LOT.width / 2 - 1e-3 && box.max.x <= LOT.width / 2 + 1e-3 && box.min.z >= -LOT.depth / 2 - 1e-3 && box.max.z <= LOT.depth / 2 + 1e-3 && box.min.y >= -1e-3 && box.max.y <= LOT.height + 1e-3
  let tris = 0
  d.root.traverse(o => { if (o.isMesh) { const g = o.geometry; tris += (g.index ? g.index.count : g.attributes.position.count) / 3 } })
  $('fit').textContent = `${size.x.toFixed(2)} × ${size.z.toFixed(2)} × ${size.y.toFixed(2)} m`
  $('fit-ok').textContent = inside ? 'inside the volume' : 'outside the volume!'
  $('fit-ok').className = inside ? 'ok' : 'bad'
  $('snake-len').textContent = `${d.snakeLength.toFixed(1)} m`
  $('ladder-len').textContent = `${d.ladderLength.toFixed(1)} m`
  $('tris').textContent = `${Math.round(tris / 1000)}k`
  window.__diorama = { scene, camera, controls, d, box, inside, goTo, render: () => render() }
  console.log('diorama built in', Math.round(built), 'ms; box', box.min.toArray().map(v => +v.toFixed(3)), box.max.toArray().map(v => +v.toFixed(3)), inside ? 'inside' : 'OUTSIDE')

  function download(blob, name) {
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; a.click()
    setTimeout(() => URL.revokeObjectURL(a.href), 2000)
  }
  function resize() {
    camera.aspect = W() / H(); camera.updateProjectionMatrix()
    renderer.setSize(W(), H(), false)
    composer.setSize(W(), H())
    labels.setSize(W(), H())
    sizeTilt()
  }
  addEventListener('resize', resize)
  controls.addEventListener('start', () => { fly = null; document.querySelectorAll('[data-cam]').forEach(b => b.setAttribute('aria-pressed', false)) })

  const timer = new THREE.Timer()
  let time = 0
  function render() {
    composer.render()
    labels.render(scene, camera)
  }
  function frame(now) {
    timer.update(now)
    const dt = Math.min(timer.getDelta(), 0.1)
    if (fx.anim) { time += dt; d.animate(time) }
    if (fly) {
      fly.t = Math.min(1, fly.t + dt / 1.3)
      const k = fly.t < 0.5 ? 4 * fly.t ** 3 : 1 - (-2 * fly.t + 2) ** 3 / 2
      camera.position.lerpVectors(fly.p0, fly.p1, k)
      controls.target.lerpVectors(fly.a0, fly.a1, k)
      if (fly.t >= 1) fly = null
    }
    controls.update(dt)
    render()
    requestAnimationFrame(frame)
  }
  frame()
  $('loading').classList.add('done')

  // ?shot=tmp/name.png saves a frame through the local dev server (for checking the build)
  if (q.has('shot')) {
    setTimeout(() => {
      render()
      canvas.toBlob(b => fetch('/save/' + q.get('shot'), { method: 'POST', body: b }).then(() => { window.shotDone = true }), 'image/png')
    }, 1500)
  }
}

main().catch(e => {
  console.error(e)
  $('loading').classList.add('error')
  status('Could not build the diorama: ' + (e.message || e))
})
