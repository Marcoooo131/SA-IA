import { useEffect, useRef } from 'react';
import { BookOpen, Home as HomeIcon, MessageSquareText, RefreshCw, Repeat, UserRound } from 'lucide-react';
import { flushSync, getMeta, getState, setMeta, setState, subscribeState, useAppState } from '../core/store';
import { addStudyTime, currentDay, dueCards, openMistakes, type SessionKind } from '../core/state';
import { scheduleSync, syncNow } from '../core/sync';
import { matchRoute, navigate, useRoute } from './router';
import { useUpdateAvailable } from './pwa';
import { Home } from './screens/Home';
import { Learn } from './screens/Learn';
import { Review, Vocabulary } from './screens/Review';
import { ChatList, ChatThreadScreen } from './screens/Chat';
import { Profile } from './screens/Profile';
import { InstallGuide } from './platform';
import { SessionScreen } from './screens/Session';

const TABS = [
  { path: '/', label: 'Accueil', icon: HomeIcon, match: ['/'] },
  { path: '/learn', label: 'Apprendre', icon: BookOpen, match: ['/learn'] },
  { path: '/review', label: 'Réviser', icon: Repeat, match: ['/review', '/vocabulary'] },
  { path: '/chat', label: 'Conversation', icon: MessageSquareText, match: ['/chat'] },
  { path: '/profile', label: 'Profil', icon: UserRound, match: ['/profile', '/install'] },
];

function TabBar({ route }: { route: string }) {
  const state = useAppState();
  const due = dueCards(state).length + openMistakes(state).length;
  return (
    <nav className="tabbar" aria-label="Navigation principale">
      {TABS.map((t) => {
        const active = t.match.some((m) => (m === '/' ? route === '/' : route === m || route.startsWith(`${m}/`)));
        const Icon = t.icon;
        return (
          <a key={t.path} href={`#${t.path}`} className="tab" aria-current={active ? 'page' : undefined}>
            <Icon size={24} strokeWidth={active ? 2.4 : 2} aria-hidden="true" />
            <span className="label">{t.label}</span>
            {t.path === '/review' && due > 0 && (
              <span className="badge" aria-label={`${due} à réviser`}>
                {due > 99 ? '99+' : due}
              </span>
            )}
          </a>
        );
      })}
    </nav>
  );
}

/** Compte le temps d'apprentissage réel : écran d'exercice ou de conversation visible et utilisé. */
function useStudyTimer(active: boolean) {
  const lastInput = useRef(Date.now());
  useEffect(() => {
    const mark = () => (lastInput.current = Date.now());
    window.addEventListener('pointerdown', mark);
    window.addEventListener('keydown', mark);
    return () => {
      window.removeEventListener('pointerdown', mark);
      window.removeEventListener('keydown', mark);
    };
  }, []);
  useEffect(() => {
    if (!active) return;
    lastInput.current = Date.now();
    let pending = 0;
    const tick = setInterval(() => {
      if (document.visibilityState !== 'visible' || Date.now() - lastInput.current > 90_000) return;
      pending += 5;
      if (pending >= 15) {
        const add = pending;
        pending = 0;
        setState((s) => addStudyTime(s, getMeta().deviceId, add));
      }
    }, 5000);
    return () => {
      clearInterval(tick);
      if (pending > 0) setState((s) => addStudyTime(s, getMeta().deviceId, pending));
    };
  }, [active]);
}

function useBackgroundSync() {
  useEffect(() => {
    void syncNow();
    const unsub = subscribeState(() => scheduleSync());
    const online = () => void syncNow();
    const hidden = () => {
      if (document.visibilityState === 'hidden') {
        flushSync();
        void syncNow();
      }
    };
    window.addEventListener('online', online);
    document.addEventListener('visibilitychange', hidden);
    window.addEventListener('pagehide', flushSync);
    return () => {
      unsub();
      window.removeEventListener('online', online);
      document.removeEventListener('visibilitychange', hidden);
    };
  }, []);
}

const SESSION_ROUTES: [string, SessionKind][] = [
  ['/session/review', 'review'],
  ['/session/mistakes', 'mistakes'],
];

export function App() {
  const route = useRoute();
  const update = useUpdateAvailable();

  // Reprise : si l'application avait été fermée au milieu d'une leçon, on y retourne directement.
  useEffect(() => {
    const last = getMeta().lastRoute;
    if (window.location.hash || !last) return;
    const lesson = matchRoute(last, '/lesson/:day');
    const s = getState().sessions;
    if ((lesson && s.lesson?.day === Number(lesson.day)) || SESSION_ROUTES.some(([r, k]) => r === last && s[k])) {
      navigate(last, { replace: true });
    }
  }, []);

  useEffect(() => {
    if (route === '/continue') {
      const s = getState();
      navigate(`/lesson/${s.sessions.lesson?.day ?? currentDay(s)}`, { replace: true });
      return;
    }
    if (getMeta().lastRoute !== route) setMeta({ lastRoute: route });
    window.scrollTo(0, 0);
  }, [route]);

  useBackgroundSync();

  const lesson = matchRoute(route, '/lesson/:day');
  const thread = matchRoute(route, '/chat/:id');
  const sessionKind = SESSION_ROUTES.find(([r]) => r === route)?.[1];
  useStudyTimer(Boolean(lesson || sessionKind || thread));

  let screen: React.ReactNode;
  let fullscreen = true;
  if (lesson) screen = <SessionScreen kind="lesson" day={Number(lesson.day)} />;
  else if (sessionKind) screen = <SessionScreen kind={sessionKind} />;
  else if (thread) screen = <ChatThreadScreen id={thread.id} />;
  else {
    fullscreen = false;
    if (route === '/learn') screen = <Learn />;
    else if (route === '/review') screen = <Review />;
    else if (route === '/vocabulary') screen = <Vocabulary />;
    else if (route === '/chat') screen = <ChatList />;
    else if (route === '/profile') screen = <Profile />;
    else if (route === '/install') screen = <InstallGuide />;
    else screen = <Home />;
  }

  return (
    <div className="app">
      {screen}
      {!fullscreen && <TabBar route={route} />}
      {!fullscreen && update && (
        <div className="toast" role="status">
          <RefreshCw size={18} aria-hidden="true" />
          <span>Une nouvelle version d'English Coach est prête.</span>
          <button type="button" className="btn btn-secondary btn-small" onClick={update}>
            Mettre à jour
          </button>
        </div>
      )}
    </div>
  );
}
