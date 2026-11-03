import { describe, expect, it } from 'vitest';
import type { Exercise, WorkoutSession, WorkoutSet } from '../types';
import { comparePerformances, epley1RM, exerciseHistory, exerciseRecords, isStagnating, muscleVolume, progressionSuggestion, recordsBrokenBySet, recordTimeline, setVolume, totalVolume } from './training';

let n = 0;
const sess = (date: string): WorkoutSession => ({ id: `s${date}`, name: 'S', programId: null, programDayId: null, startedAt: `${date}T18:00:00.000Z`, endedAt: `${date}T19:00:00.000Z`, status: 'done', notes: '', updatedAt: '' });
const set = (sessionId: string, w: number, r: number, extra: Partial<WorkoutSet> = {}): WorkoutSet => ({ id: `x${n++}`, sessionId, workoutExerciseId: 'we', exerciseId: 'bench', position: n, weightKg: w, reps: r, done: true, isWarmup: false, completedAt: null, updatedAt: '', ...extra });

describe('1RM estimé (Epley)', () => {
  it('80 kg × 10 → 106,7 kg', () => {
    expect(epley1RM(80, 10)).toBeCloseTo(106.667, 2);
  });
  it('1 répétition = la charge', () => {
    expect(epley1RM(140, 1)).toBe(140);
  });
  it('valeurs manquantes → null', () => {
    expect(epley1RM(0, 10)).toBeNull();
    expect(epley1RM(80, 0)).toBeNull();
    expect(epley1RM(null, 5)).toBeNull();
  });
});

describe('volume', () => {
  it('ignore échauffements, séries non validées et sans répétition', () => {
    const sets = [set('a', 80, 10), set('a', 80, 9), set('a', 40, 10, { isWarmup: true }), set('a', 80, 8, { done: false }), set('a', 80, null as unknown as number)];
    expect(setVolume({ weightKg: 80, reps: 10 })).toBe(800);
    expect(totalVolume(sets)).toBe(1520);
  });
});

describe('historique, comparaison et records', () => {
  const sessions = [sess('2026-10-01'), sess('2026-10-05'), sess('2026-10-09')];
  const sets = [
    set('s2026-10-01', 80, 9), set('s2026-10-01', 80, 8), set('s2026-10-01', 80, 7),
    set('s2026-10-05', 80, 10), set('s2026-10-05', 80, 9), set('s2026-10-05', 80, 8),
    set('s2026-10-09', 82.5, 8), set('s2026-10-09', 82.5, 7), set('s2026-10-09', 82.5, 7),
  ];
  const h = exerciseHistory('bench', sessions, sets);

  it('historique chronologique', () => {
    expect(h.map((p) => p.date)).toEqual(['2026-10-01', '2026-10-05', '2026-10-09']);
    expect(h[1].volume).toBe(2160);
  });

  it('détecte la hausse de répétitions à charge égale', () => {
    const c = comparePerformances(h[1], h[0]);
    expect(c.kind).toBe('progress');
    expect(c.repsDelta).toBe(1);
    expect(c.messages.join(' ')).toContain('10 répétitions à 80 kg contre 9');
  });

  it('détecte la hausse de charge', () => {
    const c = comparePerformances(h[2], h[1]);
    expect(c.weightDelta).toBe(2.5);
    expect(c.kind).toBe('progress');
  });

  it('records battus par une série', () => {
    const r = recordsBrokenBySet(h[0].sets, { weightKg: 80, reps: 10 });
    expect(r.map((x) => x.type).sort()).toEqual(['e1rm', 'reps', 'setVolume']);
    expect(recordsBrokenBySet([], { weightKg: 80, reps: 10 })).toEqual([]);
  });

  it('chronologie des records', () => {
    const t = recordTimeline('bench', h);
    expect(t.filter((e) => e.date === '2026-10-01')).toHaveLength(0);
    expect(t.find((e) => e.type === 'weight')?.value).toBe(82.5);
    expect(t.find((e) => e.type === 'sessionVolume')?.date).toBe('2026-10-05');
  });

  it('records de l\'exercice', () => {
    const r = exerciseRecords(h);
    expect(r.bestWeight?.value).toBe(82.5);
    expect(r.bestE1rm?.value).toBeCloseTo(106.7, 1);
    expect(r.maxReps?.value).toBe(10);
    expect(r.totalVolume).toBe(1920 + 2160 + 1815);
  });
});

describe('surcharge progressive', () => {
  const s = sess('2026-10-10');
  it('suggère une hausse quand toutes les séries atteignent le haut de fourchette', () => {
    const p = exerciseHistory('bench', [s], [set(s.id, 60, 12), set(s.id, 60, 12), set(s.id, 60, 12)])[0];
    const sug = progressionSuggestion(p, { sets: 3, repMin: 8, repMax: 12 }, 2.5);
    expect(sug?.suggestedWeightKg).toBe(62.5);
  });
  it('ne suggère rien si une série est sous le haut de fourchette', () => {
    const p = exerciseHistory('bench', [s], [set(s.id, 60, 12), set(s.id, 60, 12), set(s.id, 60, 11)])[0];
    expect(progressionSuggestion(p, { sets: 3, repMin: 8, repMax: 12 }, 2.5)).toBeNull();
  });
});

describe('stagnation', () => {
  it('détecte 3 séances sans progrès', () => {
    const ss = ['2026-09-01', '2026-09-05', '2026-09-09', '2026-09-13'].map(sess);
    const sets = ss.flatMap((x) => [set(x.id, 80, 8), set(x.id, 80, 8)]);
    expect(isStagnating(exerciseHistory('bench', ss, sets), 3)).toBe(true);
    const sets2 = [...sets, set(ss[3].id, 85, 8)];
    expect(isStagnating(exerciseHistory('bench', ss, sets2), 3)).toBe(false);
  });
});

describe('volume par muscle', () => {
  it('séries directes et secondaires', () => {
    const ex = { id: 'bench', primaryMuscle: 'chest', secondaryMuscles: ['triceps', 'shoulders'] } as Exercise;
    const rows = muscleVolume([set('a', 80, 10), set('a', 80, 9)], new Map([['bench', ex]]));
    const chest = rows.find((r) => r.muscle === 'chest')!;
    const tri = rows.find((r) => r.muscle === 'triceps')!;
    expect(chest.direct).toBe(2);
    expect(tri.secondary).toBe(2);
    expect(tri.weighted).toBe(1);
  });
});
