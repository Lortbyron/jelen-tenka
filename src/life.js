import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { rand, rr, pick } from './util.js';
import { RING, LANE } from './park.js';

/*
  The living park (phase 3), from the drone video:
  - the yellow/blue/green ropes course with kids in helmets, the playground with its swings;
  - the fair next door: a ferris wheel that lights up in colours at night, a carousel, striped tents;
  - people walking round the oval, cyclists on the blue lane, the ice-cream cart, a family on a blanket.
  Fewer people at night and in the rain; umbrellas when it rains.
*/
const V = (x, y, z) => new THREE.Vector3(x, y, z);
export const ROPES = { x: -80, z: 4, ry: 0.3 };
export const PLAY = { x: -104, z: 30, ry: -0.4 };
export const FAIR = { x: 108, z: 8, wheel: V(119, 13.9, -4) };

const matCache = new Map();
const mat = (color, o = {}) => {
  const k = color + JSON.stringify(o);
  if (!matCache.has(k)) matCache.set(k, new THREE.MeshStandardMaterial({ color, roughness: 0.75, ...o }));
  return matCache.get(k);
};
const mesh = (geo, m, x = 0, y = 0, z = 0) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.castShadow = true; o.receiveShadow = true; return o; };

// shared person parts
const GEO = {
  leg: new THREE.CapsuleGeometry(0.075, 0.62, 3, 8).translate(0, -0.38, 0),
  arm: new THREE.CapsuleGeometry(0.052, 0.48, 3, 8).translate(0, -0.27, 0),
  torso: new THREE.CapsuleGeometry(0.17, 0.36, 4, 10),
  head: new THREE.SphereGeometry(0.115, 12, 10),
  hair: new THREE.SphereGeometry(0.122, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2.1),
  helmet: new THREE.SphereGeometry(0.14, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2),
  umbrella: new THREE.ConeGeometry(0.62, 0.28, 12, 1, true),
  stick: new THREE.CylinderGeometry(0.012, 0.012, 0.9, 5),
};
const SKIN = ['#8a5a40', '#a46c4c', '#c08a66', '#6f4632', '#d1a07e', '#9b6447'];
const TOPS = ['#f2f2ee', '#e2483a', '#3a74c4', '#f2c230', '#56a35a', '#e98ab0', '#2b2b30', '#7a4fb0', '#ef7f2e', '#7cc0e4'];
const BOTTOMS = ['#2f3d5c', '#3b3b44', '#5b6b8c', '#7a6a58', '#22252c', '#e8e2d4'];
const HAIR = ['#1d1612', '#2a1d16', '#3a2a1e', '#141010'];
const UMBRELLAS = ['#e2483a', '#3a74c4', '#2b2b30', '#f2c230', '#56a35a', '#7a4fb0'];

/** A simple figure, feet at the origin, facing +z. Legs and arms swing from hip and shoulder pivots. */
function person({ h = 1, skin = pick(SKIN), top = pick(TOPS), bottom = pick(BOTTOMS), hair = pick(HAIR), helmet = null, umbrella = false } = {}) {
  const g = new THREE.Group();
  const body = new THREE.Group();
  g.add(body);
  const legs = [], arms = [];
  for (const s of [-1, 1]) {
    const hip = new THREE.Group(); hip.position.set(s * 0.095, 0.84, 0);
    hip.add(mesh(GEO.leg, mat(bottom)));
    const sh = new THREE.Group(); sh.position.set(s * 0.235, 1.36, 0);
    sh.add(mesh(GEO.arm, mat(top === '#2b2b30' ? skin : rand() < 0.6 ? skin : top)));
    sh.rotation.z = s * 0.08;
    body.add(hip, sh); legs.push(hip); arms.push(sh);
  }
  body.add(mesh(GEO.torso, mat(top), 0, 1.13, 0));
  body.add(mesh(GEO.head, mat(skin), 0, 1.57, 0));
  body.add(helmet ? mesh(GEO.helmet, mat(helmet, { roughness: 0.4 }), 0, 1.6, 0) : mesh(GEO.hair, mat(hair), 0, 1.59, -0.01));
  let umb = null;
  if (umbrella) {
    umb = new THREE.Group();
    const c = mesh(GEO.umbrella, mat(pick(UMBRELLAS), { side: THREE.DoubleSide }), 0, 2.08, 0);
    umb.add(c, mesh(GEO.stick, mat('#2a2a2a'), 0, 1.68, 0));
    umb.position.set(0.18, 0, 0.05);
    umb.visible = false;
    body.add(umb);
  }
  g.scale.setScalar(h);
  g.userData = { body, legs, arms, umb };
  return g;
}
function walkPose(p, phase, amp = 0.45) {
  const { legs, arms, body } = p.userData;
  const s = Math.sin(phase);
  legs[0].rotation.x = s * amp; legs[1].rotation.x = -s * amp;
  arms[0].rotation.x = -s * amp * 0.8; arms[1].rotation.x = s * amp * 0.8;
  body.position.y = Math.abs(Math.cos(phase)) * 0.03;
}
function sitPose(p) {
  const { legs, arms, body } = p.userData;
  body.position.y = -0.62;
  for (const l of legs) l.rotation.x = -Math.PI / 2 + 0.15;
  for (const a of arms) a.rotation.x = 0.5;
}

