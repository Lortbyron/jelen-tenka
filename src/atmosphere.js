import * as THREE from 'three';

// Adapted from Casa Marfil for the equator: 12-hour days, sun almost overhead at noon, humid haze.

// ------------------------------------------------------------------ palettes
const DAY = {
  top: '#2d6fae', mid: '#6eaedb', hor: '#dde9ea',
  sun: '#fff0d8', sunI: 2.9, hemiS: '#d6ebff', hemiG: '#7d8a4c', hemiI: 1.0,
  cloud: '#ffffff', cloudE: '#c4d8e8', cloudEI: 0.42, night: 0, env: 0.55,
};
const NIGHT = {
  top: '#071230', mid: '#13295a', hor: '#2a4a74',
  sun: '#b4c8ff', sunI: 0.75, hemiS: '#5a7ab8', hemiG: '#1a2a24', hemiI: 0.55,
  cloud: '#4a5e84', cloudE: '#1f2e52', cloudEI: 0.35, night: 1, env: 0.28,
};
const KEYS = [
  { h: 0, ...NIGHT },
  { h: 4.6, ...NIGHT, hor: '#30507a' },
  { h: 5.55, top: '#1b2c57', mid: '#56628f', hor: '#e0a08e', sun: '#ff9e7a', sunI: 0.6, hemiS: '#8d8fb8', hemiG: '#3a3a2c', hemiI: 0.5,
    cloud: '#c8a0a8', cloudE: '#a87a8c', cloudEI: 0.35, night: 0.55, env: 0.35 },
  { h: 6.8, top: '#3a6ea6', mid: '#8db4d8', hor: '#ffd0a4', sun: '#ffbd85', sunI: 2.0, hemiS: '#ffe0c8', hemiG: '#6f7444', hemiI: 0.85,
    cloud: '#fff0e4', cloudE: '#f4c0a8', cloudEI: 0.42, night: 0, env: 0.5 },
  { h: 9.5, ...DAY },
  { h: 15.0, ...DAY },
  // late afternoon: the light of the reference sheets — warm, low, long shadows
  { h: 16.9, top: '#2f68a4', mid: '#7fb2d8', hor: '#eadfc8', sun: '#ffd8a8', sunI: 2.9, hemiS: '#ffe8cc', hemiG: '#7d8448', hemiI: 0.95,
    cloud: '#fffaf2', cloudE: '#e6dccd', cloudEI: 0.4, night: 0, env: 0.52 },
  { h: 18.1, top: '#27427a', mid: '#a07896', hor: '#ff9e70', sun: '#ff8048', sunI: 1.4, hemiS: '#ffb8a8', hemiG: '#4a4434', hemiI: 0.65,
    cloud: '#ffc8a8', cloudE: '#e8907c', cloudEI: 0.5, night: 0.15, env: 0.4 },
  { h: 18.9, top: '#13224f', mid: '#3a4882', hor: '#8f7aa8', sun: '#9fb4ff', sunI: 0.5, hemiS: '#6a7cb8', hemiG: '#22302c', hemiI: 0.48,
    cloud: '#6a6f98', cloudE: '#383e68', cloudEI: 0.35, night: 0.7, env: 0.3 },
  { h: 20, ...NIGHT },
  { h: 24, ...NIGHT },
];
const COLOR_KEYS = ['top', 'mid', 'hor', 'sun', 'hemiS', 'hemiG', 'cloud', 'cloudE'];
const NUM_KEYS = ['sunI', 'hemiI', 'cloudEI', 'night', 'env'];
for (const k of KEYS) for (const c of COLOR_KEYS) k[c] = new THREE.Color(k[c]);

function samplePalette(h, out) {
  h = ((h % 24) + 24) % 24;
  let i = 0;
  while (i < KEYS.length - 2 && KEYS[i + 1].h <= h) i++;
  const a = KEYS[i], b = KEYS[i + 1];
  const t = THREE.MathUtils.smoothstep(h, a.h, b.h);
  for (const c of COLOR_KEYS) (out[c] ||= new THREE.Color()).copy(a[c]).lerp(b[c], t);
  for (const n of NUM_KEYS) out[n] = a[n] + (b[n] - a[n]) * t;
  return out;
}

// ------------------------------------------------------------------ weather
export const WEATHER = {
  clear: { cloud: 0, rain: 0, mist: 0, wind: 0.3, storm: 0 },
  partly: { cloud: 0.22, rain: 0, mist: 0.03, wind: 0.35, storm: 0 },
  cloudy: { cloud: 0.55, rain: 0, mist: 0.05, wind: 0.45, storm: 0 },
  rain: { cloud: 0.8, rain: 0.6, mist: 0.15, wind: 0.5, storm: 0 },
  storm: { cloud: 1, rain: 1, mist: 0.2, wind: 0.95, storm: 1 },
  fog: { cloud: 0.25, rain: 0, mist: 1, wind: 0.08, storm: 0 },
};

