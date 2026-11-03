import { useState } from 'react';
import { Button, Field, NumberInput, Sheet } from './ui';
import { logWeight } from '../lib/actions';
import { today } from '../lib/dates';
import { useStore } from '../lib/store/store';
import { toast } from './toast';

export function WeightSheet({ open, onClose, date: initialDate }: { open: boolean; onClose: () => void; date?: string }) {
  const weights = useStore((s) => s.data.weights);
  const [date, setDate] = useState(initialDate ?? today());
  const existing = weights.find((w) => w.date === date);
  const last = [...weights].sort((a, b) => b.date.localeCompare(a.date))[0];
  const [value, setValue] = useState<number | null>(existing?.weightKg ?? last?.weightKg ?? null);
  const [note, setNote] = useState(existing?.note ?? '');
  const valid = value !== null && value >= 25 && value <= 400;
  const save = () => {
    if (!valid) return;
    logWeight(date, Math.round(value! * 10) / 10, note);
    toast('Poids enregistré', `${value!.toLocaleString('fr-FR')} kg`);
    onClose();
  };
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Saisir mon poids"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Annuler
          </Button>
          <Button variant="primary" onClick={save} disabled={!valid}>
            Enregistrer
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Date">
            <input
              type="date"
              className="field"
              value={date}
              max={today()}
              onChange={(e) => {
                setDate(e.target.value);
                const ex = weights.find((w) => w.date === e.target.value);
                if (ex) {
                  setValue(ex.weightKg);
                  setNote(ex.note);
                }
              }}
            />
          </Field>
          <Field label="Poids" hint={existing ? 'Remplace la pesée de ce jour' : undefined}>
            <NumberInput value={value} onChange={setValue} suffix="kg" onEnter={save} />
          </Field>
        </div>
        <Field label="Note (facultatif)">
          <input className="field" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ex. : après un repas salé" maxLength={140} />
        </Field>
        <p className="text-xs text-faint">Conseil : pèse-toi le matin, à jeun, dans les mêmes conditions. La tendance est calculée sur la moyenne de 7 jours.</p>
      </div>
    </Sheet>
  );
}
