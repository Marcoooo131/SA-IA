import type { DossierInfo, HousingType, TriState } from '@/domain/types';
import { HOUSING_TYPE_LABELS, TRISTATE_LABELS } from '@/domain/labels';
import { Field, NumberInput, Select, TextInput, inputCls } from './kit';

/** Formulaire des informations du dossier (création et onglet Logement). */
export function DossierForm({ info, onChange, compact }: { info: DossierInfo; onChange: (patch: Partial<DossierInfo>) => void; compact?: boolean }) {
  return (
    <div className={compact ? 'grid grid-cols-2 gap-3' : 'grid grid-cols-3 gap-4'}>
      <Field label="Référence du dossier" required>
        <TextInput value={info.reference} onChange={(e) => onChange({ reference: e.target.value })} name="reference" />
      </Field>
      <Field label="Nom ou identifiant fictif du client" required hint="N'utilisez pas de données client réelles dans la démonstration.">
        <TextInput value={info.clientName} onChange={(e) => onChange({ clientName: e.target.value })} name="clientName" placeholder="Ex. Client démo 042" />
      </Field>
      <Field label="Adresse du nouveau logement" required className={compact ? 'col-span-2' : ''}>
        <TextInput value={info.address} onChange={(e) => onChange({ address: e.target.value })} name="address" placeholder="Adresse fictive pour la démo" />
      </Field>
      <Field label="Type de logement">
        <Select value={info.housingType} onChange={(e) => onChange({ housingType: e.target.value as HousingType })} name="housingType">
          {Object.entries(HOUSING_TYPE_LABELS).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Surface approximative">
        <NumberInput value={info.surface} onChange={(v) => onChange({ surface: v })} allowNull min={0} max={5000} step={1} suffix="m²" name="surface" />
      </Field>
      <Field label="Nombre d'étages">
        <NumberInput value={info.floors} onChange={(v) => onChange({ floors: v === null ? null : Math.round(v) })} allowNull min={1} max={10} step={1} name="floors" />
      </Field>
      <Field label="Nombre de pièces">
        <NumberInput value={info.rooms} onChange={(v) => onChange({ rooms: v === null ? null : Math.round(v) })} allowNull min={1} max={60} step={1} name="rooms" />
      </Field>
      <Field label="Date d'installation souhaitée">
        <input type="date" className={inputCls} value={info.installationDate ?? ''} onChange={(e) => onChange({ installationDate: e.target.value || null })} name="installationDate" />
      </Field>
      <Field label="Animaux dans le logement">
        <Select value={info.pets} onChange={(e) => onChange({ pets: e.target.value as TriState })} name="pets">
          {Object.entries(TRISTATE_LABELS).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Souhaite se déplacer système activé (nuit)">
        <Select value={info.nightArming} onChange={(e) => onChange({ nightArming: e.target.value as TriState })} name="nightArming">
          {Object.entries(TRISTATE_LABELS).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Commentaires du conseiller" className={compact ? 'col-span-2' : 'col-span-3'}>
        <textarea className={inputCls} rows={compact ? 2 : 4} value={info.advisorNotes} onChange={(e) => onChange({ advisorNotes: e.target.value })} name="advisorNotes" />
      </Field>
    </div>
  );
}
