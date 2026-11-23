import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import * as TX from './textures.js';
import { createFlora } from './flora.js';
import { rand, rr, pick } from './util.js';

/*
  The park around the monument (from the drone video): a wide lawn, an oval concrete walk round the
  sculptures, a low hedge arc in front of the bust, beds of red crotons and lime shrubs, young trees,
  rows of palms, tall floodlight posts, the blue bike lane with its yellow line, an avenue with a palm
  median, the low city of Santo Domingo all round and the blue cordillera far off.
*/
const V = (x, y, z) => new THREE.Vector3(x, y, z);
export const RING = { rx: 46, rz: 32, w: 3.2 };
export const LANE = { z: 43, w: 2.8 };
export const AVENUE = { z: -150, w: 26 };

export function createPark(monumentFootprint) {
  const root = new THREE.Group();
  const flora = createFlora();
  const obstacles = { circles: [...monumentFootprint.circles], segs: [], boxes: [] };
  const night = { value: 0 };

  // ---------------------------------------------------------------- lawn
  const grass = TX.grassTexture();
  grass.repeat.set(1100, 1100);
  const lawnMat = new THREE.MeshStandardMaterial({ map: grass, roughness: 0.95, color: '#e8ffd0' });
  lawnMat.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vW;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvW = (modelMatrix * vec4(position, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec3 vW;
        float h21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float vnoise(vec2 p) {
          vec2 i = floor(p), f = fract(p);
          vec2 u = f * f * (3.0 - 2.0 * f);
          return mix(mix(h21(i), h21(i + vec2(1, 0)), u.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), u.x), u.y);
        }`)
      .replace('#include <map_fragment>', `#include <map_fragment>
        {
          // tropical lawn: patches of lush and sun-dried grass, worn earth here and there
          float n = vnoise(vW.xz * 0.035) * 0.55 + vnoise(vW.xz * 0.16) * 0.3 + vnoise(vW.xz * 0.9) * 0.15;
          vec3 g = diffuseColor.rgb;
          g *= 0.84 + 0.32 * n;
          float dry = smoothstep(0.62, 0.8, vnoise(vW.xz * 0.02 + 7.0));
          g = mix(g, g * vec3(1.12, 1.0, 0.7), dry * 0.45);
          float far = smoothstep(120.0, 400.0, length(vW.xz));
          g = mix(g, g * vec3(0.95, 1.0, 0.9), far * 0.4);
          diffuseColor.rgb = g;
        }`);
  };
  const lawn = new THREE.Mesh(new THREE.CircleGeometry(1500, 72), lawnMat);
  lawn.rotation.x = -Math.PI / 2;
  lawn.receiveShadow = true;
  root.add(lawn);

  // ---------------------------------------------------------------- walks (concrete)
  const conc = TX.concreteTexture();
  const concMat = new THREE.MeshStandardMaterial({ map: conc, roughness: 0.9, polygonOffset: true, polygonOffsetFactor: -2 });
  const flat = (pts, y = 0.04) => pts; // readability
  /** A band following a polyline of [x, z] points, `w` wide, with uv in metres / 4. */
  function band(points, w, y = 0.04, uvScale = 4) {
    const pos = [], uv = [], idx = [];
    let along = 0;
    for (let i = 0; i < points.length; i++) {
      const [x, z] = points[i];
      const [xa, za] = points[Math.max(0, i - 1)], [xb, zb] = points[Math.min(points.length - 1, i + 1)];
      let tx = xb - xa, tz = zb - za; const l = Math.hypot(tx, tz) || 1; tx /= l; tz /= l;
      if (i > 0) along += Math.hypot(x - points[i - 1][0], z - points[i - 1][1]);
      const nx = -tz, nz = tx;
      pos.push(x - nx * w / 2, y, z - nz * w / 2, x + nx * w / 2, y, z + nz * w / 2);
      uv.push(0, along / uvScale, w / uvScale, along / uvScale);
      if (i < points.length - 1) { const k = i * 2; idx.push(k, k + 2, k + 1, k + 1, k + 2, k + 3); }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    if (g.attributes.normal.getY(0) < 0) { // keep faces up
      const id = g.index.array; for (let i = 0; i < id.length; i += 3) { const t = id[i]; id[i] = id[i + 2]; id[i + 2] = t; }
      g.computeVertexNormals();
    }
    return g;
  }
  const ellipse = (rx, rz, n = 160, a0 = 0, a1 = Math.PI * 2, cx = 0, cz = 0) => {
    const pts = [];
    for (let i = 0; i <= n; i++) { const a = a0 + (a1 - a0) * (i / n); pts.push([cx + Math.sin(a) * rx, cz + Math.cos(a) * rz]); }
    return pts;
  };
  const curve = (pts, n = 60) => new THREE.SplineCurve(pts.map(([x, z]) => new THREE.Vector2(x, z))).getPoints(n).map((p) => [p.x, p.y]);
  const walks = [
    band(ellipse(RING.rx, RING.rz), RING.w),
    // links from the ring out to the bike lane and to the avenue, curving like the drone shots
    band(curve([[-14, 31.5], [-18, 36], [-22, 41.5]]), 2.6),
    band(curve([[30, 24], [40, 33], [52, 41.5]]), 2.6),
    band(curve([[-30, -24], [-44, -40], [-56, -58], [-62, -90], [-64, -136]]), 3),
    band(curve([[12, -31.5], [20, -50], [34, -68], [40, -100], [42, -136]]), 3),
    // the wide promenade alongside the avenue
    band([[-400, AVENUE.z + AVENUE.w / 2 + 6], [400, AVENUE.z + AVENUE.w / 2 + 6]], 4, 0.05),
    // sidewalk by the bike lane
    band([[-400, LANE.z + LANE.w / 2 + 1.6], [400, LANE.z + LANE.w / 2 + 1.6]], 3, 0.05),
  ];
  const walkMesh = new THREE.Mesh(mergeGeometries(walks), concMat);
  walkMesh.receiveShadow = true;
  root.add(walkMesh);
  // low kerb along both sides of the ring
  const kerbMat = new THREE.MeshStandardMaterial({ color: '#d8d4cb', roughness: 0.9 });
  const kerbs = [];
  for (const d of [-RING.w / 2 - 0.1, RING.w / 2 + 0.1]) {
    const pts = ellipse(RING.rx + d, RING.rz + d * (RING.rz / RING.rx), 200);
    for (let i = 0; i < pts.length - 1; i++) {
      const [x0, z0] = pts[i], [x1, z1] = pts[i + 1];
      const L = Math.hypot(x1 - x0, z1 - z0);
      const g = new THREE.BoxGeometry(0.18, 0.14, L + 0.02);
      g.rotateY(Math.atan2(x1 - x0, z1 - z0));
      g.translate((x0 + x1) / 2, 0.05, (z0 + z1) / 2);
      kerbs.push(g.toNonIndexed());
    }
  }
  const kerb = new THREE.Mesh(mergeGeometries(kerbs), kerbMat);
  kerb.receiveShadow = true;
  root.add(kerb);

  // ---------------------------------------------------------------- bike lane
  const laneTex = TX.bikeLaneTexture();
  laneTex.rotation = Math.PI / 2;
  const laneG = new THREE.PlaneGeometry(800, LANE.w);
  const luv = laneG.attributes.uv;
  for (let i = 0; i < luv.count; i++) luv.setXY(i, luv.getX(i) * (800 / 6), luv.getY(i));
  laneG.rotateX(-Math.PI / 2);
  laneG.translate(0, 0.05, LANE.z);
  const laneTex2 = laneTex; laneTex2.center.set(0.5, 0.5);
  const lane = new THREE.Mesh(laneG, new THREE.MeshStandardMaterial({ map: laneTex2, roughness: 0.85, polygonOffset: true, polygonOffsetFactor: -2 }));
  lane.receiveShadow = true;
  root.add(lane);

  // ---------------------------------------------------------------- avenue with a palm median
  const asph = TX.asphaltTexture();
  asph.center.set(0.5, 0.5); asph.rotation = Math.PI / 2;
  const roadMat = new THREE.MeshStandardMaterial({ map: asph, roughness: 0.92, polygonOffset: true, polygonOffsetFactor: -2 });
  for (const s of [-1, 1]) {
    const g = new THREE.PlaneGeometry(1000, 10);
    const u = g.attributes.uv;
    for (let i = 0; i < u.count; i++) u.setXY(i, u.getX(i) * (1000 / 12), u.getY(i));
    g.rotateX(-Math.PI / 2);
    g.translate(0, 0.04, AVENUE.z + s * 7.5);
    const m = new THREE.Mesh(g, roadMat); m.receiveShadow = true; root.add(m);
  }
  {
    const g = new THREE.BoxGeometry(1000, 0.25, 4.6);
    g.translate(0, 0.12, AVENUE.z);
    const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: '#5f8a34', roughness: 1 }));
    m.receiveShadow = true; root.add(m);
    for (let x = -420; x <= 420; x += 14) flora.palm(x + rr(-1.5, 1.5), AVENUE.z + rr(-0.6, 0.6), rr(9, 12.5), { fronds: 12, L: 3.8 });
  }

  // ---------------------------------------------------------------- hedges and beds
  /** Low clipped hedge along an elliptical arc, as short straight pieces. */
  function hedgeArc(cx, cz, rx, rz, a0, a1, h = 0.9, w = 1.0, palette) {
    const n = Math.max(3, Math.ceil(((a1 - a0) * (rx + rz)) / 2 / 2.2));
    for (let i = 0; i < n; i++) {
      const ta = a0 + (a1 - a0) * (i / n), tb = a0 + (a1 - a0) * ((i + 1) / n);
      const xa = cx + Math.sin(ta) * rx, za = cz + Math.cos(ta) * rz;
      const xb = cx + Math.sin(tb) * rx, zb = cz + Math.cos(tb) * rz;
      const L = Math.hypot(xb - xa, zb - za) + 0.25;
      const mx = (xa + xb) / 2, mz = (za + zb) / 2;
      flora.hedge(mx - L / 2, mx + L / 2, mz - w / 2, mz + w / 2, h, Math.atan2(-(zb - za), xb - xa), palette);
      obstacles.circles.push([mx, mz, Math.max(L, w) / 2]);
    }
  }
  /** A row of round shrubs along an arc (the coloured croton bands). */
  function shrubArc(cx, cz, rx, rz, a0, a1, palette, r = 0.6) {
    const len = ((a1 - a0) * (rx + rz)) / 2;
    const n = Math.floor(len / (r * 1.25));
    for (let i = 0; i <= n; i++) {
      const a = a0 + (a1 - a0) * (i / n);
      flora.shrub(cx + Math.sin(a) * rx + rr(-0.15, 0.15), 0, cz + Math.cos(a) * rz + rr(-0.15, 0.15), r * rr(0.85, 1.15), 0, palette);
    }
  }
  const G = flora.GREENS;
  // the low hedge arc in front of the bust (with a bed of red crotons inside it)
  hedgeArc(0, -1, 15.5, 14.5, -1.35, 1.35, 0.85, 1.1, G.hedge);
  shrubArc(0, -1, 13.8, 12.8, -1.15, 1.15, G.croton, 0.5);
  // the round bed to the right, with lime shrubs in a ring
  hedgeArc(18, 16, 5.6, 5.6, 0, Math.PI * 2, 0.6, 0.9, G.lime);
  for (let i = 0; i < 9; i++) flora.shrub(18 + rr(-3.5, 3.5), 0, 16 + rr(-3.5, 3.5), rr(0.4, 0.6), 0, G.croton);
  // coloured bands in the lawn between the ring and the bike lane (red and yellow, like the photos)
  shrubArc(0, 6, 34, 30, -0.95, -0.3, G.croton, 0.55);
  shrubArc(0, 6, 31, 27.5, -0.85, -0.35, G.lime, 0.5);
  shrubArc(0, 6, 34, 30, 0.35, 0.9, G.lime, 0.55);
  shrubArc(-6, -4, 60, 44, 0.25, 0.75, G.croton, 0.55);
  // little beds round each arm
  hedgeArc(-25, -9, 7, 5.6, -2.6, 0.9, 0.6, 0.9, G.lime);
  hedgeArc(25.5, -8, 7, 5.6, -0.6, 2.6, 0.6, 0.9, G.lime);
  // bike lane: low lime hedge on the park side
  flora.hedge(-140, -26, LANE.z - LANE.w / 2 - 1.2, LANE.z - LANE.w / 2 - 0.4, 0.75, 0, G.lime);
  flora.hedge(-18, 50, LANE.z - LANE.w / 2 - 1.2, LANE.z - LANE.w / 2 - 0.4, 0.75, 0, G.lime);
  flora.hedge(56, 160, LANE.z - LANE.w / 2 - 1.2, LANE.z - LANE.w / 2 - 0.4, 0.75, 0, G.lime);

  // ---------------------------------------------------------------- palms and trees
  const palms = [];
  // along the bike lane (gap in front of the home view)
  for (let x = -150; x <= 160; x += 13) if (x < -14 || x > 24) palms.push([x + rr(-2, 2), LANE.z + 7 + rr(-0.5, 0.5), rr(10, 14)]);
  // a row behind the sculptures and clumps in the park
  for (let x = -110; x <= 110; x += 11) palms.push([x + rr(-2, 2), -52 + rr(-2, 2), rr(11, 16)]);
  for (const [x, z] of [[-50, 62], [-42, 70], [-60, 58], [64, 2], [70, 10], [60, -20], [-70, -26], [-48, 52], [44, 58], [80, 40], [-84, 44]]) palms.push([x, z, rr(9, 15)]);
  for (const [x, z, h] of palms) { flora.palm(x, z, h); obstacles.circles.push([x, z, 0.5]); }

  // young lawn trees (still small: the park is new)
  const young = [[-38, 14], [-44, -10], [38, 16], [46, -12], [-24, 26], [32, -22], [-8, -36], [10, 36], [-56, -36], [58, 28], [-70, 30], [74, -36], [-30, 54], [24, 56], [-90, -10], [6, -70], [-26, -70], [52, -64]];
  for (const [x, z] of young) { flora.gardenTree(x, z, rr(0.7, 0.95), { palette: G.tropic }); obstacles.circles.push([x, z, 0.35]); }
  // big trees closing the park on the sides and behind
  const BIG = [[-120, -40], [-128, 10], [-118, 60], [122, -30], [130, 22], [118, 70], [-80, -72], [-40, -76], [0, -78], [44, -74], [86, -70], [140, -60], [-150, -64]];
  for (const [x, z] of BIG) { flora.broadleaf(x + rr(-4, 4), z + rr(-4, 4), rr(1.1, 1.5), { palette: G.tropic }); obstacles.circles.push([x, z, 0.7]); }
  // a belt of trees between the park and the avenue: from the monument the city hides behind it
  for (let i = 0; i < 95; i++) flora.forestTree(rr(-200, 200), rr(-125, -80), rr(1.0, 1.5));
  for (let i = 0; i < 30; i++) flora.palm(rr(-180, 180), rr(-120, -70), rr(13, 19));
  // a woodland mass on the right (seen in the drone video)
  for (let i = 0; i < 70; i++) flora.forestTree(rr(160, 260), rr(-80, 120), rr(1.1, 1.6));

  // ---------------------------------------------------------------- lamp posts
  const poleMat = new THREE.MeshStandardMaterial({ color: '#7b8085', roughness: 0.5, metalness: 0.6 });
  const headMat = new THREE.MeshStandardMaterial({ color: '#e8e4da', emissive: new THREE.Color('#ffd7a0'), emissiveIntensity: 0, roughness: 0.4 });
  const whiteMat = new THREE.MeshStandardMaterial({ color: '#f1efe9', roughness: 0.6 });
  const poles = [], heads = [], whites = [];
  const lampSpots = [];
  const tall = (x, z, ry = 0) => {
    const g = new THREE.CylinderGeometry(0.11, 0.17, 10, 8); g.translate(x, 5, z); poles.push(g.toNonIndexed());
    const arm = new THREE.BoxGeometry(1.6, 0.1, 0.12); arm.rotateY(ry); arm.translate(x, 9.95, z); poles.push(arm.toNonIndexed());
    for (const s of [-0.65, 0.65]) {
      const h = new THREE.BoxGeometry(0.6, 0.22, 0.42);
      h.translate(s, 0, 0); h.rotateY(ry); h.translate(x, 10.1, z);
      heads.push(h.toNonIndexed());
    }
    lampSpots.push([x, z, 9]);
    obstacles.circles.push([x, z, 0.25]);
  };
  const bollard = (x, z) => {
    const g = new THREE.CylinderGeometry(0.09, 0.12, 2.6, 10); g.translate(x, 1.3, z); whites.push(g.toNonIndexed());
    const b = new THREE.SphereGeometry(0.24, 14, 10); b.translate(x, 2.75, z); heads.push(b.toNonIndexed());
    lampSpots.push([x, z, 3.4]);
  };
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2 + 0.26;
    tall(Math.sin(a) * (RING.rx + 3), Math.cos(a) * (RING.rz + 3), -a);
  }
  for (let x = -130; x <= 140; x += 16) bollard(x, LANE.z - LANE.w / 2 - 2.0);
  for (let x = -300; x <= 300; x += 30) tall(x, AVENUE.z + AVENUE.w / 2 + 3.5, 0);
  const lampsGroup = new THREE.Group();
  for (const [geos, mat] of [[poles, poleMat], [heads, headMat], [whites, whiteMat]]) {
    const m = new THREE.Mesh(mergeGeometries(geos), mat);
    m.castShadow = true; m.receiveShadow = true;
    lampsGroup.add(m);
  }
  root.add(lampsGroup);
  // pools of warm light on the ground at night (additive discs)
  {
    const [c, ctx] = [document.createElement('canvas'), null];
    c.width = c.height = 128;
    const x = c.getContext('2d');
    const gr = x.createRadialGradient(64, 64, 0, 64, 64, 64);
    gr.addColorStop(0, 'rgba(255,214,150,1)'); gr.addColorStop(0.4, 'rgba(255,190,120,0.45)'); gr.addColorStop(1, 'rgba(255,170,100,0)');
    x.fillStyle = gr; x.fillRect(0, 0, 128, 128);
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
    const poolMat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 });
    const geos = lampSpots.map(([px, pz, h]) => { const g = new THREE.PlaneGeometry(h * 1.6, h * 1.6); g.rotateX(-Math.PI / 2); g.translate(px, 0.08, pz); return g; });
    const pools = new THREE.Mesh(mergeGeometries(geos), poolMat);
    pools.renderOrder = 2;
    root.add(pools);
    night.pools = poolMat;
  }

  // ---------------------------------------------------------------- a small service building (red, as in the video)
  {
    const b = new THREE.Mesh(new THREE.BoxGeometry(9, 3.2, 4.5), new THREE.MeshStandardMaterial({ color: '#a8322c', roughness: 0.8 }));
    b.position.set(-60, 1.6, 34); b.rotation.y = 0.3; b.castShadow = b.receiveShadow = true;
    const roof = new THREE.Mesh(new THREE.BoxGeometry(10.4, 0.3, 5.8), new THREE.MeshStandardMaterial({ color: '#e9e6df', roughness: 0.7 }));
    roof.position.set(0, 1.75, 0); roof.castShadow = true;
    b.add(roof);
    root.add(b);
    obstacles.circles.push([-60, 34, 5]);
  }

  // ---------------------------------------------------------------- the JELEN TENKA letters (vertical garden)
  const letters = createLetters(flora, -33, 35.5, 0.42);
  root.add(letters.group);
  // a warm light from the lawn washes the letters at night
  const letterLight = new THREE.SpotLight('#ffd9a8', 0, 22, 0.55, 0.7, 1.2);
  letterLight.position.set(-33 + Math.sin(0.42) * 6, 0.4, 35.5 + Math.cos(0.42) * 6);
  letterLight.target.position.set(-33, 2.3, 35.5);
  root.add(letterLight, letterLight.target);
  obstacles.circles.push(...letters.circles);
  // the low hedge along the bike lane: a walker goes round it, through the gaps
  for (const [x0, x1] of [[-140, -26], [-18, 50], [56, 160]]) obstacles.segs.push([x0, LANE.z - LANE.w / 2 - 0.8, x1, LANE.z - LANE.w / 2 - 0.8]);

  const plants = flora.build();
  root.add(plants);

  // ---------------------------------------------------------------- the city
  root.add(createCity(night));

  // ---------------------------------------------------------------- far forest + cordillera
  {
    let blob = new THREE.IcosahedronGeometry(1, 3);
    blob.deleteAttribute('uv'); blob.deleteAttribute('normal');
    blob = mergeVertices(blob);
    const p = blob.attributes.position, v = V();
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i);
      const k = 1 + 0.14 * Math.sin(v.x * 5.1 + v.y * 3.3) + 0.1 * Math.sin(v.z * 6.7 - v.y * 4.1);
      v.multiplyScalar(k); v.y = v.y * 0.8 + 0.1;
      p.setXYZ(i, v.x, v.y, v.z);
    }
    blob.computeVertexNormals();
    const spots = [];
    for (let i = 0; i < 6000 && spots.length < 1500; i++) {
      const x = rr(-700, 700), z = rr(-700, 700);
      const r = Math.hypot(x, z);
      if (r < 150 || r > 700) continue;
      if (inCity(x, z) && rand() < 0.93) continue;
      spots.push([x, z]);
    }
    const im = new THREE.InstancedMesh(blob, new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 1 }), spots.length);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), col = new THREE.Color();
    const tones = ['#2f5326', '#3a5f2a', '#44692e', '#2c4a24', '#4f7534', '#3d6a30'];
    spots.forEach(([x, z], i) => {
      const s = rr(5, 10);
      q.setFromAxisAngle(V(0, 1, 0), rr(0, 6.28));
      m4.compose(V(x, s * rr(0.7, 1.0) + 1, z), q, V(s * rr(0.9, 1.3), s * rr(0.85, 1.2), s * rr(0.9, 1.3)));
      im.setMatrixAt(i, m4);
      im.setColorAt(i, col.set(tones[i % tones.length]).offsetHSL(0, rr(-0.04, 0.04), rr(-0.04, 0.03)));
    });
    root.add(im);
  }
  // the cordillera: blue ridges far off (the Andes foothills to the east), green hills nearer
  for (const [R, H, seed, color, y0] of [[900, 34, 2.1, '#4d6b4a', -4], [1350, 95, 4.7, '#5d7690', -6], [1700, 165, 1.3, '#7088a2', -8]]) {
    const seg = 220, pos = [], idx = [];
    for (let i = 0; i <= seg; i++) {
      const a = (i / seg) * Math.PI * 2;
      // the high range stands to the east/back (−z), lower elsewhere
      const east = 0.45 + 0.55 * Math.max(0, -Math.sin(a + 0.4));
      const h = H * east * (0.5 + 0.28 * Math.sin(a * 4 + seed) + 0.15 * Math.sin(a * 11.3 + seed * 2) + 0.07 * Math.sin(a * 29 + seed));
      const x = Math.cos(a) * R, z = Math.sin(a) * R;
      pos.push(x, y0, z, x * 0.985, Math.max(4, h), z * 0.985);
      if (i < seg) { const k = i * 2; idx.push(k, k + 2, k + 1, k + 1, k + 2, k + 3); }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    root.add(new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color, roughness: 1, side: THREE.DoubleSide })));
  }

  return {
    group: root,
    flora,
    wind: flora.wind,
    obstacles,
    letters: letters.group,
    lot: { x0: -190, x1: 190, z0: -135, z1: 140 },
    /** What's underfoot, for the footsteps. */
    surfaceAt(x, z) {
      const d = Math.hypot(x / RING.rx, z / RING.rz);
      if (Math.abs(d - 1) * (RING.rx + RING.rz) * 0.5 < RING.w / 2 + 0.1) return 'concrete';
      if (z > LANE.z - LANE.w / 2 && z < LANE.z + LANE.w / 2 + 3.2) return 'concrete';
      return 'grass';
    },
    setNight(k) {
      headMat.emissiveIntensity = k * 2.4;
      letterLight.intensity = k * 90;
      night.pools.opacity = k * 0.55;
      night.value = k;
    },
    update(t) { flora.update(t); },
  };
}

// ====================================================================== letters
// Bold block letters, unit height, stroke s. [outline, holes?]
const S_ = 0.25;
const GLYPHS = {
  J: { W: 0.66, pts: [[0.66 - S_, 1], [0.66, 1], [0.66, 0], [0, 0], [0, 0.34], [S_, 0.34], [S_, S_], [0.66 - S_, S_]] },
  E: { W: 0.66, pts: [[0, 0], [0.66, 0], [0.66, S_], [S_, S_], [S_, 0.5 - S_ / 2], [0.58, 0.5 - S_ / 2], [0.58, 0.5 + S_ / 2], [S_, 0.5 + S_ / 2], [S_, 1 - S_], [0.66, 1 - S_], [0.66, 1], [0, 1]] },
  L: { W: 0.62, pts: [[0, 0], [0.62, 0], [0.62, S_], [S_, S_], [S_, 1], [0, 1]] },
  N: { W: 0.8, pts: [[0, 0], [S_, 0], [S_, 0.6], [0.8 - S_, 0], [0.8, 0], [0.8, 1], [0.8 - S_, 1], [0.8 - S_, 0.4], [S_, 1], [0, 1]] },
  T: { W: 0.72, pts: [[0.36 - S_ / 2, 0], [0.36 + S_ / 2, 0], [0.36 + S_ / 2, 1 - S_], [0.72, 1 - S_], [0.72, 1], [0, 1], [0, 1 - S_], [0.36 - S_ / 2, 1 - S_]] },
  K: { W: 0.76, pts: [[0, 0], [S_, 0], [S_, 0.36], [0.47, 0], [0.76, 0], [0.42, 0.5], [0.76, 1], [0.47, 1], [S_, 0.64], [S_, 1], [0, 1]] },
  A: { W: 0.84, pts: [[0, 0], [S_ + 0.02, 0], [0.29, 0.26], [0.55, 0.26], [0.84 - S_ - 0.02, 0], [0.84, 0], [0.55, 1], [0.29, 1]],
    hole: [[0.35, 0.47], [0.49, 0.47], [0.42, 0.74]] },
};
function inPoly(x, y, pts) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i], [xj, yj] = pts[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** "JELEN" over "TENKA": planter letters of dark weathered concrete, their faces covered in plants and flowers. */
function createLetters(flora, cx, cz, ry) {
  const H = 1.9, gap = 0.16, depth = 0.6, lineGap = 0.24, base = 0.3;
  const group = new THREE.Group();
  group.position.set(cx, 0, cz); group.rotation.y = ry;
  const geos = [];
  const spots = [];
  const lines = ['TENKA', 'JELEN'];  // bottom line first
  let maxW = 0;
  lines.forEach((word, li) => {
    const total = [...word].reduce((a, ch) => a + GLYPHS[ch].W * H, 0) + gap * (word.length - 1);
    maxW = Math.max(maxW, total);
    let x = -total / 2;
    const y = base + li * (H + lineGap);
    for (const ch of word) {
      const gl = GLYPHS[ch];
      const shape = new THREE.Shape(gl.pts.map(([px, py]) => new THREE.Vector2(px * H, py * H)));
      if (gl.hole) shape.holes.push(new THREE.Path(gl.hole.map(([px, py]) => new THREE.Vector2(px * H, py * H))));
      const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelThickness: 0.04, bevelSize: 0.035, bevelSegments: 1 });
      g.translate(x, y, -depth / 2);
      geos.push(g.toNonIndexed());
      spots.push({ x, y, gl });
      x += gl.W * H + gap;
    }
  });
  // plinth
  const plinth = new THREE.BoxGeometry(maxW + 1.2, base, depth + 1.0);
  plinth.translate(0, base / 2, 0);
  const merged = mergeGeometries(geos.map((g) => { g.clearGroups(); return g; }));
  const letterMesh = new THREE.Mesh(merged, new THREE.MeshStandardMaterial({ color: '#5a5045', roughness: 0.95 }));
  letterMesh.castShadow = letterMesh.receiveShadow = true;
  const plinthMesh = new THREE.Mesh(plinth, new THREE.MeshStandardMaterial({ color: '#b9b4aa', roughness: 0.9 }));
  plinthMesh.receiveShadow = true; plinthMesh.castShadow = true;
  group.add(letterMesh, plinthMesh);

  // plants over each letter's face: moss, ferns and small leaves, with pink, red and white flowers
  const cos = Math.cos(ry), sin = Math.sin(ry);
  const toWorld = (lx, ly, lz) => new THREE.Vector3(cx + lx * cos + lz * sin, ly, cz - lx * sin + lz * cos);
  const nrm = new THREE.Vector3(sin, 0.25, cos).normalize();
  const G = flora.GREENS, col = new THREE.Color();
  const FLOWERS = ['#e24a7a', '#f06b9a', '#d8302e', '#ffffff', '#f2c230', '#b04fc0'];
  for (const { x, y, gl } of spots) {
    // the frame of each letter stays bare: plant only where the point is well inside the outline
    const m = 0.055;
    const inner = (u, v) => [[0, 0], [m, 0], [-m, 0], [0, m], [0, -m]].every(([du, dv]) =>
      inPoly(u + du, v + dv, gl.pts) && !(gl.hole && inPoly(u + du, v + dv, gl.hole)));
    for (let i = 0; i < 1100; i++) {
      const u = rand() * gl.W, v = rand();
      if (!inner(u, v)) continue;
      const p = toWorld(x + u * H, y + v * H, depth / 2 + rr(0.0, 0.05));
      const palette = rand() < 0.45 ? G.moss : rand() < 0.5 ? G.lime : G.tropic;
      flora.cluster(flora.B.hedges, p.x, p.y, p.z, rr(0.06, 0.11), palette, { density: 240, card: 0.11, squash: 0.5 });
      if (rand() < 0.16) {
        col.set(pick(FLOWERS)).offsetHSL(0, 0, rr(-0.05, 0.05));
        flora.B.blossoms.card(p.clone().addScaledVector(nrm, 0.07), nrm, rr(0.1, 0.16), col);
      }
    }
    // a few trailing ferns spilling from the tops of the letters
    for (let k = 0; k < 3; k++) {
      const u = rr(0.1, gl.W - 0.1);
      if (!inPoly(u, 0.97, gl.pts)) continue;
      const p = toWorld(x + u * H, y + H + 0.05, rr(-0.1, 0.2));
      flora.cluster(flora.B.trees, p.x, p.y, p.z, rr(0.16, 0.26), G.moss, { density: 80, card: 0.2, squash: 1.1 });
    }
  }
  const circles = [];
  for (let lx = -maxW / 2 - 0.4; lx <= maxW / 2 + 0.4; lx += 0.9) { const p = toWorld(lx, 0, 0); circles.push([p.x, p.z, 0.75]); }
  return { group, circles };
}

// ====================================================================== city
// Blocks of 2–5 storey concrete houses, painted in the colours of the coast and the Andes.
function inCity(x, z) {
  if (z < AVENUE.z - AVENUE.w / 2 - 8) return true;                  // across the avenue
  if (x < -230) return true;                                          // west side
  if (z > 160) return true;                                           // behind the home view
  return false;
}

function createCity(night) {
  const lots = [];
  const B = 44, street = 10;
  for (let bx = -720; bx < 720; bx += B + street) {
    for (let bz = -720; bz < 720; bz += B + street) {
      for (let i = 0; i < 4; i++) for (let j = 0; j < 3; j++) {
        // a block = a ring of lots facing the streets
        const edge = i === 0 || i === 3 || j === 0 || j === 2;
        if (!edge && rand() < 0.6) continue;
        const w = B / 4, d = B / 3; // ~11 × 15 m lots
        const x = bx + i * w + w / 2, z = bz + j * d + d / 2;
        const r = Math.hypot(x, z);
        if (r > 720 || !inCity(x, z)) continue;
        if (z < AVENUE.z - AVENUE.w / 2 - 8 && z > AVENUE.z - AVENUE.w / 2 - 20) continue;
        const floors = rand() < 0.05 ? 5 + Math.floor(rand() * 4) : 2 + Math.floor(rand() * 2.6);
        lots.push({ x: x + rr(-0.6, 0.6), z: z + rr(-0.6, 0.6), w: w * rr(0.82, 0.98), d: d * rr(0.75, 0.95), h: floors * 3.1 + rr(-0.3, 0.6) });
      }
    }
  }
  const geo = new THREE.BoxGeometry(1, 1, 1);
  geo.translate(0, 0.5, 0);
  const mat = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.85 });
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uNight = night;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vCW;\nvarying vec3 vCN;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        {
          vec4 wp = vec4(transformed, 1.0);
          vec3 wn = objectNormal;
          #ifdef USE_INSTANCING
            wp = instanceMatrix * wp;
            wn = mat3(instanceMatrix) * wn;
          #endif
          vCW = (modelMatrix * wp).xyz;
          vCN = normalize(mat3(modelMatrix) * wn);
        }`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec3 vCW;
        varying vec3 vCN;
        uniform float uNight;
        float jtWin = 0.0, jtLit = 0.0;
        float jtHash(vec2 p) { return fract(sin(dot(p, vec2(41.3, 289.1))) * 15731.743); }`)
      .replace('#include <map_fragment>', `#include <map_fragment>
        {
          float side = 1.0 - step(0.5, abs(vCN.y));
          float hor = abs(vCN.z) > 0.5 ? vCW.x : vCW.z;
          vec2 cell = vec2(hor / 2.2, (vCW.y - 0.3) / 3.1);
          vec2 f = fract(cell);
          float w = step(0.3, f.x) * step(f.x, 0.7) * step(0.38, f.y) * step(f.y, 0.82);
          // ground floor: wide shop shutters
          float ground = 1.0 - step(3.1, vCW.y);
          float shop = step(0.08, fract(hor / 5.4)) * step(fract(hor / 5.4), 0.92) * step(0.25, vCW.y) * step(vCW.y, 2.6);
          w = mix(w, shop * 0.7, ground);
          jtWin = w * side;
          jtLit = step(0.58, jtHash(floor(cell) + floor(vCW.xz / 40.0)));
          vec3 glass = mix(vec3(0.17, 0.2, 0.23), vec3(0.42, 0.4, 0.36), ground);
          diffuseColor.rgb = mix(diffuseColor.rgb, glass, jtWin * 0.85);
          // grime at the base of the walls, a lighter cornice line on top floors
          diffuseColor.rgb *= mix(0.82, 1.0, smoothstep(0.0, 2.0, vCW.y));
        }`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        totalEmissiveRadiance += vec3(1.0, 0.78, 0.5) * jtWin * jtLit * uNight * 1.4;`);
  };
  const im = new THREE.InstancedMesh(geo, mat, lots.length);
  const m4 = new THREE.Matrix4(), col = new THREE.Color();
  const PAINT = ['#efe6d2', '#e8d7b8', '#f2c9a8', '#d9e3e6', '#c9d8c0', '#f4e3a0', '#e3b9a2', '#dcdcd6', '#b8c4cc', '#f0f0ea', '#e6a98c', '#c4d6e8', '#bfbfb8'];
  lots.forEach((L, i) => {
    m4.makeScale(L.w, L.h, L.d).setPosition(L.x, 0, L.z);
    im.setMatrixAt(i, m4);
    im.setColorAt(i, col.set(pick(PAINT)).offsetHSL(0, rr(-0.03, 0.03), rr(-0.04, 0.03)));
  });
  im.castShadow = false; im.receiveShadow = true;
  // rooftop water tanks and slabs, the city's skyline texture
  const tankGeo = new THREE.CylinderGeometry(0.7, 0.7, 1.4, 10); tankGeo.translate(0, 0.7, 0);
  const tops = lots.filter(() => rand() < 0.35);
  const tanks = new THREE.InstancedMesh(tankGeo, new THREE.MeshStandardMaterial({ color: '#2b3a4a', roughness: 0.6 }), tops.length);
  tops.forEach((L, i) => { m4.makeTranslation(L.x + rr(-L.w / 4, L.w / 4), L.h, L.z + rr(-L.d / 4, L.d / 4)); tanks.setMatrixAt(i, m4); });
  const g = new THREE.Group();
  g.add(im, tanks);
  return g;
}
