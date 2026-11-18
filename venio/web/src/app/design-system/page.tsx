"use client";
import { CalendarDays, Inbox, Phone, Plus, Search, Settings } from "lucide-react";
import { useState, type ReactNode } from "react";
import {
  Alert, Avatar, Badge, BrowserFrame, Button, Card, CardHeader, Checkbox, ChoiceTile, ConfirmDialog, EmptyState,
  Field, IconButton, Input, Kpi, Logo, LogoMark, Modal, PhoneFrame, Select, Skeleton, SmsBubble, Spinner, Switch,
  Table, Tabs, Td, TextLink, Textarea, Th, ThreadProgress, ToastProvider, useToast,
} from "@/components/ui";
import { brandPair, brandStyle, contrast } from "@/lib/color";

const COLORS: { token: string; hex: string; use: string; on?: string }[] = [
  { token: "ink", hex: "#14213d", use: "Texte principal, bouton principal", on: "#faf9f6" },
  { token: "ink-muted", hex: "#4a5468", use: "Texte secondaire", on: "#faf9f6" },
  { token: "ink-subtle", hex: "#6b7385", use: "Légendes (≥ 14 px)", on: "#faf9f6" },
  { token: "paper", hex: "#faf9f6", use: "Fond général" },
  { token: "surface", hex: "#ffffff", use: "Cartes, champs" },
  { token: "sunken", hex: "#f1efea", use: "Survol, zones en retrait" },
  { token: "line", hex: "#e6e3dc", use: "Séparateurs (décoratif)" },
  { token: "line-strong", hex: "#cfcbc1", use: "Bordures de champs" },
  { token: "signal", hex: "#f28c28", use: "Accent : le fil, pastilles — texte ink dessus", on: "#14213d" },
  { token: "signal-strong", hex: "#a6470a", use: "Liens, bouton accent (texte blanc)", on: "#faf9f6" },
  { token: "success", hex: "#1f7a4d", use: "Réussite", on: "#faf9f6" },
  { token: "warning", hex: "#8a5a00", use: "Attention", on: "#faf9f6" },
  { token: "danger", hex: "#b42318", use: "Erreur, suppression", on: "#faf9f6" },
  { token: "info", hex: "#1f4e8c", use: "Information", on: "#faf9f6" },
];

const SECTIONS = ["Identité", "Couleurs", "Typographie", "Espacements", "Boutons", "Champs", "Contenus", "Retours", "Spécifiques"];
const slug = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

function Section({ title, intro, children }: { title: string; intro?: ReactNode; children: ReactNode }) {
  return (
    <section id={slug(title)} className="scroll-mt-6 border-t border-line py-12">
      <h2 className="font-display text-3xl font-semibold text-ink">{title}</h2>
      {intro && <p className="mt-2 max-w-2xl text-ink-muted">{intro}</p>}
      <div className="mt-8">{children}</div>
    </section>
  );
}

function Specimen({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <div className={className}>
      <p className="mb-2 font-mono text-xs text-ink-subtle">{label}</p>
      {children}
    </div>
  );
}

export default function DesignSystemPage() {
  return <ToastProvider><Catalogue /></ToastProvider>;
}

