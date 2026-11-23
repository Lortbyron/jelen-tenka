// Sound for Jelen Tenka.
//  - Beds synthesised live from noise: wind in the palms (stronger up on the lookout), the tropical
//    downpour (hiss + patter + a low roar), and the far hum of the city.
//  - Living things synthesised with oscillators: kiskadees ("bien-te-veo"), oropendolas, passing parrots,
//    tanagers, sparrows and doves by day; cicadas in the heat of the afternoon; crickets, tree frogs and
//    toads at night.
//  - Footsteps per surface: grass, concrete, the steel stair.
//  - One-shots in public/sounds/*.mp3 rendered with earshot (https://github.com/Leonxlnx/earshot): a marimba in
//    D major pentatonic (the music), a bamboo tok, thunder, drips and UI.

const MARIMBA = ['marimba_Fs3', 'marimba_A3', 'marimba_B3', 'marimba_D4', 'marimba_E4', 'marimba_Fs4', 'marimba_A4',
  'marimba_B4', 'marimba_D5', 'marimba_E5', 'marimba_Fs5', 'marimba_A5', 'marimba_B5', 'marimba_D6'];
const SOUNDS = [
  ...MARIMBA, 'bamboo_tok', 'thunder_body', 'thunder_roll', 'wood_tap',
  'drip_drop_1', 'drip_drop_2', 'drip_plink_1', 'drip_plink_2', 'drip_tiny_1', 'drip_tiny_2',
  'ui_open', 'ui_close', 'ui_tap', 'ui_toggle', 'ui_swish',
];

// Pad chords (MIDI): Dmaj9, Bm7, Gmaj7, A6sus — the key of the marimba.
const midi = (m) => 440 * Math.pow(2, (m - 69) / 12);
const CHORDS = [
  [50, 57, 62, 66, 69, 76],
  [47, 54, 62, 66, 69, 73],
  [43, 50, 59, 62, 66, 74],
  [45, 52, 57, 62, 64, 71],
];
const CHORD_NOTES = [ // indices into MARIMBA that sit well over each chord
  [0, 1, 3, 5, 6, 8, 9, 10, 11, 13],
  [0, 2, 3, 5, 6, 7, 8, 10, 11, 12],
  [2, 3, 5, 7, 8, 10, 12, 13],
  [1, 3, 4, 6, 8, 9, 11, 13],
];

