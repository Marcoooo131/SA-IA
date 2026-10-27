import { useCallback, useEffect, useRef, useState } from 'react';
import { useTeam } from '../context/TeamContext';
import { friendlyError } from '../lib/errors';
import type { Appointment } from '../lib/types';
import { fetchAgenda } from './api';

/**
 * Rendez-vous d'une période, rechargés automatiquement dès qu'un membre de l'équipe
 * crée, modifie ou supprime un rendez-vous (signal temps réel).
 */
export function useAgenda(from: Date | null, to: Date | null) {
  const { appointmentsVersion } = useTeam();
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestId = useRef(0);
  const fromMs = from?.getTime();
  const toMs = to?.getTime();

  const load = useCallback(async () => {
    if (fromMs === undefined || toMs === undefined) return;
    const id = ++requestId.current;
    setLoading(true);
    try {
      const data = await fetchAgenda(new Date(fromMs), new Date(toMs));
      if (id === requestId.current) {
        setAppointments(data);
        setError(null);
      }
    } catch (e) {
      if (id === requestId.current) setError(friendlyError(e));
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  }, [fromMs, toMs]);

  useEffect(() => {
    // Plusieurs modifications rapprochées → un seul rechargement
    const t = setTimeout(() => void load(), appointmentsVersion ? 150 : 0);
    return () => clearTimeout(t);
  }, [load, appointmentsVersion]);

  return { appointments, setAppointments, loading, error, reload: load };
}
