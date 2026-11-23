import * as THREE from 'three';
import { rand, rr, pick } from './util.js';

// Every texture is painted on a <canvas> at load: no downloaded images.

function canvas(w, h = w) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return [c, c.getContext('2d')];
}

function toTex(c, { srgb = true, repeat = true } = {}) {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  return t;
}

const _hsl = {};
export function shade(hex, dl = 0, ds = 0, dh = 0) {
  const c = new THREE.Color(hex);
  c.getHSL(_hsl, THREE.SRGBColorSpace);
  c.setHSL(_hsl.h + dh, THREE.MathUtils.clamp(_hsl.s + ds, 0, 1), THREE.MathUtils.clamp(_hsl.l + dl, 0, 1), THREE.SRGBColorSpace);
  return '#' + c.getHexString(THREE.SRGBColorSpace);
}

function speckle(ctx, w, h, n, a = 0.05) {
  for (let i = 0; i < n; i++) {
    ctx.fillStyle = rand() < 0.5 ? `rgba(0,0,0,${rr(0, a)})` : `rgba(255,255,255,${rr(0, a)})`;
    ctx.fillRect(rr(0, w), rr(0, h), rr(1, 3), rr(1, 3));
  }
}

/** Ivory ashlar: 4 courses of blocks per tile. Tile = 2.4 m (see STONE_TILE in mansion.js). */
export function stoneTextures() {
  const S = 512, rows = 4, rh = S / rows;
  const [c, ctx] = canvas(S);
  const [b, bx] = canvas(S); // bump: joints dark
  ctx.fillStyle = '#efe9de'; ctx.fillRect(0, 0, S, S);
  bx.fillStyle = '#fff'; bx.fillRect(0, 0, S, S);
  for (let r = 0; r < rows; r++) {
    const y = r * rh;
    const off = r % 2 ? S / 4 : 0;
    for (let k = -1; k < 3; k++) {
      const x = off + k * (S / 2);
      ctx.fillStyle = shade('#efe9de', rr(-0.035, 0.025), rr(-0.04, 0.01), rr(-0.008, 0.008));
      ctx.fillRect(x, y, S / 2, rh);
      // soft weathering inside each block
      const g = ctx.createLinearGradient(0, y, 0, y + rh);
      g.addColorStop(0, 'rgba(255,255,255,0.06)'); g.addColorStop(1, 'rgba(120,100,70,0.05)');
      ctx.fillStyle = g; ctx.fillRect(x, y, S / 2, rh);
      ctx.fillStyle = 'rgba(150,130,100,0.45)'; ctx.fillRect(x, y, 2, rh);
      bx.fillStyle = '#555'; bx.fillRect(x, y, 3, rh);
    }
    ctx.fillStyle = 'rgba(150,130,100,0.5)'; ctx.fillRect(0, y, S, 2);
    ctx.fillStyle = 'rgba(255,255,255,0.18)'; ctx.fillRect(0, y + 2, S, 1.5);
    bx.fillStyle = '#555'; bx.fillRect(0, y, S, 3);
  }
  speckle(ctx, S, S, 2600, 0.05);
  // rain streaks, very faint
  for (let i = 0; i < 18; i++) {
    const x = rr(0, S), g = ctx.createLinearGradient(0, 0, 0, S);
    g.addColorStop(0, 'rgba(110,95,70,0.05)'); g.addColorStop(1, 'rgba(110,95,70,0)');
    ctx.fillStyle = g; ctx.fillRect(x, rr(0, S * 0.5), rr(3, 10), S);
  }
  return { map: toTex(c), bump: toTex(b, { srgb: false }) };
}

/** Smooth stucco for trims (subtle noise only). */
export function trimTexture() {
  const [c, ctx] = canvas(256);
  ctx.fillStyle = '#f6f2ea'; ctx.fillRect(0, 0, 256, 256);
  speckle(ctx, 256, 256, 1200, 0.04);
  return toTex(c);
}

