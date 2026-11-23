import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import * as TX from './textures.js';
import { rand, rr, pick } from './util.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const UP = V(0, 1, 0);

export const GREENS = {
  oak: ['#5a852e', '#679433', '#76a23a', '#4f7a2a', '#84ad42'],
  garden: ['#5f9233', '#6ea03a', '#7fae45', '#57872e'],
  forest: ['#3f6526', '#4a7029', '#55792e', '#3a5c25', '#5f8434'],
  hedge: ['#3f6a26', '#47742a', '#4f7c2e', '#3a6224'],
  shrub: ['#4b7a2c', '#58883a', '#447028'],
  // tropical: lighter, yellower lawn trees; crotons and ixoras in the beds
  tropic: ['#5e9a2e', '#6fab34', '#80b83c', '#4f8a2a', '#8cc043'],
  lime: ['#a9c63a', '#bad24c', '#98b832', '#c4d85a'],
  croton: ['#9c2a2a', '#b5452c', '#c9682a', '#7a2433', '#a8352c'],
  moss: ['#4f7a2a', '#5f8f30', '#6fa03a', '#3f6a24'],
  palm: ['#4f7f2c', '#5a8c30', '#66963a', '#486f28'],
};

/**
 * Leaf-card vegetation (the technique from the floating house): quads with a leaf-bunch texture,
 * normals pushed out from each cluster centre so the crowns light like soft spheres.
 * Everything of one kind goes into one Batch → one draw call.
 */
