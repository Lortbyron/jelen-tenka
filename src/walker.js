import * as THREE from 'three';

/*
  First-person walking, shared by the garden and the hall.
  - Keys: W A S D / arrows (Shift walks faster). Drag to look. Click or tap the ground to walk there.
  - The world is described by `heightAt(x, z)`, `surfaceAt(x, z)` and a ColliderSet.
  - Yaw 0 looks toward −z (at the house from the walk).
*/

/** Circles and wall segments in the xz plane; `resolve` pushes a body of radius r out of all of them. */
export class ColliderSet {
  constructor(bounds) {
    this.circles = []; // [x, z, r]
    this.segs = [];    // [ax, az, bx, bz]
    this.bounds = bounds; // {x0, x1, z0, z1}
  }
  circle(x, z, r) { this.circles.push([x, z, r]); return this; }
  seg(ax, az, bx, bz) { this.segs.push([ax, az, bx, bz]); return this; }
  box(x0, x1, z0, z1) {
    this.seg(x0, z0, x1, z0); this.seg(x1, z0, x1, z1); this.seg(x1, z1, x0, z1); this.seg(x0, z1, x0, z0);
    return this;
  }
  resolve(p, r) {
    for (let iter = 0; iter < 3; iter++) {
      for (const [cx, cz, cr] of this.circles) {
        const dx = p.x - cx, dz = p.z - cz, d = Math.hypot(dx, dz), m = cr + r;
        if (d < m && d > 1e-5) { p.x = cx + (dx / d) * m; p.z = cz + (dz / d) * m; }
      }
      for (const [ax, az, bx, bz] of this.segs) {
        const ex = bx - ax, ez = bz - az, L2 = ex * ex + ez * ez;
        const t = THREE.MathUtils.clamp(((p.x - ax) * ex + (p.z - az) * ez) / L2, 0, 1);
        const qx = ax + ex * t, qz = az + ez * t;
        const dx = p.x - qx, dz = p.z - qz, d = Math.hypot(dx, dz);
        if (d < r && d > 1e-5) { p.x = qx + (dx / d) * r; p.z = qz + (dz / d) * r; }
      }
    }
    const b = this.bounds;
    if (b) { p.x = THREE.MathUtils.clamp(p.x, b.x0, b.x1); p.z = THREE.MathUtils.clamp(p.z, b.z0, b.z1); }
    return p;
  }
}

