import * as THREE from 'three';
import { rand, rr } from './util.js';

/** Rain streaks in a box that follows the camera; falling is done in the vertex shader. */
export function createRain(count = 7000) {
  const BOX = new THREE.Vector3(70, 34, 70);
  const seeds = new Float32Array(count * 2 * 4);
  for (let i = 0; i < count; i++) {
    const x = rand() * BOX.x, y = rand() * BOX.y, z = rand() * BOX.z, sp = rr(0.85, 1.25);
    seeds.set([x, y, z, sp, x, y, z, sp], i * 8);
  }
  const end = new Float32Array(count * 2);
  for (let i = 0; i < count; i++) end[i * 2 + 1] = 1;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 2 * 3), 3));
  g.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 4));
  g.setAttribute('aEnd', new THREE.BufferAttribute(end, 1));
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, fog: false,
    uniforms: {
      uTime: { value: 0 }, uCenter: { value: new THREE.Vector3() }, uBox: { value: BOX },
      uAmount: { value: 0 }, uWind: { value: new THREE.Vector2(0.15, 0.05) }, uColor: { value: new THREE.Color('#dce9f0') },
    },
    vertexShader: /* glsl */ `
      attribute vec4 aSeed;
      attribute float aEnd;
      uniform float uTime, uAmount;
      uniform vec3 uCenter, uBox;
      uniform vec2 uWind;
      varying float vA;
      void main() {
        vec3 p = aSeed.xyz;
        float fall = uTime * 26.0 * aSeed.w;
        p.y = mod(p.y - fall, uBox.y);
        p.xz = mod(p.xz + uWind * (uBox.y - p.y) - uCenter.xz, uBox.xz) - uBox.xz * 0.5;
        vec3 w = vec3(uCenter.x + p.x, p.y, uCenter.z + p.z);
        // align the streak with its velocity
        vec3 vel = normalize(vec3(uWind.x, -1.0, uWind.y));
        w += vel * aEnd * 0.9 * aSeed.w;
        // only a share of drops is visible, by intensity
        float keep = step(fract(aSeed.x * 13.37 + aSeed.z * 7.11), uAmount);
        vA = keep * (0.25 + 0.2 * aSeed.w) * (1.0 - aEnd * 0.7);
        gl_Position = projectionMatrix * viewMatrix * vec4(w, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      varying float vA;
      void main() {
        if (vA < 0.01) discard;
        gl_FragColor = vec4(uColor, vA);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const lines = new THREE.LineSegments(g, mat);
  lines.frustumCulled = false;
  lines.renderOrder = 5;
  return {
    mesh: lines,
    update(t, camera, amount, windVec) {
      mat.uniforms.uTime.value = t;
      mat.uniforms.uAmount.value = amount;
      mat.uniforms.uCenter.value.set(camera.position.x, 0, camera.position.z);
      mat.uniforms.uWind.value.copy(windVec);
      lines.visible = amount > 0.005;
    },
    setColor(c) { mat.uniforms.uColor.value.copy(c); },
  };
}

/** Fireflies drifting over the hedges and by the steps at night. */
export function createFireflies(count = 70) {
  const base = [];
  const pos = new Float32Array(count * 3);
  const seed = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    // around the hedge ring of the monument and over the flower beds
    const a = rand() * Math.PI * 2, r = rr(10, 30);
    const p = new THREE.Vector3(Math.cos(a) * r * 1.3, rr(0.5, 2.6), Math.sin(a) * r);
    base.push(p);
    seed[i] = rand() * 100;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
    uniforms: { uTime: { value: 0 }, uOpacity: { value: 0 }, uPixel: { value: 1 } },
    vertexShader: /* glsl */ `
      attribute float aSeed;
      uniform float uTime, uPixel;
      varying float vBlink;
      void main() {
        vBlink = smoothstep(0.2, 1.0, sin(uTime * (0.7 + fract(aSeed) * 0.9) + aSeed) * 0.5 + 0.5);
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = uPixel * 26.0 / -mv.z * 6.0;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform float uOpacity;
      varying float vBlink;
      void main() {
        float d = length(gl_PointCoord - 0.5);
        float core = smoothstep(0.12, 0.0, d);
        float glow = smoothstep(0.5, 0.0, d) * 0.35;
        gl_FragColor = vec4(vec3(1.0, 0.92, 0.45) * (core + glow) * 2.0, (core + glow) * vBlink * uOpacity);
      }`,
  });
  const pts = new THREE.Points(g, mat);
  pts.frustumCulled = false;
  return {
    mesh: pts,
    material: mat,
    update(t, opacity) {
      mat.uniforms.uTime.value = t;
      mat.uniforms.uOpacity.value = opacity;
      pts.visible = opacity > 0.01;
      if (!pts.visible) return;
      for (let i = 0; i < count; i++) {
        const b = base[i], s = seed[i];
        pos[i * 3] = b.x + Math.sin(t * 0.31 + s) * 0.9 + Math.sin(t * 0.73 + s * 2) * 0.3;
        pos[i * 3 + 1] = b.y + Math.sin(t * 0.45 + s * 3) * 0.5;
        pos[i * 3 + 2] = b.z + Math.cos(t * 0.27 + s) * 0.9;
      }
      g.attributes.position.needsUpdate = true;
    },
  };
}
