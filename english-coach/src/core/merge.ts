import { hydrate, type AppState } from './state';

/**
 * Fusion de deux états (cet appareil et la copie du serveur).
 * La règle : on ne perd jamais une progression. Chaque élément garde sa version la plus récente,
 * les ensembles sont réunis et le temps d'étude est compté par appareil.
 */

function newestBy<T>(a: Record<string, T>, b: Record<string, T>, stamp: (v: T) => number): Record<string, T> {
  const out: Record<string, T> = { ...a };
  for (const [k, v] of Object.entries(b)) {
    const mine = out[k];
    if (mine === undefined || stamp(v) > stamp(mine)) out[k] = v;
  }
  return out;
}

export function mergeStates(localRaw: AppState, remoteRaw: unknown): AppState {
  const local = hydrate(localRaw);
  if (!remoteRaw) return local;
  const remote = hydrate(remoteRaw);

  const completed = { ...local.completed };
  for (const [day, r] of Object.entries(remote.completed)) {
    const l = completed[Number(day)];
    completed[Number(day)] = l ? { ...l, at: Math.min(l.at, r.at), date: l.at <= r.at ? l.date : r.date, score: Math.max(l.score, r.score) } : r;
  }

  const attemptsById = new Map(local.attempts.map((a) => [a.id, a]));
  for (const a of remote.attempts) attemptsById.set(a.id, a);
  const attempts = [...attemptsById.values()].sort((x, y) => x.at - y.at).slice(-3000);

  const time: AppState['time'] = { ...local.time };
  for (const [device, byDate] of Object.entries(remote.time)) {
    const mine = { ...(time[device] ?? {}) };
    for (const [date, sec] of Object.entries(byDate)) mine[date] = Math.max(mine[date] ?? 0, sec);
    time[device] = mine;
  }

  const sessions: AppState['sessions'] = { ...local.sessions };
  for (const [kind, s] of Object.entries(remote.sessions) as [keyof AppState['sessions'], AppState['sessions'][keyof AppState['sessions']]][]) {
    const mine = sessions[kind];
    if (!s) continue;
    // Une leçon déjà terminée ailleurs n'est pas reprise.
    if (s.kind === 'lesson' && s.day && completed[s.day] && completed[s.day].at >= s.updatedAt) continue;
    if (!mine || s.updatedAt > mine.updatedAt) sessions[kind] = s;
  }
  for (const kind of Object.keys(sessions) as (keyof AppState['sessions'])[]) {
    const s = sessions[kind];
    if (s?.kind === 'lesson' && s.day && completed[s.day] && completed[s.day].at >= s.updatedAt) delete sessions[kind];
  }

  return {
    ...local,
    createdAt: Math.min(local.createdAt, remote.createdAt),
    updatedAt: Math.max(local.updatedAt, remote.updatedAt),
    completed,
    cards: newestBy(local.cards, remote.cards, (c) => c.updatedAt),
    attempts,
    mistakes: newestBy(local.mistakes, remote.mistakes, (m) => m.updatedAt),
    activeDays: [...new Set([...local.activeDays, ...remote.activeDays])].sort(),
    time,
    sessions,
    chats: newestBy(local.chats, remote.chats, (c) => c.updatedAt),
    extraWords: newestBy(local.extraWords, remote.extraWords, (w) => w.at),
    settings: remote.settings.updatedAt > local.settings.updatedAt ? remote.settings : local.settings,
  };
}
