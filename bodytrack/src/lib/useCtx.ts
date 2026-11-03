import { useMemo } from 'react';
import { useStore } from './store/store';
import { buildContext, type Ctx } from './analytics/context';
import { today } from './dates';
import { useEffect, useState } from 'react';

/** Index dérivé des données, recalculé uniquement quand les données changent */
export function useCtx(): Ctx {
  const data = useStore((s) => s.data);
  return useMemo(() => buildContext(data), [data]);
}

/** Date du jour, mise à jour automatiquement au passage de minuit */
export function useToday(): string {
  const [d, setD] = useState(today());
  useEffect(() => {
    const id = setInterval(() => {
      const t = today();
      setD((cur) => (cur === t ? cur : t));
    }, 30_000);
    return () => clearInterval(id);
  }, []);
  return d;
}
