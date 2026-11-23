import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { rand, rr } from './util.js';
import { wispTexture } from './textures.js';

/** Stylised cumulus clouds (merged spheres with flattened bottoms) + soft wisps.
 *  More of them show up as the sky gets cloudier. */
export function createClouds() {
  const group = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({
    color: '#ffffff', roughness: 1, metalness: 0,
    emissive: new THREE.Color('#b7d6ea'), emissiveIntensity: 0.42, envMapIntensity: 0.6,
  });

  const COUNT = 80;
  const clouds = [];
  for (let i = 0; i < COUNT; i++) {
    const width = rr(35, 85);
    const geos = [];
    const big = new THREE.SphereGeometry(width * 0.27, 28, 18);
    big.translate(0, width * 0.1, 0);
    geos.push(big);
    const n = 6 + Math.floor(rand() * 7);
    for (let j = 0; j < n; j++) {
      const x = (rand() - 0.5) * width;
      const edge = 1 - Math.abs(x) / (width * 0.5);
      const r = width * (0.1 + rand() * 0.12) * (0.55 + edge * 0.6);
      const s = new THREE.SphereGeometry(r, 24, 16);
      s.translate(x, r * 0.2 + rand() * width * 0.12 * edge, (rand() - 0.5) * width * 0.3);
      geos.push(s);
    }
    const g = mergeGeometries(geos);
    const pos = g.attributes.position;
    for (let k = 0; k < pos.count; k++) {
      const y = pos.getY(k);
      if (y < 0) pos.setY(k, y * 0.12);
    }
    g.computeVertexNormals();
    const m = new THREE.Mesh(g, mat);
    // first 46 follow the original even ring; the rest fill the gaps for overcast skies
    const a = i < 46 ? (i / 46) * Math.PI * 2 + rr(-0.15, 0.15) : rand() * Math.PI * 2;
    const dist = rr(380, 1300);
    m.position.set(Math.cos(a) * dist, rr(150, 260) + dist * 0.05, Math.sin(a) * dist);
    m.lookAt(0, m.position.y, 0);
    const sc = rr(1.8, 3.0); // big tropical cumulus, high and far
    m.scale.setScalar(sc);
    m.userData = { order: i < 46 ? 0 : (i - 46) / 34, sc, show: i < 46 ? 1 : 0 };
    m.visible = i < 46;
    group.add(m);
    clouds.push(m);
  }

  const wtex = wispTexture();
  const wisps = [];
  for (let i = 0; i < 16; i++) {
    const sm = new THREE.SpriteMaterial({ map: wtex, transparent: true, opacity: rr(0.45, 0.8), depthWrite: false, fog: true });
    const s = new THREE.Sprite(sm);
    const a = rand() * Math.PI * 2, dist = rr(350, 800);
    s.position.set(Math.cos(a) * dist, rr(60, 200), Math.sin(a) * dist);
    s.scale.set(rr(220, 420), rr(40, 70), 1);
    s.userData.base = sm.opacity;
    group.add(s);
    wisps.push(s);
  }

  let cover = 0;
  return {
    group,
    material: mat,
    setLook(color, emissive, ei, c) {
      mat.color.copy(color);
      mat.emissive.copy(emissive);
      mat.emissiveIntensity = ei;
      cover = c;
      for (const w of wisps) {
        w.material.opacity = w.userData.base * (1 - c * 0.5);
        w.material.color.copy(color);
      }
    },
    update(dt) {
      group.rotation.y += dt * (0.004 + cover * 0.006);
      for (const m of clouds) {
        const u = m.userData;
        const want = u.order === 0 ? 1 : (cover > u.order * 0.9 ? 1 : 0);
        u.show += (want - u.show) * Math.min(1, dt * 0.4);
        m.visible = u.show > 0.02;
        // overcast clouds swell and sag a little
        m.scale.set(u.sc * (0.2 + 0.8 * u.show) * (1 + cover * 0.25), u.sc * (0.2 + 0.8 * u.show), u.sc * (0.2 + 0.8 * u.show) * (1 + cover * 0.25));
      }
    },
  };
}