/** Sun/moon direction for an hour of the day. Santo Domingo sits on the equator: sunrise ~6:05, sunset ~18:15,
 *  the sun climbs out of the cordillera in the east (−z), passes high to the south (+x) and sets in the west (+z),
 *  in front of the face. */
const EAST = new THREE.Vector3(0, 0, -1), SOUTH = new THREE.Vector3(1, 0, 0);
export function celestial(h, out = new THREE.Vector3(), isMoon = false) {
  const hh = isMoon ? (h + 12) % 24 : h;
  const f = (hh - 6.1) / 12.15;
  const a = f * Math.PI;
  return out.copy(EAST).multiplyScalar(Math.cos(a)).addScaledVector(SOUTH, isMoon ? 0.15 : 0.36).add(new THREE.Vector3(0, Math.sin(a) * 0.93, 0)).normalize();
}

const tmp = new THREE.Color();
function overcast(c, k) {
  const l = c.r * 0.3 + c.g * 0.59 + c.b * 0.11;
  tmp.setRGB(l * 0.92, l * 0.97, l * 1.05);
  return c.lerp(tmp, k * 0.8).multiplyScalar(1 - k * 0.35);
}

export class Atmosphere {
  constructor(o) {
    Object.assign(this, o); // scene, renderer, skyMat, sun, hemi, clouds, stars, moon, rainbow, rain, fireflies, world, envScene, envGround
    this.hour = 17;
    this.weatherName = 'clear';
    this.w = { ...WEATHER.clear };
    this.target = { ...WEATHER.clear };
    this.pal = {};
    this.sunDir = new THREE.Vector3();
    this.moonDir = new THREE.Vector3();
    this.lightDir = new THREE.Vector3();
    this.flash = 0;
    this._nextBolt = 8;
    this._rainbow = 0;
    this._hadRain = 0;
    this._env = { hour: -99, cloud: -1, mist: -1, t: 0 };
    this.pmrem = new THREE.PMREMGenerator(this.renderer);
    this.windVec = new THREE.Vector2();
  }

  setWeather(name) {
    this.weatherName = name;
    Object.assign(this.target, WEATHER[name]);
  }

