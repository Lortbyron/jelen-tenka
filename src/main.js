import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { createSky, makeSkyMaterial, createStars, createMoon, createRainbow } from './sky.js';
import { createClouds } from './clouds.js';
import { createRain, createFireflies } from './effects.js';
import { Atmosphere, celestial } from './atmosphere.js';
import { createPark, AVENUE } from './park.js';
import { createLife, ROPES, PLAY, FAIR } from './life.js';
import { createDetails } from './details.js';
import { createMonument } from './monument.js';
import { createFlora } from './flora.js';
import { AudioEngine } from './audio.js';
import { ColliderSet, Walker } from './walker.js';
import { createGuide } from './guide.js';
// style.css se enlaza en index.html (evita ver el HTML sin estilo mientras carga el JS)

const $ = (s) => document.querySelector(s);
const params = new URLSearchParams(location.search);

// ---------------------------------------------------------------- settings
const STORE = 'jelen-tenka';
let saved = {};
try { saved = JSON.parse(localStorage.getItem(STORE) || '{}'); } catch { /* private mode */ }
const settings = { timeMode: 'real', hour: 16.5, weather: 'partly', sound: true, volume: 0.8, ambient: true, music: true, view: 'third', ...saved };
if (params.has('hour')) { settings.timeMode = 'manual'; settings.hour = parseFloat(params.get('hour')); }
if (params.has('weather')) settings.weather = params.get('weather');
const save = () => { try { localStorage.setItem(STORE, JSON.stringify(settings)); } catch { /* ignore */ } };

// ---------------------------------------------------------------- renderer
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
$('#app').appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.fog = new THREE.Fog('#dde9ea', 160, 2600);
const camera = new THREE.PerspectiveCamera(36, innerWidth / innerHeight, 0.3, 6000);
// portrait screens: widen the lens so both arms stay in the frame
const fitLens = () => { camera.aspect = innerWidth / innerHeight; camera.fov = camera.aspect < 1 ? 36 / Math.max(camera.aspect, 0.45) * 0.62 : 36; camera.updateProjectionMatrix(); };
fitLens();

// ------------------------------------------------------------------ lights
const hemi = new THREE.HemisphereLight('#d6ebff', '#7d8a4c', 1.0);
scene.add(hemi);
const sun = new THREE.DirectionalLight('#fff0d8', 2.9);
sun.target.position.set(0, 4, -2);
sun.castShadow = true;
sun.shadow.mapSize.set(4096, 4096);
Object.assign(sun.shadow.camera, { left: -50, right: 50, top: 50, bottom: -50, near: 20, far: 220 });
sun.shadow.bias = -0.0003;
sun.shadow.normalBias = 0.05;
scene.add(sun, sun.target);

// --------------------------------------------------------------- the world
const skyMat = makeSkyMaterial(celestial(16));
scene.add(createSky(skyMat, 2400));
const stars = createStars();
const moon = createMoon();
const rainbow = createRainbow();
scene.add(stars, moon, rainbow);

const envScene = new THREE.Scene();
envScene.add(createSky(skyMat, 50));
const envGround = new THREE.Mesh(new THREE.CircleGeometry(50, 32), new THREE.MeshBasicMaterial({ color: '#5a6a3a' }));
envGround.rotation.x = -Math.PI / 2; envGround.position.y = -1;
envScene.add(envGround);

const clouds = createClouds();
scene.add(clouds.group);

// the monument has its own flora batches (moss and plants growing in the veil and on the arms)
const monumentFlora = createFlora();
const monument = createMonument(monumentFlora);
scene.add(monument.group);
scene.add(monumentFlora.build());
const park = createPark(monument.footprint);
scene.add(park.group);

const rain = createRain();
scene.add(rain.mesh);
const fireflies = createFireflies();
scene.add(fireflies.mesh);
const life = createLife();
scene.add(life.group);