const MUSIC = 0.36; // music bus level: the marimba sits just above the birds, under the rain
const rr = (a, b) => a + Math.random() * (b - a);
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.buffers = {};
    // height: 0 on the lawn … 1 up on the lookout
    this.state = { wind: 0.3, rain: 0, storm: 0, night: 0, hour: 16, height: 0 };
    this.volume = 0.8;
    this.ambientOn = true;
    this.musicOn = true;
    this._t = { bird: 2, parrots: 25, cicada: 6, frog: 1, toad: 8, city: 20, chord: 0, phrase: 2, drip: 0 };
    this._chord = 0;
  }

  get started() { return !!this.ctx; }
  now() { return this.ctx.currentTime; }

  async start() {
    if (this.ctx) { if (this.ctx.state === 'suspended') await this.ctx.resume(); return; }
    const ctx = (this.ctx = new (window.AudioContext || window.webkitAudioContext)());

    // master → +4 dB of make-up → a soft limiter (thunder in a storm stays clean)
    this.limiter = ctx.createDynamicsCompressor();
    this.limiter.threshold.value = -8; this.limiter.knee.value = 6; this.limiter.ratio.value = 12;
    this.limiter.attack.value = 0.003; this.limiter.release.value = 0.25;
    this.limiter.connect(ctx.destination);
    this.master = ctx.createGain();
    this.master.gain.value = 0;
    this.master.connect(this.gain(this.limiter, 1.6));
    this.master.gain.setTargetAtTime(this.volume, this.now(), 1.2);

    this.ambBus = this.gain(this.master, this.ambientOn ? 1 : 0);
    this.sfxBus = this.gain(this.master, 1);
    this.musicBus = this.gain(this.master, this.musicOn ? MUSIC : 0);
    this.uiBus = this.gain(this.master, 0.5);

    // an open-air tail for the park (the lawn is wide and flat, so short and soft)
    this.airVerb = ctx.createConvolver(); this.airVerb.buffer = this.impulse(1.8, 4);
    this.airVerb.connect(this.gain(this.master, 0.22));
    this.musicVerb = ctx.createConvolver(); this.musicVerb.buffer = this.impulse(2.6, 2.8);
    this.musicVerb.connect(this.gain(this.musicBus, 0.55));

    this.noise = { brown: this.noiseBuffer('brown', 6), pink: this.noiseBuffer('pink', 6), white: this.noiseBuffer('white', 3) };
    this.buildBeds();
    this.buildCrickets();
    this.buildPad();

    await Promise.all(SOUNDS.map(async (name) => {
      try {
        const res = await fetch(`${import.meta.env.BASE_URL}sounds/${name}.mp3`);
        this.buffers[name] = await ctx.decodeAudioData(await res.arrayBuffer());
      } catch (e) { console.warn('sound failed', name, e); }
    }));
  }

  // ------------------------------------------------------------------ helpers
  gain(dest, v = 1) { const g = this.ctx.createGain(); g.gain.value = v; if (dest) g.connect(dest); return g; }
  filter(type, freq, q = 0.7, dest) {
    const f = this.ctx.createBiquadFilter();
    f.type = type; f.frequency.value = freq; f.Q.value = q;
    if (dest) f.connect(dest);
    return f;
  }
  panner(pan, dest) { const p = this.ctx.createStereoPanner(); p.pan.value = clamp(pan, -1, 1); p.connect(dest); return p; }
  loop(buffer, dest, offset = 0) {
    const s = this.ctx.createBufferSource();
    s.buffer = buffer; s.loop = true; s.connect(dest); s.start(0, offset);
    return s;
  }

  noiseBuffer(kind, seconds) {
    const ctx = this.ctx, n = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(2, n, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0, last = 0;
      for (let i = 0; i < n; i++) {
        const w = Math.random() * 2 - 1;
        if (kind === 'white') d[i] = w * 0.5;
        else if (kind === 'brown') { last = (last + 0.02 * w) / 1.02; d[i] = last * 3.2; }
        else {
          b0 = 0.99886 * b0 + w * 0.0555179; b1 = 0.99332 * b1 + w * 0.0750759; b2 = 0.969 * b2 + w * 0.153852;
          b3 = 0.8665 * b3 + w * 0.3104856; b4 = 0.55 * b4 + w * 0.5329522; b5 = -0.7616 * b5 - w * 0.016898;
          d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11; b6 = w * 0.115926;
        }
      }
      const f = Math.floor(ctx.sampleRate * 0.05);
      for (let i = 0; i < f; i++) { const k = i / f; d[n - f + i] = d[n - f + i] * (1 - k) + d[i] * k; }
    }
    return buf;
  }

  impulse(seconds, decay) {
    const ctx = this.ctx, n = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(2, n, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, decay);
    }
    return buf;
  }

  /** A short noise burst through a filter: the atom of footsteps and rain taps. */
  burst({ when = 0, dur = 0.08, type = 'bandpass', freq = 2000, q = 0.8, gain = 0.2, pan = 0, kind = 'white', dest, attack = 0.004, verb = null, verbAmt = 0 }) {
    const ctx = this.ctx, t = this.now() + when;
    const s = ctx.createBufferSource(); s.buffer = this.noise[kind];
    const f = this.filter(type, freq, q);
    const g = this.gain(null, 0);
    s.connect(f); f.connect(g); g.connect(this.panner(pan, dest || this.sfxBus));
    if (verb) g.connect(this.gain(verb, verbAmt));
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + attack);
    g.gain.setTargetAtTime(0, t + attack, dur / 3);
    s.start(t, Math.random() * 2);
    s.stop(t + dur + 0.3);
  }

  /** A decaying sine partial (metal rings, frog blips). */
  tone({ when = 0, f0, f1 = f0, dur = 0.2, gain = 0.1, pan = 0, type = 'sine', dest, attack = 0.003, verb = null, verbAmt = 0 }) {
    const ctx = this.ctx, t = this.now() + when;
    const o = ctx.createOscillator(); o.type = type;
    o.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const g = this.gain(null, 0);
    o.connect(g); g.connect(this.panner(pan, dest || this.sfxBus));
    if (verb) g.connect(this.gain(verb, verbAmt));
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + attack);
    g.gain.setTargetAtTime(0, t + attack, dur / 3.5);
    o.start(t); o.stop(t + dur + 0.4);
  }

  // -------------------------------------------------------------------- beds
  buildBeds() {
    // wind: a low body and the dry clatter of palm fronds, both following the gusts
    this.windGain = this.gain(this.ambBus, 0);
    this.windBP = this.filter('bandpass', 420, 0.8, this.windGain);
    this.loop(this.noise.pink, this.windBP, 1.3);
    this.frondGain = this.gain(this.ambBus, 0);
    this.frondBP = this.filter('bandpass', 4200, 0.6, this.frondGain);
    this.loop(this.noise.white, this.filter('highpass', 2200, 0.5, this.frondBP), 2.7);
    // the downpour: hiss on the lawn, patter on the concrete and the low roar of heavy tropical rain
    this.rainGain = this.gain(this.ambBus, 0);
    this.loop(this.noise.white, this.filter('highpass', 900, 0.5, this.filter('lowpass', 8000, 0.5, this.rainGain)), 1.1);
    this.patterGain = this.gain(this.ambBus, 0);
    this.loop(this.noise.pink, this.filter('bandpass', 2400, 0.9, this.patterGain), 3.3);
    this.roarGain = this.gain(this.ambBus, 0);
    this.loop(this.noise.brown, this.filter('lowpass', 420, 0.6, this.roarGain), 4.1);
    // the city behind the trees: a far, low hum
    this.cityGain = this.gain(this.ambBus, 0);
    this.loop(this.noise.brown, this.filter('lowpass', 190, 0.6, this.cityGain), 0.7);
  }

  /** Crickets: a high sine chopped into pulses, the pulses grouped into chirps. Three of them, out of step. */
  buildCrickets() {
    const ctx = this.ctx;
    this.crickets = this.gain(this.ambBus, 0);
    for (const [f, pulse, chirp, pan] of [[4350, 31, 2.1, -0.45], [4720, 27, 1.55, 0.5], [5100, 36, 3.3, 0.1]]) {
      const o = ctx.createOscillator(); o.frequency.value = f;
      const a = this.gain(null, 0.5); const b = this.gain(null, 0.5);
      const lfo1 = ctx.createOscillator(); lfo1.type = 'square'; lfo1.frequency.value = pulse;
      const lfo2 = ctx.createOscillator(); lfo2.type = 'square'; lfo2.frequency.value = chirp;
      lfo1.connect(this.gain(a.gain, 0.5)); lfo2.connect(this.gain(b.gain, 0.5));
      o.connect(a); a.connect(b); b.connect(this.panner(pan, this.crickets));
      o.start(); lfo1.start(); lfo2.start();
    }
  }

  buildPad() {
    const ctx = this.ctx;
    this.padOut = this.gain(this.musicBus, 0);
    this.padLP = this.filter('lowpass', 750, 0.4, this.padOut);
    this.padLP.connect(this.musicVerb);
    this.padVoices = [];
    for (let i = 0; i < 6; i++) {
      const g = this.gain(this.padLP, 0);
      const o1 = ctx.createOscillator(); o1.type = 'sine';
      const o2 = ctx.createOscillator(); o2.type = 'triangle'; o2.detune.value = rr(6, 11);
      o1.connect(g); o2.connect(this.gain(g, 0.3));
      o1.start(); o2.start();
      this.padVoices.push({ g, o1, o2 });
    }
    const lfo = ctx.createOscillator(); lfo.frequency.value = 0.05;
    lfo.connect(this.gain(this.padLP.frequency, 220)); lfo.start();
    this.setChord(0, 0.1);
  }

  setChord(i, glide = 4) {
    const now = this.now();
    CHORDS[i].forEach((m, k) => {
      const v = this.padVoices[k], f = midi(m);
      v.o1.frequency.setTargetAtTime(f, now, glide / 3);
      v.o2.frequency.setTargetAtTime(f, now, glide / 3);
      v.g.gain.setTargetAtTime(k < 2 ? 0.04 : 0.026, now, glide / 3);
    });
  }

  // ------------------------------------------------------------------ one-shots
  play(name, { gain = 1, rate = 1, pan = 0, bus = this.sfxBus, verb = null, verbAmt = 0, when = 0 } = {}) {
    if (!this.ctx || !this.buffers[name]) return;
    const s = this.ctx.createBufferSource();
    s.buffer = this.buffers[name];
    s.playbackRate.value = rate;
    const g = this.gain(null, gain);
    s.connect(g); g.connect(this.panner(pan, bus));
    if (verb) g.connect(this.gain(verb, verbAmt));
    s.start(this.now() + when);
  }
  ui(name, gain = 0.6) { this.play(name, { gain, bus: this.uiBus }); }

  /** A bird voice: one oscillator, a small score of glides. Returns helpers to write the score. */
  voice({ type = 'sine', gain = 0.1, pan = rr(-0.9, 0.9), lp = 9000, verbAmt = 0.45 } = {}) {
    const ctx = this.ctx, t0 = this.now() + 0.05;
    const out = this.gain(null, gain);
    const f = this.filter('lowpass', lp, 0.5);
    out.connect(f); f.connect(this.panner(pan, this.ambBus));
    out.connect(this.gain(this.airVerb, verbAmt));
    const o = ctx.createOscillator(); o.type = type;
    const env = this.gain(out, 0);
    o.connect(env);
    const note = (t, f0, f1, d, a = 1) => {
      o.frequency.setValueAtTime(f0, t);
      o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + d);
      env.gain.setValueAtTime(0, t);
      env.gain.linearRampToValueAtTime(a, t + Math.min(0.012, d / 3));
      env.gain.setValueAtTime(a, t + d * 0.7);
      env.gain.linearRampToValueAtTime(0, t + d);
    };
    return { o, env, out, t0, note, end: (t) => { o.start(t0); o.stop(t + 0.15); } };
  }

  /** Tropical birds of the park. */
  bird(kind) {
    if (!this.ctx) return;
    const dist = rr(0.3, 1);
    if (kind === 'kiskadee') {          // "bien-te-veo": loud, nasal, three notes
      const v = this.voice({ type: 'triangle', gain: 0.09 * dist, lp: 6000 });
      let t = v.t0;
      const s = rr(0.95, 1.08);
      v.note(t, 1900 * s, 2300 * s, 0.09, 0.8); t += 0.13;
      v.note(t, 2700 * s, 2600 * s, 0.07, 0.75); t += 0.11;
      v.note(t, 3300 * s, 1900 * s, 0.34, 1); t += 0.4;
      v.end(t);
    } else if (kind === 'oropendola') { // liquid gurgle rising, then a dropping "plop"
      const v = this.voice({ type: 'sine', gain: 0.1 * dist, lp: 5000, verbAmt: 0.7 });
      const bub = this.ctx.createOscillator(); bub.frequency.value = rr(28, 36);
      bub.connect(this.gain(v.o.frequency, 160)); bub.start(v.t0);
      let t = v.t0;
      v.note(t, 420, 1600, 0.32, 0.9); t += 0.36;
      v.note(t, 1500, 900, 0.1, 0.7); t += 0.14;
      v.note(t, 1300, 260, 0.2, 1); t += 0.26;
      bub.stop(t + 0.2);
      v.end(t);
    } else if (kind === 'tanager') {    // a bright, quick, slightly buzzy run
      const v = this.voice({ gain: 0.06 * dist });
      let t = v.t0;
      const n = 5 + Math.floor(rr(0, 6)), base = rr(4200, 5600);
      for (let i = 0; i < n; i++) { const f = base * rr(0.85, 1.2); v.note(t, f, f * rr(0.75, 1.1), 0.05, rr(0.6, 1)); t += rr(0.06, 0.1); }
      v.end(t);
    } else if (kind === 'trill') {      // a small bird's trill
      const v = this.voice({ gain: 0.05 * dist });
      const am = this.ctx.createOscillator(); am.type = 'square'; am.frequency.value = rr(16, 24);
      const f = rr(3800, 5200), d = rr(0.7, 1.4);
      v.note(v.t0, f, f * rr(0.92, 1.05), d, 0.9);
      am.connect(this.gain(v.env.gain, 0.5)); am.start(v.t0); am.stop(v.t0 + d + 0.1);
      v.end(v.t0 + d);
    } else if (kind === 'chirps') {     // sparrows chattering
      const v = this.voice({ gain: 0.07 * dist });
      let t = v.t0;
      const n = 3 + Math.floor(rr(0, 5));
      for (let i = 0; i < n; i++) { const f = rr(4600, 6000); v.note(t, f, f * 0.62, 0.045, 0.8); t += rr(0.07, 0.13); }
      v.end(t);
    } else {                            // a ground dove, low and far: "cu-cuu"
      const v = this.voice({ type: 'triangle', gain: 0.06 * dist, lp: 900, verbAmt: 0.6 });
      let t = v.t0;
      const f = rr(430, 500);
      for (let k = 0; k < 2 + Math.floor(rr(0, 3)); k++) {
        v.note(t, f, f * 0.95, 0.18, 0.8); t += 0.26;
        v.note(t, f * 1.04, f * 0.9, 0.42, 1); t += 0.9;
      }
      v.end(t);
    }
  }

  /** A flock of parrots crossing the sky: harsh squawks that pan from one side to the other. */
  parrots() {
    if (!this.ctx) return;
    const n = 4 + Math.floor(rr(0, 6)), from = pick([-1, 1]);
    for (let i = 0; i < n; i++) {
      const when = (i / n) * rr(2, 3.2) + rr(0, 0.2);
      const pan = from * (1 - (2 * i) / Math.max(1, n - 1)) * 0.85;
      const ctx = this.ctx, t = this.now() + when;
      const o = ctx.createOscillator(); o.type = 'sawtooth';
      const f = rr(1500, 2100);
      o.frequency.setValueAtTime(f, t);
      o.frequency.linearRampToValueAtTime(f * rr(1.3, 1.6), t + 0.05);
      o.frequency.linearRampToValueAtTime(f * rr(0.8, 1.0), t + rr(0.12, 0.2));
      const bp = this.filter('bandpass', rr(1800, 2600), 2.5);
      const g = this.gain(null, 0);
      o.connect(bp); bp.connect(g); g.connect(this.panner(pan, this.ambBus));
      g.connect(this.gain(this.airVerb, 0.5));
      const a = rr(0.05, 0.09);
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(a, t + 0.015);
      g.gain.setValueAtTime(a, t + 0.1); g.gain.linearRampToValueAtTime(0, t + 0.22);
      o.start(t); o.stop(t + 0.3);
    }
  }

  /** A cicada in the trees: a rasping buzz that swells, holds, and falls away in pitch. */
  cicada() {
    if (!this.ctx) return;
    const ctx = this.ctx, t = this.now() + 0.05;
    const pan = rr(-0.85, 0.85), f = rr(4300, 6200), rise = rr(2, 4), hold = rr(4, 9), fall = rr(1.5, 2.5);
    const s = ctx.createBufferSource(); s.buffer = this.noise.white; s.loop = true;
    const bp = this.filter('bandpass', f, 7);
    const am = this.gain(null, 0.5);
    const lfo = ctx.createOscillator(); lfo.type = 'square'; lfo.frequency.value = rr(110, 200);
    lfo.connect(this.gain(am.gain, 0.5));
    const g = this.gain(null, 0);
    s.connect(bp); bp.connect(am); am.connect(g); g.connect(this.panner(pan, this.ambBus));
    const peak = rr(0.13, 0.24);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(peak, t + rise);
    g.gain.setValueAtTime(peak, t + rise + hold);
    g.gain.linearRampToValueAtTime(0, t + rise + hold + fall);
    bp.frequency.setValueAtTime(f * 0.92, t);
    bp.frequency.linearRampToValueAtTime(f, t + rise);
    bp.frequency.setValueAtTime(f, t + rise + hold);
    bp.frequency.exponentialRampToValueAtTime(f * 0.55, t + rise + hold + fall);
    lfo.frequency.setValueAtTime(lfo.frequency.value, t + rise + hold);
    lfo.frequency.linearRampToValueAtTime(lfo.frequency.value * 0.6, t + rise + hold + fall);
    const end = t + rise + hold + fall + 0.1;
    s.start(t, rr(0, 2)); lfo.start(t); s.stop(end); lfo.stop(end);
  }

  /** Tree frogs at night: short tonal "pik" calls in runs; several frogs answer each other. */
  frog() {
    if (!this.ctx) return;
    const pan = rr(-0.9, 0.9), f = rr(2000, 3000), n = 3 + Math.floor(rr(0, 7)), gap = rr(0.18, 0.32);
    const g = rr(0.04, 0.07);
    for (let i = 0; i < n; i++) {
      this.tone({ when: i * gap + rr(0, 0.02), f0: f * 1.12, f1: f * 0.88, dur: 0.035, gain: g, pan, dest: this.ambBus, verb: this.airVerb, verbAmt: 0.6 });
    }
  }

  /** A toad's low trill from the wet grass. */
  toad() {
    if (!this.ctx) return;
    const ctx = this.ctx, t = this.now() + 0.05, d = rr(1.2, 3);
    const o = ctx.createOscillator(); o.type = 'triangle'; o.frequency.value = rr(420, 560);
    const am = this.gain(null, 0.5);
    const lfo = ctx.createOscillator(); lfo.type = 'square'; lfo.frequency.value = rr(24, 34);
    lfo.connect(this.gain(am.gain, 0.5));
    const g = this.gain(null, 0);
    o.connect(am); am.connect(g); g.connect(this.panner(rr(-0.8, 0.8), this.filter('lowpass', 1400, 0.5, this.ambBus)));
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.035, t + 0.15);
    g.gain.setValueAtTime(0.035, t + d - 0.2); g.gain.linearRampToValueAtTime(0, t + d);
    o.start(t); lfo.start(t); o.stop(t + d + 0.1); lfo.stop(t + d + 0.1);
  }

  /** Something far off in the city: a motorbike passing or a short horn, through the trees. */
  cityEvent() {
    if (!this.ctx) return;
    const ctx = this.ctx, t = this.now() + 0.05;
    const lp = this.filter('lowpass', 700, 0.5, this.ambBus);
    if (Math.random() < 0.65) {
      const d = rr(3, 6), from = pick([-1, 1]);
      const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = rr(70, 95);
      const g = this.gain(null, 0), p = ctx.createStereoPanner();
      o.connect(g); g.connect(p); p.connect(lp);
      p.pan.setValueAtTime(from * 0.9, t); p.pan.linearRampToValueAtTime(-from * 0.9, t + d);
      o.frequency.setValueAtTime(o.frequency.value, t); o.frequency.linearRampToValueAtTime(o.frequency.value * rr(1.2, 1.5), t + d * 0.5);
      o.frequency.linearRampToValueAtTime(o.frequency.value * 0.9, t + d);
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.045, t + d * 0.5); g.gain.linearRampToValueAtTime(0, t + d);
      o.start(t); o.stop(t + d + 0.1);
    } else {
      const pan = rr(-0.8, 0.8);
      for (const [when, d] of [[0, 0.18], [0.26, 0.32]]) {
        for (const f of [410, 515]) this.tone({ when, f0: f, dur: d, gain: 0.016, type: 'square', pan, dest: lp, attack: 0.01 });
      }
    }
  }

  /** One footstep: 'grass' | 'concrete' | 'metal'. */
  step(surface, pan = 0) {
    if (!this.ctx) return;
    const v = rr(0.85, 1.15);
    if (surface === 'grass') {
      this.burst({ dur: 0.16, freq: 1500 * v, q: 0.5, gain: 0.05, kind: 'pink', attack: 0.02, pan });
      this.burst({ when: 0.05, dur: 0.1, freq: 3000 * v, q: 0.7, gain: 0.022, pan });
      if (this.state.rain > 0.3) this.burst({ when: 0.02, dur: 0.12, freq: 900, q: 0.8, gain: 0.04, kind: 'pink', pan }); // wet
    } else if (surface === 'concrete') {
      this.burst({ dur: 0.05, type: 'lowpass', freq: 280, gain: 0.16, kind: 'brown', pan });
      this.burst({ dur: 0.022, freq: 2400 * v, q: 1.3, gain: 0.06, pan, verb: this.airVerb, verbAmt: 0.3 });
    } else {
      // the steel stair: a dull thump and the ring of the tread
      this.burst({ dur: 0.05, type: 'lowpass', freq: 220, gain: 0.16, kind: 'brown', pan });
      for (const [f, a, d] of [[412, 0.05, 0.35], [1130, 0.035, 0.25], [2270, 0.02, 0.18], [3480, 0.012, 0.12]]) {
        this.tone({ f0: f * v, dur: d, gain: a, pan, verb: this.airVerb, verbAmt: 0.4 });
      }
    }
  }

  drip(gain = 0.4, pan = rr(-0.7, 0.7)) {
    this.play(pick(['drip_drop_1', 'drip_drop_2', 'drip_plink_1', 'drip_plink_2', 'drip_tiny_1', 'drip_tiny_2']),
      { gain, pan, rate: rr(0.75, 1.15), verb: this.airVerb, verbAmt: 0.2 });
  }

  /** Thunder rolling off the cordillera: long and low. */
  thunder(distance = 0.5) {
    if (!this.ctx) return;
    const delay = 0.4 + distance * 3.5, t0 = this.now();
    const g = 0.9 - distance * 0.45;
    const lp = this.filter('lowpass', 520 - distance * 260, 0.5, this.sfxBus);
    lp.connect(this.gain(this.airVerb, 0.7));
    const mk = (name, gain, rate, when) => {
      if (!this.buffers[name]) return;
      const s = this.ctx.createBufferSource(); s.buffer = this.buffers[name]; s.playbackRate.value = rate;
      s.connect(this.gain(lp, gain)); s.start(t0 + when);
    };
    mk('thunder_body', g, rr(0.42, 0.58), delay);
    mk('thunder_roll', g * 0.75, rr(0.38, 0.5), delay + rr(0.2, 0.8));
    mk('thunder_roll', g * 0.45, rr(0.33, 0.4), delay + rr(2, 3.5));      // the echo off the mountains
    const now = t0 + delay, ng = this.gain(lp, 0);
    const s = this.ctx.createBufferSource(); s.buffer = this.noise.brown; s.connect(ng); s.start(now, rr(0, 3));
    ng.gain.setValueAtTime(0, now);
    ng.gain.linearRampToValueAtTime(g * 1.2, now + 0.3);
    ng.gain.setTargetAtTime(0, now + 0.8, 1.8);
    s.stop(now + 10);
  }

  /** Arriving at the lookout: a few rising marimba notes. */
  lookout() {
    [3, 5, 6, 8, 10].forEach((i, k) => this.play(MARIMBA[i], { gain: 0.13, bus: this.uiBus, when: k * 0.12, verb: this.musicVerb, verbAmt: 0.4 }));
  }

  // --------------------------------------------------------------- settings
  setVolume(v) { this.volume = v; if (this.ctx) this.master.gain.setTargetAtTime(v, this.now(), 0.1); }
  setAmbient(on) { this.ambientOn = on; if (this.ctx) this.ambBus.gain.setTargetAtTime(on ? 1 : 0, this.now(), 0.5); }
  setMusic(on) { this.musicOn = on; if (this.ctx) this.musicBus.gain.setTargetAtTime(on ? MUSIC : 0, this.now(), 0.8); }

  // -------------------------------------------------------------- music
  /** A marimba phrase over the current chord: a short ostinato, sometimes with a tremolo on the last note. */
  phrase() {
    const pool = CHORD_NOTES[this._chord];
    const night = this.state.night > 0.5;
    const n = night ? 2 + Math.floor(rr(0, 3)) : 3 + Math.floor(rr(0, 5));
    const beat = night ? rr(0.3, 0.42) : rr(0.19, 0.26);
    let idx = pick(pool), when = 0;
    const pan = rr(-0.3, 0.3);
    for (let i = 0; i < n; i++) {
      // step along the pool (mostly by neighbours), a little louder on the first note
      const k = pool.indexOf(idx) + pick([-1, 1, 1, 2, -2]);
      idx = pool[clamp(k, 0, pool.length - 1)];
      const gain = (i === 0 ? 0.3 : rr(0.18, 0.26)) * (night ? 0.75 : 1);
      this.play(MARIMBA[idx], { gain, bus: this.musicBus, pan: pan + rr(-0.1, 0.1), verb: this.musicVerb, verbAmt: 0.5, when });
      // the bass note an octave-ish below on the downbeat
      if (i === 0 && Math.random() < 0.5) this.play(MARIMBA[clamp(idx - 5, 0, 4)], { gain: 0.2, bus: this.musicBus, pan: -0.15, when });
      when += beat * (Math.random() < 0.2 ? 2 : 1);
    }
    // marimba tremolo on the last note now and then
    if (!night && Math.random() < 0.35) {
      for (let r = 1; r <= 4; r++) this.play(MARIMBA[idx], { gain: 0.12 - r * 0.02, bus: this.musicBus, pan, when: when - beat + r * 0.07 });
    }
    // a dry bamboo on the off-beats
    if (!night && Math.random() < 0.4) {
      for (let i = 0; i < n; i += 2) this.play('bamboo_tok', { gain: 0.1, bus: this.musicBus, pan: 0.35, rate: rr(0.95, 1.05), when: i * beat + beat / 2 });
    }
  }

  // ------------------------------------------------------------------- tick
  update(dt) {
    if (!this.ctx || this.ctx.state !== 'running') return;
    const now = this.now(), st = this.state, T = this._t;
    const w = st.wind, r = st.rain, day = 1 - st.night, h = st.hour, up = st.height;
    const gust = 0.55 + 0.25 * Math.sin(now * 0.31) + 0.2 * Math.sin(now * 0.83 + 1.3);
    const windK = w + up * 0.25;

    this.windGain.gain.setTargetAtTime((0.015 + windK * windK * 0.16) * gust * (1 + up * 0.6), now, 0.5);
    this.windBP.frequency.setTargetAtTime(320 + windK * 420 + gust * 120 + up * 200, now, 0.5);
    this.frondGain.gain.setTargetAtTime((0.005 + w * 0.045) * gust * gust, now, 0.3);
    this.frondBP.frequency.setTargetAtTime(3600 + gust * 1600, now, 0.3);
    this.rainGain.gain.setTargetAtTime(r * 0.2, now, 0.8);
    this.patterGain.gain.setTargetAtTime(r * 0.08, now, 0.8);
    this.roarGain.gain.setTargetAtTime(r * r * 0.12, now, 1.2);
    this.cityGain.gain.setTargetAtTime((0.012 + day * 0.012) * (1 - r * 0.6), now, 2);
    const cricketK = st.night * (1 - r) * (1 - w * 0.6);
    this.crickets.gain.setTargetAtTime(cricketK * 0.011, now, 1.5);
    this.padOut.gain.setTargetAtTime(this.musicOn ? 0.42 - st.night * 0.08 : 0, now, 2);

    // ---- events
    for (const k in T) T[k] -= dt;
    // birds: a dawn chorus and an evening one, quiet under heavy rain and at night
    const chorus = 1 + 1.6 * Math.exp(-((h - 6.4) ** 2) / 1.0) + 0.9 * Math.exp(-((h - 17.6) ** 2) / 1.2);
    const birdK = day * (1 - r * 0.85) * (1 - st.storm) * chorus;
    if (T.bird <= 0) {
      if (birdK > 0.05 && Math.random() < birdK) {
        const kind = h < 8.5 && Math.random() < 0.3 ? 'dove'
          : pick(['kiskadee', 'kiskadee', 'oropendola', 'tanager', 'tanager', 'trill', 'chirps', 'dove']);
        this.bird(kind);
      }
      T.bird = rr(1.4, 5.5) / Math.max(0.3, birdK);
    }
    if (T.parrots <= 0) {
      if (day > 0.5 && r < 0.3 && (h < 9.5 || h > 16)) this.parrots();
      T.parrots = rr(40, 110);
    }
    // cicadas in the heat: late morning to late afternoon, dry weather
    const heat = day * Math.exp(-((h - 14) ** 2) / 8) * (1 - r) * (1 - st.storm);
    if (T.cicada <= 0) {
      if (heat > 0.2 && Math.random() < heat) this.cicada();
      T.cicada = rr(6, 18) / Math.max(0.4, heat);
    }
    // frogs and toads at night, more after rain
    const wet = st.night * (1 - r * 0.7) * (1 + (this._wet || 0));
    if (r > 0.3) this._wet = 1; else this._wet = Math.max(0, (this._wet || 0) - dt / 600);
    if (T.frog <= 0) {
      if (wet > 0.3 && Math.random() < wet) this.frog();
      T.frog = rr(0.6, 3) / Math.max(0.3, wet);
    }
    if (T.toad <= 0) {
      if (wet > 0.5) this.toad();
      T.toad = rr(10, 30);
    }
    if (T.city <= 0) {
      if (r < 0.5) this.cityEvent();
      T.city = rr(18, 55) * (st.night > 0.5 ? 1.8 : 1);
    }
    // big drops off the palms and trees in the rain
    if (r > 0.05 && T.drip <= 0) {
      this.drip(0.08 + r * 0.16);
      T.drip = rr(0.05, 0.45) / (0.2 + r * 1.4);
    }

    // generative marimba over the pad
    if (this.musicOn) {
      if (T.chord <= 0) {
        this._chord = (this._chord + 1) % CHORDS.length;
        this.setChord(this._chord);
        T.chord = rr(12, 18);
      }
      if (T.phrase <= 0) {
        this.phrase();
        T.phrase = rr(3.2, 7.5) * (st.night > 0.5 ? 1.4 : 1);
      }
    }
  }
}