function Catalogue() {
  const toast = useToast();
  const [modal, setModal] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [sw, setSw] = useState(true);
  const [tile, setTile] = useState("visite");
  const [tab, setTab] = useState<"tous" | "nouveaux" | "traites">("tous");
  const [brand, setBrand] = useState("#2f9e8f");
  const pair = brandPair(brand);

  return (
    <div className="mx-auto max-w-6xl px-5 pb-24">
      <header className="flex flex-wrap items-end justify-between gap-4 py-10">
        <div>
          <Logo className="text-lg" />
          <h1 className="mt-6 font-display text-5xl font-semibold text-ink md:text-6xl">Design system</h1>
          <p className="mt-3 max-w-2xl text-lg text-ink-muted">
            Un seul système pour la vitrine, l&apos;espace entreprise et les pages de réservation.
            Toutes les couleurs de texte respectent un contraste de 4,5:1 minimum (WCAG AA).
          </p>
        </div>
        <nav aria-label="Sections" className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
          {SECTIONS.map((s) => <a key={s} href={`#${slug(s)}`} className="text-ink-muted hover:text-ink">{s}</a>)}
        </nav>
      </header>

      <Section title="Identité" intro="« Le fil » : un signal (le point orange — un appel, une visite) relié par une ligne continue à un rendez-vous (l'anneau). Une seule épaisseur de trait, deux couleurs.">
        <div className="grid gap-6 md:grid-cols-3">
          <Card className="flex h-40 items-center justify-center"><Logo className="text-3xl" /></Card>
          <div className="flex h-40 items-center justify-center rounded-card bg-ink"><Logo inverted className="text-3xl" /></div>
          <Card className="flex h-40 items-center justify-center gap-6">
            <LogoMark className="h-16 w-16" animated />
            <LogoMark className="h-10 w-10" />
            <LogoMark className="h-6 w-6" />
          </Card>
        </div>
        <p className="mt-4 text-sm text-ink-muted">Le tracé s&apos;anime une seule fois à l&apos;affichage (jamais en boucle) et reste immobile si l&apos;utilisateur a demandé à réduire les animations.</p>
      </Section>

      <Section title="Couleurs" intro="Palette limitée : bleu nuit dominant, fonds chauds, un seul accent. L'orange clair n'accepte jamais de texte blanc.">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {COLORS.map((c) => (
            <div key={c.token} className="flex items-center gap-3 rounded-card border border-line bg-surface p-3">
              <span className="h-12 w-12 shrink-0 rounded-control border border-ink/10" style={{ background: c.hex }} />
              <div className="min-w-0 text-sm">
                <p className="font-mono text-xs text-ink">{c.token} · {c.hex}</p>
                <p className="text-ink-muted">{c.use}</p>
                {c.on && <p className="tabular text-xs text-ink-subtle">Contraste {contrast(c.hex, c.on).toFixed(1)}:1 {contrast(c.hex, c.on) >= 4.5 ? "✓ AA" : "✗"}</p>}
              </div>
            </div>
          ))}
        </div>

        <Card className="mt-6">
          <CardHeader title="Couleur d'une entreprise cliente" description="Sur sa page de réservation, l'entreprise choisit sa couleur. Le texte (blanc ou encre) est choisi automatiquement ; une teinte moyenne illisible est assombrie sans changer de teinte." />
          <div className="flex flex-wrap items-end gap-6">
            <Field label="Couleur choisie"><Input type="color" className="h-11 w-24 p-1" value={brand} onChange={(e) => setBrand(e.target.value)} /></Field>
            <div style={brandStyle(brand)} className="flex items-center gap-4">
              <Button variant="brand" size="lg">Continuer</Button>
              <p className="tabular text-sm text-ink-muted">Fond appliqué {pair.bg} · texte {pair.fg === "#ffffff" ? "blanc" : "encre"} · {contrast(pair.bg, pair.fg).toFixed(1)}:1</p>
            </div>
          </div>
        </Card>
      </Section>

      <Section title="Typographie" intro="Fraunces (titres de la vitrine uniquement), Inter (toute l'interface, chiffres tabulaires), JetBrains Mono (identifiants). Polices auto-hébergées.">
        <div className="space-y-6">
          <Specimen label="font-display · 72 / 60 / 48 / 36 px · Fraunces 600">
            <p className="font-display text-6xl font-semibold leading-[1.05] md:text-7xl">Chaque appel compte.</p>
            <p className="font-display text-4xl font-semibold">Une opportunité de rendez-vous.</p>
          </Specimen>
          <Specimen label="font-sans · Inter · 30 / 24 / 20 / 18 / 16 / 14 / 12 px">
            <p className="text-3xl font-semibold tracking-tight">Titre de page de l&apos;application</p>
            <p className="text-2xl font-semibold tracking-tight">Titre de section</p>
            <p className="text-xl font-semibold">Titre de carte important</p>
            <p className="text-lg">Texte d&apos;introduction, lisible et aéré.</p>
            <p className="text-base">Texte courant : vos clients décrivent leur besoin, choisissent un créneau réellement libre, et vous arrivez préparé.</p>
            <p className="text-sm text-ink-muted">Texte secondaire et libellés de champs.</p>
            <p className="text-xs text-ink-subtle">Légende, métadonnée, horodatage.</p>
          </Specimen>
          <Specimen label="tabular · font-mono">
            <p className="tabular text-2xl font-semibold">08:30 · 10:00 · 14:15 · 1 248 €</p>
            <p className="font-mono text-sm">Dossier VN-2026-00142</p>
          </Specimen>
        </div>
      </Section>

      <Section title="Espacements" intro="Grille de 4 px. Vitrine très aérée (96–128 px entre sections), application dense (8–16 px). Rayons : 6 px contrôles, 10 px cartes, 16 px grandes captures.">
        <div className="flex flex-wrap items-end gap-4">
          {[4, 8, 12, 16, 24, 32, 48, 64, 96, 128].map((n) => (
            <div key={n} className="text-center">
              <span className="block bg-signal/70" style={{ width: Math.min(n, 128), height: Math.min(n, 128) }} />
              <span className="tabular mt-1 block font-mono text-xs text-ink-subtle">{n}</span>
            </div>
          ))}
        </div>
        <div className="mt-8 flex flex-wrap gap-6">
          {[["rounded-control", "6 px"], ["rounded-card", "10 px"], ["rounded-frame", "16 px"]].map(([c, l]) => (
            <Specimen key={c} label={`${c} · ${l}`}><span className={`block h-20 w-32 border border-line-strong bg-surface ${c}`} /></Specimen>
          ))}
          <Specimen label="shadow-float (menus, modales uniquement)"><span className="block h-20 w-32 rounded-card bg-surface shadow-float" /></Specimen>
        </div>
      </Section>

      <Section title="Boutons" intro="Une action principale par vue. Le texte du bouton dit ce qui va se passer.">
        <div className="space-y-6">
          {(["sm", "md", "lg"] as const).map((size) => (
            <Specimen key={size} label={`size="${size}"`}>
              <div className="flex flex-wrap items-center gap-3">
                <Button size={size}>Principal</Button>
                <Button size={size} variant="secondary">Secondaire</Button>
                <Button size={size} variant="ghost">Discret</Button>
                <Button size={size} variant="accent">Accent</Button>
                <Button size={size} variant="danger">Supprimer</Button>
              </div>
            </Specimen>
          ))}
          <Specimen label="États : avec icône · chargement · désactivé · bouton icône · lien">
            <div className="flex flex-wrap items-center gap-3">
              <Button icon={<Plus className="h-4 w-4" />}>Nouvelle prestation</Button>
              <Button loading>Enregistrement…</Button>
              <Button disabled>Indisponible</Button>
              <Button variant="secondary" disabled>Indisponible</Button>
              <IconButton label="Rechercher"><Search className="h-4 w-4" /></IconButton>
              <IconButton label="Paramètres"><Settings className="h-4 w-4" /></IconButton>
              <TextLink href="#boutons">Lien dans un texte</TextLink>
            </div>
          </Specimen>
        </div>
      </Section>

      <Section title="Champs" intro="Libellé toujours visible, aide sous le champ, erreur explicite qui dit comment corriger.">
        <div className="grid gap-6 md:grid-cols-2">
          <Field label="Nom de l'entreprise" hint="Affiché sur votre page de réservation."><Input placeholder="Ex. Rénovation Exemple" /></Field>
          <Field label="Email" error="Cette adresse n'est pas valide : vérifiez le @ et le domaine."><Input invalid defaultValue="contact@exemple" /></Field>
          <Field label="Téléphone" optional><Input type="tel" placeholder="06 12 34 56 78" /></Field>
          <Field label="Identifiant (non modifiable)"><Input disabled defaultValue="renovation-exemple" /></Field>
          <Field label="Type de rendez-vous"><Select defaultValue="visite"><option value="visite">Visite sur place</option><option value="appel">Appel téléphonique</option><option value="visio">Visio</option></Select></Field>
          <Field label="Description du besoin"><Textarea placeholder="Décrivez votre projet en quelques phrases." /></Field>
          <div className="space-y-3">
            <Checkbox label="Recevoir un rappel par SMS la veille" description="Vous pouvez répondre STOP à tout moment." defaultChecked />
            <Checkbox label="Option désactivée" disabled />
          </div>
          <Card><Switch checked={sw} onChange={setSw} label="Récupération des appels manqués" description="Exemple d'interrupteur d'activation." /></Card>
        </div>
        <Specimen label="ChoiceTile — parcours client (une décision par écran, couleur de l'entreprise)" className="mt-8">
          <div style={brandStyle("#14213d")} className="grid max-w-xl gap-3 sm:grid-cols-3">
            {[["visite", "🏠", "Visite technique", "Sur place, 1 h"], ["appel", "📞", "Appel", "15 min"], ["visio", "💻", "Visio", "30 min"]].map(([v, i, t, d]) => (
              <ChoiceTile key={v} icon={i} title={t} description={d} selected={tile === v} onClick={() => setTile(v)} />
            ))}
          </div>
        </Specimen>
      </Section>

      <Section title="Contenus" intro="Cartes, indicateurs et tableaux de l'espace entreprise. Exemples avec des données fictives.">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Card><Kpi label="Nouvelles demandes" value={12} /></Card>
          <Card><Kpi label="Rendez-vous (30 j)" value={38} /></Card>
          <Card><Kpi label="Taux de conversion" value="42 %" hint="Calculé sur 91 parcours démarrés." /></Card>
          <Card><Kpi label="Absences" value="3 %" hint="Indicatif : moins de 20 rendez-vous." /></Card>
        </div>

        <div className="mt-6">
          <Tabs label="Filtrer les demandes" value={tab} onChange={setTab}
            items={[{ value: "tous", label: "Toutes", count: 3 }, { value: "nouveaux", label: "Nouvelles", count: 1 }, { value: "traites", label: "Traitées", count: 2 }]} />
          <Table className="mt-4">
            <thead><tr><Th>Client (exemple)</Th><Th>Prestation</Th><Th>Rendez-vous</Th><Th>Statut</Th></tr></thead>
            <tbody>
              <tr><Td><span className="flex items-center gap-2"><Avatar name="Léa Durand" size="sm" />Léa Durand</span></Td><Td>Visite technique</Td><Td>mar. 24 nov. · 08:30</Td><Td><Badge tone="accent" dot>Nouvelle</Badge></Td></tr>
              <tr><Td><span className="flex items-center gap-2"><Avatar name="Karim Benali" size="sm" />Karim Benali</span></Td><Td>Appel</Td><Td>mer. 25 nov. · 14:15</Td><Td><Badge tone="good" dot>Confirmé</Badge></Td></tr>
              <tr><Td><span className="flex items-center gap-2"><Avatar name="Paul Martin" size="sm" />Paul Martin</span></Td><Td>Visio</Td><Td>ven. 20 nov. · 10:00</Td><Td><Badge tone="bad" dot>Annulé</Badge></Td></tr>
            </tbody>
          </Table>
        </div>

        <div className="mt-6 grid gap-6 md:grid-cols-2">
          <Specimen label="Chargement (squelette)">
            <Card className="space-y-3"><Skeleton className="h-4 w-1/3" /><Skeleton className="h-4 w-full" /><Skeleton className="h-4 w-5/6" /><Skeleton className="h-4 w-2/3" /></Card>
          </Specimen>
          <Specimen label="État vide">
            <EmptyState icon={<Inbox className="h-6 w-6" />} title="Aucune demande pour l'instant" action={<Button variant="secondary" size="sm">Copier mon lien de réservation</Button>}>
              Partagez votre lien sur votre site, votre fiche Google et votre signature d&apos;email.
            </EmptyState>
          </Specimen>
        </div>
        <div className="mt-6 flex flex-wrap gap-2">
          <Badge>Neutre</Badge><Badge tone="accent">Accent</Badge><Badge tone="good">Réussite</Badge><Badge tone="warning">Attention</Badge><Badge tone="bad">Erreur</Badge><Badge tone="info">Information</Badge>
        </div>
      </Section>

      <Section title="Retours" intro="Messages dans la page, notifications éphémères discrètes, modales pour les décisions.">
        <div className="grid gap-3 md:grid-cols-2">
          <Alert kind="success" title="Page publiée">Votre page de réservation est en ligne.</Alert>
          <Alert kind="info">Les SMS sont désactivés tant que les envois payants ne sont pas autorisés.</Alert>
          <Alert kind="warning" title="Quota bientôt atteint">80 % des crédits SMS du mois sont utilisés.</Alert>
          <Alert kind="error">Ce créneau vient d&apos;être réservé par quelqu&apos;un d&apos;autre. Choisissez-en un autre.</Alert>
        </div>
        <div className="mt-6 flex flex-wrap items-center gap-3">
          <Button variant="secondary" onClick={() => toast("Modifications enregistrées")}>Afficher une notification</Button>
          <Button variant="secondary" onClick={() => toast("Envoi impossible : réessayez", "error")}>Notification d&apos;erreur</Button>
          <Button variant="secondary" onClick={() => setModal(true)}>Ouvrir une modale</Button>
          <Button variant="danger" onClick={() => setConfirm(true)}>Supprimer une prestation</Button>
          <Spinner label="Chargement…" />
        </div>
        <Modal open={modal} onClose={() => setModal(false)} title="Ajouter une absence"
          footer={<><Button variant="secondary" onClick={() => setModal(false)}>Annuler</Button><Button onClick={() => { setModal(false); toast("Absence ajoutée"); }}>Ajouter l&apos;absence</Button></>}>
          <div className="space-y-4">
            <Field label="Du"><Input type="date" /></Field>
            <Field label="Au"><Input type="date" /></Field>
          </div>
        </Modal>
        <ConfirmDialog open={confirm} onCancel={() => setConfirm(false)} onConfirm={() => { setConfirm(false); toast("Prestation supprimée"); }}
          title="Supprimer « Visite technique » ?" confirmLabel="Supprimer la prestation">
          Les rendez-vous déjà réservés sont conservés. Cette prestation ne sera plus proposée à vos clients.
        </ConfirmDialog>
        <Card className="mt-6 max-w-md text-center">
          <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-success-soft text-success"><CalendarDays className="h-6 w-6" /></div>
          <p className="mt-4 text-lg font-semibold">Rendez-vous confirmé</p>
          <p className="mt-1 text-sm text-ink-muted">Écran de réussite : il rassure, résume et dit ce qui va se passer ensuite.</p>
        </Card>
      </Section>

      <Section title="Spécifiques" intro="Composants propres à Venio : progression en fil, cadres de présentation du produit, aperçu de SMS.">
        <div className="grid gap-10 lg:grid-cols-[1fr_320px]">
          <div className="space-y-8">
            <Specimen label="ThreadProgress — progression d'un parcours (couleur de l'entreprise)">
              <div style={brandStyle("#14213d")} className="space-y-4"><ThreadProgress value={20} /><ThreadProgress value={60} /><ThreadProgress value={100} /></div>
            </Specimen>
            <Specimen label="BrowserFrame — capture de l'espace entreprise">
              <BrowserFrame url="venio-rdv.netlify.app/app">
                <div className="grid grid-cols-3 gap-3 p-4">
                  <Card><Kpi label="Appels manqués" value={23} /></Card>
                  <Card><Kpi label="SMS envoyés" value={17} /></Card>
                  <Card><Kpi label="RDV récupérés" value={9} /></Card>
                </div>
                <p className="px-4 pb-4 text-xs text-ink-subtle">Données fictives — les captures de la vitrine seront générées depuis l&apos;espace de démonstration.</p>
              </BrowserFrame>
            </Specimen>
          </div>
          <Specimen label="PhoneFrame + SmsBubble — modèle « Professionnel » (exemple)">
            <PhoneFrame label="Aperçu d'un SMS de récupération d'appel manqué">
              <div className="space-y-4 px-4">
                <p className="flex items-center justify-center gap-1.5 text-xs text-ink-subtle"><Phone className="h-3 w-3" /> Appel manqué · 10:42</p>
                <SmsBubble sender="RENOEXEMPLE" time="10:44">
                  Rénovation Exemple : nous n&apos;avons pas pu prendre votre appel. Décrivez votre besoin et réservez votre rendez-vous ici : vnio.fr/c/Ab3dEf9h STOP au 36173
                </SmsBubble>
                <p className="text-center text-[11px] text-ink-subtle">1 SMS · 152 caractères</p>
              </div>
            </PhoneFrame>
          </Specimen>
        </div>
      </Section>
    </div>
  );
}