// el caminante: the walker's body (third person) and, in the overview, a man looking up at the monument
const guide = createGuide();
// he waits on the front of the oval, where the HOME view sees him, looking at the monument
const GUIDE_HOME = { x: 9, z: 31.4 };
guide.group.position.set(GUIDE_HOME.x, 0, GUIDE_HOME.z);
guide.group.rotation.y = Math.atan2(-GUIDE_HOME.x, -GUIDE_HOME.z);
scene.add(guide.group);

const windU = park.wind;
const world = {
  wind: { set value(v) { windU.value = v; monumentFlora.wind.value = v; }, get value() { return windU.value; } },
  setNight: (k) => { park.setNight(k); monument.setNight(k); },
};
const atm = new Atmosphere({ scene, renderer, skyMat, sun, hemi, clouds, stars, moon, rainbow, rain, fireflies, world, envScene, envGround });
atm.setWeather(settings.weather);
Object.assign(atm.w, atm.target);

const audio = new AudioEngine();
audio.volume = settings.volume; audio.ambientOn = settings.ambient; audio.musicOn = settings.music;
atm.onBolt = (d) => audio.thunder(d);
if (import.meta.env.DEV) window.__audio = audio; // for the measuring script in development only
const FOV_ORBIT = 36, FOV_WALK = 62;

// ---------------------------------------------------------------- camera
// HOME: from the lawn by the bike lane, the bust centred between the two arms (like the reference photos)
const HOME = { pos: new THREE.Vector3(7, 4.6, 70), target: new THREE.Vector3(0, 9.5, -3) };
if (innerWidth < innerHeight) HOME.pos.set(9, 6.5, 112); // step back on a phone so both arms fit
const controls = new OrbitControls(camera, renderer.domElement);
Object.assign(controls, {
  enableDamping: true, dampingFactor: 0.06, minDistance: 8, maxDistance: 240, maxPolarAngle: Math.PI / 2 - 0.02,
  screenSpacePanning: true, rotateSpeed: 0.55, zoomSpeed: 0.8, autoRotateSpeed: 0.22,
});
controls.target.copy(HOME.target);
camera.position.set(-110, 80, 190); // the drone's first view

let tween = null;
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
function flyTo(pos, target, dur = 1.6) {
  tween = { p0: camera.position.clone(), t0: controls.target.clone(), p1: pos.clone(), t1: target.clone(), start: performance.now(), dur: dur * 1000 };
}
const capture = params.get('capture');
if (capture !== null) {
  $('#loader').remove();
  const c = capture.split(',').map(Number);
  camera.position.copy(c.length >= 3 ? new THREE.Vector3(c[0], c[1], c[2]) : HOME.pos);
  if (c.length === 6) controls.target.set(c[3], c[4], c[5]);
  controls.minDistance = Math.min(8, camera.position.distanceTo(controls.target) * 0.9); // close-ups of el caminante
} else {
  flyTo(HOME.pos, HOME.target, 5);
}

let lastInput = performance.now();
const markInput = () => { lastInput = performance.now(); controls.autoRotate = false; };
controls.addEventListener('start', () => { tween = null; markInput(); hideHint(); });
controls.addEventListener('end', markInput);
renderer.domElement.addEventListener('wheel', () => { tween = null; markInput(); hideHint(); }, { passive: true });

