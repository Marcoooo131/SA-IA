import { describe, expect, it } from 'vitest';
import { buildDemoData } from '../../data/demo';
import { buildContext } from './context';
import { activityStats, nextSession, nutritionAverages, recentRecords } from './stats';
import { allInsights, weeklySeries } from './coach';
import { consistencyScore, monthlyReport, weeklyReport } from './reports';
import { achievementDates, goalProgress, trackingStreak } from './goals';
import { dailySummary } from './dashboard';
import { addDays, startOfWeek } from '../dates';
import { emptyData } from '../store/store';

const TODAY = '2026-11-03';

describe('analyses sur les données de démonstration', () => {
  const data = buildDemoData(TODAY);
  const ctx = buildContext(data);

  it('génère un historique réaliste', () => {
    expect(ctx.doneSessions.length).toBeGreaterThan(30);
    expect(ctx.loggedDates.size).toBeGreaterThan(60);
    expect(data.weights.length).toBeGreaterThan(50);
  });

  it('statistiques d\'activité et nutrition', () => {
    const a = activityStats(ctx, addDays(TODAY, -27), TODAY);
    expect(a.sessions).toBeGreaterThan(8);
    expect(a.volume).toBeGreaterThan(10000);
    const n = nutritionAverages(ctx, addDays(TODAY, -6), TODAY);
    expect(n.avgKcal).toBeGreaterThan(1500);
    expect(n.avgKcal).toBeLessThan(4500);
  });

  it('records, prochaine séance et bilan du jour', () => {
    expect(recentRecords(ctx, addDays(TODAY, -30)).length).toBeGreaterThan(0);
    expect(nextSession(ctx, TODAY)).not.toBeNull();
    const lines = dailySummary(ctx, TODAY);
    expect(lines.length).toBeGreaterThanOrEqual(3);
  });

  it('coach, rapports, objectifs et succès', () => {
    const insights = allInsights(ctx, TODAY);
    expect(insights.length).toBeGreaterThan(2);
    const w = weeklyReport(ctx, startOfWeek(addDays(TODAY, -7)), TODAY);
    expect(w.sessions).toBeGreaterThan(0);
    expect(w.recommendations.length).toBeLessThanOrEqual(3);
    const m = monthlyReport(ctx, addDays(TODAY, -35), TODAY);
    expect(m.sessions).toBeGreaterThan(5);
    expect(m.weightStart).not.toBeNull();
    const c = consistencyScore(ctx, addDays(TODAY, -29), TODAY);
    expect(c.score).toBeGreaterThan(40);
    expect(c.score).toBeLessThanOrEqual(100);
    for (const g of data.goals) expect(goalProgress(ctx, g, TODAY).pct).toBeGreaterThanOrEqual(0);
    expect(achievementDates(ctx).first_session).not.toBeNull();
    expect(trackingStreak(ctx, TODAY).current).toBeGreaterThan(5);
    expect(weeklySeries(ctx, TODAY, 8)).toHaveLength(8);
  });
});

describe('états vides', () => {
  const ctx = buildContext(emptyData());
  it('aucune erreur sans données', () => {
    expect(dailySummary(ctx, TODAY)).toEqual([]);
    expect(allInsights(ctx, TODAY).length).toBeGreaterThanOrEqual(0);
    expect(weeklyReport(ctx, startOfWeek(TODAY), TODAY).sessions).toBe(0);
    expect(monthlyReport(ctx, TODAY, TODAY).weightStart).toBeNull();
    expect(consistencyScore(ctx, addDays(TODAY, -6), TODAY).score).toBe(0);
    expect(trackingStreak(ctx, TODAY).current).toBe(0);
    expect(nextSession(ctx, TODAY)).toBeNull();
  });
});
