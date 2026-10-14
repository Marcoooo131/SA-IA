import { useState } from 'react';
import { AlertTriangle, BookMarked, CalendarClock, ChevronRight, Repeat } from 'lucide-react';
import { getItem } from '../../curriculum';
import { ACQUIRED_LEVEL } from '../../core/srs';
import { dueCards, MAX_REVIEW_ITEMS, openMistakes, vocabularyStats } from '../../core/state';
import { useAppState } from '../../core/store';
import { addDays, localDate } from '../../core/util';
import { Page } from '../components/Page';
import { navigate } from '../router';

export function Review() {
  const state = useAppState();
  const today = localDate();
  const due = dueCards(state, today);
  const mistakes = openMistakes(state);
  const tomorrow = Object.values(state.cards).filter((c) => c.due === addDays(today, 1)).length;
  const vocab = vocabularyStats(state);
  const reviewInProgress = state.sessions.review;
  const mistakesInProgress = state.sessions.mistakes;

  return (
    <Page title="Réviser" subtitle="La répétition espacée fixe durablement ce que tu apprends.">
      <section className="card">
        <h2 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Repeat size={20} aria-hidden="true" /> Révisions du jour
        </h2>
        {due.length > 0 || reviewInProgress ? (
          <>
            <p>
              {due.length} élément{due.length > 1 ? 's' : ''} à revoir aujourd'hui
              {due.length > MAX_REVIEW_ITEMS ? ` (séries de ${MAX_REVIEW_ITEMS})` : ''}.
            </p>
            <button type="button" className="btn btn-primary btn-block" onClick={() => navigate('/session/review')}>
              {reviewInProgress ? 'Reprendre ma révision' : `Commencer la révision`}
            </button>
          </>
        ) : (
          <p className="hint">Rien à réviser pour le moment. {tomorrow > 0 ? `${tomorrow} élément${tomorrow > 1 ? 's' : ''} demain.` : 'Termine une leçon pour alimenter tes révisions.'}</p>
        )}
      </section>

      <section className="card">
        <h2 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <AlertTriangle size={20} aria-hidden="true" /> Erreurs à corriger
        </h2>
        {mistakes.length > 0 || mistakesInProgress ? (
          <>
            <ul className="list" style={{ marginBottom: 10 }}>
              {mistakes.slice(0, 3).map((m) => (
                <li key={m.itemId}>
                  <span className="grow">
                    <span lang="fr">{m.exercise.prompt}</span>
                    <br />
                    <span className="sub">
                      Ta réponse : <del lang="en">{m.answer || '—'}</del> · Attendu : <span lang="en">{m.expected}</span>
                    </span>
                  </span>
                </li>
              ))}
            </ul>
            <button type="button" className="btn btn-secondary btn-block" onClick={() => navigate('/session/mistakes')}>
              {mistakesInProgress ? 'Reprendre' : `Corriger mes erreurs (${mistakes.length})`}
            </button>
          </>
        ) : (
          <p className="hint">Aucune erreur en attente. Bravo !</p>
        )}
      </section>

      <a className="card" href="#/vocabulary" style={{ display: 'flex', alignItems: 'center', gap: 12, color: 'inherit', textDecoration: 'none' }}>
        <BookMarked size={22} color="var(--brand)" aria-hidden="true" />
        <span style={{ flex: 1 }}>
          <strong>Mon vocabulaire</strong>
          <br />
          <span className="hint">
            {vocab.acquired} mot{vocab.acquired > 1 ? 's' : ''} acquis · {vocab.learning} en cours
          </span>
        </span>
        <ChevronRight size={20} aria-hidden="true" />
      </a>

      <p className="hint" style={{ display: 'flex', gap: 8 }}>
        <CalendarClock size={16} aria-hidden="true" style={{ flex: 'none', marginTop: 3 }} />
        Chaque bonne réponse espace la prochaine révision (1, 2, 4, 7, 15, 30 puis 60 jours). Une erreur la remet dans les révisions du jour.
      </p>
    </Page>
  );
}

export function Vocabulary() {
  const state = useAppState();
  const [filter, setFilter] = useState<'all' | 'acquired' | 'learning'>('all');
  const [query, setQuery] = useState('');
  const words = Object.values(state.cards)
    .filter((c) => c.id.startsWith('w:') || c.id.startsWith('x:'))
    .map((c) => {
      const extra = state.extraWords[c.id];
      const item = getItem(c.id);
      const en = extra?.en ?? (item?.kind === 'word' ? item.word.en[0] : '');
      const fr = extra?.fr ?? (item?.kind === 'word' ? item.word.fr : '');
      return { card: c, en, fr, acquired: c.level >= ACQUIRED_LEVEL };
    })
    .filter((w) => w.en)
    .filter((w) => (filter === 'all' ? true : filter === 'acquired' ? w.acquired : !w.acquired))
    .filter((w) => !query || `${w.en} ${w.fr}`.toLowerCase().includes(query.toLowerCase()))
    .sort((a, b) => a.en.localeCompare(b.en));

  return (
    <Page
      title="Mon vocabulaire"
      action={
        <button type="button" className="btn btn-ghost btn-small" onClick={() => navigate('/review')}>
          Retour
        </button>
      }
    >
      <div className="segmented" style={{ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }} role="group" aria-label="Filtre">
        {(
          [
            ['all', 'Tous'],
            ['acquired', 'Acquis'],
            ['learning', 'En cours'],
          ] as const
        ).map(([id, label]) => (
          <button key={id} type="button" aria-pressed={filter === id} onClick={() => setFilter(id)}>
            {label}
          </button>
        ))}
      </div>
      <label className="sr-only" htmlFor="vocab-search">
        Rechercher un mot
      </label>
      <input
        id="vocab-search"
        className="text-input"
        type="search"
        placeholder="Rechercher un mot"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        enterKeyHint="search"
        autoComplete="off"
      />
      <section className="card">
        {words.length === 0 ? (
          <p className="empty">Les mots apparaîtront ici au fil des leçons.</p>
        ) : (
          <ul className="list">
            {words.map((w) => (
              <li key={w.card.id}>
                <span className="grow">
                  <strong lang="en">{w.en}</strong>
                  <br />
                  <span className="sub">{w.fr}</span>
                </span>
                <span className={`pill${w.acquired ? ' ok' : ''}`}>{w.acquired ? 'Acquis' : `Niveau ${w.card.level}`}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </Page>
  );
}