// ------------------------------------------------------------- walking
const colliders = new ColliderSet(park.lot);
for (const [x, z, r] of park.obstacles.circles) colliders.circle(x, z, r);
for (const sg of [...park.obstacles.segs, ...monument.footprint.segs]) colliders.seg(...sg);
for (const [x, z, r] of life.obstacles) colliders.circle(x, z, r);
const walker = new Walker({
  dom: renderer.domElement, camera, colliders,
  heightAt: (x, z) => monument.heightAt(x, z),
  surfaceAt: (x, z) => (monument.onSteel(x, z) ? 'metal' : park.surfaceAt(x, z)),
  speed: 2.5,
});
const ray = new THREE.Raycaster();
const ndc = new THREE.Vector2();
const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const setRay = (e) => { ndc.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1); ray.setFromCamera(ndc, camera); };
/** A click on the steel stair or the lookout: go to the foot of the stair. */
function hitStair(e) {
  setRay(e);
  const h = ray.intersectObject(monument.group, true)[0];
  return h && monument.onSteel(h.point.x, h.point.z) && h.point.y < monument.lookout.y + 2 ? h : null;
}
walker.onClick = (e) => {
  if (walker._y > 0.5 || monument.onSteel(walker.pos.x, walker.pos.z)) return false;
  if (hitStair(e)) { walker.walkTo(new THREE.Vector3(monument.stairFoot.x, 0, monument.stairFoot.z)); toast('Hacia la escalera del mirador…', 2000); return true; }
  return false;
};
walker.pickGround = (e) => {
  setRay(e);
  const p = new THREE.Vector3();
  if (!ray.ray.intersectPlane(groundPlane, p) || p.distanceTo(camera.position) > 80) return null;
  return p;
};
walker.onStep = (s) => audio.step(s, (Math.random() - 0.5) * 0.2);

// ------------------------------------------------------------------- sound
const body = document.body;
async function enableSound() {
  settings.sound = true; save();
  body.classList.add('sound-on');
  await audio.start();
  audio.setVolume(settings.volume);
}
function disableSound() {
  settings.sound = false; save();
  body.classList.remove('sound-on');
  audio.setVolume(0);
}
// browsers only allow audio after a gesture: the first touch anywhere wakes it up
addEventListener('pointerdown', () => { if (settings.sound && !audio.started) enableSound(); }, { once: true });
addEventListener('keydown', () => { if (settings.sound && !audio.started) enableSound(); }, { once: true });
$('#btn-sound').addEventListener('click', (e) => {
  e.stopPropagation();
  if (body.classList.contains('sound-on') && audio.started) disableSound(); else enableSound();
});

// -------------------------------------------------------------------- UI
const hint = $('.hint');
let hintHidden = false;
function hideHint() {
  if (hintHidden) return;
  hintHidden = true;
  setTimeout(() => hint.classList.add('gone'), 2500);
}

$('#btn-eye').addEventListener('click', () => { body.classList.toggle('ui-hidden'); closePanel(); });
$('#btn-reset').addEventListener('click', () => {
  if (mode === 'walk') { leaveWalk(); return; }
  markInput(); flyTo(HOME.pos, HOME.target, 1.8); audio.ui('ui_swish', 0.35);
});
let toastTimer;
function toast(msg, ms = 3000) {
  const t = $('#toast');
  t.textContent = msg; t.classList.add('on');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('on'), ms);
}

const panel = $('#panel');
function openPanel() { panel.classList.add('open'); panel.setAttribute('aria-hidden', 'false'); audio.ui('ui_open', 0.5); }
function closePanel() { if (!panel.classList.contains('open')) return; panel.classList.remove('open'); panel.setAttribute('aria-hidden', 'true'); audio.ui('ui_close', 0.4); }
if (params.has('panel')) openPanel();
$('#btn-panel').addEventListener('click', (e) => { e.stopPropagation(); panel.classList.contains('open') ? closePanel() : openPanel(); });
renderer.domElement.addEventListener('pointerdown', closePanel);
addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  if (panel.classList.contains('open')) closePanel(); else if (mode === 'walk') leaveWalk();
});

const hourInput = $('#hour');
const fmt = (h) => {
  h = ((h % 24) + 24) % 24;
  const H = Math.floor(h), M = Math.floor((h - H) * 60);
  return `${String(H).padStart(2, '0')}:${String(M).padStart(2, '0')}`;
};
function setTimeMode(m) {
  settings.timeMode = m; save();
  for (const b of $('#time-mode').children) b.classList.toggle('on', b.dataset.mode === m);
}
$('#time-mode').addEventListener('click', (e) => {
  const m = e.target.dataset.mode; if (!m) return;
  if (m === 'manual') settings.hour = atm.hour;
  setTimeMode(m); audio.ui('ui_tap', 0.5);
});
hourInput.addEventListener('input', () => {
  if (settings.timeMode !== 'manual') setTimeMode('manual');
  settings.hour = parseFloat(hourInput.value); save();
});
setTimeMode(settings.timeMode);