/** Merge geometries by material into a few meshes. */
class Builder {
  constructor() { this.parts = new Map(); }
  add(geo, color, o) {
    const m = mat(color, o);
    if (!this.parts.has(m)) this.parts.set(m, []);
    this.parts.get(m).push(geo.index ? geo.toNonIndexed() : geo);
  }
  box(color, x, y, z, w, h, d, ry = 0, o) { const g = new THREE.BoxGeometry(w, h, d); g.rotateY(ry); g.translate(x, y, z); this.add(g, color, o); }
  rod(color, a, b, r = 0.08, seg = 8, o) {
    const dir = b.clone().sub(a);
    const g = new THREE.CylinderGeometry(r, r, dir.length(), seg);
    g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), dir.clone().normalize()));
    g.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
    this.add(g, color, o);
  }
  disc(color, x, y, z, r, h = 0.1, seg = 20, o) { const g = new THREE.CylinderGeometry(r, r, h, seg); g.translate(x, y, z); this.add(g, color, o); }
  build() {
    const group = new THREE.Group();
    for (const [m, geos] of this.parts) {
      const o = new THREE.Mesh(mergeGeometries(geos.map((g) => { for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k); return g; })), m);
      o.castShadow = o.receiveShadow = true;
      group.add(o);
    }
    return group;
  }
}

function stripeTexture(colors, w = 256, h = 32) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const x = c.getContext('2d');
  const sw = w / colors.length;
  colors.forEach((col, i) => { x.fillStyle = col; x.fillRect(i * sw, 0, sw + 1, h); });
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = THREE.RepeatWrapping;
  return t;
}

/** A dirt or rubber patch under an attraction. */
function patch(color, x, z, rx, rz, ry = 0) {
  const g = new THREE.CircleGeometry(1, 40);
  g.scale(rx, rz, 1); g.rotateX(-Math.PI / 2); g.rotateY(ry); g.translate(x, 0.035, z);
  const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color, roughness: 1, polygonOffset: true, polygonOffsetFactor: -3 }));
  m.receiveShadow = true;
  return m;
}

