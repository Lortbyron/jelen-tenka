import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { mulberry32 } from './util.js';

/*
  El caminante: a Tsáchila man carved in clay, from the user's three reference sheets
  (the reference sheets of the character). He is the walker's body in 'walk' mode (third person)
  and stands looking up at the monument in 'orbit' mode.

  Built like a carved figure: low-segment geometry with flat shading (the facets of the knife),
  matte terracotta skin, black huito lines painted on canvas textures, the red achiote hair
  cut like a helmet with a fringe of strands and a cotton crown, the striped stole with
  diamonds and fringes, the bead necklaces with the cacao-seed pendant, the red sash,
  the black-and-white striped skirt and silver cuffs.

  Local frame: feet at y = 0, faces +z, 1.70 m tall.
*/

const rnd = mulberry32(5150); // own seed: building him must not shift the park's random sequence
const R = (a, b) => a + (b - a) * rnd();

const SKIN = '#c4703c';
const PAINT = '#33201a';
const ACHIOTE = '#b8231c';

// ------------------------------------------------------------------ textures
function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return [c, c.getContext('2d')]; }
function tex(c, rep = [1, 1]) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(...rep);
  t.anisotropy = 4;
  return t;
}
/** Clay skin with a little grain; `bands` are v positions (0 bottom, 1 top) of painted rings. */
function skinTexture({ bands = [], meander = null } = {}) {
  const W = 128, H = 256;
  const [c, g] = canvas(W, H);
  g.fillStyle = SKIN; g.fillRect(0, 0, W, H);
  for (let i = 0; i < 900; i++) {
    g.fillStyle = rnd() < 0.5 ? 'rgba(90,40,15,0.06)' : 'rgba(255,220,180,0.06)';
    g.fillRect(rnd() * W, rnd() * H, 1 + rnd() * 3, 1 + rnd() * 3);
  }
  g.fillStyle = PAINT;
  for (const v of bands) {
    const y = (1 - v) * H;
    g.beginPath();
    for (let x = 0; x <= W; x += 4) g.lineTo(x, y + Math.sin(x * 0.11 + v * 9) * 0.8 - 4);
    for (let x = W; x >= 0; x -= 4) g.lineTo(x, y + Math.sin(x * 0.13 + v * 7) * 0.8 + 4);
    g.fill();
  }
  if (meander) {
    // a squared spiral on the outer side of the upper arm (u = 0.25 and 0.75: both sides, the inner one hides against the body)
    const [v0, v1] = meander;
    for (const uc of [0.25, 0.75]) {
      const cx = uc * W, cy = (1 - (v0 + v1) / 2) * H, s = (v1 - v0) * H * 0.92;
      g.strokeStyle = PAINT; g.lineWidth = 5; g.lineCap = 'square';
      g.strokeRect(cx - s / 2, cy - s / 2, s, s);
      g.beginPath();
      let x = cx - s * 0.3, y = cy + s * 0.3, L = s * 0.6;
      g.moveTo(x, y);
      const dirs = [[0, -1], [1, 0], [0, 1], [-1, 0]];
      for (let k = 0; k < 6 && L > 4; k++) {
        const [dx, dy] = dirs[k % 4];
        x += dx * L; y += dy * L; g.lineTo(x, y);
        if (k % 2 === 1) L -= s * 0.18;
      }
      g.stroke();
    }
  }
  return tex(c);
}
/** The skirt: wide black bands and narrow cream ones, with the grain of the weave. */
function skirtTexture() {
  const [c, g] = canvas(64, 256);
  g.fillStyle = '#1d1b1b'; g.fillRect(0, 0, 64, 256);
  const cream = [12, 46, 82, 118, 154, 190, 226, 248];
  g.fillStyle = '#e8dbbd';
  for (const y of cream) g.fillRect(0, y, 64, y === 248 ? 8 : 10);
  for (let i = 0; i < 1400; i++) {
    g.fillStyle = rnd() < 0.5 ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.12)';
    g.fillRect(rnd() * 64, rnd() * 256, 2, 1);
  }
  return tex(c, [4, 1]);
}
/** The stole: lengthwise stripes (red, yellow, green, blue, orange) and a cream band with dark diamonds. */
function stoleTexture() {
  const W = 64, H = 256;
  const [c, g] = canvas(W, H);
  const cols = ['#c8262a', '#f0b52a', '#2f8a46', '#e8dcc0', '#2f4f9a', '#e2742a', '#c8262a'];
  const sw = 4.2;
  for (const side of [0, 1]) {
    cols.forEach((col, i) => {
      g.fillStyle = col;
      const x = side ? W - (i + 1) * sw : i * sw;
      g.fillRect(x, 0, sw + 0.5, H);
    });
  }
  const x0 = cols.length * sw, x1 = W - cols.length * sw;
  g.fillStyle = '#efe4c8'; g.fillRect(x0, 0, x1 - x0, H);
  const cx = (x0 + x1) / 2, hw = (x1 - x0) / 2 - 2;
  for (let y = 0; y < H; y += 32) {
    g.fillStyle = '#2a2220';
    g.beginPath(); g.moveTo(cx, y + 2); g.lineTo(cx + hw, y + 16); g.lineTo(cx, y + 30); g.lineTo(cx - hw, y + 16); g.closePath(); g.fill();
    g.fillStyle = '#c8262a';
    g.beginPath(); g.moveTo(cx, y + 9); g.lineTo(cx + hw * 0.5, y + 16); g.lineTo(cx, y + 23); g.lineTo(cx - hw * 0.5, y + 16); g.closePath(); g.fill();
  }
  // the braid of the yarn
  for (let i = 0; i < 1500; i++) {
    g.fillStyle = rnd() < 0.5 ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.1)';
    g.fillRect(rnd() * W, rnd() * H, 1, 2);
  }
  return tex(c, [1, 3]);
}