function setWeather(w, silent) {
  settings.weather = w; save();
  atm.setWeather(w);
  for (const b of $('#weather').children) b.classList.toggle('on', b.dataset.w === w);
  if (!silent) audio.ui('ui_tap', 0.5);
}
$('#weather').addEventListener('click', (e) => { const w = e.target.dataset.w; if (w) setWeather(w); });
setWeather(settings.weather, true);

const vol = $('#volume');
vol.value = settings.volume;
vol.addEventListener('input', () => {
  settings.volume = parseFloat(vol.value); save();
  if (body.classList.contains('sound-on')) audio.setVolume(settings.volume);
});
const amb = $('#amb'), mus = $('#mus');
amb.checked = settings.ambient; mus.checked = settings.music;
amb.addEventListener('change', () => { settings.ambient = amb.checked; save(); audio.setAmbient(amb.checked); audio.ui('ui_toggle', 0.5); });
mus.addEventListener('change', () => { settings.music = mus.checked; save(); audio.setMusic(mus.checked); audio.ui('ui_toggle', 0.5); });

// ------------------------------------------------------------ modes
// 'orbit' (around the monument) or 'walk' (on foot, up to the lookout)
let mode = 'orbit';
let busy = false;
function fadeSwap(fn) {
  if (busy) return;
  busy = true;
  const f = $('#fade');
  f.classList.add('on');
  setTimeout(() => {
    fn();
    requestAnimationFrame(() => setTimeout(() => { f.classList.remove('on'); busy = false; }, 140));
  }, 560);
}
function setMode(m) {
  mode = m;
  body.classList.toggle('walking', m === 'walk');
  controls.enabled = m === 'orbit';
  walker.active = m === 'walk';
  if (m !== 'walk') sun.target.position.set(0, 4, -2);
  const touch = matchMedia('(pointer: coarse)').matches;
  const keys = touch ? 'Toca' : '<b>W A S D</b> o toca';
  $('#walk-help').innerHTML = `${keys} el césped para caminar · arrastra para mirar · toca la escalera para ir al mirador${touch ? '' : ' · <b>V</b> cambia la vista'}`;
  camera.fov = m === 'orbit' ? FOV_ORBIT : FOV_WALK;
  if (m === 'orbit') fitLens(); else camera.updateProjectionMatrix();
  camera.rotation.order = m === 'walk' ? 'YXZ' : 'XYZ';
}
function startWalk(x = guide.group.position.x, z = guide.group.position.z, yaw = Math.atan2(x, z), pitch = 0.14) {
  closePanel(); tween = null;
  setMode('walk');
  walker.place(x, z, yaw, pitch);
  third.heading = yaw + Math.PI; // he faces where the camera looks
  third.dist = 11; third.lift = 0.45; // the camera settles in behind him after the fade
  third.prev.set(x, 0, z);
  hideHint();
}

