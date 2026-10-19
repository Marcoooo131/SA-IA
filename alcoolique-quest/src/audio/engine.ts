// Moteur audio : synthèse en temps réel (Web Audio API), réverbérations générées, ordonnanceur à anticipation
// calé sur l'horloge audio — c'est cette horloge qui pilote la cinématique (synchronisation image/son exacte).
import { rng } from '../core/math';

export interface Cue {
  t: number;
  dur: number;
  music?: boolean;
  fn: (when: number) => void;
}

const NOTE: Record<string, number> = { C: 0, 'C#': 1, Db: 1, D: 2, 'D#': 3, Eb: 3, E: 4, F: 5, 'F#': 6, Gb: 6, G: 7, 'G#': 8, Ab: 8, A: 9, 'A#': 10, Bb: 10, B: 11 };
/** 'D4' → fréquence en Hz. */
export function hz(n: string): number {
  const m = /^([A-G][#b]?)(-?\d)$/.exec(n);
  if (!m) throw new Error('Note invalide ' + n);
  const midi = (parseInt(m[2]) + 1) * 12 + NOTE[m[1]];
  return 440 * Math.pow(2, (midi - 69) / 12);
}
export const chord = (s: string) => s.split(' ').map(hz);

const VOWELS: Record<string, [number, number, number]> = {
  a: [800, 1150, 2900],
  o: [450, 800, 2830],
  u: [325, 700, 2530],
  e: [400, 1600, 2700],
};

export class AudioEngine {
  ctx: AudioContext | null = null;
  private master!: GainNode;
  private session!: GainNode;
  music!: GainNode;
  sfx!: GainNode;
  private hall!: ConvolverNode;
  private cathedral!: ConvolverNode;
  private hallSend!: GainNode;
  private cathSend!: GainNode;
  private noise!: AudioBuffer;
  private sources = new Set<AudioScheduledSourceNode>();
  private cues: Cue[] = [];
  private scheduled = 0;
  private startCtx = 0;
  private offset = 0;
  private timer: number | null = null;
  private running = false;
  private externalMusic: AudioBuffer | null = null;
  externalVoices: Record<string, AudioBuffer> = {};
  muted = false;
  onVoice: ((id: string, text: string, when: number) => void) | null = null;

  /** Doit être appelé lors d'un geste utilisateur (politique d'autoplay des navigateurs). */
  async init() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') await this.ctx.resume();
      return;
    }
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx({ latencyHint: 'playback' });
    this.ctx = ctx;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.knee.value = 12;
    comp.ratio.value = 4;
    comp.attack.value = 0.005;
    comp.release.value = 0.25;
    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.9;
    this.master.connect(comp).connect(ctx.destination);
    this.hall = ctx.createConvolver();
    this.hall.buffer = this.impulse(3.2, 2.6, 1);
    this.cathedral = ctx.createConvolver();
    this.cathedral.buffer = this.impulse(7.5, 2.2, 2);
    this.hallSend = ctx.createGain();
    this.cathSend = ctx.createGain();
    this.hallSend.gain.value = 0.55;
    this.cathSend.gain.value = 0.7;
    this.hallSend.connect(this.hall).connect(this.master);
    this.cathSend.connect(this.cathedral).connect(this.master);
    this.noise = ctx.createBuffer(1, ctx.sampleRate * 4, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    this.newSession();
    // iOS/Android : la synthèse vocale doit être « débloquée » pendant le geste utilisateur
    if ('speechSynthesis' in window) {
      speechSynthesis.getVoices();
      const u = new SpeechSynthesisUtterance(' ');
      u.volume = 0;
      speechSynthesis.speak(u);
    }
    if (ctx.state === 'suspended') await ctx.resume();
    await this.loadOptionalAssets();
  }

  /** Fichiers audio facultatifs (public/audio/) : remplacent la musique synthétique ou la voix de synthèse. */
  private async loadOptionalAssets() {
    const tryLoad = async (path: string) => {
      try {
        const res = await fetch(path, { cache: 'force-cache' });
        if (!res.ok || !(res.headers.get('content-type') ?? '').startsWith('audio')) return null;
        return await this.ctx!.decodeAudioData(await res.arrayBuffer());
      } catch {
        return null;
      }
    };
    const base = import.meta.env.BASE_URL + 'audio/';
    const [score, v1, v2] = await Promise.all([tryLoad(base + 'score.mp3'), tryLoad(base + 'voice-1.mp3'), tryLoad(base + 'voice-2.mp3')]);
    this.externalMusic = score;
    if (v1) this.externalVoices['voice-1'] = v1;
    if (v2) this.externalVoices['voice-2'] = v2;
  }

  get available() {
    return !!this.ctx;
  }

  private impulse(seconds: number, decay: number, seed: number) {
    const ctx = this.ctx!;
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    const r = rng(seed);
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c);
      for (let i = 0; i < len; i++) {
        const t = i / len;
        // premières réflexions discrètes + queue diffuse
        const early = i < ctx.sampleRate * 0.08 && r.next() < 0.004 ? r.range(-1, 1) * 0.8 : 0;
        d[i] = (r.range(-1, 1) * Math.pow(1 - t, decay) + early) * (1 - Math.exp(-i / 200));
      }
    }
    return buf;
  }

  private newSession() {
    const ctx = this.ctx!;
    this.session = ctx.createGain();
    this.session.connect(this.master);
    this.music = ctx.createGain();
    this.music.gain.value = 0.8;
    this.sfx = ctx.createGain();
    this.sfx.gain.value = 1;
    this.music.connect(this.session);
    this.sfx.connect(this.session);
  }

  setMuted(m: boolean) {
    this.muted = m;
    if (this.ctx) this.master.gain.setTargetAtTime(m ? 0 : 0.9, this.ctx.currentTime, 0.05);
    if (m && 'speechSynthesis' in window) speechSynthesis.cancel();
  }

  setCues(cues: Cue[]) {
    this.cues = [...cues].sort((a, b) => a.t - b.t);
  }

  /** Démarre la lecture à `offset` secondes de la timeline. */
  start(offset = 0) {
    this.stop(0.05);
    this.offset = offset;
    if (!this.ctx) {
      this.startCtx = performance.now() / 1000;
      this.running = true;
      return;
    }
    this.newSession();
    this.startCtx = this.ctx.currentTime + 0.12;
    this.scheduled = 0;
    // indices des repères encore actifs (y compris ceux commencés avant l'offset mais pas terminés)
    this.running = true;
    if (this.externalMusic) {
      const src = this.ctx.createBufferSource();
      src.buffer = this.externalMusic;
      src.connect(this.music);
      src.start(this.startCtx, offset);
      this.track(src);
    }
    this.pump();
    this.timer = window.setInterval(() => this.pump(), 50);
  }

  /** Temps courant de la timeline (s). */
  time(): number {
    if (!this.running) return this.offset;
    if (!this.ctx) return performance.now() / 1000 - this.startCtx + this.offset;
    return Math.max(this.offset, this.ctx.currentTime - this.startCtx + this.offset);
  }

  private pump() {
    if (!this.ctx || !this.running) return;
    const horizon = this.time() + 1.2;
    while (this.scheduled < this.cues.length && this.cues[this.scheduled].t < horizon) {
      const c = this.cues[this.scheduled++];
      if (c.t + c.dur < this.offset) continue;
      if (c.music && this.externalMusic) continue;
      try {
        c.fn(this.startCtx + (c.t - this.offset));
      } catch (e) {
        console.warn('Repère audio ignoré', e);
      }
    }
  }

  stop(fade = 0.3) {
    this.running = false;
    if (this.timer !== null) clearInterval(this.timer);
    this.timer = null;
    if ('speechSynthesis' in window) speechSynthesis.cancel();
    if (!this.ctx || !this.session) return;
    const now = this.ctx.currentTime;
    const s = this.session;
    s.gain.cancelScheduledValues(now);
    s.gain.setValueAtTime(s.gain.value, now);
    s.gain.linearRampToValueAtTime(0, now + fade);
    const srcs = [...this.sources];
    this.sources.clear();
    setTimeout(() => {
      for (const src of srcs) {
        try { src.stop(); } catch { /* déjà arrêté */ }
      }
      s.disconnect();
    }, fade * 1000 + 60);
  }

  // ------------------------------------------------------------------ primitives
  private track<T extends AudioScheduledSourceNode>(n: T): T {
    this.sources.add(n);
    n.addEventListener('ended', () => this.sources.delete(n));
    return n;
  }
  private gain(v = 1) {
    const g = this.ctx!.createGain();
    g.gain.value = v;
    return g;
  }
  private out(node: AudioNode, bus: 'music' | 'sfx', wet = 0, space: 'hall' | 'cathedral' = 'hall') {
    node.connect(bus === 'music' ? this.music : this.sfx);
    if (wet > 0) {
      const s = this.gain(wet);
      node.connect(s);
      s.connect(space === 'hall' ? this.hallSend : this.cathSend);
    }
  }
  /** Enveloppe ADSR simple sur un gain. */
  private env(g: GainNode, when: number, a: number, hold: number, r: number, peak: number) {
    const p = g.gain;
    p.setValueAtTime(0.0001, when);
    p.linearRampToValueAtTime(peak, when + a);
    p.setValueAtTime(peak, when + a + hold);
    p.exponentialRampToValueAtTime(0.0001, when + a + hold + r);
  }
  private osc(type: OscillatorType, f: number, when: number, dur: number, dest: AudioNode, detune = 0) {
    const o = this.ctx!.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f, when);
    o.detune.value = detune;
    o.connect(dest);
    o.start(when);
    o.stop(when + dur + 0.05);
    return this.track(o);
  }
  private noiseSrc(when: number, dur: number, dest: AudioNode, rate = 1) {
    const s = this.ctx!.createBufferSource();
    s.buffer = this.noise;
    s.loop = true;
    s.playbackRate.value = rate;
    s.connect(dest);
    s.start(when, Math.random() * 3);
    s.stop(when + dur + 0.05);
    return this.track(s);
  }
  private filter(type: BiquadFilterType, f: number, q = 0.7) {
    const b = this.ctx!.createBiquadFilter();
    b.type = type;
    b.frequency.value = f;
    b.Q.value = q;
    return b;
  }
  private shaper(amount: number) {
    const ws = this.ctx!.createWaveShaper();
    const n = 1024;
    const curve = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const x = (i / (n - 1)) * 2 - 1;
      curve[i] = Math.tanh(x * amount);
    }
    ws.curve = curve;
    return ws;
  }

  // ------------------------------------------------------------------ instruments (orchestre synthétique)
  /** Nappe de cordes / pupitre tenu. */
  pad(freqs: number[], when: number, dur: number, o: { vol?: number; cutoff?: number; attack?: number; release?: number; wet?: number; space?: 'hall' | 'cathedral' } = {}) {
    const g = this.gain(0);
    const lp = this.filter('lowpass', o.cutoff ?? 1400, 0.8);
    lp.connect(g);
    const attack = o.attack ?? 1.2, release = o.release ?? 1.5;
    this.env(g, when, attack, Math.max(0, dur - attack), release, (o.vol ?? 0.12) / Math.sqrt(freqs.length));
    this.out(g, 'music', o.wet ?? 0.6, o.space);
    for (const f of freqs) {
      this.osc('sawtooth', f, when, dur + release, lp, -7);
      this.osc('sawtooth', f, when, dur + release, lp, 7);
      this.osc('triangle', f / 2, when, dur + release, lp);
    }
  }

  /** Cuivres : ouverture du filtre à l'attaque. */
  brass(freqs: number[], when: number, dur: number, vol = 0.12, wet = 0.5) {
    const g = this.gain(0);
    const lp = this.filter('lowpass', 300, 1.2);
    lp.frequency.setValueAtTime(250, when);
    lp.frequency.linearRampToValueAtTime(2600, when + 0.25);
    lp.frequency.exponentialRampToValueAtTime(1100, when + dur);
    lp.connect(g);
    this.env(g, when, 0.12, Math.max(0, dur - 0.12), 0.5, vol / Math.sqrt(freqs.length));
    this.out(g, 'music', wet);
    for (const f of freqs) {
      this.osc('sawtooth', f, when, dur + 0.5, lp, -4);
      this.osc('square', f, when, dur + 0.5, lp, 5);
    }
  }

  /** Chœur : sources riches filtrées par des formants vocaliques, vibrato. */
  choir(freqs: number[], when: number, dur: number, vowel: keyof typeof VOWELS = 'a', vol = 0.1, o: { attack?: number; release?: number; wet?: number; space?: 'hall' | 'cathedral' } = {}) {
    const ctx = this.ctx!;
    const g = this.gain(0);
    const attack = o.attack ?? 0.8, release = o.release ?? 1.4;
    this.env(g, when, attack, Math.max(0, dur - attack), release, vol / Math.sqrt(freqs.length));
    this.out(g, 'music', o.wet ?? 0.9, o.space);
    const [f1, f2, f3] = VOWELS[vowel];
    const bank = this.gain(1);
    for (const [f, q, a] of [[f1, 9, 1], [f2, 10, 0.6], [f3, 12, 0.25]] as const) {
      const bp = this.filter('bandpass', f, q);
      const ga = this.gain(a * 3);
      bank.connect(bp).connect(ga).connect(g);
    }
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 5.2;
    const lfoGain = this.gain(9);
    lfo.connect(lfoGain);
    lfo.start(when);
    lfo.stop(when + dur + release + 0.1);
    this.track(lfo);
    for (const f of freqs) {
      for (const det of [-11, 0, 12]) {
        const o2 = this.osc('sawtooth', f, when, dur + release, bank, det);
        lfoGain.connect(o2.detune);
      }
    }
  }

  /** Cordes en ostinato (notes courtes). */
  pluck(f: number, when: number, vol = 0.06, len = 0.18) {
    const g = this.gain(0);
    const lp = this.filter('lowpass', 2200, 1);
    lp.connect(g);
    this.env(g, when, 0.008, 0.02, len, vol);
    this.out(g, 'music', 0.35);
    this.osc('sawtooth', f, when, len + 0.1, lp, -6);
    this.osc('sawtooth', f, when, len + 0.1, lp, 6);
  }

  /** Taïko / timbale. */
  drum(when: number, vol = 0.6, pitch = 1, wet = 0.3) {
    const ctx = this.ctx!;
    const g = this.gain(0);
    this.env(g, when, 0.003, 0.02, 0.7, vol);
    this.out(g, 'music', wet);
    const o = this.osc('sine', 130 * pitch, when, 0.9, g);
    o.frequency.setValueAtTime(130 * pitch, when);
    o.frequency.exponentialRampToValueAtTime(42 * pitch, when + 0.25);
    const ng = this.gain(0);
    this.env(ng, when, 0.001, 0.01, 0.12, vol * 0.6);
    const lp = this.filter('lowpass', 700);
    lp.connect(ng);
    this.out(ng, 'music', wet);
    this.noiseSrc(when, 0.2, lp);
    void ctx;
  }

  /** Impact grave cinématographique. */
  boom(when: number, vol = 0.9, len = 3, wet = 0.5, space: 'hall' | 'cathedral' = 'hall') {
    const g = this.gain(0);
    this.env(g, when, 0.005, 0.05, len, vol);
    const sh = this.shaper(2);
    sh.connect(g);
    this.out(g, 'sfx', wet, space);
    const o = this.osc('sine', 62, when, len + 0.2, sh);
    o.frequency.setValueAtTime(70, when);
    o.frequency.exponentialRampToValueAtTime(26, when + len * 0.8);
    const ng = this.gain(0);
    this.env(ng, when, 0.002, 0.05, len * 0.6, vol * 0.7);
    const lp = this.filter('lowpass', 900);
    lp.frequency.setValueAtTime(1800, when);
    lp.frequency.exponentialRampToValueAtTime(90, when + len * 0.5);
    lp.connect(ng);
    this.out(ng, 'sfx', wet, space);
    this.noiseSrc(when, len, lp);
  }

  cymbal(when: number, vol = 0.2, len = 2.5, swell = false) {
    const g = this.gain(0);
    if (swell) {
      g.gain.setValueAtTime(0.0001, when);
      g.gain.exponentialRampToValueAtTime(vol, when + len);
      g.gain.linearRampToValueAtTime(0, when + len + 0.05);
    } else this.env(g, when, 0.002, 0.05, len, vol);
    const hp = this.filter('highpass', 5000);
    hp.connect(g);
    this.out(g, 'music', 0.5);
    this.noiseSrc(when, len + 0.1, hp);
  }

  /** Choc métallique (épées, enclume) : partiels inharmoniques. */
  clang(when: number, vol = 0.3, base = 520, len = 1.2) {
    const g = this.gain(1);
    this.out(g, 'sfx', 0.45);
    for (const [k, a] of [[1, 1], [2.76, 0.6], [5.4, 0.4], [8.93, 0.25], [13.3, 0.15]] as const) {
      const pg = this.gain(0);
      this.env(pg, when, 0.001, 0.0, len / k ** 0.3, vol * a);
      pg.connect(g);
      this.osc('sine', base * k, when, len, pg);
    }
    const ng = this.gain(0);
    this.env(ng, when, 0.001, 0.005, 0.06, vol * 1.2);
    const hp = this.filter('highpass', 2500);
    hp.connect(ng);
    ng.connect(g);
    this.noiseSrc(when, 0.1, hp);
  }

  /** Souffle (passage, mouvement rapide). */
  whoosh(when: number, dur = 0.8, vol = 0.3, from = 300, to = 2200, bus: 'sfx' | 'music' = 'sfx') {
    const g = this.gain(0);
    g.gain.setValueAtTime(0.0001, when);
    g.gain.linearRampToValueAtTime(vol, when + dur * 0.55);
    g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
    const bp = this.filter('bandpass', from, 1.4);
    bp.frequency.setValueAtTime(from, when);
    bp.frequency.exponentialRampToValueAtTime(to, when + dur * 0.55);
    bp.frequency.exponentialRampToValueAtTime(from * 0.8, when + dur);
    bp.connect(g);
    this.out(g, bus, 0.25);
    this.noiseSrc(when, dur, bp);
  }

  explosion(when: number, vol = 0.8) {
    this.boom(when, vol, 3.5, 0.5);
    const g = this.gain(0);
    this.env(g, when, 0.002, 0.1, 1.6, vol * 0.5);
    const lp = this.filter('lowpass', 4000);
    lp.frequency.setValueAtTime(5000, when);
    lp.frequency.exponentialRampToValueAtTime(300, when + 1.5);
    lp.connect(g);
    this.out(g, 'sfx', 0.4);
    this.noiseSrc(when, 1.8, lp, 0.7);
    this.crackle(when + 0.05, 1.2, vol * 0.25);
  }

  /** Grésillements (feu, plastique froissé…). */
  crackle(when: number, dur: number, vol = 0.2, hpFreq = 1500, density = 120, space: 'hall' | 'cathedral' = 'hall') {
    const ctx = this.ctx!;
    const len = Math.floor(ctx.sampleRate * dur);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    const r = rng(Math.floor(when * 1000));
    const n = Math.floor(density * dur);
    for (let k = 0; k < n; k++) {
      const start = Math.floor(r.next() * len);
      const l = Math.floor(ctx.sampleRate * r.range(0.002, 0.018));
      const a = r.range(0.2, 1);
      for (let i = 0; i < l && start + i < len; i++) d[start + i] += (Math.random() * 2 - 1) * a * Math.exp(-i / (l * 0.3));
    }
    const s = ctx.createBufferSource();
    s.buffer = buf;
    const hp = this.filter('highpass', hpFreq);
    const g = this.gain(vol);
    s.connect(hp).connect(g);
    this.out(g, 'sfx', 0.5, space);
    s.start(when);
    this.track(s);
  }

  /** Rugissement de créature : source saturée + formants mobiles + sub. */
  roar(when: number, dur = 1.6, vol = 0.5, pitch = 1, space: 'hall' | 'cathedral' = 'hall') {
    const g = this.gain(0);
    g.gain.setValueAtTime(0.0001, when);
    g.gain.linearRampToValueAtTime(vol, when + 0.15);
    g.gain.setValueAtTime(vol, when + dur * 0.6);
    g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
    const bp = this.filter('bandpass', 400 * pitch, 2);
    bp.frequency.setValueAtTime(350 * pitch, when);
    bp.frequency.linearRampToValueAtTime(900 * pitch, when + dur * 0.3);
    bp.frequency.linearRampToValueAtTime(260 * pitch, when + dur);
    const sh = this.shaper(6);
    sh.connect(bp).connect(g);
    this.out(g, 'sfx', 0.6, space);
    const o = this.osc('sawtooth', 75 * pitch, when, dur, sh);
    o.frequency.setValueAtTime(70 * pitch, when);
    o.frequency.linearRampToValueAtTime(95 * pitch, when + dur * 0.3);
    o.frequency.linearRampToValueAtTime(55 * pitch, when + dur);
    const jitter = this.ctx!.createOscillator();
    jitter.frequency.value = 23;
    const jg = this.gain(18 * pitch);
    jitter.connect(jg).connect(o.frequency);
    jitter.start(when);
    jitter.stop(when + dur);
    this.track(jitter);
    const ng = this.gain(0.5);
    ng.connect(sh);
    this.noiseSrc(when, dur, ng);
    const sub = this.gain(0);
    this.env(sub, when, 0.1, dur * 0.5, dur * 0.5, vol * 0.8);
    this.out(sub, 'sfx', 0.2, space);
    this.osc('sine', 40 * pitch, when, dur, sub);
  }

  /** Cri de rapace. */
  screech(when: number, vol = 0.18, far = false) {
    const g = this.gain(0);
    this.env(g, when, 0.03, 0.25, 0.5, vol);
    const bp = this.filter('bandpass', 2600, 2.5);
    bp.connect(g);
    this.out(g, 'sfx', far ? 0.9 : 0.4);
    const o = this.osc('sawtooth', 2500, when, 0.9, bp);
    o.frequency.setValueAtTime(2700, when);
    o.frequency.exponentialRampToValueAtTime(1700, when + 0.75);
    const vib = this.ctx!.createOscillator();
    vib.frequency.value = 32;
    const vg = this.gain(60);
    vib.connect(vg).connect(o.frequency);
    vib.start(when);
    vib.stop(when + 0.9);
    this.track(vib);
  }

  gull(when: number, vol = 0.05) {
    for (let k = 0; k < 3; k++) {
      const w = when + k * 0.22;
      const g = this.gain(0);
      this.env(g, w, 0.02, 0.05, 0.15, vol);
      this.out(g, 'sfx', 0.8);
      const o = this.osc('triangle', 1400, w, 0.25, g);
      o.frequency.setValueAtTime(1500, w);
      o.frequency.exponentialRampToValueAtTime(950, w + 0.2);
    }
  }

  /** Cloche d'église (partiels de cloche, tierce mineure). */
  bell(when: number, f = 220, vol = 0.12, len = 5, space: 'hall' | 'cathedral' = 'hall') {
    const g = this.gain(1);
    this.out(g, 'music', 0.7, space);
    for (const [k, a] of [[0.5, 0.5], [1, 1], [1.19, 0.5], [1.5, 0.35], [2, 0.3], [2.52, 0.2], [3.01, 0.12]] as const) {
      const pg = this.gain(0);
      this.env(pg, when, 0.002, 0, len / k ** 0.5, vol * a);
      pg.connect(g);
      this.osc('sine', f * k, when, len, pg);
    }
  }

  gong(when: number, vol = 0.35, len = 8) {
    const g = this.gain(1);
    this.out(g, 'music', 0.6);
    const base = 72;
    for (const [k, a] of [[1, 1], [1.43, 0.7], [2.11, 0.5], [2.87, 0.4], [3.6, 0.3], [4.9, 0.2], [6.3, 0.15]] as const) {
      const pg = this.gain(0);
      pg.gain.setValueAtTime(0.0001, when);
      pg.gain.linearRampToValueAtTime(vol * a, when + 0.02 + k * 0.05);
      pg.gain.exponentialRampToValueAtTime(0.0001, when + len / k ** 0.25);
      pg.connect(g);
      const o = this.osc('sine', base * k, when, len, pg);
      o.frequency.setValueAtTime(base * k * 1.01, when);
      o.frequency.linearRampToValueAtTime(base * k, when + 2);
    }
  }

  /** Vent : bruit filtré avec rafales aléatoires. */
  wind(when: number, dur: number, vol = 0.2, seed = 1, center = 500, gusts = 1) {
    const r = rng(seed);
    const g = this.gain(0);
    const lp = this.filter('bandpass', center, 0.6);
    lp.connect(g);
    this.out(g, 'sfx', 0.2);
    g.gain.setValueAtTime(0.0001, when);
    g.gain.linearRampToValueAtTime(vol * 0.6, when + Math.min(3, dur * 0.3));
    let t = when + Math.min(3, dur * 0.3);
    while (t < when + dur - 1.5) {
      const step = r.range(0.8, 2.4);
      t += step;
      g.gain.linearRampToValueAtTime(vol * r.range(0.4, 0.4 + gusts * 0.8), t);
      lp.frequency.linearRampToValueAtTime(center * r.range(0.6, 1.8), t);
    }
    g.gain.linearRampToValueAtTime(0.0001, when + dur);
    this.noiseSrc(when, dur, lp, 0.5);
  }

  /** Ressac : vagues qui se brisent à intervalles irréguliers. */
  surf(when: number, dur: number, vol = 0.3, seed = 3) {
    const r = rng(seed);
    const g = this.gain(0);
    const lp = this.filter('lowpass', 700, 0.5);
    lp.connect(g);
    this.out(g, 'sfx', 0.3);
    g.gain.setValueAtTime(0.0001, when);
    let t = when;
    while (t < when + dur - 2) {
      t += r.range(0.1, 0.5);
      g.gain.linearRampToValueAtTime(vol * r.range(0.6, 1), t + 0.4);
      lp.frequency.linearRampToValueAtTime(1500, t + 0.4);
      t += r.range(2, 3.5);
      g.gain.linearRampToValueAtTime(vol * 0.15, t);
      lp.frequency.linearRampToValueAtTime(500, t);
    }
    g.gain.linearRampToValueAtTime(0.0001, when + dur);
    this.noiseSrc(when, dur, lp, 0.8);
  }

  /** Rumeur de foule (cité). */
  crowd(when: number, dur: number, vol = 0.08) {
    const g = this.gain(0);
    this.env(g, when, 1.5, Math.max(0, dur - 3), 1.5, vol);
    this.out(g, 'sfx', 0.5);
    for (const f of [420, 650, 980, 1400]) {
      const bp = this.filter('bandpass', f, 4);
      const am = this.gain(0.5);
      bp.connect(am).connect(g);
      const lfo = this.ctx!.createOscillator();
      lfo.frequency.value = 2 + Math.random() * 3;
      const lg = this.gain(0.5);
      lfo.connect(lg).connect(am.gain);
      lfo.start(when);
      lfo.stop(when + dur);
      this.track(lfo);
      this.noiseSrc(when, dur, bp);
    }
  }

  heartbeat(when: number, vol = 0.4, space: 'hall' | 'cathedral' = 'cathedral') {
    for (const [dt, a] of [[0, 1], [0.24, 0.7]] as const) {
      const g = this.gain(0);
      this.env(g, when + dt, 0.005, 0.02, 0.3, vol * a);
      this.out(g, 'sfx', 0.3, space);
      const o = this.osc('sine', 60, when + dt, 0.4, g);
      o.frequency.exponentialRampToValueAtTime(35, when + dt + 0.25);
    }
  }

  drip(when: number, vol = 0.05) {
    const g = this.gain(0);
    this.env(g, when, 0.001, 0.0, 0.08, vol);
    this.out(g, 'sfx', 1, 'cathedral');
    const o = this.osc('sine', 1400, when, 0.12, g);
    o.frequency.exponentialRampToValueAtTime(2800, when + 0.06);
  }

  /** Corde d'arc. */
  twang(when: number, vol = 0.3) {
    const g = this.gain(0);
    this.env(g, when, 0.002, 0.01, 0.5, vol);
    const lp = this.filter('lowpass', 3000, 3);
    lp.frequency.exponentialRampToValueAtTime(400, when + 0.4);
    lp.connect(g);
    this.out(g, 'sfx', 0.3);
    const o = this.osc('sawtooth', 160, when, 0.6, lp);
    o.frequency.setValueAtTime(190, when);
    o.frequency.exponentialRampToValueAtTime(150, when + 0.3);
  }

  /** Coup de tonnerre : craquement puis grondement. */
  thunder(when: number, vol = 0.8, space: 'hall' | 'cathedral' = 'hall') {
    const g = this.gain(0);
    this.env(g, when, 0.001, 0.05, 0.4, vol);
    const hp = this.filter('highpass', 1200);
    hp.connect(g);
    this.out(g, 'sfx', 0.6, space);
    this.noiseSrc(when, 0.5, hp, 1.5);
    this.boom(when + 0.03, vol, 5, 0.7, space);
  }

  /** Montée de tension. */
  riser(when: number, dur: number, vol = 0.25) {
    const g = this.gain(0);
    g.gain.setValueAtTime(0.0001, when);
    g.gain.exponentialRampToValueAtTime(vol, when + dur);
    g.gain.linearRampToValueAtTime(0.0001, when + dur + 0.05);
    const bp = this.filter('bandpass', 200, 2);
    bp.frequency.setValueAtTime(200, when);
    bp.frequency.exponentialRampToValueAtTime(5000, when + dur);
    bp.connect(g);
    this.out(g, 'sfx', 0.5);
    this.noiseSrc(when, dur, bp);
  }

  /** Grondement continu (sol qui tremble, présence surnaturelle). */
  rumble(when: number, dur: number, vol = 0.4, space: 'hall' | 'cathedral' = 'cathedral') {
    const g = this.gain(0);
    this.env(g, when, dur * 0.4, dur * 0.2, dur * 0.4, vol);
    const lp = this.filter('lowpass', 120, 1);
    lp.connect(g);
    this.out(g, 'sfx', 0.4, space);
    this.noiseSrc(when, dur, lp, 0.4);
    this.osc('sine', 33, when, dur, g);
  }

  /** Battement d'ailes. */
  flap(when: number, vol = 0.25, big = false) {
    const g = this.gain(0);
    this.env(g, when, 0.03, 0.04, big ? 0.35 : 0.2, vol);
    const bp = this.filter('bandpass', big ? 300 : 600, 0.8);
    bp.connect(g);
    this.out(g, 'sfx', big ? 0.6 : 0.2, big ? 'cathedral' : 'hall');
    this.noiseSrc(when, 0.5, bp, 0.6);
  }

  /** Murmure (souffle vocal) pour doubler la voix de la prêtresse. */
  whisper(when: number, dur: number, vol = 0.08) {
    const g = this.gain(0);
    this.env(g, when, 0.2, Math.max(0, dur - 0.5), 0.6, vol);
    const r = rng(Math.floor(when));
    const bank = this.gain(1);
    for (const f of [700, 1300, 2600]) {
      const bp = this.filter('bandpass', f, 6);
      let t = when;
      while (t < when + dur) {
        t += r.range(0.12, 0.3);
        bp.frequency.linearRampToValueAtTime(f * r.range(0.7, 1.4), t);
      }
      bank.connect(bp).connect(g);
    }
    this.out(g, 'sfx', 1.2, 'cathedral');
    this.noiseSrc(when, dur + 0.6, bank);
  }

  /** Réplique : fichier audio facultatif, sinon synthèse vocale du navigateur (voix grave et lente). */
  voice(id: string, text: string, when: number) {
    const ctx = this.ctx;
    const buf = this.externalVoices[id];
    if (ctx && buf) {
      const s = ctx.createBufferSource();
      s.buffer = buf;
      s.playbackRate.value = 0.94;
      const g = this.gain(1.2);
      s.connect(g);
      this.out(g, 'sfx', 1.0, 'cathedral');
      s.start(when);
      this.track(s);
    } else if ('speechSynthesis' in window && !this.muted) {
      const delay = ctx ? Math.max(0, (when - ctx.currentTime) * 1000) : 0;
      window.setTimeout(() => {
        if (!this.running || this.muted) return;
        const u = new SpeechSynthesisUtterance(text);
        u.lang = 'fr-FR';
        u.pitch = 0.1;
        u.rate = 0.78;
        u.volume = 1;
        const voices = speechSynthesis.getVoices().filter((v) => v.lang.startsWith('fr'));
        const female = voices.find((v) => /female|femme|amelie|amélie|audrey|marie|julie|denise|hortense|virginie/i.test(v.name));
        if (female || voices[0]) u.voice = (female ?? voices[0])!;
        speechSynthesis.speak(u);
      }, delay);
    }
    this.onVoice?.(id, text, when);
  }
}