// ------------------------------------------------------------------ helpers
const mat = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.85, flatShading: true, ...o });
function mesh(geo, m, x = 0, y = 0, z = 0) {
  const me = new THREE.Mesh(geo, m);
  me.position.set(x, y, z);
  me.castShadow = true; me.receiveShadow = true;
  return me;
}
/** A limb segment hanging down from its joint (top at y = 0), textured around its length. */
function limb(rTop, rBot, len, m, seg = 9) {
  const g = new THREE.CylinderGeometry(rTop, rBot, len, seg, 3);
  g.translate(0, -len / 2, 0);
  return mesh(g, m);
}
/** A horizontal arc (torus) in front of a unit head, at height y (unit), spanning `arc` radians. */
function faceArc(y, arc, tube = 0.035, out = 1.03) {
  const r = Math.sqrt(Math.max(0.02, 1 - y * y)) * out;
  const g = new THREE.TorusGeometry(r, tube, 4, 24, arc);
  g.rotateZ(Math.PI / 2 - arc / 2);
  g.rotateX(Math.PI / 2);
  g.translate(0, y, 0);
  return g;
}

// torso profile (radius, y) before the front-back squash
const TORSO = [[0.15, 0.9], [0.158, 0.98], [0.168, 1.08], [0.188, 1.2], [0.205, 1.3], [0.2, 1.37], [0.15, 1.425], [0.06, 1.45]];
const TZ = 0.64;
function torsoR(y) {
  for (let i = 1; i < TORSO.length; i++) {
    const [r0, y0] = TORSO[i - 1], [r1, y1] = TORSO[i];
    if (y <= y1) return r0 + (r1 - r0) * THREE.MathUtils.clamp((y - y0) / (y1 - y0), 0, 1);
  }
  return 0.06;
}
/** z of the chest surface at (x, y), for laying necklaces and the stole on it. */
const chestZ = (x, y) => Math.sqrt(Math.max(0, torsoR(y) ** 2 - x * x)) * TZ;