export class Walker {
  constructor({ dom, camera, colliders, heightAt, surfaceAt, eye = 1.62, speed = 2.4, radius = 0.32 }) {
    Object.assign(this, { dom, camera, colliders, heightAt, surfaceAt, eye, speed, radius });
    this.pos = new THREE.Vector3();
    this.yaw = 0; this.pitch = 0;
    this.active = false;
    this.target = null;        // click-to-walk destination
    this.keys = new Set();
    this.onStep = null;        // (surface) => void
    this.onClick = null;       // (event) => boolean: return true if the click was used for something else
    this.pickGround = null;    // (event) => Vector3|null
    this._y = 0; this._dist = 0; this._bob = 0; this._v = 0;

    let down = null;
    const ptrs = new Map();
    this._down = (e) => {
      if (!this.active) return;
      ptrs.set(e.pointerId, e);
      down = { x: e.clientX, y: e.clientY, lx: e.clientX, ly: e.clientY, moved: 0, id: e.pointerId };
    };
    this._move = (e) => {
      if (!this.active || !down || e.pointerId !== down.id) return;
      const dx = e.clientX - down.lx, dy = e.clientY - down.ly;
      down.lx = e.clientX; down.ly = e.clientY; down.moved += Math.abs(dx) + Math.abs(dy);
      if (down.moved > 6) {
        const k = e.pointerType === 'touch' ? 0.006 : 0.0042;
        this.yaw += dx * k;
        this.pitch = THREE.MathUtils.clamp(this.pitch + dy * k, -1.1, 1.0);
      }
    };
    this._up = (e) => {
      ptrs.delete(e.pointerId);
      if (!this.active || !down || e.pointerId !== down.id) return;
      const click = down.moved < 6 && e.button === 0;
      down = null;
      if (!click) return;
      if (this.onClick?.(e)) return;
      const p = this.pickGround?.(e);
      if (p) this.walkTo(p);
    };
    this._key = (e) => {
      if (!this.active || e.target.closest?.('input, textarea')) return;
      const k = e.key.toLowerCase();
      if (!['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'shift'].includes(k)) return;
      if (e.type === 'keydown') { this.keys.add(k); this.target = null; } else this.keys.delete(k);
      if (k.startsWith('arrow')) e.preventDefault();
    };
    this._blur = () => this.keys.clear();
    dom.addEventListener('pointerdown', this._down);
    addEventListener('pointermove', this._move);
    addEventListener('pointerup', this._up);
    addEventListener('keydown', this._key);
    addEventListener('keyup', this._key);
    addEventListener('blur', this._blur);
  }

  place(x, z, yaw = 0, pitch = 0) {
    this.pos.set(x, 0, z);
    this.yaw = yaw; this.pitch = pitch;
    this._y = this.heightAt(x, z);
    this.target = null; this.keys.clear();
    this.apply(0);
  }
  walkTo(p) { this.target = new THREE.Vector3(p.x, 0, p.z); }
  get moving() { return this._v > 0.1; }

  update(dt) {
    if (!this.active) return;
    const fx = -Math.sin(this.yaw), fz = -Math.cos(this.yaw);
    let mx = 0, mz = 0;
    const K = this.keys;
    const f = (K.has('w') || K.has('arrowup') ? 1 : 0) - (K.has('s') || K.has('arrowdown') ? 1 : 0);
    const s = (K.has('d') ? 1 : 0) - (K.has('a') ? 1 : 0);
    const turn = (K.has('arrowright') ? 1 : 0) - (K.has('arrowleft') ? 1 : 0);
    this.yaw -= turn * dt * 1.6;
    if (f || s) { mx = fx * f - fz * s; mz = fz * f + fx * s; }
    else if (this.target) {
      const dx = this.target.x - this.pos.x, dz = this.target.z - this.pos.z, d = Math.hypot(dx, dz);
      if (d < 0.15) this.target = null;
      else {
        mx = dx / d; mz = dz / d;
        if (d < 0.8) { mx *= d / 0.8; mz *= d / 0.8; }
        // turn gently toward where we're going
        const want = Math.atan2(-dx, -dz);
        let da = want - this.yaw; da = Math.atan2(Math.sin(da), Math.cos(da));
        this.yaw += da * Math.min(1, dt * 1.8) * Math.min(1, d / 2);
      }
    }
    const len = Math.hypot(mx, mz);
    if (len > 1) { mx /= len; mz /= len; }
    const sp = this.speed * (K.has('shift') ? 1.8 : 1);
    const want = Math.min(1, len) * sp;
    this._v += (want - this._v) * Math.min(1, dt * 8);
    if (len > 0.001) {
      const px = this.pos.x, pz = this.pos.z;
      this.pos.x += (mx / Math.max(len, 1e-6)) * this._v * dt;
      this.pos.z += (mz / Math.max(len, 1e-6)) * this._v * dt;
      this.colliders.resolve(this.pos, this.radius);
      const moved = Math.hypot(this.pos.x - px, this.pos.z - pz);
      if (this.target && moved < this._v * dt * 0.2 && this._v > 0.5) this.target = null; // blocked
      this._dist += moved;
      this._bob += moved * 2.2;
      if (this._dist > 0.72) { this._dist = 0; this.onStep?.(this.surfaceAt(this.pos.x, this.pos.z)); }
    }
    this.apply(dt);
  }

  apply(dt) {
    const gy = this.heightAt(this.pos.x, this.pos.z);
    this._y = dt ? this._y + (gy - this._y) * Math.min(1, dt * 10) : gy;
    const bob = Math.sin(this._bob * Math.PI) * 0.035 * Math.min(1, this._v / this.speed);
    this.camera.position.set(this.pos.x, this._y + this.eye + bob, this.pos.z);
    this.camera.rotation.order = 'YXZ';
    this.camera.rotation.set(this.pitch, this.yaw, 0); // drag "grabs" the world, like the sanctuary interior
  }
}
