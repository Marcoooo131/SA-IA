import { useCallback, useEffect, useLayoutEffect, useRef, useState, type TouchEvent } from 'react';
import { ChevronLeft, ChevronRight, Download, Keyboard, LayoutGrid, Maximize, Minimize, StickyNote, X } from 'lucide-react';
import { deckTitle, slides } from './content';
import { Slide } from './slides';

// Toile de conception : 16:9, mise à l'échelle pour remplir l'écran (vidéoprojecteur, écran de salle).
const CANVAS_W = 1600;
const CANVAS_H = 900;
const TOOLBAR_H = 64;
// En dessous de cette largeur (téléphone, petite tablette en portrait) : mise en page fluide et défilable.
const FLOW_BREAKPOINT = 820;

const PPTX_FILE = 'Nouvelle-organisation-Movers.pptx';

function indexFromHash(): number {
  const match = /^#\/?(\d+)$/.exec(window.location.hash);
  if (!match) return 0;
  const n = Number(match[1]) - 1;
  return Math.min(Math.max(n, 0), slides.length - 1);
}

function useViewport() {
  const [size, setSize] = useState({ w: window.innerWidth, h: window.innerHeight });
  useLayoutEffect(() => {
    const onResize = () => setSize({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  return size;
}

export default function App() {
  const [index, setIndex] = useState(indexFromHash);
  const [direction, setDirection] = useState<1 | -1>(1);
  const [overview, setOverview] = useState(false);
  const [notes, setNotes] = useState(false);
  const [help, setHelp] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [idle, setIdle] = useState(false);
  const { w, h } = useViewport();
  const flow = w < FLOW_BREAKPOINT;
  const touchStart = useRef<{ x: number; y: number } | null>(null);

  const goToIndex = useCallback((next: number) => {
    const clamped = Math.min(Math.max(next, 0), slides.length - 1);
    setIndex((current) => {
      if (clamped !== current) setDirection(clamped > current ? 1 : -1);
      return clamped;
    });
    setOverview(false);
  }, []);
  const goTo = useCallback((id: string) => goToIndex(slides.findIndex((s) => s.id === id)), [goToIndex]);
  const next = useCallback(() => goToIndex(index + 1), [goToIndex, index]);
  const prev = useCallback(() => goToIndex(index - 1), [goToIndex, index]);

  const toggleFullscreen = useCallback(() => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void document.documentElement.requestFullscreen?.().catch(() => undefined);
  }, []);

  // Lien direct vers une diapositive (#/5) et retour arrière du navigateur
  useEffect(() => {
    const target = `#/${index + 1}`;
    if (window.location.hash !== target) window.history.replaceState(null, '', target);
    document.title = `${index + 1}/${slides.length} · ${deckTitle}`;
  }, [index]);
  useEffect(() => {
    const onHash = () => goToIndex(indexFromHash());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, [goToIndex]);

  useEffect(() => {
    const onChange = () => setFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

  // En plein écran, la barre d'outils s'efface quand la souris ne bouge plus.
  useEffect(() => {
    if (!fullscreen) {
      setIdle(false);
      return;
    }
    let timer = window.setTimeout(() => setIdle(true), 2500);
    const wake = () => {
      setIdle(false);
      window.clearTimeout(timer);
      timer = window.setTimeout(() => setIdle(true), 2500);
    };
    window.addEventListener('mousemove', wake);
    return () => {
      window.removeEventListener('mousemove', wake);
      window.clearTimeout(timer);
    };
  }, [fullscreen]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.altKey || e.ctrlKey || e.metaKey) return;
      const target = e.target as HTMLElement | null;
      // Espace / Entrée sur un bouton : laisser le bouton réagir.
      const onButton = target?.tagName === 'BUTTON';
      switch (e.key) {
        case 'ArrowRight':
        case 'ArrowDown':
        case 'PageDown':
          e.preventDefault();
          next();
          break;
        case ' ':
          if (onButton) return;
          e.preventDefault();
          if (e.shiftKey) prev();
          else next();
          break;
        case 'ArrowLeft':
        case 'ArrowUp':
        case 'PageUp':
        case 'Backspace':
          e.preventDefault();
          prev();
          break;
        case 'Home':
          e.preventDefault();
          goToIndex(0);
          break;
        case 'End':
          e.preventDefault();
          goToIndex(slides.length - 1);
          break;
        case 'f':
        case 'F':
          toggleFullscreen();
          break;
        case 'g':
        case 'G':
        case 'o':
        case 'O':
          setOverview((v) => !v);
          break;
        case 'n':
        case 'N':
          setNotes((v) => !v);
          break;
        case '?':
        case 'h':
        case 'H':
          setHelp((v) => !v);
          break;
        case 'Escape':
          setOverview(false);
          setHelp(false);
          break;
        default:
          // Touches 1 à 9 : accès direct
          if (/^[1-9]$/.test(e.key) && !overview) goToIndex(Number(e.key) - 1);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [next, prev, goToIndex, toggleFullscreen, overview]);

  const reserved = fullscreen || flow ? 0 : TOOLBAR_H;
  const scale = Math.min(w / CANVAS_W, (h - reserved) / CANVAS_H);
  const meta = slides[index];
  const progress = ((index + 1) / slides.length) * 100;

  const onTouchStart = (e: TouchEvent) => {
    const t = e.touches[0];
    touchStart.current = { x: t.clientX, y: t.clientY };
  };
  const onTouchEnd = (e: TouchEvent) => {
    const start = touchStart.current;
    touchStart.current = null;
    if (!start) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - start.x;
    const dy = t.clientY - start.y;
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) {
      if (dx < 0) next();
      else prev();
    }
  };

  return (
    <div className={`app ${flow ? 'is-flow' : 'is-stage'} ${fullscreen ? 'is-fullscreen' : ''} ${idle ? 'is-idle' : ''}`}>
      <div className="progress" role="progressbar" aria-valuemin={1} aria-valuemax={slides.length} aria-valuenow={index + 1} aria-label="Progression">
        <div className="progress__bar" style={{ width: `${progress}%` }} />
      </div>

      <main className="viewport" style={{ height: flow ? undefined : h - reserved }} onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
        <div
          className="stage"
          style={flow ? undefined : { width: CANVAS_W, height: CANVAS_H, transform: `translate(-50%, -50%) scale(${scale})` }}
        >
          <div key={meta.id} className={`slide-wrap ${direction > 0 ? 'enter-next' : 'enter-prev'}`}>
            <Slide meta={meta} goTo={goTo} />
          </div>
          <span className="slide-number" aria-hidden="true">
            {index + 1} / {slides.length}
          </span>
        </div>
      </main>

      {notes && (
        <aside className="notes" aria-label="Notes de l'orateur">
          <div className="notes__head">
            <strong>Notes · {meta.title}</strong>
            <button type="button" onClick={() => setNotes(false)} aria-label="Fermer les notes">
              <X size={18} />
            </button>
          </div>
          <p>{meta.notes}</p>
        </aside>
      )}

      <nav className="toolbar" aria-label="Navigation de la présentation">
        <button type="button" onClick={prev} disabled={index === 0} aria-label="Diapositive précédente" title="Précédente (←)">
          <ChevronLeft size={22} />
          <span className="toolbar__text">Précédent</span>
        </button>
        <button type="button" className="toolbar__counter" onClick={() => setOverview(true)} title="Sommaire (G)">
          <strong>{index + 1}</strong> / {slides.length}
          <span className="toolbar__title">{meta.title}</span>
        </button>
        <button type="button" onClick={next} disabled={index === slides.length - 1} aria-label="Diapositive suivante" title="Suivante (→)">
          <span className="toolbar__text">Suivant</span>
          <ChevronRight size={22} />
        </button>
        <span className="toolbar__sep" />
        <button type="button" onClick={() => setOverview((v) => !v)} aria-pressed={overview} aria-label="Sommaire" title="Sommaire (G)">
          <LayoutGrid size={20} />
        </button>
        <button type="button" onClick={() => setNotes((v) => !v)} aria-pressed={notes} aria-label="Notes de l'orateur" title="Notes de l'orateur (N)">
          <StickyNote size={20} />
        </button>
        <a className="toolbar__link" href={`./${PPTX_FILE}`} download aria-label="Télécharger le PowerPoint" title="Télécharger le PowerPoint modifiable">
          <Download size={20} />
        </a>
        <button type="button" onClick={() => setHelp((v) => !v)} aria-pressed={help} aria-label="Raccourcis clavier" title="Raccourcis clavier (?)">
          <Keyboard size={20} />
        </button>
        <button type="button" onClick={toggleFullscreen} aria-label={fullscreen ? 'Quitter le plein écran' : 'Plein écran'} title="Plein écran (F)">
          {fullscreen ? <Minimize size={20} /> : <Maximize size={20} />}
        </button>
      </nav>

      {overview && (
        <div className="overlay" role="dialog" aria-modal="true" aria-label="Sommaire" onClick={() => setOverview(false)}>
          <div className="overview" onClick={(e) => e.stopPropagation()}>
            <div className="overview__head">
              <h2>Sommaire</h2>
              <button type="button" onClick={() => setOverview(false)} aria-label="Fermer le sommaire">
                <X size={22} />
              </button>
            </div>
            <ol className="overview__grid">
              {slides.map((s, i) => (
                <li key={s.id}>
                  <button type="button" className={i === index ? 'is-current' : ''} onClick={() => goToIndex(i)}>
                    <span className="thumb" aria-hidden="true">
                      <span className="thumb__canvas">
                        <Slide meta={s} goTo={() => undefined} />
                      </span>
                    </span>
                    <span className="overview__label">
                      <strong>{i + 1}</strong> {s.title}
                    </span>
                  </button>
                </li>
              ))}
            </ol>
          </div>
        </div>
      )}

      {help && (
        <div className="overlay" role="dialog" aria-modal="true" aria-label="Raccourcis clavier" onClick={() => setHelp(false)}>
          <div className="help" onClick={(e) => e.stopPropagation()}>
            <div className="overview__head">
              <h2>Raccourcis clavier</h2>
              <button type="button" onClick={() => setHelp(false)} aria-label="Fermer">
                <X size={22} />
              </button>
            </div>
            <dl>
              <div><dt>→ ↓ Espace Page suiv.</dt><dd>Diapositive suivante</dd></div>
              <div><dt>← ↑ Page préc.</dt><dd>Diapositive précédente</dd></div>
              <div><dt>Début / Fin</dt><dd>Première / dernière diapositive</dd></div>
              <div><dt>1 à 9</dt><dd>Accès direct à une diapositive</dd></div>
              <div><dt>G</dt><dd>Sommaire</dd></div>
              <div><dt>F</dt><dd>Plein écran</dd></div>
              <div><dt>N</dt><dd>Notes de l&rsquo;orateur</dd></div>
              <div><dt>Échap</dt><dd>Fermer une fenêtre</dd></div>
            </dl>
          </div>
        </div>
      )}
    </div>
  );
}