// ---------------------------------------------------- third person
// The camera orbits behind el caminante: drag turns it (walker.yaw), W walks where the camera looks,
// and he turns toward where he goes. V switches to first person (he hides).
const third = { heading: Math.PI, dist: 4.4, lift: 0, prev: new THREE.Vector3(), speed: 0, occl: 99, tick: 0 };
const camRay = new THREE.Raycaster();
function setView(v, silent) {
  settings.view = v; save();
  $('#btn-view').textContent = v === 'third' ? 'Primera persona' : 'Tercera persona';
  if (!silent) { toast(v === 'third' ? 'Paseas con el caminante' : 'Miras con sus ojos', 1800); audio.ui('ui_tap', 0.4); }
}
$('#btn-view').addEventListener('click', (e) => { e.stopPropagation(); setView(settings.view === 'third' ? 'first' : 'third'); });
addEventListener('keydown', (e) => {
  if (mode !== 'walk' || e.key.toLowerCase() !== 'v' || e.repeat || e.target.closest?.('input')) return;
  setView(settings.view === 'third' ? 'first' : 'third');
});
setView(settings.view, true);
function updateGuide(dt) {
  const g = guide.group;
  if (mode === 'walk') {
    const p = walker.pos;
    const dx = p.x - third.prev.x, dz = p.z - third.prev.z;
    const v = Math.hypot(dx, dz) / Math.max(dt, 1e-4);
    third.speed += (v - third.speed) * Math.min(1, dt * 10);
    third.prev.set(p.x, 0, p.z);
    if (v > 0.25) {
      let da = Math.atan2(dx, dz) - third.heading; da = Math.atan2(Math.sin(da), Math.cos(da));
      third.heading += da * Math.min(1, dt * 9);
    }
    g.position.set(p.x, walker._y, p.z);
    g.rotation.y = third.heading;
    g.visible = settings.view === 'third';
    guide.update(dt, third.speed);
    if (settings.view !== 'third') return;
    // the camera behind his shoulder; pitch tilts it over him
    third.dist += (3.9 - third.dist) * Math.min(1, dt * 1.6);
    third.lift += (0 - third.lift) * Math.min(1, dt * 1.6);
    const el = THREE.MathUtils.clamp(0.28 - walker.pitch * 0.9 + third.lift, -0.12, 1.25);
    const fx = -Math.sin(walker.yaw), fz = -Math.cos(walker.yaw);
    const look = new THREE.Vector3(p.x, walker._y + 1.5, p.z);
    // keep the camera out of the monument: a ray from his head, every few frames and only near it
    let d = third.dist;
    if (--third.tick <= 0) {
      third.tick = 3;
      third.occl = 99;
      if (Math.hypot(p.x, p.z) < 42) {
        const dir = new THREE.Vector3(-fx * Math.cos(el), Math.sin(el), -fz * Math.cos(el));
        camRay.set(look, dir); camRay.far = third.dist + 0.4;
        const h = camRay.intersectObject(monument.group, true)[0];
        if (h) third.occl = Math.max(0.9, h.distance - 0.35);
      }
    }
    d = Math.min(d, third.occl);
    camera.position.set(look.x - fx * Math.cos(el) * d, look.y + Math.sin(el) * d, look.z - fz * Math.cos(el) * d);
    const gy = monument.heightAt(camera.position.x, camera.position.z) + 0.3;
    if (camera.position.y < gy) camera.position.y = gy;
    camera.lookAt(look.x + fx * 1.2, look.y + 0.1 - walker.pitch * 0.6, look.z + fz * 1.2);
  } else {
    g.visible = true;
    guide.update(dt, 0, { gaze: 'monument' });
  }
}
$('#btn-walk').addEventListener('click', (e) => {
  e.stopPropagation();
  if (mode === 'walk') { leaveWalk(); return; }
  audio.ui('ui_swish', 0.35);
  fadeSwap(() => { startWalk(); toast('Paseo a pie por el parque', 2200); });
});
function leaveWalk() {
  if (mode !== 'walk') return;
  audio.ui('ui_swish', 0.35);
  fadeSwap(() => {
    const p = walker.pos.clone();
    setMode('orbit');
    guide.group.visible = true;
    camera.position.set(p.x + 6, 9, p.z + 16);
    controls.target.set(p.x, 5, p.z - 10);
    flyTo(HOME.pos, HOME.target, 2.2);
    markInput();
  });
}
$('#btn-exit').addEventListener('click', () => leaveWalk());

