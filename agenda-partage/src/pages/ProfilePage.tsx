import { KeyRound, Loader2, LogOut, Save } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Avatar } from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { useTeam } from '../context/TeamContext';
import { useToast } from '../context/ToastContext';
import { updateProfile } from '../data/api';
import { listTimeZones } from '../lib/datetime';

const COLORS = ['#E30613', '#B8000A', '#111111', '#525252', '#F97316', '#F59E0B', '#16A34A', '#0D9488', '#2563EB', '#7C3AED', '#DB2777', '#78350F'];

export function ProfilePage() {
  const { profile, signOut, setPassword, refreshProfile } = useAuth();
  const { settings, reloadTeam } = useTeam();
  const toast = useToast();
  const [fullName, setFullName] = useState(profile?.full_name ?? '');
  const [phone, setPhone] = useState(profile?.phone ?? '');
  const [color, setColor] = useState(profile?.color ?? '#E30613');
  const [timezone, setTimezone] = useState(profile?.timezone ?? '');
  const [saving, setSaving] = useState(false);
  const [pwd, setPwd] = useState('');
  const [pwd2, setPwd2] = useState('');
  const [pwdBusy, setPwdBusy] = useState(false);

  useEffect(() => {
    if (!profile) return;
    setFullName(profile.full_name);
    setPhone(profile.phone ?? '');
    setColor(profile.color);
    setTimezone(profile.timezone ?? '');
  }, [profile]);

  if (!profile) return null;

  const save = async () => {
    if (!fullName.trim()) return toast.warning('Indiquez votre nom');
    setSaving(true);
    try {
      await updateProfile(profile.id, { full_name: fullName.trim(), phone: phone.trim() || null, color, timezone: timezone || null });
      await Promise.all([refreshProfile(), reloadTeam()]);
      toast.success('Profil enregistré');
    } catch (e) {
      toast.error(e);
    } finally {
      setSaving(false);
    }
  };

  const changePassword = async () => {
    if (pwd.length < 8) return toast.warning('8 caractères minimum');
    if (pwd !== pwd2) return toast.warning('Les deux mots de passe sont différents');
    setPwdBusy(true);
    try {
      await setPassword(pwd);
      setPwd('');
      setPwd2('');
      toast.success('Mot de passe modifié');
    } catch (e) {
      toast.error(e);
    } finally {
      setPwdBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <div className="card flex items-center gap-4 p-5">
        <Avatar profile={{ full_name: fullName, email: profile.email, color }} size="lg" />
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-xl font-extrabold">{fullName || profile.email}</h1>
          <p className="truncate text-sm text-neutral-500">{profile.email}</p>
          <p className="mt-1 text-xs font-semibold text-brand uppercase">{profile.role === 'admin' ? 'Administrateur' : 'Collaborateur'}</p>
        </div>
        <button className="btn-ghost" onClick={() => void signOut()}>
          <LogOut className="h-4 w-4" /> <span className="hidden sm:inline">Déconnexion</span>
        </button>
      </div>

      <div className="card space-y-4 p-5">
        <h2 className="font-bold">Mes informations</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label">Nom complet</label>
            <input className="field" value={fullName} maxLength={120} onChange={(e) => setFullName(e.target.value)} autoComplete="name" />
          </div>
          <div>
            <label className="label">Téléphone</label>
            <input className="field" type="tel" inputMode="tel" value={phone} maxLength={40} onChange={(e) => setPhone(e.target.value)} autoComplete="tel" />
          </div>
        </div>
        <div>
          <label className="label">Ma couleur dans l'agenda</label>
          <div className="flex flex-wrap gap-2">
            {COLORS.map((c) => (
              <button
                key={c}
                onClick={() => setColor(c)}
                className={`h-9 w-9 rounded-full transition ${color.toUpperCase() === c ? 'ring-2 ring-ink ring-offset-2' : 'hover:scale-110'}`}
                style={{ background: c }}
                aria-label={`Couleur ${c}`}
              />
            ))}
          </div>
        </div>
        <div>
          <label className="label">Fuseau horaire d'affichage</label>
          <select className="field" value={timezone} onChange={(e) => setTimezone(e.target.value)}>
            <option value="">Celui de l'équipe ({settings?.timezone ?? '—'})</option>
            {listTimeZones().map((z) => (
              <option key={z} value={z}>
                {z}
              </option>
            ))}
          </select>
        </div>
        <div className="flex justify-end">
          <button className="btn-primary" onClick={save} disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Enregistrer
          </button>
        </div>
      </div>

      <div className="card space-y-4 p-5">
        <h2 className="flex items-center gap-2 font-bold">
          <KeyRound className="h-4 w-4 text-brand" /> Changer de mot de passe
        </h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <input className="field" type="password" placeholder="Nouveau mot de passe" value={pwd} onChange={(e) => setPwd(e.target.value)} autoComplete="new-password" />
          <input className="field" type="password" placeholder="Confirmer" value={pwd2} onChange={(e) => setPwd2(e.target.value)} autoComplete="new-password" />
        </div>
        <div className="flex justify-end">
          <button className="btn-dark" onClick={changePassword} disabled={pwdBusy || !pwd}>
            {pwdBusy && <Loader2 className="h-4 w-4 animate-spin" />} Mettre à jour
          </button>
        </div>
      </div>
    </div>
  );
}
