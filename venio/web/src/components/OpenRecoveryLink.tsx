"use client";
import { CalendarCheck, Hammer, PhoneCall } from "lucide-react";
import { useEffect, useState } from "react";
import { Alert, Button, Field, Input, LogoMark, Spinner, Textarea } from "@/components/ui";
import { api, errorMessage } from "@/lib/api";

type Link = { slug: string; ref: string; name: string };
type View = "choose" | "existing" | "callback" | "sent";

/**
 * Page ouverte par le lien du SMS après un appel manqué. Avant d'envoyer vers la réservation, l'appelant dit ce qu'il
 * voulait : un SMS de réservation n'est pas adapté à tous les appels (filtrage des appels, niveau 1, document 08).
 */
export function OpenRecoveryLink({ code }: { code: string }) {
  const [link, setLink] = useState<Link | null>(null);
  const [view, setView] = useState<View>("choose");
  const [error, setError] = useState("");
  const [name, setName] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<Link>(`/public/links/${encodeURIComponent(code)}`).then(setLink).catch((e) => setError(errorMessage(e)));
  }, [code]);

  const intent = (i: "new" | "existing" | "callback") => api(`/public/links/${encodeURIComponent(code)}/intent`, { method: "POST", body: { intent: i } }).catch(() => {});
  const book = async () => {
    if (!link) return;
    setBusy(true);
    await intent("new");
    window.location.replace(`/r/${encodeURIComponent(link.slug)}?mc=${encodeURIComponent(link.ref)}`);
  };
  async function sendCallback(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError("");
    try { await api(`/public/links/${encodeURIComponent(code)}/callback`, { method: "POST", body: { name, note: note || null } }); setView("sent"); }
    catch (err) { setError(errorMessage(err)); }
    setBusy(false);
  }

  if (!link) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-sm flex-col items-center justify-center gap-4 px-5 text-center">
        <LogoMark className="h-10 w-10" />
        {error ? <Alert>{error}</Alert> : <Spinner label="Chargement…" />}
      </main>
    );
  }

  const Choice = ({ Icon, title, text, onClick }: { Icon: typeof Hammer; title: string; text: string; onClick: () => void }) => (
    <button type="button" onClick={onClick} disabled={busy}
      className="flex w-full items-start gap-4 rounded-card border border-line bg-surface p-4 text-left transition-colors hover:border-ink/40 disabled:opacity-60">
      <Icon aria-hidden className="mt-0.5 h-6 w-6 shrink-0 text-ink" strokeWidth={1.5} />
      <span><span className="block font-semibold text-ink">{title}</span><span className="mt-0.5 block text-sm text-ink-muted">{text}</span></span>
    </button>
  );

  return (
    <main className="mx-auto min-h-dvh max-w-md px-5 py-10">
      <p className="text-sm text-ink-muted">{link.name}</p>
      {view === "choose" && (
        <>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-ink">Merci pour votre appel</h1>
          <p className="mt-2 text-ink-muted">Nous n&apos;avons pas pu répondre. Votre appel concernait :</p>
          <div className="mt-6 space-y-3">
            <Choice Icon={Hammer} title="Un nouveau projet ou un devis" text="Décrivez votre besoin et choisissez un créneau." onClick={book} />
            <Choice Icon={CalendarCheck} title="Un rendez-vous déjà pris" text="Pour le déplacer ou l'annuler." onClick={() => { intent("existing"); setView("existing"); }} />
            <Choice Icon={PhoneCall} title="Autre chose" text="Laissez votre prénom : nous vous rappelons." onClick={() => { intent("callback"); setView("callback"); }} />
          </div>
        </>
      )}
      {view === "existing" && (
        <div className="mt-4 space-y-4">
          <h1 className="text-2xl font-semibold tracking-tight text-ink">Votre rendez-vous</h1>
          <p className="text-ink">Pour le déplacer ou l&apos;annuler, utilisez le lien « Reporter ou annuler » de l&apos;email de confirmation que vous avez reçu.</p>
          <Button variant="secondary" onClick={() => setView("callback")}>Je préfère être rappelé</Button>
        </div>
      )}
      {view === "callback" && (
        <form onSubmit={sendCallback} className="mt-4 space-y-4">
          <h1 className="text-2xl font-semibold tracking-tight text-ink">Être rappelé</h1>
          <p className="text-ink-muted">{link.name} vous rappelle au numéro depuis lequel vous avez appelé.</p>
          <Field label="Votre prénom"><Input required maxLength={80} value={name} onChange={(e) => setName(e.target.value)} autoComplete="given-name" /></Field>
          <Field label="Motif de votre appel" optional><Textarea maxLength={300} rows={3} value={note} onChange={(e) => setNote(e.target.value)} /></Field>
          {error && <Alert>{error}</Alert>}
          <Button type="submit" loading={busy} size="lg" className="w-full">Demander à être rappelé</Button>
          <button type="button" className="w-full text-sm text-ink-muted underline underline-offset-2" onClick={() => setView("choose")}>Retour</button>
        </form>
      )}
      {view === "sent" && (
        <div className="mt-4"><Alert kind="success" title="C'est noté">{link.name} a bien reçu votre demande et vous rappelle dès que possible.</Alert></div>
      )}
      <p className="mt-10 text-xs text-ink-subtle">Vos informations sont transmises uniquement à {link.name}.</p>
    </main>
  );
}
