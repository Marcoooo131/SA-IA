import { Card, ProgressBar } from '../../components/ui';
import type { ConsistencyComponent } from '../../lib/analytics/reports';

export function ScoreCard({ score, components }: { score: number; components: ConsistencyComponent[] }) {
  return (
    <Card>
      <div className="flex items-center gap-4">
        <div className="display text-5xl font-bold tnum text-accent">{score}</div>
        <div>
          <div className="font-semibold">Score de régularité</div>
          <div className="text-xs text-muted">sur 100 · mesure de l'assiduité du suivi</div>
        </div>
      </div>
      <div className="space-y-3 mt-4">
        {components.map((c) => (
          <div key={c.key}>
            <div className="flex justify-between text-xs mb-1">
              <span>
                {c.label} <span className="text-faint">({c.weight} pts)</span>
              </span>
              <span className="tnum text-muted">
                {Math.round(c.ratio * c.weight)} pts · {c.detail}
              </span>
            </div>
            <ProgressBar value={c.ratio} max={1} height={5} />
          </div>
        ))}
      </div>
      <p className="text-[11px] text-faint mt-3">
        40 pts pour les séances réalisées par rapport à ton objectif hebdomadaire, 30 pts pour les jours de journal alimentaire, 20 pts pour les jours où l'objectif protéique est atteint (≥ 90 %), 10 pts pour les pesées (3 par semaine suffisent). Ce score ne mesure pas ta forme ni la qualité de ton physique.
      </p>
    </Card>
  );
}