export function createFlora() {
  const time = { value: 0 };
  const wind = { value: 0.3 };

  const leafTex = TX.leafTexture();
  const blossomTex = TX.blossomTexture();
  const windy = (mat, amp = 1) => {
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uTime = time;
      sh.uniforms.uWind = wind;
      sh.vertexShader = 'uniform float uTime;\nuniform float uWind;\n' + sh.vertexShader.replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
         vec4 wpS = modelMatrix * vec4(position, 1.0);
         float hgt = clamp(wpS.y * 0.12, 0.0, 1.6);
         float sw = sin(uTime * 1.3 + wpS.x * 0.35 + wpS.z * 0.27) * 0.6 + sin(uTime * 2.3 + wpS.y * 0.9 + wpS.x) * 0.4;
         transformed += vec3(sw * 0.06, sw * 0.02, cos(uTime * 1.7 + wpS.x * 0.5) * 0.05) * (0.3 + uWind * 2.2) * hgt * ${amp.toFixed(2)};`
      );
    };
    return mat;
  };
  const leafMat = windy(new THREE.MeshStandardMaterial({ map: leafTex, alphaTest: 0.5, side: THREE.DoubleSide, vertexColors: true, roughness: 0.8 }));
  const hedgeMat = windy(new THREE.MeshStandardMaterial({ map: leafTex, alphaTest: 0.5, side: THREE.DoubleSide, vertexColors: true, roughness: 0.85 }), 0.25);
  const blossomMat = windy(new THREE.MeshStandardMaterial({ map: blossomTex, alphaTest: 0.45, side: THREE.DoubleSide, vertexColors: true, roughness: 0.7 }), 0.4);
  const depthOf = (tex) => new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: tex, alphaTest: 0.5, side: THREE.DoubleSide });
  const leafDepth = depthOf(leafTex), blossomDepth = depthOf(blossomTex);
  const frondTex = TX.frondTexture();
  const frondMat = windy(new THREE.MeshStandardMaterial({ map: frondTex, alphaTest: 0.45, side: THREE.DoubleSide, vertexColors: true, roughness: 0.75 }), 1.3);
  const bark = new THREE.MeshStandardMaterial({ color: '#594f46', roughness: 1 });
  const palmBark = new THREE.MeshStandardMaterial({ color: '#a7a297', roughness: 0.95 });
  const shaftMat = new THREE.MeshStandardMaterial({ color: '#6f8a3a', roughness: 0.7 });
  const hedgeCore = new THREE.MeshStandardMaterial({ color: '#2c4a1c', roughness: 1 });

  class Batch {
    constructor(mat, depth, { cast = true } = {}) {
      Object.assign(this, { mat, depth, cast, pos: [], nor: [], uv: [], col: [], idx: [], vi: 0 });
    }
    card(p, n, size, color) {
      const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(rand() * 6.28, rand() * 6.28, rand() * 6.28));
      const a = V(1, 0, 0).applyQuaternion(q), b = V(0, 1, 0).applyQuaternion(q);
      for (const [u, v] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
        const c = p.clone().addScaledVector(a, u * size * 0.5).addScaledVector(b, v * size * 0.5);
        this.pos.push(c.x, c.y, c.z);
        this.nor.push(n.x, n.y, n.z);
        this.uv.push((u + 1) / 2, (v + 1) / 2);
        this.col.push(color.r, color.g, color.b);
      }
      const i = this.vi;
      this.idx.push(i, i + 1, i + 2, i, i + 2, i + 3);
      this.vi += 4;
    }
    mesh() {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
      g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
      g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
      g.setIndex(this.idx);
      g.computeBoundingSphere();
      const m = new THREE.Mesh(g, this.mat);
      m.customDepthMaterial = this.depth;
      m.castShadow = this.cast; m.receiveShadow = true;
      return m;
    }
  }

  const c = new THREE.Color(), base = new THREE.Color();

  /** Leaf cards scattered through a sphere. */
  function cluster(batch, cx, cy, cz, r, palette, { card = 0.9, density = 30, squash = 0.85 } = {}) {
    const center = V(cx, cy, cz);
    const count = Math.floor(r * r * density) + 8;
    base.set(pick(palette));
    for (let i = 0; i < count; i++) {
      const dir = V(rand() * 2 - 1, rand() * 2 - 1, rand() * 2 - 1).normalize();
      dir.y *= squash;
      const p = center.clone().addScaledVector(dir, r * (0.4 + 0.6 * Math.sqrt(rand())));
      const local = p.clone().sub(center).divideScalar(r);
      const outer = THREE.MathUtils.clamp(local.length(), 0, 1);
      // sunlit top & rim lighter, inside & underside darker
      const k = THREE.MathUtils.clamp(0.45 + 0.32 * (local.y * 0.5 + 0.5) + 0.3 * outer, 0.32, 1.12);
      c.copy(base).offsetHSL(rr(-0.02, 0.02), rr(-0.05, 0.05), rr(-0.04, 0.04)).multiplyScalar(k);
      const n = local.clone().add(V(0, 0.3, 0)).normalize();
      batch.card(p, n, card * rr(0.75, 1.25), c);
    }
  }

  /** Leaf cards over the surface of a box (clipped hedges, topiary). */
  function boxSurface(batch, x0, x1, y0, y1, z0, z1, palette, { card = 0.42, perM2 = 34, ry = 0 } = {}) {
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    const w = x1 - x0, h = y1 - y0, d = z1 - z0;
    const faces = [
      { n: V(0, 1, 0), area: w * d, p: () => V(rr(x0, x1), y1, rr(z0, z1)) },
      { n: V(0, 0, 1), area: w * h, p: () => V(rr(x0, x1), rr(y0, y1), z1) },
      { n: V(0, 0, -1), area: w * h, p: () => V(rr(x0, x1), rr(y0, y1), z0) },
      { n: V(1, 0, 0), area: d * h, p: () => V(x1, rr(y0, y1), rr(z0, z1)) },
      { n: V(-1, 0, 0), area: d * h, p: () => V(x0, rr(y0, y1), rr(z0, z1)) },
    ];
    const rot = new THREE.Matrix4().makeRotationY(ry);
    const piv = V(cx, 0, cz);
    for (const f of faces) {
      const count = Math.floor(f.area * perM2);
      for (let i = 0; i < count; i++) {
        base.set(pick(palette));
        const p = f.p().addScaledVector(f.n, rr(-0.08, 0.1));
        // slightly rounded edges: pull points near the top edges down/in
        const top = (p.y - y0) / h;
        const k = THREE.MathUtils.clamp(0.55 + 0.4 * top + (f.n.y > 0 ? 0.25 : 0), 0.4, 1.15);
        c.copy(base).offsetHSL(rr(-0.015, 0.015), rr(-0.04, 0.04), rr(-0.03, 0.03)).multiplyScalar(k);
        const n = f.n.clone().add(V(0, 0.35, 0)).normalize();
        p.sub(piv).applyMatrix4(rot).add(piv); n.applyMatrix4(rot);
        batch.card(p, n, card * rr(0.8, 1.2), c);
      }
    }
  }

  // ---------------------------------------------------------------- trunks
  const trunkGeos = [];
  const palmGeos = [], shaftGeos = [];
  const rod = (a, b, r0, r1, seg = 7, into = trunkGeos) => {
    const dir = b.clone().sub(a);
    const g = new THREE.CylinderGeometry(r1, r0, dir.length(), seg);
    g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(UP, dir.clone().normalize()));
    g.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
    into.push(g.toNonIndexed());
  };

  // ---------------------------------------------------------------- batches
  const B = {
    trees: new Batch(leafMat, leafDepth),
    forest: new Batch(leafMat, leafDepth, { cast: false }), // outside the shadow frustum anyway
    hedges: new Batch(hedgeMat, leafDepth),
    blossoms: new Batch(blossomMat, blossomDepth),
    fronds: new Batch(frondMat, depthOf(frondTex)),
  };

  /** One pinnate frond: a V-folded strip that arches out and droops, leaflets from the texture. */
  function frond(batch, base, az, el, L, wMax, color) {
    const N = 10;
    const dh = V(Math.cos(az), 0, Math.sin(az));
    const pts = [];
    for (let s = 0; s <= N; s++) {
      const t = s / N;
      pts.push(base.clone().addScaledVector(dh, Math.cos(el) * t * L).add(V(0, Math.sin(el) * t * L - 0.55 * t * t * L, 0)));
    }
    const i0 = batch.vi;
    for (let s = 0; s <= N; s++) {
      const t = s / N;
      const p = pts[s];
      const tan = (s < N ? pts[s + 1].clone().sub(p) : p.clone().sub(pts[s - 1])).normalize();
      const side = V(0, 1, 0).cross(tan).normalize();
      const n = tan.clone().cross(side).normalize().negate();
      if (n.y < 0) n.negate();
      const w = wMax * Math.sin(Math.min(1, t * 1.15 + 0.06) * Math.PI) * 0.5 + 0.05;
      const k = 0.75 + 0.35 * t;
      for (const [u, off, drop] of [[0, -1, 1], [0.5, 0, 0], [1, 1, 1]]) {
        const q = p.clone().addScaledVector(side, off * w).addScaledVector(n, -drop * w * 0.35);
        batch.pos.push(q.x, q.y, q.z);
        batch.nor.push(n.x, n.y, n.z);
        batch.uv.push(u, t);
        batch.col.push(color.r * k, color.g * k, color.b * k);
      }
    }
    for (let s = 0; s < N; s++) {
      const a = i0 + s * 3, b = a + 3;
      batch.idx.push(a, b, a + 1, a + 1, b, b + 1, a + 1, b + 1, a + 2, a + 2, b + 1, b + 2);
    }
    batch.vi += (N + 1) * 3;
  }

  /** Palm: slender grey trunk, green crownshaft, a crown of arching fronds. */
  function palm(x, z, H = 12, { fronds = 17, L = 5.2, lean = 0.6, shaft = true } = {}) {
    const la = rand() * 6.28;
    const top = V(x + Math.cos(la) * lean * rand(), H, z + Math.sin(la) * lean * rand());
    const mid = V(x, 0, z).lerp(top, 0.5).add(V(rr(-0.15, 0.15), 0, rr(-0.15, 0.15)));
    rod(V(x, -0.3, z), V(x, 0.8, z), 0.48, 0.36, 10, palmGeos);
    rod(V(x, 0.8, z), mid, 0.36, 0.3, 10, palmGeos);
    rod(mid, top, 0.3, 0.26, 10, palmGeos);
    if (shaft) rod(top.clone().add(V(0, -0.3, 0)), top.clone().add(V(0, 1.9, 0)), 0.3, 0.24, 10, shaftGeos);
    const crown = top.clone().add(V(0, shaft ? 1.9 : 0.2, 0));
    base.set(pick(GREENS.palm));
    for (let i = 0; i < fronds; i++) {
      const az = i * 2.39996 + rr(-0.2, 0.2);
      const age = i / fronds;                       // the first fronds are the old, drooping ones
      const el = THREE.MathUtils.lerp(0.05, 1.2, age) + rr(-0.12, 0.12);
      c.copy(base).offsetHSL(rr(-0.015, 0.015), rr(-0.05, 0.05), rr(-0.05, 0.04));
      if (age < 0.12) c.lerp(new THREE.Color('#a39a5a'), 0.35);   // an old, yellowing frond
      frond(B.fronds, crown, az, el, L * rr(0.85, 1.08) * (1 - age * 0.25), 2.5, c);
    }
    return { x, z, r: 0.45 };
  }
  const coreGeos = [];

  /** Large mature broadleaf: tall bare trunk, a few limbs, a wide rounded crown. */
  function broadleaf(x, z, s = 1, { palette = GREENS.oak, batch = B.trees, density = 40, card = 0.62 } = {}) {
    const H = rr(5.2, 6.4) * s;
    const lean = V(rr(-0.3, 0.3), 0, rr(-0.3, 0.3)).multiplyScalar(s);
    const base0 = V(x, 0, z), top = V(x, H, z).add(lean);
    rod(V(x, -0.3, z), top, 0.42 * s, 0.3 * s, 9);
    // root flare
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * 6.28 + rr(-0.3, 0.3);
      rod(V(x, 0.5 * s, z), V(x + Math.cos(a) * 0.9 * s, -0.1, z + Math.sin(a) * 0.9 * s), 0.18 * s, 0.06 * s, 5);
    }
    const crownY = H + 3.6 * s;
    cluster(batch, top.x, crownY + 1.2 * s, top.z, 3.6 * s, palette, { density, card });
    cluster(batch, top.x, H + 1.6 * s, top.z, 2.8 * s, palette, { density: density * 0.6, card });
    const limbs = 5 + Math.floor(rand() * 3);
    for (let i = 0; i < limbs; i++) {
      const a = (i / limbs) * 6.28 + rr(-0.35, 0.35);
      const R = rr(3.0, 4.6) * s;
      const from = top.clone().lerp(base0, rr(0, 0.25));
      const end = V(top.x + Math.cos(a) * R, H + rr(1.8, 4.2) * s, top.z + Math.sin(a) * R);
      rod(from, end, 0.2 * s, 0.07 * s);
      cluster(batch, end.x, end.y + 0.6 * s, end.z, rr(2.3, 3.0) * s, palette, { density, card });
      // filler between limb and crown
      const mid = end.clone().lerp(V(top.x, crownY, top.z), 0.5);
      cluster(batch, mid.x, mid.y + 0.4 * s, mid.z, rr(1.9, 2.5) * s, palette, { density: density * 0.7, card });
    }
    return { x, z, r: 5 * s };
  }

  /** Medium garden tree: slender trunk, oval crown. */
  function gardenTree(x, z, s = 1, { palette = GREENS.garden, batch = B.trees } = {}) {
    const H = rr(2.2, 3.0) * s;
    const top = V(x + rr(-0.15, 0.15), H, z + rr(-0.15, 0.15));
    rod(V(x, -0.2, z), top, 0.16 * s, 0.11 * s, 7);
    const n = 5 + Math.floor(rand() * 3);
    for (let i = 0; i < n; i++) {
      const a = rand() * 6.28, rad = rr(0.4, 1.3) * s;
      const y = H + rr(0.8, 3.6) * s;
      if (i < 3) rod(top, V(top.x + Math.cos(a) * rad, y, top.z + Math.sin(a) * rad), 0.08 * s, 0.03 * s, 5);
      cluster(batch, top.x + Math.cos(a) * rad, y, top.z + Math.sin(a) * rad, rr(1.2, 1.7) * s, palette, { density: 60, card: 0.5 });
    }
  }

  /** Cheap distant tree for the woodland edge. */
  function forestTree(x, z, s = 1) {
    // short trunk, big low crown: from the lawn the woodland reads as one soft wall
    const H = rr(1.6, 2.6) * s;
    rod(V(x, -0.2, z), V(x, H + 1.5 * s, z), 0.32 * s, 0.2 * s, 6);
    cluster(B.forest, x, H + 4.6 * s, z, rr(4.0, 5.0) * s, GREENS.forest, { density: 11, card: 1.25 });
    for (let i = 0; i < 4; i++) {
      const a = rand() * 6.28;
      cluster(B.forest, x + Math.cos(a) * 3.0 * s, H + rr(2.2, 4.4) * s, z + Math.sin(a) * 3.0 * s, rr(2.6, 3.4) * s, GREENS.forest, { density: 11, card: 1.15 });
    }
  }

  /** Clipped hedge: solid dark core + leaf cards over its surface. */
  function hedge(x0, x1, z0, z1, h = 1.3, ry = 0, palette = GREENS.hedge) {
    const g = new THREE.BoxGeometry(x1 - x0 - 0.12, h - 0.06, z1 - z0 - 0.12);
    g.translate(0, (h - 0.06) / 2, 0);
    g.rotateY(ry);
    g.translate((x0 + x1) / 2, 0, (z0 + z1) / 2);
    coreGeos.push(g.toNonIndexed());
    boxSurface(B.hedges, x0, x1, 0, h, z0, z1, palette, { ry });
  }

  /** Round shrub, optionally with white hydrangea heads. */
  function shrub(x, y, z, r = 0.8, flowers = 0, palette = GREENS.shrub) {
    cluster(B.hedges, x, y + r * 0.8, z, r, palette, { density: 70, card: 0.42, squash: 0.75 });
    for (let i = 0; i < flowers; i++) {
      const dir = V(rr(-1, 1), rr(0.1, 1), rr(-0.4, 1)).normalize();
      const p = V(x, y + r * 0.8, z).addScaledVector(dir, r * rr(0.85, 1.05));
      c.set('#f7f5ec').offsetHSL(0, 0, rr(-0.05, 0.03));
      B.blossoms.card(p, dir.clone().add(V(0, 0.4, 0)).normalize(), rr(0.32, 0.45) * (r / 0.8), c);
      B.blossoms.card(p.clone().addScaledVector(dir, 0.04), dir, rr(0.28, 0.38) * (r / 0.8), c);
    }
  }

  return {
    time, wind, B, cluster, palm, frond, windy, leafMat, leafDepth, broadleaf, gardenTree, forestTree, hedge, shrub, GREENS,
    /** Call once everything has been planted. */
    build() {
      const group = new THREE.Group();
      for (const b of Object.values(B)) if (b.vi) group.add(b.mesh());
      if (trunkGeos.length) {
        const t = new THREE.Mesh(mergeGeometries(trunkGeos), bark);
        t.castShadow = t.receiveShadow = true;
        group.add(t);
      }
      if (palmGeos.length) {
        const t = new THREE.Mesh(mergeGeometries(palmGeos), palmBark);
        t.castShadow = t.receiveShadow = true;
        group.add(t);
        const sh = new THREE.Mesh(mergeGeometries(shaftGeos), shaftMat);
        sh.castShadow = sh.receiveShadow = true;
        group.add(sh);
      }
      if (coreGeos.length) {
        const h = new THREE.Mesh(mergeGeometries(coreGeos), hedgeCore);
        h.castShadow = h.receiveShadow = true;
        group.add(h);
      }
      return group;
    },
    update(t) { time.value = t; },
  };
}
