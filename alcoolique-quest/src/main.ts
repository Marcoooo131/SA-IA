// Point d'entrée : chargement, lecteur de cinématique (horloge audio), interface (passer, plein écran,
// son, fin, accueil provisoire) et outils de vérification (?t=, ?still=, ?debug=1, ?quality=).
import '@fontsource/cinzel/400.css';
import '@fontsource/cinzel/700.css';
import '@fontsource/cinzel/900.css';
import '@fontsource/cinzel-decorative/700.css';
import '@fontsource/cinzel-decorative/900.css';
import '@fontsource/cormorant-garamond/400.css';
import '@fontsource/cormorant-garamond/400-italic.css';
import './style.css';
import { Director, type Quality } from './core/director';
import { DURATION, LINES, shotAt } from './core/timeline';
import { AudioEngine } from './audio/engine';
import { buildScore } from './audio/score';
import { SCENE_FACTORIES } from './scenes';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const params = new URLSearchParams(location.search);
const isMobile = matchMedia('(pointer: coarse)').matches || /Android|iPhone|iPad/i.test(navigator.userAgent);
const quality = (params.get('quality') as Quality) ?? (isMobile ? 'low' : 'high');
const startAt = parseFloat(params.get('t') ?? '0') || 0;
const still = params.has('still') ? parseFloat(params.get('still')!) : null;
const debug = params.has('debug');

type State = 'loading' | 'ready' | 'playing' | 'ended' | 'home';
let state: State = 'loading';
const canvas = $<HTMLCanvasElement>('view');
const director = new Director(canvas, quality);
const audio = new AudioEngine();
const subtitle = $('subtitle');
const skipBtn = $('btn-skip');
const debugEl = $('debug');
debugEl.hidden = !debug;

function show(id: string, on: boolean) {
  $(id).classList.toggle('visible', on);
}
const nextFrame = () => new Promise<void>((r) => requestAnimationFrame(() => r()));

async function load() {
  const fill = $('bar-fill');
  const step = $('loader-step');
  // Les polices doivent être prêtes avant de graver le logo sur canevas.
  await Promise.all(['900 64px "Cinzel"', '700 64px "Cinzel Decorative"', '400 32px "Cinzel"', 'italic 32px "Cormorant Garamond"'].map((f) => document.fonts.load(f).catch(() => null)));
  for (let i = 0; i < SCENE_FACTORIES.length; i++) {
    const [label, make] = SCENE_FACTORIES[i];
    step.textContent = label;
    await nextFrame();
    director.add(make(quality));
    fill.style.width = `${((i + 1) / (SCENE_FACTORIES.length + 1)) * 100}%`;
  }
  step.textContent = 'Compilation des shaders';
  await nextFrame();
  onResize();
  director.warmup();
  fill.style.width = '100%';
  await nextFrame();
}

function onResize() {
  director.resize(window.innerWidth, window.innerHeight);
}
window.addEventListener('resize', onResize);

// ------------------------------------------------------------------ lecture
let lastFrame = performance.now();
let lastT = 0;

async function play(from = 0) {
  await audio.init().catch(() => null);
  audio.setCues(buildScore(audio));
  show('start', false);
  show('end', false);
  show('home', false);
  document.body.classList.add('playing');
  skipBtn.classList.remove('visible');
  state = 'playing';
  lastT = from;
  director.get('title')?.setMode?.('cinematic');
  audio.start(from);
}

function endCinematic() {
  audio.stop(0.6);
  state = 'ended';
  document.body.classList.remove('playing');
  skipBtn.classList.remove('visible');
  subtitle.classList.remove('on');
  show('end', true);
  ($('btn-replay') as HTMLButtonElement).focus({ preventScroll: true });
}

function enterHome() {
  state = 'home';
  show('end', false);
  show('home', true);
  director.get('title')?.setMode?.('home');
  $('home-toast').textContent = '';
}