/** Terracotta fishscale + square shingles. Tile = 2 m. */
export function shingleTexture() {
  const S = 512, rows = 14, rh = S / rows, cw = S / 12;
  const [c, ctx] = canvas(S);
  ctx.fillStyle = '#7a5a44'; ctx.fillRect(0, 0, S, S);
  for (let r = rows; r >= -1; r--) {
    const y = r * rh, off = r % 2 ? cw / 2 : 0;
    for (let k = -1; k < 13; k++) {
      const x = off + k * cw;
      const col = shade('#a3785a', rr(-0.07, 0.06), rr(-0.1, 0.04), rr(-0.015, 0.015));
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.moveTo(x + 1, y);
      ctx.lineTo(x + cw - 1, y);
      ctx.lineTo(x + cw - 1, y + rh * 1.15);
      ctx.lineTo(x + 1, y + rh * 1.15);
      ctx.fill();
      ctx.fillStyle = 'rgba(60,30,15,0.45)'; ctx.fillRect(x + 1, y + rh * 1.12, cw - 2, 2.5);
      ctx.fillStyle = 'rgba(255,230,200,0.12)'; ctx.fillRect(x + 2, y + 1, cw - 4, 2);
    }
  }
  speckle(ctx, S, S, 1600, 0.07);
  // lichen / weathering patches
  for (let i = 0; i < 30; i++) {
    const x = rr(0, S), y = rr(0, S), r = rr(10, 50);
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, rand() < 0.5 ? 'rgba(90,70,50,0.12)' : 'rgba(220,180,140,0.1)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g; ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  return toTex(c);
}

/** Sash window, `cols`×`rows` panes per sash, white curtains. Returns day map + night emissive map. */
export function windowTextures({ cols = 2, rows = 2, arch = false, curtain = true, aspect = 2 } = {}) {
  // canvas keeps the window's proportions so panes and the arch are not stretched
  const W = 128, H = Math.round(THREE.MathUtils.clamp(aspect, 0.5, 4) * W);
  const [c, ctx] = canvas(W, H);
  const [e, ex] = canvas(W, H);
  const archH = arch ? W / 2 : 0;
  const clip = (x) => {
    x.beginPath();
    if (arch) { x.moveTo(0, H); x.lineTo(0, archH); x.arc(W / 2, archH, W / 2, Math.PI, 0); x.lineTo(W, H); }
    else x.rect(0, 0, W, H);
    x.closePath();
  };
  // glass: sky reflection gradient
  ctx.save(); clip(ctx); ctx.clip();
  const g = ctx.createLinearGradient(0, 0, W * 0.4, H);
  g.addColorStop(0, '#9cc4e0'); g.addColorStop(0.45, '#4d7ea8'); g.addColorStop(1, '#253f5c');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  // diagonal sheen
  ctx.fillStyle = 'rgba(255,255,255,0.13)';
  ctx.beginPath(); ctx.moveTo(W * 0.1, H); ctx.lineTo(W * 0.45, 0); ctx.lineTo(W * 0.62, 0); ctx.lineTo(W * 0.27, H); ctx.fill();
  ctx.restore();

  // night: warm interior
  ex.fillStyle = '#000'; ex.fillRect(0, 0, W, H);
  ex.save(); clip(ex); ex.clip();
  const n = ex.createRadialGradient(W / 2, H * 0.35, 4, W / 2, H * 0.45, H * 0.7);
  n.addColorStop(0, '#ffe2a8'); n.addColorStop(0.6, '#d98c40'); n.addColorStop(1, '#5a2e12');
  ex.fillStyle = n; ex.fillRect(0, 0, W, H);
  ex.restore();

  // curtains (lit from behind at night)
  if (curtain) {
    for (const side of [0, 1]) {
      for (const [x2, cx] of [[ctx, '#f4efe4'], [ex, '#b8783c']]) {
        x2.save(); clip(x2); x2.clip();
        x2.fillStyle = cx;
        x2.beginPath();
        const x0 = side ? W : 0, dir = side ? -1 : 1;
        x2.moveTo(x0, archH * 0.6);
        x2.bezierCurveTo(x0 + dir * W * 0.32, H * 0.3, x0 + dir * W * 0.1, H * 0.62, x0 + dir * W * 0.22, H);
        x2.lineTo(x0, H);
        x2.fill();
        for (let k = 0; k < 4; k++) {
          x2.strokeStyle = 'rgba(0,0,0,0.08)'; x2.lineWidth = 2;
          x2.beginPath(); x2.moveTo(x0 + dir * (4 + k * 5), archH * 0.6 + 10); x2.lineTo(x0 + dir * (4 + k * 7), H); x2.stroke();
        }
        x2.restore();
      }
    }
  }

  // muntins + meeting rail
  for (const x2 of [ctx, ex]) {
    x2.fillStyle = x2 === ctx ? '#f7f2e8' : '#1a1008';
    const top = archH, bodyH = H - top;
    const rail = top + bodyH / 2;
    x2.fillRect(0, rail - 4, W, 8);
    for (const [y0, y1] of [[top, rail], [rail, H]]) {
      for (let i = 1; i < cols; i++) x2.fillRect((W / cols) * i - 2.5, y0, 5, y1 - y0);
      for (let j = 1; j < rows; j++) x2.fillRect(0, y0 + ((y1 - y0) / rows) * j - 2.5, W, 5);
    }
    if (arch) {
      x2.lineWidth = 5; x2.strokeStyle = x2.fillStyle;
      for (let k = 1; k < 4; k++) {
        const a = Math.PI + (Math.PI * k) / 4;
        x2.beginPath(); x2.moveTo(W / 2, archH); x2.lineTo(W / 2 + Math.cos(a) * W / 2, archH + Math.sin(a) * W / 2); x2.stroke();
      }
      x2.fillRect(0, archH - 2.5, W, 5);
    }
  }
  return { map: toTex(c, { repeat: false }), emissive: toTex(e, { repeat: false }) };
}

/** Half-round fanlight with radiating glazing bars. */
export function fanlightTextures() {
  const W = 256, H = 128;
  const [c, ctx] = canvas(W, H);
  const [e, ex] = canvas(W, H);
  for (const [x2, glass, bar] of [[ctx, null, '#f7f2e8'], [ex, '#e8a858', '#1a1008']]) {
    x2.save();
    x2.beginPath(); x2.moveTo(0, H); x2.arc(W / 2, H, W / 2, Math.PI, 0); x2.closePath(); x2.clip();
    if (glass) { x2.fillStyle = glass; } else {
      const g = x2.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#a8cbe3'); g.addColorStop(1, '#3d6a92');
      x2.fillStyle = g;
    }
    x2.fillRect(0, 0, W, H);
    x2.strokeStyle = bar; x2.lineWidth = 5;
    for (let k = 1; k < 9; k++) {
      const a = Math.PI + (Math.PI * k) / 9;
      x2.beginPath(); x2.moveTo(W / 2, H); x2.lineTo(W / 2 + Math.cos(a) * W, H + Math.sin(a) * W); x2.stroke();
    }
    x2.beginPath(); x2.arc(W / 2, H, W * 0.22, Math.PI, 0); x2.stroke();
    x2.beginPath(); x2.arc(W / 2, H, W / 2 - 3, Math.PI, 0); x2.stroke();
    x2.restore();
  }
  return { map: toTex(c, { repeat: false }), emissive: toTex(e, { repeat: false }) };
}

/** Pair of white panelled doors with brass handles. */
export function doorTexture() {
  const W = 256, H = 512;
  const [c, ctx] = canvas(W, H);
  ctx.fillStyle = '#f1ebdf'; ctx.fillRect(0, 0, W, H);
  const panel = (x, y, w, h) => {
    ctx.fillStyle = 'rgba(120,100,70,0.22)'; ctx.fillRect(x, y, w, h);
    ctx.fillStyle = '#f6f1e7'; ctx.fillRect(x + 5, y + 5, w - 10, h - 10);
    ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.fillRect(x + 5, y + 5, w - 10, 3);
  };
  for (const x0 of [0, W / 2]) {
    panel(x0 + 18, 26, W / 2 - 36, 180);
    panel(x0 + 18, 230, W / 2 - 36, 90);
    panel(x0 + 18, 344, W / 2 - 36, 140);
  }
  ctx.fillStyle = 'rgba(60,45,30,0.5)'; ctx.fillRect(W / 2 - 1.5, 0, 3, H);
  ctx.fillStyle = '#c9a24a';
  ctx.fillRect(W / 2 - 14, 250, 6, 40); ctx.fillRect(W / 2 + 8, 250, 6, 40);
  speckle(ctx, W, H, 600, 0.04);
  return toTex(c, { repeat: false });
}

/** Carved scroll panel (relief beside the entrance). */
export function reliefTexture() {
  const W = 128, H = 256;
  const [c, ctx] = canvas(W, H);
  ctx.fillStyle = '#ece2cf'; ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = 'rgba(140,115,80,0.55)'; ctx.lineWidth = 3;
  ctx.strokeRect(8, 8, W - 16, H - 16);
  ctx.lineWidth = 4; ctx.lineCap = 'round';
  const scroll = (cx, cy, r, s) => {
    ctx.beginPath();
    for (let a = 0; a < Math.PI * 3.2; a += 0.1) {
      const rr2 = r * (1 - a / (Math.PI * 3.6));
      const x = cx + Math.cos(a) * rr2 * s, y = cy + Math.sin(a) * rr2;
      a === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.stroke();
  };
  ctx.beginPath(); ctx.moveTo(W / 2, 30); ctx.bezierCurveTo(W / 2 - 30, 90, W / 2 + 30, 160, W / 2, 226); ctx.stroke();
  scroll(W / 2 - 22, 70, 18, 1); scroll(W / 2 + 22, 120, 18, -1); scroll(W / 2 - 20, 175, 16, 1);
  ctx.fillStyle = 'rgba(140,115,80,0.45)';
  for (const [x, y] of [[W / 2 + 18, 60], [W / 2 - 16, 130], [W / 2 + 18, 200]]) {
    ctx.beginPath(); ctx.ellipse(x, y, 10, 5, 0.6, 0, 7); ctx.fill();
  }
  return toTex(c, { repeat: false });
}

/** Quatrefoil openwork for the balustrade (alpha in the green channel of `alpha`). */
export function balustradeTextures() {
  const W = 512, H = 128;
  const [c, ctx] = canvas(W, H);
  const [a, ax] = canvas(W, H);
  ctx.fillStyle = '#ede4d2'; ctx.fillRect(0, 0, W, H);
  speckle(ctx, W, H, 800, 0.05);
  ax.fillStyle = '#fff'; ax.fillRect(0, 0, W, H);
  const n = 4, cw = W / n;
  for (let i = 0; i < n; i++) {
    const cx = cw * i + cw / 2, cy = H / 2, r = H * 0.2;
    for (const [x2, col] of [[ax, '#000'], [ctx, 'rgba(110,90,60,0.6)']]) {
      x2.fillStyle = col;
      x2.beginPath();
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { x2.moveTo(cx + dx * r + r * 0.95, cy + dy * r); x2.arc(cx + dx * r, cy + dy * r, r * 0.95, 0, 7); }
      if (x2 === ax) x2.fill(); else { x2.lineWidth = 3; x2.strokeStyle = col; x2.stroke(); }
    }
    // center solid lozenge stays
    ax.fillStyle = '#fff';
    ax.beginPath(); ax.arc(cx, cy, r * 0.35, 0, 7); ax.fill();
    // small piercings between quatrefoils
    ax.fillStyle = '#000';
    ax.beginPath(); ax.ellipse(cw * i, cy, 6, 22, 0, 0, 7); ax.fill();
  }
  return { map: toTex(c), alpha: toTex(a, { srgb: false }) };
}

/** Hand-set grey pavers, running bond. Tile = 2 m. */
export function cobbleTexture() {
  const S = 512, rows = 8, rh = S / rows;
  const [c, ctx] = canvas(S);
  const [b, bx] = canvas(S);
  ctx.fillStyle = '#7d766a'; ctx.fillRect(0, 0, S, S);
  bx.fillStyle = '#222'; bx.fillRect(0, 0, S, S);
  for (let r = 0; r < rows; r++) {
    let x = r % 2 ? -rh * 0.6 : 0;
    while (x < S) {
      const w = rh * rr(1.15, 1.6);
      const col = shade('#a9a398', rr(-0.09, 0.07), rr(-0.04, 0.03), rr(-0.03, 0.03));
      const rad = 7;
      for (const [x2, fill] of [[ctx, col], [bx, '#fff']]) {
        x2.fillStyle = fill;
        x2.beginPath(); x2.roundRect(x + 2, r * rh + 2, w - 4, rh - 4, rad); x2.fill();
      }
      const g = ctx.createLinearGradient(0, r * rh, 0, r * rh + rh);
      g.addColorStop(0, 'rgba(255,255,255,0.12)'); g.addColorStop(1, 'rgba(0,0,0,0.12)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.roundRect(x + 2, r * rh + 2, w - 4, rh - 4, rad); ctx.fill();
      // moss in the joints, here and there
      if (rand() < 0.25) { ctx.fillStyle = 'rgba(95,110,50,0.5)'; ctx.fillRect(x + rr(0, w), r * rh + rh - 3, rr(8, 22), 3); }
      x += w;
    }
  }
  // wrap the overhanging pavers so the tile repeats
  const tmp = document.createElement('canvas'); tmp.width = S; tmp.height = S;
  speckle(ctx, S, S, 3000, 0.07);
  return { map: toTex(c), bump: toTex(b, { srgb: false }) };
}

/** Fine lawn detail (blades), tinted further in the shader. */
export function grassTexture() {
  const S = 256;
  const [c, ctx] = canvas(S);
  ctx.fillStyle = '#668a3c'; ctx.fillRect(0, 0, S, S);
  for (let i = 0; i < 5000; i++) {
    const x = rr(0, S), y = rr(0, S), l = rr(3, 9);
    ctx.strokeStyle = shade('#668a3c', rr(-0.12, 0.14), rr(-0.1, 0.05), rr(-0.02, 0.03));
    ctx.lineWidth = rr(0.8, 1.6);
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + rr(-2, 2), y - l); ctx.stroke();
  }
  return toTex(c);
}

/** A bunch of leaves on a transparent background (tinted by vertex colors). */
export function leafTexture() {
  const [c, ctx] = canvas(256);
  const leaf = (x, y, a, L, W) => {
    ctx.save(); ctx.translate(x, y); ctx.rotate(a);
    const g = ctx.createLinearGradient(-W, 0, W, 0);
    g.addColorStop(0, '#cfcfcf'); g.addColorStop(0.5, '#ffffff'); g.addColorStop(1, '#b4b4b4');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.bezierCurveTo(W, -L * 0.3, W * 0.6, -L * 0.85, 0, -L);
    ctx.bezierCurveTo(-W * 0.6, -L * 0.85, -W, -L * 0.3, 0, 0);
    ctx.fill();
    ctx.strokeStyle = 'rgba(70,90,50,0.35)'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, -L * 0.95); ctx.stroke();
    ctx.restore();
  };
  for (let i = 0; i < 11; i++) {
    const a = (i / 11) * Math.PI * 2 + rr(-0.2, 0.2);
    leaf(128 + Math.sin(a) * 12, 128 - Math.cos(a) * 12, a, rr(62, 92), rr(20, 30));
  }
  for (let i = 0; i < 4; i++) leaf(128 + rr(-20, 20), 128 + rr(-20, 20), rr(0, 6.28), rr(45, 60), rr(16, 22));
  return toTex(c, { repeat: false });
}

/** Clustered white blossoms (hydrangea heads) on transparent background. */
export function blossomTexture() {
  const [c, ctx] = canvas(128);
  for (let i = 0; i < 26; i++) {
    const a = rand() * 6.28, r = Math.sqrt(rand()) * 46;
    const x = 64 + Math.cos(a) * r, y = 64 + Math.sin(a) * r;
    ctx.fillStyle = '#ffffff';
    for (let p = 0; p < 4; p++) {
      const pa = (p / 4) * 6.28 + a;
      ctx.beginPath(); ctx.ellipse(x + Math.cos(pa) * 4, y + Math.sin(pa) * 4, 4.5, 3, pa, 0, 7); ctx.fill();
    }
    ctx.fillStyle = '#d8d2b0'; ctx.beginPath(); ctx.arc(x, y, 1.6, 0, 7); ctx.fill();
  }
  return toTex(c, { repeat: false });
}

export function wispTexture() {
  const [c, ctx] = canvas(512, 128);
  ctx.filter = 'blur(14px)';
  for (let i = 0; i < 9; i++) {
    ctx.fillStyle = `rgba(255,255,255,${rr(0.25, 0.5)})`;
    ctx.beginPath();
    ctx.ellipse(256 + rr(-150, 150), 64 + rr(-12, 12), rr(70, 170), rr(10, 22), rr(-0.05, 0.05), 0, 7);
    ctx.fill();
  }
  return toTex(c, { repeat: false });
}

// =====================================================================================
// Jelen Tenka: broken-tile mosaic (trencadís), stone, palm fronds, concrete, bike lane
// =====================================================================================

/** Irregular tile: a jittered polygon inside a grid cell. */
function tile(ctx, cx, cy, s) {
  const n = 4 + Math.floor(rand() * 3);
  const a0 = rand() * 6.28;
  ctx.beginPath();
  for (let i = 0; i < n; i++) {
    const a = a0 + (i / n) * 6.28 + rr(-0.35, 0.35);
    const r = s * rr(0.42, 0.62);
    const x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r;
    i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
  }
  ctx.closePath();
  ctx.fill();
}

const PLANT = 'plant';
const ACCENTS = ['#e23a2e', '#f4c531', '#2f8fd8', '#7a3fa6', '#3fae5a', '#f07a2a', '#ffffff'];

/**
 * Stripes of broken tile running along v (top → bottom of the veil, along the arm).
 * stripes: colours, or 'plant' for a mossy strip where the living plants grow.
 * Returns map + bump (grout sunk, tiles raised). The texture has stripes.length stripes across u.
 */
export function mosaicTextures(stripes, { W = 1024, H = 1024, cell = 13, grout = '#8c867a', seed = 0 } = {}) {
  const [c, ctx] = canvas(W, H);
  const [b, bx] = canvas(W, H);
  ctx.fillStyle = grout; ctx.fillRect(0, 0, W, H);
  bx.fillStyle = '#202020'; bx.fillRect(0, 0, W, H);
  const sw = W / stripes.length;
  for (let k = 0; k < stripes.length; k++) {
    const col = stripes[k];
    const x0 = k * sw;
    if (col === PLANT) {
      // soil and moss under the plants: dark, soft, with a few green tiles left showing
      const g = ctx.createLinearGradient(x0, 0, x0 + sw, 0);
      g.addColorStop(0, '#3b4a26'); g.addColorStop(0.5, '#2f3d1f'); g.addColorStop(1, '#3b4a26');
      ctx.fillStyle = g; ctx.fillRect(x0, 0, sw, H);
      for (let i = 0; i < 900; i++) {
        ctx.fillStyle = shade(pick(['#4f6b2a', '#5d7d31', '#3e5524', '#6c8a36', '#4a3a26']), rr(-0.06, 0.06));
        ctx.beginPath(); ctx.arc(x0 + rr(0, sw), rr(0, H), rr(2, 7), 0, 7); ctx.fill();
      }
      bx.fillStyle = '#5a5a5a'; bx.fillRect(x0, 0, sw, H);
      continue;
    }
    // a thin grout line between stripes, then the tiles
    for (let y = cell / 2; y < H; y += cell) {
      for (let x = x0 + cell / 2; x < x0 + sw - cell * 0.3; x += cell) {
        const jx = x + rr(-2, 2), jy = y + rr(-2, 2);
        let fill = shade(col, rr(-0.09, 0.08), rr(-0.08, 0.04), rr(-0.012, 0.012));
        if (rand() < 0.025) fill = pick(ACCENTS);            // the odd tile of another colour
        ctx.fillStyle = fill; tile(ctx, jx, jy, cell);
        bx.fillStyle = `rgb(${200 + rr(-25, 40) | 0},${200 | 0},200)`; tile(bx, jx, jy, cell);
        // glaze highlight on some tiles
        if (rand() < 0.3) {
          ctx.fillStyle = 'rgba(255,255,255,0.12)';
          ctx.beginPath(); ctx.arc(jx - cell * 0.15, jy - cell * 0.15, cell * 0.15, 0, 7); ctx.fill();
        }
      }
    }
  }
  speckle(ctx, W, H, 4000, 0.05);
  const map = toTex(c), bump = toTex(b, { srgb: false });
  return { map, bump, stripes };
}
mosaicTextures.PLANT = PLANT;

/** The purple chest: purple tiles with light-blue swirls and lime dots (as in the reference). */
export function chestTextures() {
  const W = 1024, H = 1024, cell = 11;
  const [c, ctx] = canvas(W, H);
  const [b, bx] = canvas(W, H);
  ctx.fillStyle = '#5b4a6e'; ctx.fillRect(0, 0, W, H);
  bx.fillStyle = '#202020'; bx.fillRect(0, 0, W, H);
  for (let y = cell / 2; y < H; y += cell) {
    for (let x = cell / 2; x < W; x += cell) {
      const jx = x + rr(-2, 2), jy = y + rr(-2, 2);
      ctx.fillStyle = rand() < 0.04 ? pick(['#c9d94a', '#e9b33a', '#3fae9a']) : shade('#6a3fa0', rr(-0.08, 0.07), rr(-0.08, 0.05), rr(-0.02, 0.02));
      tile(ctx, jx, jy, cell);
      bx.fillStyle = '#cccccc'; tile(bx, jx, jy, cell);
    }
  }
  // spirals of small light-blue tiles, some with a second ring in turquoise
  const spiral = (cx, cy, R, turns, col) => {
    const steps = Math.floor(R * turns * 0.9);
    for (let i = 0; i < steps; i++) {
      const t = i / steps;
      const a = t * turns * 6.28, r = R * t;
      const x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r;
      ctx.fillStyle = shade(col, rr(-0.06, 0.06));
      tile(ctx, (x + W) % W, (y + H) % H, 7);
      bx.fillStyle = '#e0e0e0'; tile(bx, (x + W) % W, (y + H) % H, 7);
    }
  };
  for (let i = 0; i < 26; i++) spiral(rr(0, W), rr(0, H), rr(40, 95), rr(2, 3.2), pick(['#8fd0ec', '#7cc3e6', '#a6dcef']));
  for (let i = 0; i < 12; i++) spiral(rr(0, W), rr(0, H), rr(25, 50), 2, '#3fb3a6');
  // curling lines between the spirals
  for (let i = 0; i < 18; i++) {
    let x = rr(0, W), y = rr(0, H), a = rr(0, 6.28);
    for (let s = 0; s < 70; s++) {
      a += Math.sin(s * 0.12 + i) * 0.12; x += Math.cos(a) * 6; y += Math.sin(a) * 6;
      ctx.fillStyle = shade('#9ad6ee', rr(-0.05, 0.05)); tile(ctx, (x + W) % W, (y + H) % H, 6);
    }
  }
  speckle(ctx, W, H, 3000, 0.05);
  return { map: toTex(c), bump: toTex(b, { srgb: false }) };
}

/** Weathered grey stone/concrete for the face (sampled triplanar in the shader). */
export function stoneFaceTextures() {
  const S = 512;
  const [c, ctx] = canvas(S);
  const [b, bx] = canvas(S);
  ctx.fillStyle = '#9a958c'; ctx.fillRect(0, 0, S, S);
  bx.fillStyle = '#808080'; bx.fillRect(0, 0, S, S);
  // soft mottling
  ctx.filter = 'blur(10px)';
  for (let i = 0; i < 90; i++) {
    ctx.fillStyle = rand() < 0.5 ? `rgba(70,66,58,${rr(0.05, 0.16)})` : `rgba(210,205,195,${rr(0.05, 0.14)})`;
    ctx.beginPath(); ctx.arc(rr(0, S), rr(0, S), rr(20, 70), 0, 7); ctx.fill();
  }
  // greenish weathering stains
  for (let i = 0; i < 16; i++) {
    ctx.fillStyle = `rgba(90,104,70,${rr(0.06, 0.15)})`;
    ctx.beginPath(); ctx.ellipse(rr(0, S), rr(0, S), rr(15, 45), rr(30, 90), 0, 0, 7); ctx.fill();
  }
  ctx.filter = 'none';
  // pores: the porous concrete of the sculpture
  for (let i = 0; i < 9000; i++) {
    const x = rr(0, S), y = rr(0, S), r = rr(0.5, 2.2);
    ctx.fillStyle = `rgba(40,38,34,${rr(0.15, 0.5)})`; ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill();
    bx.fillStyle = `rgba(0,0,0,${rr(0.3, 0.8)})`; bx.beginPath(); bx.arc(x, y, r, 0, 7); bx.fill();
  }
  speckle(ctx, S, S, 8000, 0.08);
  return { map: toTex(c), bump: toTex(b, { srgb: false }) };
}

/** A pinnate palm frond on transparent background (rachis vertical, base at the bottom). */
export function frondTexture() {
  const W = 256, H = 1024;
  const [c, ctx] = canvas(W, H);
  ctx.strokeStyle = '#d8d8c8'; ctx.lineWidth = 5;
  ctx.beginPath(); ctx.moveTo(W / 2, H); ctx.lineTo(W / 2, 8); ctx.stroke();
  const n = 58;
  for (let i = 0; i < n; i++) {
    const t = i / n;                       // 0 base → 1 tip
    const y = H - 24 - t * (H - 40);
    const L = (W / 2 - 4) * Math.sin(Math.min(1, t * 1.2 + 0.1) * Math.PI) * rr(0.88, 1.0);
    for (const s of [-1, 1]) {
      const ex = W / 2 + s * L, ey = y - L * 0.5;
      const g = ctx.createLinearGradient(W / 2, y, ex, ey);
      g.addColorStop(0, '#f4f4f0'); g.addColorStop(1, '#cfcfc6');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(W / 2, y - 6);
      ctx.quadraticCurveTo(W / 2 + s * L * 0.5, y - L * 0.2 - 13, ex, ey);
      ctx.quadraticCurveTo(W / 2 + s * L * 0.55, y - L * 0.2 + 10, W / 2, y + 10);
      ctx.fill();
    }
  }
  return toTex(c, { repeat: false });
}

/** Poured concrete walk with expansion joints every ~2 m (tile = 4 m). */
export function concreteTexture() {
  const S = 512;
  const [c, ctx] = canvas(S);
  ctx.fillStyle = '#c9c6bf'; ctx.fillRect(0, 0, S, S);
  ctx.filter = 'blur(8px)';
  for (let i = 0; i < 50; i++) {
    ctx.fillStyle = rand() < 0.5 ? `rgba(90,85,75,${rr(0.04, 0.1)})` : `rgba(255,255,255,${rr(0.04, 0.1)})`;
    ctx.beginPath(); ctx.arc(rr(0, S), rr(0, S), rr(20, 60), 0, 7); ctx.fill();
  }
  ctx.filter = 'none';
  speckle(ctx, S, S, 9000, 0.09);
  ctx.strokeStyle = 'rgba(70,66,60,0.55)'; ctx.lineWidth = 2;
  for (const p of [0, S / 2]) { ctx.beginPath(); ctx.moveTo(p + 1, 0); ctx.lineTo(p + 1, S); ctx.stroke(); }
  return toTex(c);
}

/** Blue bike lane with a dashed yellow centre line (tile = 1 lane wide × 6 m). */
export function bikeLaneTexture() {
  const W = 256, H = 512;
  const [c, ctx] = canvas(W, H);
  ctx.fillStyle = '#4f7fa8'; ctx.fillRect(0, 0, W, H);
  speckle(ctx, W, H, 6000, 0.1);
  ctx.fillStyle = '#f1c530';
  ctx.fillRect(W / 2 - 4, 40, 8, H / 2);
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.fillRect(4, 0, 6, H); ctx.fillRect(W - 10, 0, 6, H);
  return toTex(c);
}

/** Asphalt with lane lines (tile = carriageway width × 12 m). */
export function asphaltTexture() {
  const W = 256, H = 512;
  const [c, ctx] = canvas(W, H);
  ctx.fillStyle = '#4a4a4c'; ctx.fillRect(0, 0, W, H);
  speckle(ctx, W, H, 12000, 0.12);
  ctx.fillStyle = 'rgba(240,240,235,0.8)';
  ctx.fillRect(W / 2 - 3, 0, 6, H * 0.45);
  ctx.fillRect(6, 0, 5, H); ctx.fillRect(W - 11, 0, 5, H);
  return toTex(c);
}
