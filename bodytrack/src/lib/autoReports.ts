import { useEffect } from 'react';
import { useStore, store } from './store/store';
import { buildContext } from './analytics/context';
import { ACHIEVEMENTS, achievementDates } from './analytics/goals';
import { weeklyReport } from './analytics/reports';
import { addDays, dateOf, diffDays, startOfWeek, today } from './dates';
import { nowISO, uid } from './format';
import { toast } from '../components/toast';

/**
 * Tâches automatiques à l'ouverture et après chaque modification :
 * - enregistre les succès nouvellement obtenus (notification si récents) ;
 * - archive le bilan de chaque semaine terminée (historique des bilans hebdomadaires).
 */
export function useAutoReports() {
  const data = useStore((s) => s.data);
  const status = useStore((s) => s.status);
  useEffect(() => {
    if (status !== 'ready' || !data.profile) return;
    const id = setTimeout(() => {
      const ctx = buildContext(store().data);
      const t = today();
      const dates = achievementDates(ctx);
      const have = new Set(store().data.achievements.map((a) => a.key));
      const fresh = ACHIEVEMENTS.filter((a) => dates[a.key] && !have.has(a.key));
      if (fresh.length) {
        store().upsert(
          'achievements',
          fresh.map((a) => ({ id: uid(), key: a.key, unlockedAt: new Date(`${dates[a.key]}T12:00:00`).toISOString(), updatedAt: nowISO() })),
        );
        for (const a of fresh) if (diffDays(dates[a.key]!, t) <= 1) toast(`Succès débloqué : ${a.title}`, a.description, 'record', 5000);
      }
      // Bilans des semaines terminées (8 dernières au maximum)
      const firstDay = [dateOf(ctx.data.profile!.createdAt), ...ctx.doneSessions.map((s) => dateOf(s.startedAt)), ...[...ctx.loggedDates]].sort()[0];
      const stored = new Set(store().data.weeklyReports.map((w) => w.weekStart));
      const current = startOfWeek(t);
      const rows = [];
      for (let w = addDays(current, -7), n = 0; n < 8 && w >= startOfWeek(firstDay); w = addDays(w, -7), n++) {
        if (stored.has(w)) continue;
        rows.push({ id: uid(), weekStart: w, data: weeklyReport(ctx, w, addDays(w, 6)), createdAt: nowISO(), updatedAt: nowISO() });
      }
      if (rows.length) store().upsert('weeklyReports', rows);
    }, 1500);
    return () => clearTimeout(id);
  }, [data, status]);
}
