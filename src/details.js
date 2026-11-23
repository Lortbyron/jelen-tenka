import * as THREE from 'three';

// "Busca los detalles": markers over the scene, the story card and the found counter.
// Adapted from Paisajegat (Bahía al Atardecer). A detail is { id, title, text, objs, anchor, dist, live? }.
const KEY = 'jelen-detalles';

export function createDetails({ details, camera, home, focus, unfocus, onOpen }) {
  const $ = (s) => document.querySelector(s);
  const body = document.body;
  let found = new Set();
  try { found = new Set(JSON.parse(localStorage.getItem(KEY) || '[]')); } catch { /* private mode */ }
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify([...found])); } catch { /* ignore */ } };

  const count = $('#count');
  const renderCount = () => { count.textContent = `${[...found].filter((id) => details.some((d) => d.id === id)).length} / ${details.length}`; };
  renderCount();

  const wrap = $('#marks');
  const marks = details.map((d, i) => {
    const b = document.createElement('button');
    b.className = 'mark' + (found.has(d.id) ? ' found' : '');
    b.setAttribute('aria-label', d.title);
    b.addEventListener('click', (e) => { e.stopPropagation(); open(i); });
    wrap.appendChild(b);
    return b;
  });

  let current = -1;
  const card = $('#card');
  function open(i) {
    current = (i + details.length) % details.length;
    const d = details[current];
    $('#card-kicker').textContent = `Detalle ${String(current + 1).padStart(2, '0')} de ${details.length}`;
    $('#card-title').textContent = d.title;
    $('#card-text').textContent = d.text;
    card.setAttribute('aria-hidden', 'false');
    body.classList.add('focus');
    found.add(d.id); save(); renderCount();
    marks[current].classList.add('found');
    // look at it from the side the visitor came from, a little above
    const dir = new THREE.Vector3().subVectors(home.pos, d.anchor).setY(0).normalize();
    const dist = d.dist * (innerWidth < innerHeight ? 1.75 : 1); // a narrow phone screen needs to step back
    const offset = dir.multiplyScalar(dist).add(new THREE.Vector3(0, dist * (d.lift ?? 0.28), 0));
    focus(d, offset);
    onOpen?.(d);
  }
  function close() {
    if (current < 0) return;
    current = -1;
    body.classList.remove('focus');
    card.setAttribute('aria-hidden', 'true');
    unfocus();
  }
  $('#card-prev').addEventListener('click', () => open(current - 1));
  $('#card-next').addEventListener('click', () => open(current + 1));
  $('#card-close').addEventListener('click', close);
  addEventListener('keydown', (e) => {
    if (current < 0) return;
    if (e.key === 'Escape') close();
    if (e.key === 'ArrowRight') open(current + 1);
    if (e.key === 'ArrowLeft') open(current - 1);
  });

  const seekBtn = $('#btn-seek');
  function setSeek(on) {
    body.classList.toggle('seek', on);
    seekBtn.setAttribute('aria-pressed', String(on));
  }
  setSeek(false);
  seekBtn.addEventListener('click', (e) => { e.stopPropagation(); setSeek(!body.classList.contains('seek')); });

  // which detail (if any) does a ray hit first?
  const owners = new Map();
  details.forEach((d, i) => d.objs.forEach((o) => owners.set(o, i)));
  const all = [...owners.keys()];
  function pick(ray) {
    const hit = ray.intersectObjects(all, true)[0];
    if (!hit) return -1;
    for (let o = hit.object; o; o = o.parent) if (owners.has(o)) return owners.get(o);
    return -1;
  }

  const v = new THREE.Vector3();
  function update() {
    for (const d of details) d.track?.(d.anchor);
    if (!body.classList.contains('seek')) return;
    const w = innerWidth, h = innerHeight;
    details.forEach((d, i) => {
      v.copy(d.anchor).project(camera);
      const vis = v.z < 1 && Math.abs(v.x) < 0.97 && Math.abs(v.y) < 0.95;
      marks[i].classList.toggle('vis', vis);
      if (vis) marks[i].style.transform = `translate(${((v.x + 1) / 2) * w}px, ${((1 - v.y) / 2) * h}px)`;
    });
  }

  return { open, close, pick, update, setSeek, get current() { return current; }, get detail() { return current >= 0 ? details[current] : null; } };
}
