import { getCommerceSettings } from "@/server/settings";
import { Alert, Card, CardHeader, Checkbox, Field, Input, PageHeader, Select, Textarea } from "@/components/ui";
import { Form, Submit } from "@/components/ui/Form";
import { settingsAction } from "@/app/actions/admin";
import { previewNet } from "@/server/commission/engine";
import { centsToInput, formatEUR } from "@/lib/money";

export default async function Settings() {
  const s = await getCommerceSettings();
  const pct = (bps: number) => String(bps / 100);
  const ex1 = previewNet({ saleType: "P2P", unitPriceCents: 10000, quantity: 1 }, s);
  const ex2 = previewNet({ saleType: "DELEGATED", unitPriceCents: 10000, quantity: 1, contractCommissionBps: 2000 }, s);
  const ex3 = previewNet({ saleType: "SUPPLIER_AFFILIATE", unitPriceCents: 15000, quantity: 1, supplierRule: { type: "FIXED", value: 1500 } }, s);
  return (
    <>
      <PageHeader title="Paramètres commerciaux" subtitle="Tous les taux et délais sont administrables ici ; aucun n'est codé dans les interfaces. Chaque modification est journalisée. Les commandes déjà passées conservent leurs taux figés." />
      <Card className="mb-6 p-5 text-sm">
        <p className="mb-2 font-semibold">Simulation avec les paramètres actuels</p>
        <ul className="space-y-1 text-ink-2">
          <li>Vente entre particuliers à 100 € : vendeur {formatEUR(ex1.seller)} · plateforme {formatEUR(ex1.platform)}</li>
          <li>Vente déléguée à 100 € (20 %) : propriétaire {formatEUR(ex2.seller)} · indépendant {formatEUR(ex2.professional)} · plateforme {formatEUR(ex2.platform)}</li>
          <li>Vente fournisseur à 150 € (commission 15 €) : fournisseur {formatEUR(ex3.seller)} · indépendant {formatEUR(ex3.professional)} · plateforme {formatEUR(ex3.platform)}</li>
        </ul>
      </Card>
      <Form action={settingsAction} className="space-y-6">
        <Card><CardHeader title="Frais de plateforme" />
          <div className="grid gap-4 p-5 md:grid-cols-3">
            <Field label="Frais vente entre particuliers (%)"><Input name="p2pFee" defaultValue={pct(s.p2pFeeBps)} /></Field>
            <Field label="+ part fixe (€)"><Input name="p2pFeeFixed" defaultValue={centsToInput(s.p2pFeeFixedCents)} /></Field>
            <Field label="Frais vente fournisseur directe (%)"><Input name="supplierDirectFee" defaultValue={pct(s.supplierDirectFeeBps)} /></Field>
            <Field label="Frais sur commission des indépendants (%)"><Input name="commissionPlatformFee" defaultValue={pct(s.commissionPlatformFeeBps)} /></Field>
            <Field label="Minimum de frais sur commission (€)"><Input name="commissionPlatformFeeMin" defaultValue={centsToInput(s.commissionPlatformFeeMinCents)} /></Field>
          </div></Card>
        <Card><CardHeader title="Bornes des commissions" />
          <div className="grid gap-4 p-5 md:grid-cols-4">
            <Field label="Délégation min. (%)"><Input name="delegationMin" defaultValue={pct(s.delegationCommissionMinBps)} /></Field>
            <Field label="Délégation max. (%)"><Input name="delegationMax" defaultValue={pct(s.delegationCommissionMaxBps)} /></Field>
            <Field label="Fournisseur min. (% du prix)"><Input name="supplierMin" defaultValue={pct(s.supplierCommissionMinBps)} /></Field>
            <Field label="Fournisseur max. (% du prix)"><Input name="supplierMax" defaultValue={pct(s.supplierCommissionMaxBps)} /></Field>
          </div></Card>
        <Card><CardHeader title="Validation et versements" />
          <div className="grid gap-4 p-5 md:grid-cols-3">
            <Field label="Confirmation auto. de réception après livraison (jours)"><Input name="autoConfirmReceiptDays" type="number" defaultValue={s.autoConfirmReceiptDays} /></Field>
            <Field label="Délai de validation — vendeur particulier (jours)"><Input name="holdDaysP2P" type="number" defaultValue={s.holdDaysP2P} /></Field>
            <Field label="Délai de validation — vendeur professionnel (jours)" hint="≥ 14 recommandé (droit de rétractation)"><Input name="holdDaysProfessional" type="number" defaultValue={s.holdDaysProfessional} /></Field>
            <Field label="Versement minimum (€)"><Input name="minPayout" defaultValue={centsToInput(s.minPayoutCents)} /></Field>
          </div></Card>
        <Card><CardHeader title="Attribution et collaboration" />
          <div className="grid gap-4 p-5 md:grid-cols-3">
            <Field label="Fenêtre d'attribution (jours)"><Input name="attributionWindowDays" type="number" defaultValue={s.attributionWindowDays} /></Field>
            <Field label="Règle d'attribution"><Select name="attributionModel" defaultValue={s.attributionModel}><option value="LAST_CLICK">Dernier clic</option><option value="FIRST_CLICK">Premier clic</option></Select></Field>
            <Field label="Durée maximale d'une collaboration (jours)"><Input name="collaborationMaxDurationDays" type="number" defaultValue={s.collaborationMaxDurationDays} /></Field>
            <Checkbox name="requireVerifiedProfessional" defaultChecked={s.requireVerifiedProfessional} label="Indépendants vérifiés obligatoires" />
            <Checkbox name="requireVerifiedSupplier" defaultChecked={s.requireVerifiedSupplier} label="Fournisseurs vérifiés obligatoires" />
          </div></Card>
        <Card><CardHeader title="Modération" />
          <div className="space-y-4 p-5">
            <Checkbox name="requireModeration" defaultChecked={s.requireModeration} label="Modération systématique avant publication" />
            <Field label="Mots-clés surveillés (un par ligne) — l'annonce passe en modération"><Textarea name="prohibitedKeywords" defaultValue={s.prohibitedKeywords.join("\n")} /></Field>
          </div></Card>
        <Card><CardHeader title="Parrainage" />
          <div className="grid gap-4 p-5 md:grid-cols-3">
            <Checkbox name="referralEnabled" defaultChecked={s.referralEnabled} label="Programme actif" />
            <Field label="Récompense (€)"><Input name="referralReward" defaultValue={centsToInput(s.referralRewardCents)} /></Field>
            <Field label="Premier achat minimum (€)"><Input name="referralMinOrder" defaultValue={centsToInput(s.referralMinOrderCents)} /></Field>
          </div></Card>
        <Alert tone="warning">Les taux affichés aux utilisateurs (CGV, page « Comment ça marche ») sont lus depuis ces paramètres. Toute modification tarifaire doit être annoncée aux utilisateurs professionnels avec un préavis (règlement P2B 2019/1150) — à valider juridiquement.</Alert>
        <Submit size="lg">Enregistrer les paramètres</Submit>
      </Form>
    </>
  );
}