// a click on the stair from the overview: start walking at its foot, facing up the steps
let down = null;
renderer.domElement.addEventListener('pointerdown', (e) => { down = { x: e.clientX, y: e.clientY }; });
renderer.domElement.addEventListener('pointerup', (e) => {
  if (!down || e.button !== 0 || mode !== 'orbit') return;
  const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
  down = null;
  if (moved > 6) return;
  if (!hitStair(e)) {
    // a click on something with a story opens its card
    setRay(e);
    const i = details.pick(ray);
    if (i >= 0) details.open(i);
    return;
  }
  audio.ui('ui_swish', 0.35);
  fadeSwap(() => { startWalk(monument.stairFoot.x, monument.stairFoot.z + 1.2, 0, 0.25); toast('Sube con W o la flecha ↑', 2600); });
});
if (params.has('walk')) {
  const w = params.get('walk') || '';
  if (w === 'stair') startWalk(monument.stairFoot.x, monument.stairFoot.z + 1.2, 0, 0.1);
  else { const v = w.split(',').map(Number); startWalk(...(v.length >= 2 ? v : [])); }
}
let onLookout = false;
let viewShift = 0;

// ------------------------------------------------------------- the details (13 stories)
const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
const P = monument.parts, Lk = monument.lookout;
const cyclist = life.people.cyclists[0];
const DETAILS = [
  { id: 'rostro', title: 'Mira hacia arriba', objs: [P.head, P.neck], anchor: V3(0, 15.5, 1.5), dist: 14, lift: 0.12,
    text: 'Un rostro de piedra con los ojos cerrados, vuelto al cielo. En una de las ciudades más lluviosas del Ecuador, parece estar esperando el próximo aguacero.' },
  { id: 'manto', title: 'Un manto que crece', objs: [P.veil], anchor: V3(5, 9, 2), dist: 18,
    text: 'Franjas de azulejo roto en rojo, amarillo, azul y morado, como las faldas de rayas de las mujeres tsáchilas. En las franjas verdes crecen plantas de verdad: el manto cambia con cada temporada de lluvias.' },
  { id: 'collar', title: 'Cinco vueltas de rojo', objs: [P.chest], anchor: V3(0, 8.4, 5.4), dist: 9, lift: 0.1,
    text: 'Cuentas rojas y turquesa sobre un pecho de espirales. A los tsáchilas los llamaron «colorados» por el achiote con que los hombres pintan su cabello. Ellos se nombran tsáchila: «verdadera gente».' },
  { id: 'manos', title: 'Las manos de la tierra', objs: P.hands, anchor: V3(-25, 12, -10), dist: 24,
    text: 'Dos brazos de mosaico salen del césped con las palmas abiertas al cielo, uno a cada lado del rostro. Desde aquí no se sabe si reciben la lluvia o la están ofreciendo.' },
  { id: 'mirador', title: 'A la altura de la muñeca', objs: [P.stair], anchor: V3(Lk.x, Lk.y + 1, Lk.z), dist: 13,
    text: 'Treinta escalones de acero llevan a un balcón junto al antebrazo, a 5,6 metros del césped. Desde ahí el mosaico se ve pieza por pieza: ninguna tesela es igual a otra.' },
  { id: 'letras', title: 'El nombre crece', objs: [park.letters], anchor: V3(-33, 2.4, 35.5), dist: 11, lift: 0.15,
    text: 'Las letras de la entrada son maceteros. Con cada temporada de lluvias, el nombre del parque se pone un poco más verde.' },
  { id: 'cuerdas', title: 'Amarillo, azul y verde', objs: [life.ropes.group], anchor: V3(ROPES.x, 6, ROPES.z), dist: 28,
    text: 'Tres pisos de vigas, redes y puentes colgantes. Casco, arnés y un paso a la vez. Abajo, alguien siempre grita: «¡No mires para abajo!».' },
  { id: 'juegos', title: 'Turno para el columpio', objs: [life.play.group], anchor: V3(PLAY.x, 2, PLAY.z), dist: 17,
    text: 'Torres de techo rojo y verde, un puente, un tobogán amarillo y unos columpios que los domingos nunca están libres.' },
  { id: 'noria', title: 'La vuelta completa', objs: [life.fair.wheel], anchor: FAIR.wheel.clone(), dist: 40, lift: 0.08,
    text: 'En la feria junto al parque la rueda gira despacio. De noche se enciende de colores y se ve desde toda la avenida.' },
  { id: 'ciclovia', title: 'La ciclovía azul', objs: life.people.cyclists, anchor: V3(), dist: 10, lift: 0.3, live: true,
    track: (a) => a.copy(cyclist.position).setY(1.3),
    text: 'Una franja azul con línea amarilla bordea el parque. Por la tarde, cuando baja el calor, se llena de bicicletas.' },
  { id: 'carrito', title: 'Bajo el parasol verde', objs: [life.people.cart], anchor: V3(-9, 1.6, 35.6), dist: 8, lift: 0.2,
    text: 'El carrito de helados sigue a la sombra durante el día. Cuando empieza a llover, el parasol se comparte.' },
  { id: 'caminante', title: 'Verdadera gente', objs: [guide.group], anchor: V3(), dist: 4.6, lift: 0.08, live: true,
    track: (a) => a.copy(guide.group.position).setY(guide.group.position.y + 1.15),
    text: 'El cabello pintado de rojo con achiote y moldeado como un casco, la corona de algodón, las líneas negras de huito en la cara y los brazos, la falda de rayas blancas y negras y la faja roja. Él te acompaña en el paseo: toca el botón del caminante y recorre el parque a su paso.' },
  { id: 'lluvia', title: 'La ciudad de la lluvia', objs: [], anchor: V3(0, 25, -60), dist: 125, lift: 0.1,
    text: 'Santo Domingo recibe lluvia casi todo el año, y los aguaceros de la tarde son parte del día. Por eso el césped es tan verde y las palmeras crecen tan rápido.' },
  { id: 'cruce', title: 'Cruce de caminos', objs: [], anchor: V3(0, 3, AVENUE.z), dist: 42, lift: 0.4,
    text: 'Detrás de los árboles pasa la avenida. Santo Domingo es un cruce entre la Sierra y la Costa: por aquí pasan los caminos que bajan de Quito hacia el mar.' },
];
let focusDetail = null;
const details = createDetails({
  details: DETAILS, camera, home: HOME,
  focus: (d, offset) => {
    if (mode === 'walk') setMode('orbit');
    focusDetail = d; markInput(); hideHint(); closePanel();
    flyTo(d.anchor.clone().add(offset), d.anchor, 1.9);
  },
  unfocus: () => { focusDetail = null; markInput(); flyTo(HOME.pos, HOME.target, 1.9); },
  onOpen: () => audio.play('marimba_A5', { gain: 0.16, bus: audio.uiBus }),
});
if (params.has('detail')) { const i = DETAILS.findIndex((d) => d.id === params.get('detail')); if (i >= 0) details.open(i); }
if (params.has('seek')) details.setSeek(true);