// ================================================================== the ropes course
function createRopes() {
  const root = new THREE.Group();
  root.position.set(ROPES.x, 0, ROPES.z); root.rotation.y = ROPES.ry;
  const B = new Builder();
  const BLUE = '#2f7fd0', YEL = '#f2c230', GRN = '#3fa65a';
  const NX = 4, NZ = 3, SX = 4.6, SZ = 4.4, H = 11.2, LV = [3.2, 6.4, 9.6];
  const P = (i, j) => V((i - (NX - 1) / 2) * SX, 0, (j - (NZ - 1) / 2) * SZ);
  for (let i = 0; i < NX; i++) for (let j = 0; j < NZ; j++) {
    const p = P(i, j);
    B.rod(BLUE, p, p.clone().setY(H), 0.13, 10);
    for (const y of LV) B.disc(GRN, p.x, y - 0.05, p.z, 0.62, 0.1);
  }
  // beams between poles at each level, with a plank walkway on some of them
  const lines = [];
  for (const y of LV) {
    for (let i = 0; i < NX; i++) for (let j = 0; j < NZ; j++) {
      const a = P(i, j);
      for (const [di, dj] of [[1, 0], [0, 1]]) {
        if (i + di >= NX || j + dj >= NZ) continue;
        const b = P(i + di, j + dj);
        B.rod(YEL, a.clone().setY(y + 1.05), b.clone().setY(y + 1.05), 0.07, 6);   // the yellow safety beam
        B.rod(YEL, a.clone().setY(y - 0.12), b.clone().setY(y - 0.12), 0.06, 6);
        // the element between: plank walkway, rope bridge or net
        const kind = (i + j + Math.round(y)) % 3;
        const L = a.distanceTo(b), dir = b.clone().sub(a).normalize(), ry = Math.atan2(dir.x, dir.z);
        if (kind === 0) {
          for (let k = 0.7; k < L - 0.6; k += 0.55) { const q = a.clone().addScaledVector(dir, k); B.box('#c99a5a', q.x, y, q.z, 0.7, 0.05, 0.36, ry); }
        } else {
          // hanging ropes: a sagging pair below and the vertical lines up to the safety beam
          for (let k = 0; k <= 10; k++) {
            const t = k / 10, q = a.clone().lerp(b, t);
            const sag = Math.sin(t * Math.PI) * 0.35;
            if (k < 10) {
              const q2 = a.clone().lerp(b, (k + 1) / 10), sag2 = Math.sin(((k + 1) / 10) * Math.PI) * 0.35;
              lines.push(q.x, y - sag, q.z, q2.x, y - sag2, q2.z);
            }
            if (kind === 2 || k % 2 === 0) lines.push(q.x, y - sag, q.z, q.x, y + 1.05, q.z);
          }
        }
      }
    }
  }
  // the green stair tower at one end
  const st = P(NX - 1, 0).add(V(2.8, 0, 0));
  let y0 = 0;
  for (let f = 0; f < LV.length; f++) {
    const y1 = LV[f], n = 12;
    const zA = st.z - 1.6 + (f % 2) * 3.2, zB = st.z + 1.6 - (f % 2) * 3.2;
    for (let k = 0; k < n; k++) {
      const t = (k + 0.5) / n;
      B.box(GRN, st.x, y0 + (y1 - y0) * t, zA + (zB - zA) * t, 1.4, 0.06, 0.3);
    }
    for (const s of [-0.72, 0.72]) {
      B.rod(YEL, V(st.x + s, y0 + 1.0, zA), V(st.x + s, y1 + 1.0, zB), 0.04, 6);
      B.rod(GRN, V(st.x + s, y0, zA), V(st.x + s, y1, zB), 0.06, 6);
    }
    B.box(GRN, st.x, y1 - 0.05, zB + (f % 2 ? -0.7 : 0.7), 1.6, 0.1, 1.6);
    y0 = y1;
  }
  for (const dz of [-2.2, 2.2]) B.rod(BLUE, V(st.x - 0.9, 0, st.z + dz), V(st.x - 0.9, H - 1, st.z + dz), 0.1);
  for (const dz of [-2.2, 2.2]) B.rod(BLUE, V(st.x + 0.9, 0, st.z + dz), V(st.x + 0.9, H - 1, st.z + dz), 0.1);
  // a white flag on top, as in the video
  const top = P(0, 1).setY(H);
  B.rod('#dddddd', top, top.clone().setY(H + 2.2), 0.04);
  B.box('#f4f4f0', top.x + 0.5, H + 1.85, top.z, 1, 0.6, 0.02);
  root.add(B.build());
  const lg = new THREE.BufferGeometry(); lg.setAttribute('position', new THREE.Float32BufferAttribute(lines, 3));
  root.add(new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ color: '#3b3226' })));

  // kids in helmets crossing the elements, slowly, now and then stopping
  const kids = [];
  for (let k = 0; k < 7; k++) {
    const kid = person({ h: rr(0.68, 0.82), helmet: pick(['#e2483a', '#f2c230', '#3a74c4', '#ffffff']), top: pick(TOPS) });
    const lvl = LV[k % LV.length], i = Math.floor(rand() * (NX - 1)), j = Math.floor(rand() * NZ);
    kid.userData.path = { a: P(i, j).setY(lvl + 0.02), b: P(i + 1, j).setY(lvl + 0.02), t: rand(), sp: rr(0.08, 0.14), dir: rand() < 0.5 ? 1 : -1, wait: 0 };
    root.add(kid); kids.push(kid);
  }
  // a few on the ground, waiting their turn with the harness on
  for (let k = 0; k < 4; k++) {
    const p = person({ h: rr(0.7, 0.85), helmet: pick(['#e2483a', '#f2c230', '#3a74c4']) });
    p.position.set(rr(-3, 3), 0, SZ * 1.6 + rr(0, 1.5)); p.rotation.y = Math.PI + rr(-0.4, 0.4);
    root.add(p);
  }
  return {
    group: root, kids,
    update(t, dt) {
      for (const kid of kids) {
        const q = kid.userData.path;
        if (q.wait > 0) { q.wait -= dt; walkPose(kid, 0, 0); continue; }
        q.t += q.dir * q.sp * dt;
        if (q.t > 1 || q.t < 0) { q.dir *= -1; q.t = THREE.MathUtils.clamp(q.t, 0, 1); q.wait = rr(2, 6); }
        kid.position.lerpVectors(q.a, q.b, q.t);
        kid.rotation.y = Math.atan2((q.b.x - q.a.x) * q.dir, (q.b.z - q.a.z) * q.dir);
        walkPose(kid, t * 4 + kid.id, 0.3);
        // arms up holding the safety line
        kid.userData.arms[0].rotation.x = kid.userData.arms[1].rotation.x = -2.6;
      }
    },
  };
}

