import * as THREE from 'three';
import { rand, rr } from './util.js';

export const SKY = {
  top: '#1a6aa5',
  mid: '#4aa6d6',
  horizon: '#c3e7ee',
};

/** One shared material: the dome shader only uses the direction, so it works at any radius (main sky + env map). */
export function makeSkyMaterial(sunDir) {
  return new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      uTop: { value: new THREE.Color(SKY.top) },
      uMid: { value: new THREE.Color(SKY.mid) },
      uHorizon: { value: new THREE.Color(SKY.horizon) },
      uSunDir: { value: sunDir.clone() },
      uSunColor: { value: new THREE.Color('#fff0d0') },
      uSunVis: { value: 1 },
      uMoonDir: { value: new THREE.Vector3(0, -1, 0) },
      uMist: { value: 0 },
      uFlash: { value: 0 },
    },
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uTop, uMid, uHorizon, uSunDir, uSunColor, uMoonDir;
      uniform float uSunVis, uMist, uFlash;
      varying vec3 vDir;
      void main() {
        vec3 d = normalize(vDir);
        float h = d.y;
        vec3 col = mix(uHorizon, uMid, smoothstep(-0.01, 0.16, h));
        col = mix(col, uTop, smoothstep(0.18, 0.85, h));
        col = mix(col, uHorizon * 1.04, exp(-abs(h) * 40.0) * 0.45);
        float s = max(dot(d, uSunDir), 0.0);
        // wide warm glow around the sun (strong at sunrise/sunset), plus the disc
        col += uSunColor * (pow(s, 6.0) * 0.28 + pow(s, 60.0) * 0.35) * uSunVis;
        col += uSunColor * smoothstep(0.9993, 0.9997, s) * 6.0 * uSunVis * (1.0 - uMist);
        float m = max(dot(d, uMoonDir), 0.0);
        col += vec3(0.55, 0.65, 0.9) * pow(m, 30.0) * 0.12;
        col = mix(col, uHorizon, uMist * mix(0.97, 0.8, smoothstep(0.0, 1.0, h)));
        col *= 1.0 + uFlash * 2.5;
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
}

export function createSky(material, radius = 2000) {
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(radius, 48, 24), material);
  mesh.renderOrder = -1;
  mesh.frustumCulled = false;
  return mesh;
}

/** Twinkling stars on the upper dome. */
export function createStars(count = 2600, radius = 1850) {
  const pos = new Float32Array(count * 3);
  const seed = new Float32Array(count);
  const size = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    const u = rand(), v = rr(0.02, 1);
    const th = u * Math.PI * 2, y = v * v * 0.98 + 0.02;
    const r = Math.sqrt(1 - y * y);
    pos.set([Math.cos(th) * r * radius, y * radius, Math.sin(th) * r * radius], i * 3);
    seed[i] = rand() * 100;
    size[i] = rand() < 0.06 ? rr(2.6, 4.0) : rr(1.0, 2.2);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
  g.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, fog: false, blending: THREE.AdditiveBlending,
    uniforms: { uTime: { value: 0 }, uOpacity: { value: 0 }, uPixel: { value: 1 } },
    vertexShader: /* glsl */ `
      attribute float aSeed, aSize;
      uniform float uTime, uPixel;
      varying float vTw;
      void main() {
        vTw = 0.6 + 0.4 * sin(uTime * (1.0 + fract(aSeed) * 2.5) + aSeed);
        gl_PointSize = aSize * uPixel;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform float uOpacity;
      varying float vTw;
      void main() {
        float d = length(gl_PointCoord - 0.5);
        float a = smoothstep(0.5, 0.0, d);
        gl_FragColor = vec4(vec3(0.85, 0.9, 1.0), a * vTw * uOpacity);
      }`,
  });
  const pts = new THREE.Points(g, mat);
  pts.frustumCulled = false;
  pts.renderOrder = 0;
  return pts;
}

/** A soft moon disc + halo, placed on the dome every frame. */
export function createMoon() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const ctx = c.getContext('2d');
  const halo = ctx.createRadialGradient(128, 128, 20, 128, 128, 128);
  halo.addColorStop(0, 'rgba(210,225,255,0.55)');
  halo.addColorStop(0.3, 'rgba(180,200,255,0.12)');
  halo.addColorStop(1, 'rgba(180,200,255,0)');
  ctx.fillStyle = halo; ctx.fillRect(0, 0, 256, 256);
  ctx.fillStyle = '#f4f1e6';
  ctx.beginPath(); ctx.arc(128, 128, 30, 0, 7); ctx.fill();
  ctx.fillStyle = 'rgba(160,165,180,0.35)';
  for (const [x, y, r] of [[118, 120, 8], [140, 136, 6], [130, 112, 4], [116, 140, 5], [142, 118, 3]]) {
    ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, fog: false, opacity: 0 });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(260, 260), mat);
  m.renderOrder = 0;
  m.frustumCulled = false;
  return m;
}

/** Rainbow arc opposite the sun. */
export function createRainbow() {
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, fog: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
    uniforms: { uOpacity: { value: 0 } },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */ `
      uniform float uOpacity;
      varying vec2 vUv;
      vec3 spectrum(float x) {
        return clamp(vec3(abs(x * 6.0 - 3.0) - 1.0, 2.0 - abs(x * 6.0 - 2.0), 2.0 - abs(x * 6.0 - 4.0)), 0.0, 1.0);
      }
      void main() {
        float x = vUv.y;                       // across the band
        float band = smoothstep(0.0, 0.25, x) * smoothstep(1.0, 0.75, x);
        float fadeEnds = smoothstep(0.0, 0.25, vUv.x) * smoothstep(1.0, 0.75, vUv.x);
        gl_FragColor = vec4(spectrum(1.0 - x) * 0.5, band * fadeEnds * uOpacity);
      }`,
  });
  // half-ring, uv.x along the arc, uv.y across
  const inner = 1150, outer = 1260, seg = 128;
  const pos = [], uv = [], idx = [];
  for (let i = 0; i <= seg; i++) {
    const a = (i / seg) * Math.PI;
    for (let j = 0; j < 2; j++) {
      const r = j ? outer : inner;
      pos.push(Math.cos(a) * r, Math.sin(a) * r, 0);
      uv.push(i / seg, j);
    }
    if (i < seg) { const k = i * 2; idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  const m = new THREE.Mesh(g, mat);
  m.frustumCulled = false;
  return m;
}