let homeClock = 0;
function frame(now: number) {
  const realDt = Math.min(0.1, (now - lastFrame) / 1000);
  lastFrame = now;
  if (state === 'playing') {
    const t = audio.time();
    const dt = Math.max(0, Math.min(0.1, t - lastT));
    lastT = t;
    director.render(t, dt);
    director.adapt(realDt * 1000);
    // Bouton « Passer » : discret, seulement après quelques secondes
    skipBtn.classList.toggle('visible', t > 4.5 && t < DURATION - 2);
    const line = LINES.find((l) => t >= l.start && t < l.end);
    if (line && subtitle.textContent !== line.text) subtitle.textContent = line.text;
    subtitle.classList.toggle('on', !!line);
    if (debug) debugEl.textContent = `t=${t.toFixed(2)}s  plan ${shotAt(t).id} — ${shotAt(t).label}\nscène ${director.activeKey}  ${director.width}x${director.height}`;
    if (t >= DURATION) endCinematic();
  } else if (state === 'ended') {
    // Fin : écran noir sous les boutons
    director.render(DURATION - 0.01, realDt, { key: 'title', fade: 0 });
  } else if (state === 'home') {
    homeClock += realDt;
    director.render(homeClock, realDt, { key: 'title', fade: Math.min(1, homeClock / 1.5) });
  }
  requestAnimationFrame(frame);
}

// ------------------------------------------------------------------ interface
let pointerTimer = 0;
window.addEventListener('pointermove', () => {
  document.body.classList.add('pointer-active');
  clearTimeout(pointerTimer);
  pointerTimer = window.setTimeout(() => document.body.classList.remove('pointer-active'), 2200);
});

function toggleFullscreen() {
  const el = document.documentElement as HTMLElement & { webkitRequestFullscreen?: () => void };
  if (!document.fullscreenElement) {
    (el.requestFullscreen?.() ?? el.webkitRequestFullscreen?.())?.catch?.(() => null);
    // Sur mobile, on tente de verrouiller l'orientation en paysage
    const so = screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> };
    so?.lock?.('landscape').catch(() => null);
  } else document.exitFullscreen?.();
}
function toggleMute() {
  audio.setMuted(!audio.muted);
  $('btn-mute').classList.toggle('off', audio.muted);
}

$('btn-start').addEventListener('click', () => {
  if (isMobile) toggleFullscreen();
  play(startAt);
});
skipBtn.addEventListener('click', () => state === 'playing' && endCinematic());
$('btn-fs').addEventListener('click', toggleFullscreen);
$('btn-mute').addEventListener('click', toggleMute);
$('btn-replay').addEventListener('click', () => play(0));
$('btn-enter').addEventListener('click', enterHome);
$('btn-credits-close').addEventListener('click', () => ($('credits').hidden = true));
document.querySelectorAll<HTMLButtonElement>('.menu-item').forEach((b) =>
  b.addEventListener('click', () => {
    const a = b.dataset.action;
    if (a === 'replay') play(0);
    else if (a === 'credits') $('credits').hidden = false;
    else if (a === 'new') $('home-toast').textContent = 'La taverne est encore en construction… La quête commencera bientôt. Restez sobres d’ici là.';
  }),
);
window.addEventListener('keydown', (e) => {
  if (e.key === 'f' || e.key === 'F') toggleFullscreen();
  else if (e.key === 'm' || e.key === 'M') toggleMute();
  else if ((e.key === 'Escape' || e.key === ' ') && state === 'playing' && audio.time() > 4.5) {
    e.preventDefault();
    endCinematic();
  }
});
document.addEventListener('visibilitychange', () => {
  // L'horloge audio s'arrête avec le contexte : l'image reste synchronisée au retour.
  if (!audio.ctx) return;
  if (document.hidden) audio.ctx.suspend();
  else if (state === 'playing') audio.ctx.resume();
});

// ------------------------------------------------------------------ démarrage
(async () => {
  try {
    await load();
  } catch (e) {
    console.error(e);
    $('loader-step').textContent = 'Erreur : WebGL est indisponible sur cet appareil.';
    return;
  }
  if (still !== null) {
    // Mode capture : on simule la seconde qui précède pour que particules et animations soient en place.
    $('loader').style.transition = 'none';
    show('loader', false);
    const renderStill = (t: number) => {
      for (let k = 30; k >= 0; k--) director.render(Math.max(0, t - k / 30), 1 / 30);
    };
    renderStill(still);
    Object.assign(window, { __ready: true, __director: director, __still: renderStill });
    return;
  }
  show('loader', false);
  show('start', true);
  state = 'ready';
  ($('btn-start') as HTMLButtonElement).focus({ preventScroll: true });
  requestAnimationFrame(frame);
})();
