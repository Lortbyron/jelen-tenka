import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import * as TX from './textures.js';
import { rand, rr, pick } from './util.js';

/*
  The monument of Jelen Tenka, built from the reference photos:
  - a woman's face of grey porous stone, eyes closed, looking up at the sky;
  - a hooded veil of broken-tile stripes (red, yellow, blues, purple…) with living plants growing in some strips;
  - a purple mosaic chest with swirls and a big necklace of red and turquoise beads;
  - two giant striped arms rising from the lawn, palms open to the sky; a steel stair and lookout by the right one.
  Everything is generated here: sculpted spheres, swept tubes and canvas textures. The face looks to +z.
*/

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const clamp = THREE.MathUtils.clamp;
const ss = (e0, e1, x) => { const t = clamp((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t); };
const g2 = (x, y, cx, cy, sx, sy) => Math.exp(-(((x - cx) / sx) ** 2) - (((y - cy) / sy) ** 2));

export const BUST = {
  head: V(0, 14.6, 0.2), // head centre
  R: 3.1,                // half the head height
  tilt: 0.55,            // looking up at the sky
};

// ------------------------------------------------------------------ helpers
/** Sweep a circle (or ellipse) along a smooth curve. u goes around, v along (in metres / vScale). */
function tube(points, radii, { radial = 24, seg = 48, sx = 1, sz = 1, vScale = 6, twist = 0 } = {}) {
  const curve = new THREE.CatmullRomCurve3(points, false, 'catmullrom', 0.5);
  const frames = curve.computeFrenetFrames(seg, false);
  const len = curve.getLength();
  const pos = [], nor = [], uv = [], idx = [];
  const rAt = (t) => {
    const f = t * (radii.length - 1), i = Math.min(Math.floor(f), radii.length - 2);
    return radii[i] + (radii[i + 1] - radii[i]) * (f - i);
  };
  for (let i = 0; i <= seg; i++) {
    const t = i / seg;
    const P = curve.getPointAt(t);
    const N = frames.normals[i], B = frames.binormals[i];
    const r = rAt(t);
    for (let j = 0; j <= radial; j++) {
      const a = (j / radial) * Math.PI * 2 + twist * t;
      const d = N.clone().multiplyScalar(Math.cos(a) * sx).addScaledVector(B, Math.sin(a) * sz);
      const p = P.clone().addScaledVector(d, r);
      const n = N.clone().multiplyScalar(Math.cos(a) / sx).addScaledVector(B, Math.sin(a) / sz).normalize();
      pos.push(p.x, p.y, p.z); nor.push(n.x, n.y, n.z);
      uv.push(j / radial, (t * len) / vScale);
    }
  }
  for (let i = 0; i < seg; i++) for (let j = 0; j < radial; j++) {
    const a = i * (radial + 1) + j, b = a + radial + 1;
    idx.push(a, b, a + 1, a + 1, b, b + 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return { geo: g.toNonIndexed(), curve };
}

function ball(p, r, sx = 1, sy = 1, sz = 1) {
  const g = new THREE.SphereGeometry(r, 28, 20);
  g.scale(sx, sy, sz);
  g.translate(p.x, p.y, p.z);
  return g.toNonIndexed();
}

/** Material whose texture is projected in object space on 3 axes (no seams on sculpted shapes). */
function triplanar(mat, scale) {
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uTriScale = { value: scale };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vTriP;\nvarying vec3 vTriN;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvTriP = position;\nvTriN = normal;');
    const tri = `
      vec3 tw = pow(abs(normalize(vTriN)), vec3(4.0)); tw /= (tw.x + tw.y + tw.z);
      vec2 tx = vTriP.zy * uTriScale, ty = vTriP.xz * uTriScale, tz = vTriP.xy * uTriScale;`;
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vTriP;\nvarying vec3 vTriN;\nuniform float uTriScale;')
      .replace('#include <map_fragment>', `{
        ${tri}
        vec4 tc = texture2D(map, tx) * tw.x + texture2D(map, ty) * tw.y + texture2D(map, tz) * tw.z;
        diffuseColor *= tc;
      }`)
      .replace('#include <bumpmap_pars_fragment>', `#include <bumpmap_pars_fragment>
        float triBump(vec3 p, vec3 nn) {
          vec3 tw = pow(abs(normalize(nn)), vec3(4.0)); tw /= (tw.x + tw.y + tw.z);
          return texture2D(bumpMap, p.zy * uTriScale).x * tw.x + texture2D(bumpMap, p.xz * uTriScale).x * tw.y + texture2D(bumpMap, p.xy * uTriScale).x * tw.z;
        }`);
  };
  return mat;
}

// ------------------------------------------------------------------ the face
/** A sculpted head: a sphere pushed into a face (closed eyes, long nose, full lips, strong chin). */
function headGeometry(R) {
  const g = new THREE.SphereGeometry(1, 200, 150);
  const p = g.attributes.position;
  const col = new Float32Array(p.count * 3);
  const v = V();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    let x = v.x * 0.74, y = v.y, z = v.z * 0.86;
    // narrower jaw and lower face, fuller skull at the back
    const low = ss(0.05, -0.95, y);
    x *= 1 - 0.24 * low;
    if (z < 0) z *= 1.08;
    const fr = ss(0.05, 0.55, v.z);   // features only on the front
    const X = x, Y = y;
    let d = 0;
    // nose: bridge, body, tip, wings (a strong, long nose, as in the sculpture)
    d += g2(X, Y, 0, 0.12, 0.06, 0.2) * 0.13;
    d += g2(X, Y, 0, -0.1, 0.09, 0.15) * 0.22;
    d += g2(X, Y, 0, -0.25, 0.095, 0.065) * 0.1;
    for (const s of [-1, 1]) {
      d += g2(X, Y, s * 0.115, -0.255, 0.06, 0.05) * 0.085;
      d -= g2(X, Y, s * 0.06, -0.31, 0.03, 0.02) * 0.04;     // nostrils
    }
    d -= g2(X, Y, 0, -0.34, 0.09, 0.03) * 0.04;             // under the nose
    // eyes: deep sockets, heavy closed lids, the line of the lashes, brows
    for (const s of [-1, 1]) {
      d -= g2(X, Y, s * 0.26, 0.13, 0.15, 0.1) * 0.19;
      d += g2(X, Y, s * 0.26, 0.105, 0.115, 0.055) * 0.1;
      d -= g2(X, Y, s * 0.265, 0.075, 0.12, 0.012) * 0.04;
      d += g2(X, Y, s * 0.26, 0.055, 0.1, 0.025) * 0.025;     // lower lid
      d += g2(X, Y, s * 0.28, 0.28, 0.17, 0.05) * 0.07;
      d += g2(X, Y, s * 0.43, -0.07, 0.13, 0.14) * 0.07;     // cheekbones
      d -= g2(X, Y, s * 0.36, -0.3, 0.1, 0.16) * 0.035;      // under the cheekbones
      d -= g2(X, Y, s * 0.2, -0.5, 0.045, 0.045) * 0.045;    // corners of the mouth
    }
    d += g2(X, Y, 0, 0.22, 0.08, 0.08) * 0.03;               // between the brows
    // mouth: full upper and lower lip, the line between, the dip under it
    d += g2(X, Y, 0, -0.435, 0.17, 0.045) * 0.11;
    d += g2(X, Y, 0, -0.55, 0.145, 0.055) * 0.12;
    d -= g2(X, Y, 0, -0.493, 0.18, 0.014) * 0.075;
    d -= g2(X, Y, 0, -0.39, 0.035, 0.03) * 0.02;              // philtrum
    d -= g2(X, Y, 0, -0.65, 0.13, 0.035) * 0.04;
    d += g2(X, Y, 0, -0.8, 0.16, 0.11) * 0.1;                // chin
    z += d * fr;
    p.setXYZ(i, x * R, y * R, z * R);
    // cheap occlusion: hollows (sockets, lip line, nostrils) darker, ridges a touch lighter
    const ao = THREE.MathUtils.clamp(0.93 + d * fr * 1.6, 0.5, 1.08);
    col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = ao;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.computeVertexNormals();
  return g;
}

// ------------------------------------------------------------------ the veil
// Profile (y, r) in head-local coordinates, from the crown down to the lawn.
const VEIL_PROFILE = [
  [3.6, 0.0], [3.5, 1.6], [3.05, 2.8], [1.9, 3.4], [0.2, 3.55], [-2.0, 3.8],
  [-5.0, 5.0], [-8.4, 6.9], [-11.4, 8.7], [-13.5, 9.8], [-14.8, 10.5],
];
const VEIL_KNOTS = [0, 0.05, 0.1, 0.16, 0.22, 0.3, 0.42, 0.58, 0.76, 0.9, 1];
// half-opening at the front (radians) along the veil: closed at the crown, framing the face, then the chest
const OPEN = [[0, 0], [0.05, 0.26], [0.12, 0.78], [0.2, 1.02], [0.3, 1.0], [0.45, 0.8], [0.7, 0.64], [1, 0.57]];
function knot(table, v) {
  for (let i = 0; i < table.length - 1; i++) {
    const [a, va] = table[i], [b, vb] = table[i + 1];
    if (v <= b) { const t = (v - a) / (b - a); const s = t * t * (3 - 2 * t); return va + (vb - va) * s; }
  }
  return table[table.length - 1][1];
}
const profY = (v) => knot(VEIL_KNOTS.map((k, i) => [k, VEIL_PROFILE[i][0]]), v);
const profR = (v) => knot(VEIL_KNOTS.map((k, i) => [k, VEIL_PROFILE[i][1]]), v);

/** World position on the veil. u: 0..1 from one front edge, round the back, to the other. */
function veilPoint(u, v, out = V()) {
  const th0 = knot(OPEN, v);
  const th = th0 + u * (Math.PI * 2 - 2 * th0);
  const lower = ss(0.25, 0.9, v);
  let r = profR(v);
  // soft drapery folds lower down, a little puff where the plants grow
  r *= 1 + 0.035 * Math.sin(th * 9 + 1.3) * lower + 0.02 * Math.sin(th * 23) * lower;
  const sz = THREE.MathUtils.lerp(0.95, 0.8, lower);
  const zoff = THREE.MathUtils.lerp(-0.1, -1.25, lower);
  out.set(Math.sin(th) * r, profY(v), Math.cos(th) * r * sz + zoff);
  // the hood follows the tilted head; the lower veil hangs plumb
  const a = -BUST.tilt * (1 - ss(0.18, 0.55, v));
  const y = out.y * Math.cos(a) - out.z * Math.sin(a);
  const z = out.y * Math.sin(a) + out.z * Math.cos(a);
  return out.set(out.x, y, z).add(BUST.head);
}

function veilGeometry(NU = 220, NV = 150) {
  const pos = [], uv = [], idx = [];
  const p = V();
  // arc length along v, for square-ish tiles
  const arc = [0];
  const prev = V(), cur = V();
  veilPoint(0.5, 0, prev);
  for (let j = 1; j <= NV; j++) {
    veilPoint(0.5, j / NV, cur);
    arc.push(arc[j - 1] + cur.distanceTo(prev));
    prev.copy(cur);
  }
  for (let j = 0; j <= NV; j++) {
    const v = j / NV;
    for (let i = 0; i <= NU; i++) {
      const u = i / NU;
      veilPoint(u, v, p);
      pos.push(p.x, p.y, p.z);
      // stripes mirrored round the back, so both front edges start with the red border
      uv.push((1 - Math.abs(2 * u - 1)) * 1.5, arc[j] / 15);
    }
  }
  for (let j = 0; j < NV; j++) for (let i = 0; i < NU; i++) {
    const a = j * (NU + 1) + i, b = a + NU + 1;
    idx.push(a, a + 1, b, a + 1, b + 1, b);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// ------------------------------------------------------------------ the arms
/** One arm and open hand in local space: wrist at the origin, forearm down −y, palm facing +z.
 *  side = 1 puts the thumb at −x, −1 mirrors it. */
function handGeometry(side = 1) {
  const S = side;
  const geos = [];
  const arm = tube(
    [V(0, -16, 0.6), V(0.1 * S, -10, 0.35), V(0, -4.5, 0.1), V(0, 0, 0), V(0, 0.9, -0.05)],
    [1.32, 1.22, 1.08, 0.92, 0.9],
    { radial: 40, seg: 70, sx: 1.12, sz: 0.86, vScale: 7.5 },
  );
  geos.push(arm.geo);
  // palm: a flattened rounded block
  const palm = new THREE.SphereGeometry(1, 40, 28);
  palm.scale(1.28, 1.62, 0.56);
  palm.translate(0, 1.55, -0.05);
  geos.push(palm.toNonIndexed());
  // heel of the hand / thenar pad
  geos.push(ball(V(-0.55 * S, 0.9, 0.18), 0.62, 1, 1.15, 0.7));
  // four fingers, cupped a little toward the palm, spread like the reference
  const F = [
    { x: -0.9, L: 2.45, spread: -0.42, r: 0.37 },
    { x: -0.3, L: 2.75, spread: -0.12, r: 0.39 },
    { x: 0.3, L: 2.6, spread: 0.14, r: 0.37 },
    { x: 0.88, L: 2.05, spread: 0.42, r: 0.33 },
  ];
  for (const f of F) {
    const b = V(f.x * S, 2.75, 0);
    const dx = f.spread * S;
    const pts = [b, V(b.x + dx * 0.4, b.y + f.L * 0.38, 0.12), V(b.x + dx * 0.75, b.y + f.L * 0.72, 0.4), V(b.x + dx, b.y + f.L, 0.78)];
    const fg = tube(pts, [f.r, f.r * 0.92, f.r * 0.84, f.r * 0.74], { radial: 16, seg: 16, vScale: 7.5 });
    geos.push(fg.geo);
    geos.push(ball(pts[3], f.r * 0.74));
    geos.push(ball(pts[0], f.r * 1.0));
  }
  // thumb: out to the side and up
  const tp = [V(-0.85 * S, 0.75, 0.25), V(-1.55 * S, 1.45, 0.55), V(-2.05 * S, 2.25, 0.85), V(-2.3 * S, 2.95, 1.1)];
  geos.push(tube(tp, [0.5, 0.44, 0.39, 0.34], { radial: 16, seg: 16, vScale: 7.5 }).geo);
  geos.push(ball(tp[3], 0.34));
  return { geo: mergeGeometries(geos.map((g) => { g.deleteAttribute?.('color'); return g; })), armCurve: arm.curve };
}

// ------------------------------------------------------------------ the monument
export function createMonument(flora) {
  const group = new THREE.Group();
  const H = BUST.head;

  // ----- stone face
  const stone = TX.stoneFaceTextures();
  const faceMat = triplanar(new THREE.MeshStandardMaterial({ map: stone.map, bumpMap: stone.bump, bumpScale: 1.4, roughness: 0.92, color: '#ffffff', vertexColors: true }), 0.32);
  const neckMat = triplanar(new THREE.MeshStandardMaterial({ map: stone.map, bumpMap: stone.bump, bumpScale: 1.4, roughness: 0.92, color: '#d8d4cc' }), 0.32);
  const headGeo = headGeometry(BUST.R);
  const head = new THREE.Mesh(headGeo, faceMat);
  head.position.copy(H);
  head.rotation.x = -BUST.tilt;
  head.castShadow = head.receiveShadow = true;
  group.add(head);
  head.updateMatrixWorld();

  // neck, from the chest up into the jaw
  const jaw = V(0, -0.55 * BUST.R, -0.3 * BUST.R).applyMatrix4(head.matrixWorld);
  const neck = tube([V(0, 7.6, -0.9), V(0, 10.2, -0.5), jaw], [1.75, 1.45, 1.35], { radial: 36, seg: 20, vScale: 4 });
  const neckMesh = new THREE.Mesh(neck.geo, neckMat);
  neckMesh.castShadow = neckMesh.receiveShadow = true;
  group.add(neckMesh);

  // ----- veil of mosaic stripes
  const P = TX.mosaicTextures.PLANT;
  const VEIL_STRIPES = ['#c8322b', '#f2c230', P, '#7cc0e4', '#2f72c0', '#6b3d9e', '#ea7a2c', P];
  const veilTex = TX.mosaicTextures(VEIL_STRIPES, { cell: 12 });
  const veilMat = new THREE.MeshStandardMaterial({
    map: veilTex.map, bumpMap: veilTex.bump, bumpScale: 2.2, roughness: 0.55, metalness: 0.0, side: THREE.DoubleSide,
  });
  const veil = new THREE.Mesh(veilGeometry(), veilMat);
  veil.castShadow = veil.receiveShadow = true;
  group.add(veil);

  // a thick red rim along both front edges, so the veil reads as a heavy cloth
  const rimTex = TX.mosaicTextures(['#c8322b', '#d8402e', '#b52a28', '#e0533a'], { cell: 10 });
  const rimMat = new THREE.MeshStandardMaterial({ map: rimTex.map, bumpMap: rimTex.bump, bumpScale: 2, roughness: 0.55 });
  for (const u of [0, 1]) {
    const pts = [];
    for (let k = 0; k <= 30; k++) {
      const v = 0.07 + (k / 30) * 0.94;
      pts.push(veilPoint(u, Math.min(v, 1)));
    }
    const rim = tube(pts, [0.12, 0.3, 0.36, 0.42, 0.45], { radial: 14, seg: 120, vScale: 3 });
    const m = new THREE.Mesh(rim.geo, rimMat);
    m.castShadow = true; m.receiveShadow = true;
    group.add(m);
  }

  // living plants in the green strips (and some moss spilling over the edges)
  const n = V(), q = V(), q2 = V();
  const plantSpot = (u, v) => {
    veilPoint(u, v, q);
    veilPoint(u + 0.004, v, q2); const du = q2.clone().sub(q);
    veilPoint(u, v + 0.004, q2); const dv = q2.clone().sub(q);
    n.copy(du).cross(dv).normalize();
    // outward = away from the veil's axis
    const out = V(q.x - H.x, 0, q.z - H.z + 1);
    if (n.dot(out) < 0) n.negate();
    return q.clone();
  };
  const stripeOf = (u) => {
    const s = (1 - Math.abs(2 * u - 1)) * 1.5;
    return Math.floor((s % 1) * VEIL_STRIPES.length);
  };
  const plantStripes = VEIL_STRIPES.map((c, i) => (c === P ? i : -1)).filter((i) => i >= 0);
  for (let i = 0; i < 1400; i++) {
    const u = rand(), v = rr(0.08, 0.98);
    if (!plantStripes.includes(stripeOf(u))) continue;
    const p = plantSpot(u, v);
    const r = rr(0.35, 0.7) * (0.6 + v * 0.6);
    p.addScaledVector(n, r * 0.35);
    flora.cluster(flora.B.hedges, p.x, p.y, p.z, r, rand() < 0.75 ? flora.GREENS.moss : flora.GREENS.lime, { density: 55, card: 0.32, squash: 0.9 });
  }
  // ferny tufts sprouting from the crown of the hood (as in the close-ups)
  for (let i = 0; i < 26; i++) {
    const u = rr(0.25, 0.75), v = rr(0.02, 0.2);
    const p = plantSpot(u, v);
    p.addScaledVector(n, 0.4);
    flora.cluster(flora.B.trees, p.x, p.y + 0.3, p.z, rr(0.5, 0.9), flora.GREENS.moss, { density: 40, card: 0.42, squash: 1.2 });
  }

  // ----- the purple chest
  const chestTex = TX.chestTextures();
  chestTex.map.repeat.set(5, 2.4); chestTex.bump.repeat.set(5, 2.4);
  const chestMat = new THREE.MeshStandardMaterial({ map: chestTex.map, bumpMap: chestTex.bump, bumpScale: 2, roughness: 0.5 });
  const CH = { c: V(0, 0, -0.8), rx: 9.2, ry: 10.3, rz: 7.0 };
  const chestGeo = new THREE.SphereGeometry(1, 96, 48, 0, Math.PI * 2, 0, Math.PI / 2);
  chestGeo.scale(CH.rx, CH.ry, CH.rz);
  chestGeo.translate(CH.c.x, CH.c.y, CH.c.z);
  const chest = new THREE.Mesh(chestGeo, chestMat);
  chest.castShadow = chest.receiveShadow = true;
  group.add(chest);
  const chestZ = (x, y) => {
    const k = 1 - (x / CH.rx) ** 2 - (y / CH.ry) ** 2;
    return k > 0 ? CH.c.z + CH.rz * Math.sqrt(k) : null;
  };

  // necklace: strands of red beads with turquoise and big red medallions
  const beads = [];
  const STRANDS = [
    { yc: 9.9, A: 2.1, D: 0.7, r: 0.15 },
    { yc: 9.8, A: 2.6, D: 1.15, r: 0.17 },
    { yc: 9.7, A: 3.1, D: 1.6, r: 0.19 },
    { yc: 9.55, A: 3.6, D: 2.1, r: 0.21 },
    { yc: 9.4, A: 4.1, D: 2.65, r: 0.23 },
  ];
  STRANDS.forEach((s, k) => {
    const nB = Math.floor(s.A * 2 * 2.4 / (s.r * 2.05));
    for (let i = 0; i <= nB; i++) {
      const t = -1 + (2 * i) / nB;
      const x = s.A * t, y = s.yc - s.D * (1 - t * t);
      const z = chestZ(x, y);
      if (z === null) continue;
      const big = i % 7 === 3;
      const col = big ? '#c2241e' : i % 5 === 0 ? '#2fb3b0' : i % 9 === 4 ? '#e0a020' : pick(['#d22a22', '#bf1f1b', '#e2392b']);
      const r = s.r * (big ? 1.7 : rr(0.9, 1.1));
      beads.push({ p: V(x, y, z + r * 0.55), r, col });
    }
  });
  // medallions hanging from the lowest strand: big red discs with a dark stone in the middle
  const medallions = [];
  for (const t of [-0.55, -0.22, 0, 0.22, 0.55]) {
    const s = STRANDS[4];
    const x = s.A * t, y = s.yc - s.D * (1 - t * t) - 0.6;
    const z = chestZ(x, y);
    if (z !== null) medallions.push({ p: V(x, y, z + 0.1), r: t === 0 ? 0.62 : 0.42 });
  }
  {
    const bg = new THREE.SphereGeometry(1, 16, 12);
    const bm = new THREE.MeshStandardMaterial({ roughness: 0.32, metalness: 0.05 });
    const im = new THREE.InstancedMesh(bg, bm, beads.length);
    const m4 = new THREE.Matrix4(), col = new THREE.Color();
    beads.forEach((b, i) => {
      m4.makeScale(b.r, b.r, b.r * 0.8).setPosition(b.p);
      im.setMatrixAt(i, m4); im.setColorAt(i, col.set(b.col));
    });
    im.castShadow = true;
    group.add(im);
    const dg = new THREE.CylinderGeometry(1, 1, 0.22, 28);
    dg.rotateX(Math.PI / 2);
    const dm = new THREE.MeshStandardMaterial({ color: '#c8281f', roughness: 0.35 });
    const cm = new THREE.MeshStandardMaterial({ color: '#4a2030', roughness: 0.25 });
    for (const md of medallions) {
      const nrm = V(md.p.x / CH.rx ** 2, md.p.y / CH.ry ** 2, (md.p.z - CH.c.z) / CH.rz ** 2).normalize();
      const d = new THREE.Mesh(dg, dm);
      d.position.copy(md.p); d.scale.set(md.r, md.r * 1.15, 1);
      d.lookAt(md.p.clone().add(nrm));
      d.castShadow = true;
      group.add(d);
      const ci = new THREE.Mesh(dg, cm);
      ci.position.copy(md.p).addScaledVector(nrm, 0.14); ci.scale.set(md.r * 0.45, md.r * 0.52, 0.6);
      ci.quaternion.copy(d.quaternion);
      group.add(ci);
    }
  }

  // ----- the two arms
  const armTex = TX.mosaicTextures(['#c8322b', '#ea7a2c', '#f2c230', '#5aa04a', '#7cc0e4', '#2f72c0', '#6b3d9e', '#d8456a'], { cell: 12 });
  const armMat = new THREE.MeshStandardMaterial({ map: armTex.map, bumpMap: armTex.bump, bumpScale: 2.2, roughness: 0.55 });
  const HANDS = [
    // left (viewer's left): leans out to −x, palm turned up toward the bust and the viewer
    { side: 1, pos: V(-25, 12.2, -10), rot: new THREE.Euler(-0.62, 0.7, 0.3, 'YXZ') },
    // right: leans out to +x
    { side: -1, pos: V(25.5, 11.8, -9), rot: new THREE.Euler(-0.6, -0.75, -0.28, 'YXZ') },
  ];
  const hands = [];
  for (const h of HANDS) {
    const { geo, armCurve } = handGeometry(h.side);
    const m = new THREE.Mesh(geo, armMat);
    m.position.copy(h.pos); m.rotation.copy(h.rot); m.scale.setScalar(1.55);
    m.castShadow = m.receiveShadow = true;
    group.add(m);
    m.updateMatrixWorld();
    hands.push({ mesh: m, curve: armCurve });
    // moss and small plants along the top of the arm
    for (let i = 0; i < 26; i++) {
      const t = rr(0.25, 0.9);
      const p = armCurve.getPointAt(t).add(V(rr(-0.4, 0.4), 0, -1.0)).applyMatrix4(m.matrixWorld);
      if (p.y < 0.5) continue;
      flora.cluster(flora.B.hedges, p.x, p.y, p.z, rr(0.3, 0.55), flora.GREENS.moss, { density: 60, card: 0.28 });
    }
  }

  // ----- the steel lookout by the right arm (stair + platform)
  const steel = new THREE.MeshStandardMaterial({ color: '#8f9599', roughness: 0.45, metalness: 0.65 });
  const sg = [];
  const box = (x, y, z, w, h, d, ry = 0) => {
    const g = new THREE.BoxGeometry(w, h, d);
    g.rotateY(ry); g.translate(x, y, z); sg.push(g.toNonIndexed());
  };
  const bar = (a, b, r = 0.035) => {
    const dir = b.clone().sub(a);
    const g = new THREE.CylinderGeometry(r, r, dir.length(), 6);
    g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), dir.clone().normalize()));
    g.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
    sg.push(g.toNonIndexed());
  };
  // the platform stands in front of the right forearm, where the arm is ~6 m above the lawn
  const rh = hands[1];
  let armAt = V();
  for (let k = 0; k <= 200; k++) {
    const p = rh.curve.getPointAt(k / 200).applyMatrix4(rh.mesh.matrixWorld);
    if (p.y >= 6.4) { armAt = p; break; }
  }
  const PLAT = { x: armAt.x - 0.6, z: armAt.z + 3.3, y: 5.6, w: 3.2, d: 2.4 };
  box(PLAT.x, PLAT.y, PLAT.z, PLAT.w, 0.16, PLAT.d);
  bar(V(PLAT.x, 0, PLAT.z), V(PLAT.x, PLAT.y, PLAT.z), 0.16);
  // stair down toward the viewer (+z, slightly to −x)
  const nSteps = 30, rise = PLAT.y / nSteps, run = 0.3;
  const sx0 = PLAT.x - PLAT.w / 2 + 0.75, sz0 = PLAT.z + PLAT.d / 2;
  for (let i = 0; i < nSteps; i++) box(sx0, PLAT.y - (i + 1) * rise + 0.03, sz0 + (i + 0.5) * run, 1.3, 0.05, run * 0.92);
  const L0 = V(sx0, PLAT.y, sz0), L1 = V(sx0, 0, sz0 + nSteps * run);
  for (const s of [-0.68, 0.68]) {
    bar(L0.clone().add(V(s, -0.1, 0)), L1.clone().add(V(s, 0, 0)), 0.06);                                   // stringer
    bar(L0.clone().add(V(s, 1.05, 0)), L1.clone().add(V(s, 1.05, 0)), 0.035);                               // handrail
    bar(L0.clone().add(V(s, 0.55, 0)), L1.clone().add(V(s, 0.55, 0)), 0.02);
    for (let k = 0; k <= 6; k++) {
      const a = L0.clone().lerp(L1, k / 6).add(V(s, 0, 0));
      bar(a, a.clone().add(V(0, 1.05, 0)), 0.03);
    }
  }
  bar(V(sx0, PLAT.y * 0.5, sz0 + nSteps * run * 0.5), V(sx0, 0, sz0 + nSteps * run * 0.5), 0.1);
  // platform railing (open on the arm's side)
  const px0 = PLAT.x - PLAT.w / 2, px1 = PLAT.x + PLAT.w / 2, pz0 = PLAT.z - PLAT.d / 2, pz1 = PLAT.z + PLAT.d / 2;
  const rails = [[V(px0, 0, pz0), V(px0, 0, pz1)], [V(px0 + 1.5, 0, pz1), V(px1, 0, pz1)], [V(px1, 0, pz1), V(px1, 0, pz0)]];
  for (const [a, b] of rails) {
    for (const hh of [0.55, 1.1]) bar(a.clone().setY(PLAT.y + hh), b.clone().setY(PLAT.y + hh), 0.03);
    for (let k = 0; k <= 3; k++) { const c = a.clone().lerp(b, k / 3).setY(PLAT.y); bar(c, c.clone().setY(PLAT.y + 1.1), 0.03); }
  }
  const stair = new THREE.Mesh(mergeGeometries(sg), steel);
  stair.castShadow = stair.receiveShadow = true;
  group.add(stair);

  // ----- night: warm uplights on the bust and the hands
  const ups = [];
  for (const [x, z, tx, ty, tz, I] of [[-9, 17, 0, 10, 0, 1], [9, 17, 0, 10, 0, 1], [-19, 6, -27, 12, -10, 0.7], [19, 6, 27, 12, -9, 0.7]]) {
    const L = new THREE.SpotLight('#ffd9a8', 0, 60, 0.42, 0.6, 1.2);
    L.position.set(x, 0.4, z); L.target.position.set(tx, ty, tz);
    L.userData.I = I * 260;
    group.add(L, L.target);
    ups.push(L);
  }

  // ----- what a walker bumps into, and the height of the stair and the lookout
  const circles = [[0, -0.2, 8.6], [-5.2, -1.4, 6.4], [5.2, -1.4, 6.4], [0, -4, 8]];
  for (const h of hands) {       // where each forearm comes out of the lawn
    for (let k = 0; k <= 100; k++) {
      const p = h.curve.getPointAt(k / 100).applyMatrix4(h.mesh.matrixWorld);
      if (p.y >= 0.6) { circles.push([p.x, p.z, 2.3]); break; }
    }
  }
  const stairLen = nSteps * run;
  const segs = [];
  for (const s of [-0.68, 0.68]) segs.push([sx0 + s, sz0, sx0 + s, sz0 + stairLen]);        // stair rails
  segs.push([px0, pz0, px0, pz1], [px1, pz0, px1, pz1], [px0, pz0, px1, pz0], [sx0 + 0.68, pz1, px1, pz1]);
  const footprint = { circles, segs };
  const onStair = (x, z) => Math.abs(x - sx0) < 0.7 && z >= sz0 && z <= sz0 + stairLen;
  const onPlat = (x, z) => x >= px0 && x <= px1 && z >= pz0 && z <= pz1;

  return {
    group,
    footprint,
    parts: { head, neck: neckMesh, veil, chest, hands: hands.map((h) => h.mesh), stair },
    lookout: PLAT,
    stairFoot: { x: sx0, z: sz0 + stairLen + 0.4 },
    /** Ground height for a walker: the stair is a ramp up to the platform. */
    heightAt(x, z) {
      if (onPlat(x, z)) return PLAT.y + 0.08;
      if (onStair(x, z)) return PLAT.y * (1 - (z - sz0) / stairLen);
      return 0;
    },
    onSteel: (x, z) => onPlat(x, z) || onStair(x, z),
    onLookout: (x, z) => onPlat(x, z),
    setNight(k) { for (const L of ups) L.intensity = L.userData.I * k; },
  };
}