// ================================================================== the playground
function createPlayground() {
  const root = new THREE.Group();
  root.position.set(PLAY.x, 0, PLAY.z); root.rotation.y = PLAY.ry;
  const B = new Builder();
  const tower = (x, z, roof) => {
    for (const [dx, dz] of [[-1.1, -1.1], [1.1, -1.1], [1.1, 1.1], [-1.1, 1.1]]) B.rod('#f2c230', V(x + dx, 0, z + dz), V(x + dx, 3.4, z + dz), 0.07);
    B.box('#3a74c4', x, 1.5, z, 2.4, 0.12, 2.4);
    for (const s of [-1, 1]) B.box('#e2483a', x + s * 1.15, 2.0, z, 0.06, 0.9, 2.2);
    const r = new THREE.ConeGeometry(1.9, 1.2, 4); r.rotateY(Math.PI / 4); r.translate(x, 4.0, z); B.add(r, roof);
  };
  tower(-2.4, 0, '#d9443a');
  tower(2.6, 0.4, '#4caf50');
  // bridge between the towers
  for (let k = -1.1; k <= 1.3; k += 0.32) B.box('#c99a5a', k, 1.5, 0.2, 0.24, 0.06, 1.0);
  for (const s of [-0.5, 0.9]) B.rod('#f2c230', V(-1.2, 2.3, s), V(1.4, 2.3, s), 0.04);
  // a yellow slide from the green tower
  const sl = new THREE.BoxGeometry(0.8, 0.06, 3.6); sl.rotateX(0.45); sl.translate(2.6, 0.8, 3.0); B.add(sl, '#f2c230', { roughness: 0.4 });
  for (const s of [-0.42, 0.42]) { const g = new THREE.BoxGeometry(0.06, 0.25, 3.6); g.rotateX(0.45); g.translate(2.6 + s, 0.95, 3.0); B.add(g, '#f2c230', { roughness: 0.4 }); }
  // climbing wall
  const w = new THREE.BoxGeometry(2.2, 1.6, 0.12); w.rotateX(-0.25); w.translate(-2.4, 0.75, -1.5); B.add(w, '#7a4fb0');
  // swings frame
  const sx = -1, sz = -5.5;
  for (const s of [-3, 3]) {
    B.rod('#e2483a', V(sx + s, 0, sz - 1), V(sx + s, 2.8, sz), 0.07);
    B.rod('#e2483a', V(sx + s, 0, sz + 1), V(sx + s, 2.8, sz), 0.07);
  }
  B.rod('#e2483a', V(sx - 3, 2.8, sz), V(sx + 3, 2.8, sz), 0.08);
  root.add(B.build());
  root.add(patch('#4f8f78', 0, -1.5, 7.5, 6.5));
  // swings: seat + chains on a pivot, two of them with kids
  const swings = [];
  for (const [k, x] of [[0, -2.6], [1, -1], [2, 0.6]]) {
    const pv = new THREE.Group(); pv.position.set(sx + x + 1, 2.8, sz);
    const chainG = new THREE.CylinderGeometry(0.012, 0.012, 2.2, 4);
    pv.add(mesh(chainG, mat('#555'), -0.22, -1.1, 0), mesh(chainG, mat('#555'), 0.22, -1.1, 0));
    pv.add(mesh(new THREE.BoxGeometry(0.5, 0.05, 0.22), mat('#2b2b30'), 0, -2.2, 0));
    if (k < 2) {
      const kid = person({ h: 0.7 });
      sitPose(kid);
      kid.position.set(0, -2.18 - 0.03, 0.05);
      kid.userData.body.position.y = -0.84 + 0.62; // seat height
      pv.add(kid);
    }
    root.add(pv);
    swings.push({ pv, ph: rand() * 6, amp: k < 2 ? rr(0.45, 0.7) : 0.05 });
  }
  // a parent watching
  const parent = person({}); parent.position.set(sx + 1, 0, sz + 3.2); parent.rotation.y = Math.PI; root.add(parent);
  return {
    group: root,
    update(t) { for (const s of swings) s.pv.rotation.x = Math.sin(t * 1.6 + s.ph) * s.amp; },
  };
}