export function createGuide() {
  const group = new THREE.Group();
  group.name = 'caminante';
  const root = new THREE.Group(); // bobs and leans while walking
  group.add(root);

  const skinM = mat(SKIN);
  const paintM = mat(PAINT, { roughness: 0.7 });
  const silverM = mat('#b9b2a6', { metalness: 0.75, roughness: 0.38 });
  const redM = mat(ACHIOTE, { roughness: 0.9 });
  const sashM = mat('#c62026', { roughness: 0.95 });

  // ---------------------------------------------------------------- torso
  const torsoG = new THREE.LatheGeometry(TORSO.map(([r, y]) => new THREE.Vector2(r, y)), 12);
  torsoG.scale(1, 1, TZ);
  const chest = new THREE.Group();
  root.add(chest);
  chest.add(mesh(torsoG, skinM));
  // pectorals and shoulder blades, carved as low bumps
  for (const s of [-1, 1]) {
    const pec = mesh(new THREE.SphereGeometry(0.085, 8, 6), skinM, s * 0.075, 1.29, chestZ(s * 0.075, 1.29) - 0.05);
    pec.scale.set(1, 0.62, 0.5);
    chest.add(pec);
  }
  // the neck
  chest.add(mesh(new THREE.CylinderGeometry(0.064, 0.074, 0.11, 9), skinM, 0, 1.465, 0.0));

  // the red sash: rolled cloth wound three times
  const sash = new THREE.Group();
  for (const [y, r] of [[0.915, 0.168], [0.96, 0.165], [1.005, 0.163]]) {
    const t = mesh(new THREE.TorusGeometry(r, 0.03, 6, 18), sashM, 0, y, 0);
    t.rotation.x = Math.PI / 2;
    sash.add(t);
  }
  sash.scale.z = 0.7;
  chest.add(sash);

  // the skirt, open-ended so it reads as cloth; it sways a little with the hips
  const skirtM = mat('#ffffff', { map: skirtTexture(), side: THREE.DoubleSide, roughness: 0.95, flatShading: false });
  const skirtG = new THREE.CylinderGeometry(0.168, 0.205, 0.45, 18, 1, true);
  skirtG.scale(1, 1, 0.78);
  const skirt = mesh(skirtG, skirtM, 0, 0.675, 0);
  root.add(skirt);

  // ---------------------------------------------------------------- head
  const headPivot = new THREE.Group();
  headPivot.position.set(0, 1.505, 0.005);
  chest.add(headPivot);
  const head = new THREE.Group();
  head.position.set(0, 0.11, 0.012);
  head.scale.set(0.1, 0.122, 0.112);
  headPivot.add(head);
  const skull = new THREE.SphereGeometry(1, 14, 11);
  head.add(mesh(skull, skinM));
  // jaw and chin: a squarer, broader lower face
  const jaw = mesh(new THREE.SphereGeometry(0.82, 10, 8), skinM, 0, -0.42, 0.14);
  jaw.scale.set(1.0, 0.75, 0.9);
  head.add(jaw);
  // nose, brow ridge, lips and ears
  const nose = mesh(new THREE.ConeGeometry(0.17, 0.42, 5), skinM, 0, -0.08, 1.0);
  nose.rotation.x = 0.35; nose.scale.set(1.2, 1, 0.8);
  head.add(nose);
  const brow = mesh(new THREE.BoxGeometry(1.25, 0.16, 0.3), skinM, 0, 0.32, 0.86);
  brow.rotation.x = -0.2;
  head.add(brow);
  for (const s of [-1, 1]) {
    const ear = mesh(new THREE.SphereGeometry(0.22, 6, 5), skinM, s * 0.98, 0.02, -0.05);
    ear.scale.set(0.45, 1, 0.75);
    head.add(ear);
    // eyes: a white almond and a dark iris, under a straight brow
    const white = mesh(new THREE.SphereGeometry(0.15, 8, 6), mat('#efe6d6', { roughness: 0.4, flatShading: false }), s * 0.37, 0.13, 0.86);
    white.scale.set(1.1, 0.5, 0.45);
    const iris = mesh(new THREE.SphereGeometry(0.09, 8, 6), mat('#2a1b12', { roughness: 0.3, flatShading: false }), s * 0.36, 0.13, 0.925);
    iris.scale.set(1, 0.95, 0.5);
    const lid = mesh(new THREE.BoxGeometry(0.42, 0.06, 0.12), paintM, s * 0.37, 0.24, 0.88);
    lid.rotation.z = s * -0.08;
    const eyebrow = mesh(new THREE.BoxGeometry(0.42, 0.075, 0.12), mat('#21150f'), s * 0.38, 0.42, 0.92);
    eyebrow.rotation.z = s * -0.1;
    head.add(white, iris, lid, eyebrow);
  }
  // a calm, closed smile
  const lips = mesh(new THREE.TorusGeometry(0.3, 0.035, 4, 12, 1.4), mat('#7a3420'), 0, -0.3, 0.88);
  lips.rotation.z = Math.PI + (Math.PI - 1.4) / 2;
  lips.scale.set(1, 0.45, 1);
  head.add(lips);
  // huito lines: across the eyes and nose, under the cheekbones, and a short one on each jaw
  const lines = [
    faceArc(-0.05, 2.3, 0.024, 1.04),
    faceArc(-0.25, 2.1, 0.022, 1.03),
  ];
  for (const s of [-1, 1]) {
    const g = faceArc(-0.46, 0.5, 0.02, 0.99);
    g.rotateY(s * 0.62);
    lines.push(g);
  }
  // the top line crosses the bridge of the nose, over the nose itself
  const bridge = new THREE.BoxGeometry(0.36, 0.045, 0.06); bridge.translate(0, -0.05, 1.1);
  lines.push(bridge.toNonIndexed());
  head.add(mesh(mergeGeometries(lines.map((g) => (g.index ? g.toNonIndexed() : g))), paintM));

  // hair: shaved dark sides and back, the red achiote cap with its fringe of strands, the cotton crown
  const shave = new THREE.SphereGeometry(1.025, 16, 5, Math.PI / 2 + 1.15, Math.PI * 2 - 2.3, Math.PI * 0.33, Math.PI * 0.17);
  head.add(mesh(shave, mat('#3a2a22', { roughness: 1 })));
  const cap = new THREE.SphereGeometry(1.08, 16, 6, 0, Math.PI * 2, 0, Math.PI * 0.34);
  head.add(mesh(cap, redM));
  const strands = [];
  const N = 46;
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2 + R(-0.03, 0.03);
    const th = Math.PI * 0.34;
    const front = Math.max(0, Math.cos(a)); // the fringe is short over the brow, long at the sides and back
    const len = R(0.36, 0.48) * (1 - front * 0.5);
    const g = new THREE.BoxGeometry(0.15, len, 0.06);
    g.translate(0, -len / 2, 0);
    g.rotateX(-(0.62 + R(-0.08, 0.08))); // flare outward and down
    g.rotateY(a);
    const px = Math.sin(a) * Math.sin(th) * 1.06, pz = Math.cos(a) * Math.sin(th) * 1.06, py = Math.cos(th) * 1.06;
    g.translate(px, py, pz);
    strands.push(g.toNonIndexed());
  }
  // the crest, so the top reads combed and moulded
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2;
    const g = new THREE.BoxGeometry(0.12, 0.34, 0.05);
    g.translate(0, 0.17, 0);
    g.rotateX(-1.2);
    g.rotateY(a);
    g.translate(0, 1.05, 0);
    strands.push(g.toNonIndexed());
  }
  head.add(mesh(mergeGeometries(strands), mat('#a81e18', { roughness: 0.9 })));
  // the cotton crown: tufts of cream, yellow and red
  const crown = new THREE.Group();
  crown.position.set(0, 1.2, -0.04);
  const tuftCols = ['#f1e6cc', '#f1e6cc', '#e8b434', '#f1e6cc', '#c8262a', '#f1e6cc', '#e8b434'];
  tuftCols.forEach((col, i) => {
    const a = (i / tuftCols.length) * Math.PI * 2;
    const t = mesh(new THREE.IcosahedronGeometry(0.24, 1), mat(col, { roughness: 1 }), Math.sin(a) * 0.3, R(0.04, 0.12), Math.cos(a) * 0.26);
    t.scale.set(1, 0.75, 1);
    crown.add(t);
  });
  crown.add(mesh(new THREE.IcosahedronGeometry(0.24, 1), mat('#f1e6cc', { roughness: 1 }), 0, 0.24, 0));
  head.add(crown);

  // ---------------------------------------------------------------- necklaces
  const beadG = new THREE.IcosahedronGeometry(1, 0);
  const beads = [];
  /** A strand draped from the neck over the chest; `drop` is how low it hangs in front. */
  function strand(n, rx, top, drop, size, colors, stretch = 1) {
    for (let i = 0; i < n; i++) {
      const a = -Math.PI / 2 + (i / (n - 1)) * Math.PI; // front half, side to side
      const x = Math.sin(a) * rx;
      const y = top - drop * Math.cos(a) ** 1.6;
      const z = Math.max(chestZ(x, y), 0.065 * Math.cos(a)) + size * 0.7;
      beads.push({ p: new THREE.Vector3(x, y, z), s: size, c: colors[i % colors.length], stretch, a });
    }
    // round the back of the neck
    for (let i = 1; i < 8; i++) {
      const a = Math.PI / 2 + (i / 8) * Math.PI;
      beads.push({ p: new THREE.Vector3(Math.sin(a) * 0.075, top + 0.005, Math.cos(a) * 0.07), s: size * 0.9, c: colors[0], stretch: 1, a });
    }
  }
  strand(26, 0.09, 1.445, 0.07, 0.011, ['#b3241e', '#b3241e', '#5a3320']);
  strand(17, 0.105, 1.44, 0.115, 0.016, ['#efe5cd'], 1.7); // cowries
  strand(30, 0.115, 1.435, 0.16, 0.012, ['#b3241e', '#e6dcc4', '#6b3a22', '#b3241e']);
  strand(38, 0.12, 1.43, 0.22, 0.008, ['#3a2418']); // the cord
  const beadM = new THREE.MeshStandardMaterial({ roughness: 0.55, flatShading: true });
  const beadMesh = new THREE.InstancedMesh(beadG, beadM, beads.length);
  const dummy = new THREE.Object3D(), col = new THREE.Color();
  beads.forEach((b, i) => {
    dummy.position.copy(b.p);
    dummy.rotation.set(0, 0, b.a * 0.6);
    dummy.scale.set(b.s, b.s * b.stretch, b.s);
    dummy.updateMatrix();
    beadMesh.setMatrixAt(i, dummy.matrix);
    beadMesh.setColorAt(i, col.set(b.c));
  });
  beadMesh.castShadow = true;
  chest.add(beadMesh);
  // the pendant: a cacao seed hanging from the cord
  const seedY = 1.43 - 0.22 - 0.035;
  const seed = mesh(new THREE.SphereGeometry(0.024, 8, 6), mat('#5e3420', { roughness: 0.6 }), 0, seedY, chestZ(0, seedY) + 0.02);
  seed.scale.set(0.85, 1.5, 0.8);
  chest.add(seed);

  // ---------------------------------------------------------------- the stole
  const stoleM = mat('#ffffff', { map: stoleTexture(), side: THREE.DoubleSide, roughness: 0.95, flatShading: false });
  const fringeCols = ['#c8262a', '#f0b52a', '#2f8a46', '#efe4c8', '#2f4f9a', '#e2742a', '#efe4c8', '#c8262a'];
  const fringe = [];
  const stoleParts = [];
  for (const s of [-1, 1]) {
    const xs = s * 0.115;
    const pts = [
      new THREE.Vector3(s * 0.09, 1.2, -0.12),
      new THREE.Vector3(s * 0.12, 1.39, -0.085),
      new THREE.Vector3(s * 0.125, 1.46, 0.0),
      new THREE.Vector3(xs, 1.4, chestZ(xs, 1.4) + 0.03),
      new THREE.Vector3(xs, 1.22, chestZ(xs, 1.22) + 0.03),
      new THREE.Vector3(xs, 1.0, 0.16),
      new THREE.Vector3(xs * 1.04, 0.8, 0.185),
      new THREE.Vector3(xs * 1.06, 0.6, 0.2),
    ];
    const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
    const n = 40, w = 0.088;
    const pos = [], uv = [], idx = [];
    const side = new THREE.Vector3();
    for (let i = 0; i <= n; i++) {
      const t = i / n, p = curve.getPoint(t), T = curve.getTangent(t);
      side.set(1, 0, 0).addScaledVector(T, -T.x).normalize(); // as horizontal as the path allows
      pos.push(p.x - side.x * w / 2, p.y - side.y * w / 2, p.z - side.z * w / 2, p.x + side.x * w / 2, p.y + side.y * w / 2, p.z + side.z * w / 2);
      uv.push(0, t, 1, t);
      if (i < n) { const k = i * 2; idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    stoleParts.push(g);
    // fringe of yarn tassels at the front end
    const end = curve.getPoint(1);
    for (let k = 0; k < 9; k++) {
      const len = R(0.07, 0.1);
      const fg = new THREE.CylinderGeometry(0.0055, 0.004, len, 4);
      fg.translate(end.x - w / 2 + (k + 0.5) * (w / 9), end.y - len / 2, end.z + R(-0.004, 0.004));
      fringe.push({ g: fg.toNonIndexed(), c: fringeCols[k % fringeCols.length] });
    }
  }
  chest.add(mesh(mergeGeometries(stoleParts), stoleM));
  const byCol = new Map();
  for (const f of fringe) { if (!byCol.has(f.c)) byCol.set(f.c, []); byCol.get(f.c).push(f.g); }
  for (const [c, gs] of byCol) chest.add(mesh(mergeGeometries(gs), mat(c, { roughness: 1 })));

  // ---------------------------------------------------------------- arms
  const upperM = new THREE.MeshStandardMaterial({ map: skinTexture({ bands: [0.86, 0.3], meander: [0.4, 0.78] }), roughness: 0.85, flatShading: true });
  const foreM = new THREE.MeshStandardMaterial({ map: skinTexture({ bands: [0.88, 0.8, 0.55] }), roughness: 0.85, flatShading: true });
  const arms = [];
  for (const s of [-1, 1]) {
    const shoulder = new THREE.Group();
    shoulder.position.set(s * 0.225, 1.375, -0.01);
    chest.add(shoulder);
    shoulder.add(mesh(new THREE.SphereGeometry(0.082, 9, 7), skinM));
    const upper = limb(0.076, 0.056, 0.29, upperM);
    upper.rotation.y = s > 0 ? 0 : Math.PI; // so the meander faces outward on both sides
    shoulder.add(upper);
    const elbow = new THREE.Group();
    elbow.position.y = -0.29;
    shoulder.add(elbow);
    elbow.add(mesh(new THREE.SphereGeometry(0.056, 8, 6), skinM));
    elbow.add(limb(0.058, 0.042, 0.25, foreM));
    const cuff = mesh(new THREE.CylinderGeometry(0.05, 0.048, 0.065, 12, 1), silverM, 0, -0.21, 0);
    elbow.add(cuff);
    // the hand: palm, four fingers in a block, a thumb
    const hand = new THREE.Group();
    hand.position.y = -0.25;
    elbow.add(hand);
    const palm = mesh(new THREE.BoxGeometry(0.035, 0.09, 0.075), skinM, 0, -0.045, 0.005);
    const fingers = mesh(new THREE.BoxGeometry(0.03, 0.075, 0.07), skinM, -s * 0.004, -0.12, 0.012);
    fingers.rotation.x = -0.25;
    const thumb = mesh(new THREE.BoxGeometry(0.022, 0.06, 0.022), skinM, s * -0.005, -0.05, 0.05);
    thumb.rotation.x = -0.5;
    hand.add(palm, fingers, thumb);
    arms.push({ shoulder, elbow, hand, s });
  }

  // ---------------------------------------------------------------- legs
  const thighM = new THREE.MeshStandardMaterial({ map: skinTexture({ bands: [0.12] }), roughness: 0.85, flatShading: true });
  const shinM = new THREE.MeshStandardMaterial({ map: skinTexture({ bands: [0.82, 0.74, 0.36] }), roughness: 0.85, flatShading: true });
  const legs = [];
  for (const s of [-1, 1]) {
    const hip = new THREE.Group();
    hip.position.set(s * 0.092, 0.88, 0);
    root.add(hip);
    hip.add(limb(0.088, 0.062, 0.42, thighM));
    const knee = new THREE.Group();
    knee.position.y = -0.42;
    hip.add(knee);
    knee.add(mesh(new THREE.SphereGeometry(0.062, 8, 6), skinM));
    knee.add(limb(0.062, 0.042, 0.39, shinM));
    const calf = mesh(new THREE.SphereGeometry(0.058, 8, 6), skinM, 0, -0.12, -0.018);
    calf.scale.set(0.95, 1.8, 0.9);
    knee.add(calf);
    const ankle = new THREE.Group();
    ankle.position.y = -0.39;
    knee.add(ankle);
    const foot = mesh(new THREE.BoxGeometry(0.085, 0.06, 0.22), skinM, s * 0.006, -0.03, 0.05);
    const toes = mesh(new THREE.BoxGeometry(0.08, 0.035, 0.05), skinM, s * 0.006, -0.042, 0.175);
    ankle.add(foot, toes);
    legs.push({ hip, knee, ankle, s });
  }

  group.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });

  // ---------------------------------------------------------------- motion
  let phase = 0, amp = 0, t = 0;
  let look = 0, lookWant = 0, lookUp = 0, lookUpWant = 0, nextGlance = 2;
  return {
    group,
    head,
    height: 1.7,
    /**
     * speed: ground speed in m/s. gaze: 'monument' when standing in the overview (he looks up now and then).
     */
    update(dt, speed = 0, { gaze = null } = {}) {
      t += dt;
      const run = THREE.MathUtils.clamp((speed - 3) / 2, 0, 1);
      const want = THREE.MathUtils.clamp(speed / 2.4, 0, 1.15);
      amp += (want - amp) * Math.min(1, dt * 6);
      phase += dt * (speed * (2.55 - run * 0.55) + (amp > 0.05 ? 0.6 : 0));
      const sp = Math.sin(phase), cp = Math.cos(phase);
      const a = amp * (0.5 + run * 0.18);

      for (const L of legs) {
        const k = L.s < 0 ? sp : -sp;
        const kc = L.s < 0 ? cp : -cp;
        L.hip.rotation.x = -k * a;
        // the knee bends while the leg swings forward and as the foot lifts
        L.knee.rotation.x = Math.max(0, kc) * a * 1.5 + amp * 0.08;
        L.ankle.rotation.x = -Math.max(0, -k) * a * 0.4;
        L.hip.rotation.z = L.s * 0.015;
      }
      const breathe = Math.sin(t * 1.6) * 0.004;
      for (const A of arms) {
        const k = A.s < 0 ? -sp : sp;
        A.shoulder.rotation.x = -k * a * 0.75;
        A.shoulder.rotation.z = A.s * (0.1 + breathe * 2);
        A.elbow.rotation.x = -0.18 - amp * 0.25 - Math.max(0, k) * a * 0.35;
        A.hand.rotation.z = A.s * -0.06;
      }
      root.position.y = Math.abs(cp) * 0.028 * amp - 0.008 * amp;
      root.rotation.x = 0.04 * amp + run * 0.06;
      chest.rotation.y = sp * 0.06 * amp;
      chest.scale.set(1, 1 + breathe, 1 + breathe * 2);
      skirt.rotation.y = -sp * 0.05 * amp;

      // the head: at rest he glances around, and in the overview he looks up at the monument, as she looks at the sky
      nextGlance -= dt;
      if (nextGlance <= 0) {
        nextGlance = R(2.5, 6);
        if (gaze === 'monument' && rnd() < 0.55) { lookWant = R(-0.15, 0.15); lookUpWant = R(0.3, 0.45); }
        else { lookWant = R(-0.55, 0.55) * (1 - amp); lookUpWant = R(-0.05, 0.12); }
      }
      if (amp > 0.3) { lookWant *= 0.97; lookUpWant *= 0.97; }
      look += (lookWant - look) * Math.min(1, dt * 1.8);
      lookUp += (lookUpWant - lookUp) * Math.min(1, dt * 1.5);
      headPivot.rotation.set(-lookUp, look, 0);
    },
  };
}