// cursor
const cursor = $('#cursor');
addEventListener('pointermove', (e) => {
  if (e.pointerType !== 'mouse') return;
  cursor.style.transform = `translate(${e.clientX}px, ${e.clientY}px)`;
  cursor.classList.toggle('over-ui', !!e.target.closest('button, #panel, input, label'));
  cursor.classList.add('visible');
});
addEventListener('pointerdown', () => cursor.classList.add('down'));
addEventListener('pointerup', () => cursor.classList.remove('down'));
document.addEventListener('mouseleave', () => cursor.classList.remove('visible'));

addEventListener('resize', () => {
  if (mode === 'walk') { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); } else fitLens();
  renderer.setSize(innerWidth, innerHeight);
});

// --------------------------------------------------------------------- loop
const timer = new THREE.Timer();
timer.connect(document);
let uiTick = 0, first = true;
const CYCLE_HOURS_PER_SEC = 24 / (12 * 60); // a full day in 12 minutes

function frame(dt, t) {
  if (settings.timeMode === 'real') {
    const d = new Date();
    atm.hour = d.getHours() + d.getMinutes() / 60 + d.getSeconds() / 3600;
  } else if (settings.timeMode === 'cycle') {
    settings.hour = (settings.hour + dt * CYCLE_HOURS_PER_SEC) % 24;
    atm.hour = settings.hour;
  } else {
    atm.hour = settings.hour;
  }

  park.update(t);
  monumentFlora.update(t);
  life.update(t, dt, { night: atm.pal.night, rain: atm.w.rain });
  details.update();
  if (mode === 'walk') {
    walker.update(dt);
    updateGuide(dt);
    // the shadow map follows the walker (snapped, so it doesn't shimmer)
    sun.target.position.set(Math.round(walker.pos.x / 8) * 8, 2, Math.round(walker.pos.z / 8) * 8);
    const up = monument.onLookout(walker.pos.x, walker.pos.z);
    if (up && !onLookout) { toast('Mirador · 5,6 m sobre el césped', 2600); audio.lookout(); }
    onLookout = up;
  }
  if (mode !== 'walk') updateGuide(dt);
  clouds.update(dt);
  atm.update(t, dt, camera);
  stars.material.uniforms.uPixel.value = renderer.getPixelRatio();
  fireflies.material.uniforms.uPixel.value = renderer.getPixelRatio();

  Object.assign(audio.state, {
    wind: atm.w.wind, rain: atm.w.rain, storm: atm.w.storm, night: atm.pal.night, hour: atm.hour,
    height: mode === 'walk' ? THREE.MathUtils.clamp(walker._y / 5.6, 0, 1) : THREE.MathUtils.clamp((camera.position.y - 4) / 60, 0, 1),
  });
  audio.update(dt);

  if (mode === 'orbit') {
  if (tween) {
    const k = Math.min((performance.now() - tween.start) / tween.dur, 1);
    const e = ease(k);
    camera.position.lerpVectors(tween.p0, tween.p1, e);
    controls.target.lerpVectors(tween.t0, tween.t1, e);
    if (k >= 1) tween = null;
  } else if (performance.now() - lastInput > 12000 && !focusDetail) {
    controls.autoRotate = true;
  } else if (focusDetail?.live) {
    // follow a moving detail (the cyclist)
    const d = focusDetail.anchor.clone().sub(controls.target);
    camera.position.add(d); controls.target.add(d);
  }
  if (tween) camera.lookAt(controls.target); else controls.update();
  // with a story card open on a wide screen, the picture slides right so the card doesn't cover it
  const wantShift = focusDetail && innerWidth > 760 ? Math.min(240, innerWidth * 0.17) : 0;
  viewShift += (wantShift - viewShift) * Math.min(1, dt * 3);
  if (viewShift > 0.5) camera.setViewOffset(innerWidth, innerHeight, -viewShift, 0, innerWidth, innerHeight);
  else if (camera.view) camera.clearViewOffset();
  const tg = controls.target;
  tg.y = THREE.MathUtils.clamp(tg.y, 1, focusDetail ? 40 : 26);
  const hr = Math.hypot(tg.x, tg.z);
  const maxR = focusDetail ? 260 : 70;
  if (hr > maxR) { tg.x *= maxR / hr; tg.z *= maxR / hr; }
  if (camera.position.y < 1.2) camera.position.y = 1.2;
  }
  renderer.render(scene, camera);

  uiTick -= dt;
  if (uiTick <= 0) {
    uiTick = 0.25;
    $('#clock').textContent = fmt(atm.hour);
    if (document.activeElement !== hourInput) hourInput.value = ((atm.hour % 24) + 24) % 24;
  }
  if (first) {
    first = false;
    body.classList.add('ready');
    if (settings.sound) body.classList.add('sound-on');
  }
}

renderer.setAnimationLoop((now) => {
  timer.update(now);
  frame(Math.min(timer.getDelta(), 0.05), timer.getElapsed());
});