// ================================================================== the fair
function createFair() {
  const root = new THREE.Group();
  root.add(patch('#57575a', FAIR.x, FAIR.z, 26, 20, 0.2));
  const bulbsAll = [];   // [position, colour] for the night lights

  // ---- ferris wheel
  const W = FAIR.wheel, R = 11;
  const wheel = new THREE.Group();
  wheel.position.copy(W);
  wheel.rotation.y = Math.atan2(-W.x, 60 - W.z); // turned toward the park
  const B = new Builder();
  const rimG = new THREE.TorusGeometry(R, 0.14, 8, 96);
  for (const dz of [-0.75, 0.75]) { const g = rimG.clone(); g.translate(0, 0, dz); B.add(g, '#f4f4f0', { roughness: 0.5, metalness: 0.3 }); }
  const inner = new THREE.TorusGeometry(R * 0.55, 0.08, 6, 64);
  for (const dz of [-0.75, 0.75]) { const g = inner.clone(); g.translate(0, 0, dz); B.add(g, '#e2483a'); }
  const NG = 18;
  for (let i = 0; i < NG; i++) {
    const a = (i / NG) * Math.PI * 2;
    for (const dz of [-0.75, 0.75]) B.rod('#f4f4f0', V(0, 0, dz), V(Math.cos(a) * R, Math.sin(a) * R, dz), 0.05, 5);
    B.rod('#f4f4f0', V(Math.cos(a) * R, Math.sin(a) * R, -0.75), V(Math.cos(a) * R, Math.sin(a) * R, 0.75), 0.05, 5);
  }
  { const hub = new THREE.CylinderGeometry(0.9, 0.9, 1.9, 16); hub.rotateX(Math.PI / 2); B.add(hub, '#e2483a'); } // the hub, along z
  wheel.add(B.build());
  // bulbs along the rims and spokes
  const bulbLocal = [];
  const RAINBOW = ['#ff4040', '#ffb020', '#fff060', '#40e070', '#40b0ff', '#c060ff'];
  for (let i = 0; i < 96; i++) { const a = (i / 96) * Math.PI * 2; for (const dz of [-0.85, 0.85]) bulbLocal.push([V(Math.cos(a) * R, Math.sin(a) * R, dz), RAINBOW[i % 6]]); }
  for (let i = 0; i < NG; i++) { const a = (i / NG) * Math.PI * 2; for (let k = 1; k < 6; k++) bulbLocal.push([V(Math.cos(a) * R * k / 6, Math.sin(a) * R * k / 6, 0.85), RAINBOW[(i + k) % 6]]); }
  const bulbMat = new THREE.MeshBasicMaterial({ toneMapped: false, color: '#ffffff' });
  const wheelBulbs = new THREE.InstancedMesh(new THREE.SphereGeometry(0.11, 8, 6), bulbMat, bulbLocal.length);
  const m4 = new THREE.Matrix4(), col = new THREE.Color();
  bulbLocal.forEach(([p, c], i) => { m4.makeTranslation(p.x, p.y, p.z); wheelBulbs.setMatrixAt(i, m4); wheelBulbs.setColorAt(i, col.set(c)); });
  wheel.add(wheelBulbs);
  // gondolas: they hang from the rim and stay upright
  const gondolas = [];
  const CAB = ['#e2483a', '#3a74c4', '#f2c230', '#56a35a', '#e98ab0', '#ef7f2e'];
  for (let i = 0; i < NG; i++) {
    const a = (i / NG) * Math.PI * 2;
    const gp = new THREE.Group(); gp.position.set(Math.cos(a) * R, Math.sin(a) * R, 0);
    const c = CAB[i % CAB.length];
    const cab = new THREE.Group();
    cab.add(mesh(new THREE.BoxGeometry(1.3, 0.8, 1.1), mat(c), 0, -1.3, 0));
    const roof = mesh(new THREE.ConeGeometry(0.95, 0.5, 4), mat(c), 0, -0.55, 0); roof.rotation.y = Math.PI / 4; cab.add(roof);
    cab.add(mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.6, 4), mat('#ddd'), 0, -0.3, 0));
    gp.add(cab);
    wheel.add(gp);
    gondolas.push(gp);
  }
  root.add(wheel);
  // the A-frame legs, fixed (not part of the turning wheel)
  const L = new Builder();
  const legsAt = (dz) => {
    const hub = V(W.x, W.y, W.z), side = V(Math.cos(wheel.rotation.y), 0, -Math.sin(wheel.rotation.y));
    const fwd = V(Math.sin(wheel.rotation.y), 0, Math.cos(wheel.rotation.y));
    const h = hub.clone().addScaledVector(fwd, dz);
    for (const s of [-1, 1]) L.rod('#f4f4f0', h, h.clone().addScaledVector(side, s * 5.5).setY(0), 0.22, 10, { metalness: 0.3, roughness: 0.5 });
  };
  legsAt(-1.4); legsAt(1.4);
  // ticket booth
  L.box('#e2483a', W.x - 2, 1.2, W.z + 7, 2.2, 2.4, 1.8);
  L.box('#f4f4f0', W.x - 2, 2.5, W.z + 7, 2.6, 0.2, 2.2);
  root.add(L.build());

  // ---- carousel
  const caro = new THREE.Group(); caro.position.set(FAIR.x - 12, 0, FAIR.z + 10);
  const CB = new Builder();
  CB.disc('#f4e3c0', 0, 0.25, 0, 5.2, 0.5, 32);
  CB.disc('#c8322b', 0, 0.52, 0, 5.0, 0.06, 32);
  CB.rod('#f2c230', V(0, 0, 0), V(0, 5, 0), 0.35, 12);
  const caroBase = CB.build(); caro.add(caroBase);
  const roofTex = stripeTexture(['#e2483a', '#ffffff', '#f2c230', '#ffffff', '#3a74c4', '#ffffff'], 512, 16);
  roofTex.repeat.set(4, 1);
  const roof = mesh(new THREE.ConeGeometry(5.8, 2.2, 32, 1), new THREE.MeshStandardMaterial({ map: roofTex, roughness: 0.7 }), 0, 5.6, 0);
  caro.add(roof);
  const valance = mesh(new THREE.CylinderGeometry(5.8, 5.8, 0.5, 32, 1, true), new THREE.MeshStandardMaterial({ map: roofTex, side: THREE.DoubleSide }), 0, 4.3, 0);
  caro.add(valance);
  const spinner = new THREE.Group(); caro.add(spinner);
  const horses = [];
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2, r = 3.6;
    const hg = new THREE.Group(); hg.position.set(Math.cos(a) * r, 0, Math.sin(a) * r); hg.rotation.y = -a;
    hg.add(mesh(new THREE.CylinderGeometry(0.04, 0.04, 4, 6), mat('#f2c230', { metalness: 0.5, roughness: 0.3 }), 0, 2.5, 0));
    const horse = new THREE.Group();
    const c = pick(['#ffffff', '#f4e3c0', '#e98ab0', '#7cc0e4', '#2b2b30']);
    horse.add(mesh(new THREE.CapsuleGeometry(0.28, 0.9, 4, 8), mat(c), 0, 0, 0));
    horse.children[0].rotation.x = Math.PI / 2;
    horse.add(mesh(new THREE.CapsuleGeometry(0.15, 0.5, 4, 8), mat(c), 0, 0.4, 0.55));
    horse.children[1].rotation.x = 0.6;
    horse.position.y = 1.5;
    hg.add(horse);
    spinner.add(hg);
    horses.push({ horse, ph: i * 0.9 });
  }
  root.add(caro);

  // ---- striped tents (the rainbow carpas from the drone)
  const tentTex = stripeTexture(['#e2483a', '#f2c230', '#56a35a', '#3a74c4', '#7a4fb0', '#ef7f2e', '#e98ab0', '#7cc0e4'], 512, 16);
  const tents = [[FAIR.x + 2, FAIR.z + 16], [FAIR.x + 9, FAIR.z + 14], [FAIR.x - 22, FAIR.z - 2], [FAIR.x - 20, FAIR.z + 22], [FAIR.x + 14, FAIR.z + 22], [FAIR.x - 4, FAIR.z + 26]];
  const TB = new Builder();
  for (const [x, z] of tents) {
    const s = rr(3, 4.2);
    for (const [dx, dz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) TB.rod('#dddddd', V(x + dx * s / 2, 0, z + dz * s / 2), V(x + dx * s / 2, 2.4, z + dz * s / 2), 0.05);
    TB.box('#f4f0e6', x, 0.5, z + s / 2 - 0.3, s * 0.9, 1, 0.5); // counter
    const t = new THREE.Mesh(new THREE.ConeGeometry(s * 0.78, 1.6, 4, 1), new THREE.MeshStandardMaterial({ map: tentTex, roughness: 0.8 }));
    t.position.set(x, 3.2, z); t.rotation.y = Math.PI / 4; t.castShadow = true;
    root.add(t);
    bulbsAll.push(...[0, 1, 2, 3].map((k) => [V(x + (k < 2 ? -1 : 1) * s / 2, 2.4, z + (k % 2 ? -1 : 1) * s / 2), RAINBOW[k + 1]]));
  }
  root.add(TB.build());
  // strings of lights between the tents
  const strLights = [];
  for (let i = 0; i < tents.length; i++) {
    const [x0, z0] = tents[i], [x1, z1] = tents[(i + 1) % tents.length];
    for (let k = 1; k < 14; k++) {
      const t = k / 14;
      strLights.push([V(x0 + (x1 - x0) * t, 2.6 - Math.sin(t * Math.PI) * 0.6, z0 + (z1 - z0) * t), '#ffd890']);
    }
  }
  bulbsAll.push(...strLights);
  const fairBulbs = new THREE.InstancedMesh(new THREE.SphereGeometry(0.09, 6, 5), bulbMat, bulbsAll.length);
  bulbsAll.forEach(([p, c], i) => { m4.makeTranslation(p.x, p.y, p.z); fairBulbs.setMatrixAt(i, m4); fairBulbs.setColorAt(i, col.set(c)); });
  root.add(fairBulbs);
  // a warm glow over the fair at night
  const glow = new THREE.PointLight('#ffc890', 0, 60, 1.5); glow.position.set(FAIR.x - 4, 6, FAIR.z + 14); root.add(glow);
  const wheelGlow = new THREE.PointLight('#ff90c0', 0, 50, 1.5); wheelGlow.position.copy(W).add(V(0, -2, 4)); root.add(wheelGlow);

  // a few people at the fair
  const crowd = [];
  for (let i = 0; i < 9; i++) {
    const p = person({ h: rand() < 0.3 ? rr(0.6, 0.75) : rr(0.92, 1.05) });
    const a = rand() * 6.28, r = rr(4, 14);
    p.position.set(FAIR.x - 6 + Math.cos(a) * r, 0, FAIR.z + 12 + Math.sin(a) * r);
    p.rotation.y = rand() * 6.28;
    root.add(p); crowd.push(p);
  }

  return {
    group: root, wheel, crowd,
    update(t, dt, night) {
      wheel.rotation.z = t * 0.07;
      for (const g of gondolas) g.rotation.z = -wheel.rotation.z;
      spinner.rotation.y = t * 0.45;
      for (const h of horses) h.horse.position.y = 1.5 + Math.sin(t * 1.8 + h.ph) * 0.3;
      bulbMat.color.setScalar(0.45 + night * 1.6);
      // chasing lights on the wheel at night
      glow.intensity = night * 40; wheelGlow.intensity = night * 30;
    },
  };
}

