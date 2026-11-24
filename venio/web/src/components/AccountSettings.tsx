"use client";
import { Download, LogOut, ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";
import { useMe } from "@/components/AppShell";
import { Alert, Button, Card, Field, Input, Table, Td, Th } from "@/components/ui";
import { api, errorMessage } from "@/lib/api";
import { fmtDateTime } from "@/lib/format";
import { DEMO } from "@/lib/routes";

type Session = { created_at: string; current: boolean };
type Entry = { created_at: string; action: string; label: string; actor: string };

/** Paramètres > Mon compte : mot de passe, appareils connectés, export des données, journal d'activité. */
export function AccountSettings() {
  const me = useMe();
  const tz = me.tenant.timezone;
  const isAdmin = me.role !== "member";
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [pwd, setPwd] = useState<{ busy: boolean; error: string; ok: string }>({ busy: false, error: "", ok: "" });
  const [sessions, setSessions] = useState<Session[] | null>(null);
  const [revoked, setRevoked] = useState("");
  const [journal, setJournal] = useState<Entry[] | null>(null);

  const loadSessions = () => api<{ sessions: Session[] }>("/auth/sessions").then((r) => setSessions(r.sessions)).catch(() => setSessions([]));
  useEffect(() => {
    if (DEMO) return;
    loadSessions();
    if (isAdmin) api<Entry[]>("/audit?limit=50").then(setJournal).catch(() => setJournal([]));
  }, [isAdmin]);

  async function changePassword(e: React.FormEvent) {
    e.preventDefault();
    if (next.length < 10) { setPwd({ busy: false, error: "Le nouveau mot de passe doit contenir au moins 10 caractères.", ok: "" }); return; }
    if (next !== confirm) { setPwd({ busy: false, error: "Les deux mots de passe ne sont pas identiques.", ok: "" }); return; }
    setPwd({ busy: true, error: "", ok: "" });
    try {
      await api("/auth/password/change", { method: "POST", body: { current_password: current, new_password: next } });
      setCurrent(""); setNext(""); setConfirm("");
      setPwd({ busy: false, error: "", ok: "Mot de passe modifié. Vos autres appareils ont été déconnectés." });
      loadSessions();
    } catch (err) { setPwd({ busy: false, error: errorMessage(err), ok: "" }); }
  }

  async function revokeOthers() {
    try { const r = await api<{ revoked: number }>("/auth/sessions/revoke-others", { method: "POST" }); setRevoked(`${r.revoked} appareil(s) déconnecté(s).`); loadSessions(); }
    catch (err) { setRevoked(errorMessage(err)); }
  }

  const others = (sessions ?? []).filter((s) => !s.current).length;
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <Card>
        <h2 className="font-semibold">Mot de passe</h2>
        <form onSubmit={changePassword} className="mt-4 space-y-4">
          <Field label="Mot de passe actuel"><Input required type="password" value={current} onChange={(e) => setCurrent(e.target.value)} autoComplete="current-password" /></Field>
          <Field label="Nouveau mot de passe" hint="10 caractères minimum."><Input required minLength={10} type="password" value={next} onChange={(e) => setNext(e.target.value)} autoComplete="new-password" /></Field>
          <Field label="Confirmez le nouveau mot de passe"><Input required type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" /></Field>
          {pwd.error && <Alert>{pwd.error}</Alert>}
          {pwd.ok && <Alert kind="success">{pwd.ok}</Alert>}
          <Button type="submit" loading={pwd.busy}>Changer le mot de passe</Button>
        </form>
      </Card>

      <div className="space-y-5">
        <Card>
          <h2 className="font-semibold">Appareils connectés</h2>
          <p className="mt-2 text-sm text-ink-muted">
            {sessions === null ? "Chargement…" : others === 0 ? "Vous n'êtes connecté que sur cet appareil." : `Vous êtes connecté sur cet appareil et ${others} autre(s).`}
          </p>
          {others > 0 && <Button variant="secondary" className="mt-3" onClick={revokeOthers} icon={<LogOut aria-hidden className="h-4 w-4" />}>Déconnecter les autres appareils</Button>}
          {revoked && <p className="mt-2 text-sm text-ink-muted" role="status">{revoked}</p>}
        </Card>
        {me.role === "owner" && (
          <Card>
            <h2 className="font-semibold">Vos données</h2>
            <p className="mt-2 text-sm text-ink-muted">Téléchargez toutes les données de votre espace (clients, demandes, rendez-vous, réglages) dans un fichier lisible. Utile pour vos archives ou pour changer d&apos;outil.</p>
            <a href="/api/export" className="mt-3 inline-flex items-center gap-2 rounded-control border border-line-strong px-4 py-2 text-sm font-medium text-ink hover:bg-sunken"><Download aria-hidden className="h-4 w-4" />Exporter mes données</a>
            <p className="mt-3 text-xs text-ink-subtle">Pour supprimer un client et toutes ses données, ouvrez sa demande puis « Supprimer ce client ».</p>
          </Card>
        )}
      </div>

      {isAdmin && (
        <Card className="lg:col-span-2">
          <div className="flex items-center gap-2"><ShieldCheck aria-hidden className="h-5 w-5 text-ink-muted" /><h2 className="font-semibold">Journal d&apos;activité</h2></div>
          <p className="mt-1 text-sm text-ink-muted">Les consultations de dossiers, ouvertures de fichiers, exports et suppressions sont enregistrés pendant un an.</p>
          {journal === null ? <p className="mt-3 text-sm text-ink-muted">Chargement…</p> : journal.length === 0 ? <p className="mt-3 text-sm text-ink-muted">Aucune activité enregistrée pour l&apos;instant.</p> : (
            <div className="mt-3 overflow-x-auto">
              <Table><thead><tr><Th>Date</Th><Th>Action</Th><Th>Par</Th></tr></thead>
                <tbody>{journal.map((j, i) => <tr key={i}><Td>{fmtDateTime(j.created_at, tz)}</Td><Td>{j.label}</Td><Td>{j.actor}</Td></tr>)}</tbody>
              </Table>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