  update(t, dt, camera) {
    const W = this.w, T = this.target;
    const k = 1 - Math.exp(-dt * 0.25);
    for (const key of Object.keys(W)) W[key] += (T[key] - W[key]) * k;

    const P = samplePalette(this.hour, this.pal);
    celestial(this.hour, this.sunDir);
    celestial(this.hour, this.moonDir, true);

    const c = W.cloud;
    for (const key of ['top', 'mid', 'hor']) overcast(P[key], c);
    P.cloud.lerp(tmp.set('#8794a3').multiplyScalar(0.5 + (1 - P.night) * 0.5), c * 0.75);
    P.cloudE.multiplyScalar(1 - c * 0.5);
    const hor = P.hor;
    if (W.mist > 0) hor.lerp(tmp.setRGB(0.78, 0.82, 0.84).multiplyScalar(1 - P.night * 0.85), W.mist * 0.7);

    // lightning
    if (W.storm > 0.5) {
      this._nextBolt -= dt;
      if (this._nextBolt <= 0) {
        this._bolt = { t: 0, dist: Math.random() }; this._nextBolt = 5 + Math.random() * 12;
        this.onBolt?.(this._bolt.dist);
      }
    }
    if (this._bolt) {
      const b = this._bolt; b.t += dt;
      const fl = (b.t < 0.08 ? 1 : 0) + (b.t > 0.16 && b.t < 0.24 ? 0.7 : 0) + Math.max(0, 0.5 - b.t) * 0.6;
      this.flash = fl * (1 - b.dist * 0.6);
      if (b.t > 0.6) { this._bolt = null; this.flash = 0; }
    }
    const F = this.flash;

    // sky
    const su = this.skyMat.uniforms;
    su.uTop.value.copy(P.top); su.uMid.value.copy(P.mid); su.uHorizon.value.copy(hor);
    su.uSunDir.value.copy(this.sunDir);
    su.uMoonDir.value.copy(this.moonDir);
    su.uSunColor.value.copy(P.sun);
    su.uSunVis.value = THREE.MathUtils.smoothstep(this.sunDir.y, -0.1, 0.03) * (1 - c * 0.85);
    su.uMist.value = Math.max(W.mist, W.rain * 0.55, c * 0.25);
    su.uFlash.value = F;

    // lights
    const sunUp = THREE.MathUtils.smoothstep(this.sunDir.y, -0.04, 0.04);
    this.lightDir.copy(this.moonDir).lerp(this.sunDir, sunUp);
    if (this.lightDir.y < 0.12) this.lightDir.y = 0.12;
    this.lightDir.normalize();
    this.sun.position.copy(this.lightDir).multiplyScalar(90).add(this.sun.target.position);
    this.sun.color.copy(P.sun);
    this.sun.intensity = P.sunI * (1 - c * 0.75) * (1 - W.mist * 0.4);
    this.sun.shadow.intensity = 1 - c * 0.7 - W.mist * 0.2;
    this.hemi.color.copy(P.hemiS).lerp(tmp.set('#dfe6ff'), F * 0.6);
    this.hemi.groundColor.copy(P.hemiG);
    this.hemi.intensity = P.hemiI * (1 - c * 0.15) + F * 3;

    // fog: a little aerial perspective on a clear day, thick in mist and rain
    const near = THREE.MathUtils.lerp(160, 10, Math.max(W.mist, W.rain * 0.5));
    const far = THREE.MathUtils.lerp(2600, 160, Math.max(W.mist, W.rain * 0.6, c * 0.18));
    this.scene.fog.color.copy(hor);
    this.scene.fog.near = near; this.scene.fog.far = far;

    // clouds, stars, moon
    this.clouds.setLook(P.cloud, P.cloudE, P.cloudEI + F * 1.5, c);
    const clearNight = P.night * (1 - c) * (1 - W.mist);
    this.stars.material.uniforms.uOpacity.value = clearNight;
    this.stars.material.uniforms.uTime.value = t;
    this.moon.material.opacity = P.night * (1 - c * 0.9) * (1 - W.mist * 0.8);
    this.moon.position.copy(this.moonDir).multiplyScalar(1500).add(camera.position);
    this.moon.lookAt(camera.position);
    this.moon.visible = this.moon.material.opacity > 0.01;
    this.stars.position.copy(camera.position);

    // rainbow after rain
    if (W.rain > 0.4) this._hadRain = 1;
    if (this._hadRain && T.rain === 0 && W.rain < 0.15) {
      this._hadRain = 0;
      if (this.sunDir.y > 0.08 && T.cloud < 0.6) this._rainbow = 50;
    }
    this._rainbow = Math.max(0, this._rainbow - dt);
    const rbTarget = this._rainbow > 0 ? Math.min(1, this._rainbow / 8) * (1 - c) : 0;
    const ru = this.rainbow.material.uniforms.uOpacity;
    ru.value += (rbTarget * 0.55 - ru.value) * Math.min(1, dt * 0.5);
    this.rainbow.visible = ru.value > 0.005;
    if (this.rainbow.visible) {
      const dir = new THREE.Vector3(-this.sunDir.x, 0, -this.sunDir.z).normalize();
      const D = 1400;
      this.rainbow.position.set(camera.position.x + dir.x * D, -Math.tan(Math.asin(this.sunDir.y)) * D, camera.position.z + dir.z * D);
      this.rainbow.lookAt(camera.position.x, this.rainbow.position.y, camera.position.z);
    }

    // rain, wind, night lights, fireflies
    this.windVec.set(W.wind * 0.35, W.wind * 0.12);
    this.rain.update(t, camera, W.rain, this.windVec);
    this.rain.setColor(tmp.copy(P.hor).lerp(new THREE.Color(1, 1, 1), 0.5));
    this.world.wind.value = W.wind * (1 - P.night * 0.25);
    this.world.setNight(Math.max(P.night, c * 0.3 * (1 - P.night)));
    this.fireflies.update(t, P.night * (1 - W.rain) * (1 - W.storm));

    if (this.envGround) this.envGround.material.color.copy(P.hemiG).multiplyScalar(0.7);

    this.scene.environmentIntensity = P.env * (1 - c * 0.3) + F * 0.8;
    this.maybeRefreshEnv(t, W);
  }

  maybeRefreshEnv(t, W) {
    const e = this._env;
    const dh = Math.abs(this.hour - e.hour);
    const changed = Math.min(dh, 24 - dh) > 0.25 || Math.abs(W.cloud - e.cloud) > 0.06 || Math.abs(W.mist - e.mist) > 0.08;
    if (!changed || t - e.t < 0.4) return;
    e.hour = this.hour; e.cloud = W.cloud; e.mist = W.mist; e.t = t;
    const old = this.scene.environment;
    const flash = this.skyMat.uniforms.uFlash.value;
    this.skyMat.uniforms.uFlash.value = 0;
    this.scene.environment = this.pmrem.fromScene(this.envScene, 0.04, 0.1, 200).texture;
    this.skyMat.uniforms.uFlash.value = flash;
    if (old) old.dispose();
  }
}