// ================================================================== people, cyclists, cart, family
function createPeople() {
  const root = new THREE.Group();
  const walkers = [];
  const N = 38;
  for (let i = 0; i < N; i++) {
    const kid = rand() < 0.18;
    const p = person({ h: kid ? rr(0.62, 0.78) : rr(0.92, 1.07), umbrella: true });
    const onRing = i < 30;
    p.userData.walk = onRing
      ? { kind: 'ring', a: rand() * 6.28, off: rr(-0.9, 0.9), dir: rand() < 0.5 ? 1 : -1, v: rr(0.9, 1.45) * (kid ? 1.15 : 1) }
      : { kind: 'side', x: rr(-140, 140), z: LANE.z + LANE.w / 2 + 1.6 + rr(-0.7, 0.7), dir: rand() < 0.5 ? 1 : -1, v: rr(1, 1.4) };
    p.userData.rank = rand();
    p.userData.ph = rand() * 6;
    root.add(p); walkers.push(p);
  }
  // pairs: some walkers keep company with the one before them
  for (let i = 1; i < 30; i += 5) {
    const a = walkers[i - 1].userData.walk, b = walkers[i].userData.walk;
    Object.assign(b, { a: a.a + 0.02, dir: a.dir, v: a.v, off: a.off + 0.7 * Math.sign(a.off || 1) * -1 });
    walkers[i].userData.rank = walkers[i - 1].userData.rank;
  }

  // cyclists on the blue lane
  const cyclists = [];
  for (let i = 0; i < 5; i++) {
    const g = new THREE.Group();
    const wheelG = new THREE.TorusGeometry(0.34, 0.035, 6, 20);
    const fr = mat(pick(['#2b2b30', '#e2483a', '#3a74c4', '#f4f4f0']), { metalness: 0.4, roughness: 0.4 });
    const w1 = mesh(wheelG, mat('#1a1a1a'), 0, 0.36, 0.55), w2 = mesh(wheelG, mat('#1a1a1a'), 0, 0.36, -0.55);
    w1.rotation.y = w2.rotation.y = Math.PI / 2;
    g.add(w1, w2);
    const tube = (a, b) => { const d = b.clone().sub(a); const c = mesh(new THREE.CylinderGeometry(0.025, 0.025, d.length(), 5), fr); c.position.copy(a).add(b).multiplyScalar(0.5); c.quaternion.setFromUnitVectors(V(0, 1, 0), d.normalize()); g.add(c); };
    tube(V(0, 0.36, -0.55), V(0, 0.9, -0.1)); tube(V(0, 0.9, -0.1), V(0, 0.95, 0.45)); tube(V(0, 0.36, 0.55), V(0, 0.95, 0.45));
    tube(V(0, 0.36, -0.55), V(0, 0.4, 0)); tube(V(0, 0.4, 0), V(0, 0.9, -0.1)); tube(V(0, 0.4, 0), V(0, 0.95, 0.45));
    const rider = person({ h: 0.95 });
    rider.position.set(0, 0.12, -0.12);
    rider.userData.body.rotation.x = 0.3;
    g.add(rider);
    const dir = i % 2 ? 1 : -1;
    g.userData = { x: rr(-140, 140), z: LANE.z + dir * 0.6, dir, v: rr(4, 6.5), rider, wheels: [w1, w2], rank: rand() };
    root.add(g); cyclists.push(g);
  }

  // the ice-cream cart under a green parasol, by the oval
  const cart = new THREE.Group(); cart.position.set(-9, 0, 35.6); cart.rotation.y = 0.2;
  const cb = new Builder();
  cb.box('#f4f4f0', 0, 0.85, 0, 1.4, 0.8, 0.8);
  cb.box('#3a74c4', 0, 0.85, 0.41, 1.42, 0.2, 0.02);
  cb.rod('#888', V(0.3, 1.25, 0), V(0.3, 2.6, 0), 0.03);
  for (const [x, z] of [[-0.55, -0.35], [0.55, -0.35], [-0.55, 0.35], [0.55, 0.35]]) { const w = new THREE.CylinderGeometry(0.18, 0.18, 0.06, 12); w.rotateX(Math.PI / 2); w.translate(x, 0.18, z); cb.add(w, '#1a1a1a'); }
  cart.add(cb.build());
  const para = mesh(new THREE.ConeGeometry(1.4, 0.45, 16, 1, true), mat('#3fa65a', { side: THREE.DoubleSide }), 0.3, 2.62, 0);
  cart.add(para);
  const vendor = person({ top: '#f4f4f0', h: 1 }); vendor.position.set(-0.3, 0, -0.75); vendor.rotation.y = 0.2; cart.add(vendor);
  root.add(cart);

  // a family on a striped blanket
  const fam = new THREE.Group(); fam.position.set(31, 0, 22); fam.rotation.y = -0.6;
  const blTex = stripeTexture(['#e2483a', '#f4f0e6', '#3a74c4', '#f4f0e6', '#f2c230', '#f4f0e6'], 256, 8);
  const bl = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 2), new THREE.MeshStandardMaterial({ map: blTex, roughness: 1, polygonOffset: true, polygonOffsetFactor: -3 }));
  bl.rotation.x = -Math.PI / 2; bl.position.y = 0.04; bl.receiveShadow = true;
  fam.add(bl);
  for (const [x, z, h, r] of [[-0.6, 0.2, 1, 0.3], [0.5, 0.3, 0.95, -0.2], [0.05, -0.5, 0.65, 0.1]]) {
    const p = person({ h }); sitPose(p); p.position.set(x, 0, z); p.rotation.y = Math.PI + r; fam.add(p);
  }
  root.add(fam);

  return {
    group: root, walkers, cyclists, cart, family: fam,
    update(t, dt, { night, rain }) {
      const crowd = (1 - 0.75 * night) * (1 - 0.55 * rain);
      for (const p of walkers) {
        const w = p.userData.walk;
        p.visible = p.userData.rank < crowd;
        if (!p.visible) continue;
        const v = w.v * (1 + rain * 0.35);   // people hurry in the rain
        if (w.kind === 'ring') {
          const rx = RING.rx + w.off, rz = RING.rz + w.off * (RING.rz / RING.rx);
          const dl = Math.hypot(rx * Math.cos(w.a), rz * Math.sin(w.a));
          w.a += (w.dir * v * dt) / dl;
          const x = Math.sin(w.a) * rx, z = Math.cos(w.a) * rz;
          const tx = Math.cos(w.a) * rx * w.dir, tz = -Math.sin(w.a) * rz * w.dir;
          p.position.set(x, 0, z);
          p.rotation.y = Math.atan2(tx, tz);
        } else {
          w.x += w.dir * v * dt;
          if (w.x > 150) w.x = -150; if (w.x < -150) w.x = 150;
          p.position.set(w.x, 0, w.z);
          p.rotation.y = w.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
        }
        p.userData.ph += dt * v * 4.2;
        walkPose(p, p.userData.ph, 0.42);
        const umb = p.userData.umb;
        if (umb) {
          umb.visible = rain > 0.25 && p.userData.rank < 0.75;
          if (umb.visible) p.userData.arms[1].rotation.x = -1.2;
        }
      }
      for (const c of cyclists) {
        const u = c.userData;
        c.visible = u.rank < (1 - 0.8 * night) * (1 - 0.85 * rain);
        if (!c.visible) continue;
        u.x += u.dir * u.v * dt;
        if (u.x > 160) u.x = -160; if (u.x < -160) u.x = 160;
        c.position.set(u.x, 0, u.z);
        c.rotation.y = u.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
        const spin = (u.x / 0.34) * u.dir;
        for (const w of u.wheels) w.rotation.x = -spin;
        const legs = u.rider.userData.legs;
        legs[0].rotation.x = -1.1 + Math.sin(spin * 0.5) * 0.45; legs[1].rotation.x = -1.1 - Math.sin(spin * 0.5) * 0.45;
        u.rider.userData.arms[0].rotation.x = u.rider.userData.arms[1].rotation.x = -1.1;
      }
      this.cart.visible = night < 0.7;
      this.family.visible = night < 0.5 && rain < 0.3;
    },
  };
}

// ================================================================== everything
export function createLife() {
  const group = new THREE.Group();
  const ropes = createRopes();
  const play = createPlayground();
  const fair = createFair();
  const people = createPeople();
  group.add(ropes.group, play.group, fair.group, people.group);
  // worn earth under the ropes course
  group.add(patch('#8a7458', ROPES.x, ROPES.z, 13, 10, ROPES.ry));
  const obstacles = [
    [ROPES.x, ROPES.z, 9], [ROPES.x + Math.cos(ROPES.ry) * 10.5, ROPES.z - Math.sin(ROPES.ry) * 10.5, 2.2],
    [PLAY.x, PLAY.z, 6.5],
    [FAIR.wheel.x, FAIR.wheel.z, 6], [FAIR.x - 12, FAIR.z + 10, 5.6],
    [-9, 35.6, 1.0],
  ];
  return {
    group, ropes, play, fair, people, obstacles,
    update(t, dt, env) {
      ropes.update(t, dt);
      play.update(t);
      fair.update(t, dt, env.night);
      people.update(t, dt, env);
    },
  };
}
