// Modèle de données de l'outil de prospection (stocké en local dans le navigateur).

export type Metier =
  | 'electricien' | 'plombier' | 'chauffagiste' | 'peintre' | 'menuisier' | 'couvreur'
  | 'macon' | 'carreleur' | 'plaquiste' | 'renovation' | 'multiservices'
  | 'autre_btp' | 'hors_btp' | 'inconnu';

/** Tailles de la cible (section A) ; « inconnue » quand aucune donnée fiable n'existe. */
export type Taille = 'independant' | '2-5' | '6-10' | '11-20' | 'plus_de_20' | 'inconnue';

export type Canal =
  | 'linkedin' | 'email' | 'telephone' | 'formulaire_web' | 'courrier' | 'salon' | 'recommandation' | 'autre';

/** D'où vient une donnée (traçabilité : on n'invente rien). */
export type Source = 'api_entreprises' | 'import_csv' | 'google' | 'annuaire' | 'linkedin' | 'site_web' | 'saisie';

export type Statut =
  | 'a_qualifier' | 'a_contacter' | 'contacte' | 'repondu' | 'rdv' | 'essai' | 'client' | 'perdu' | 'ne_pas_contacter';

export type LogicielActuel = 'aucun' | 'papier_excel' | 'concurrent' | 'inconnu';

export type SignalActivite =
  | 'recrutement' | 'croissance_effectif' | 'nouvel_etablissement' | 'chantiers_publies' | 'avis_clients_recents' | 'site_web_actif';

export type SignalInteret =
  | 'demande_info' | 'a_repondu_positivement' | 'interaction_linkedin' | 'visite_site' | 'recommande';

export interface Dirigeant {
  prenom?: string;
  nom?: string;
  /** Qualité déclarée (Gérant, Président, Entrepreneur individuel…). */
  qualite?: string;
  linkedinUrl?: string;
  /** Le profil / l'identité a été vérifié par un humain (profil LinkedIn trouvé, appel…). */
  verifie?: boolean;
}

export interface Prospect {
  id: string;
  siren?: string;
  nom: string;
  naf?: string;
  nafLibelle?: string;
  metier: Metier;
  /** Code tranche d'effectif INSEE (NN, 00, 01, 02, 03, 11, 12…) quand il vient du répertoire. */
  trancheEffectif?: string;
  /** Effectif saisi à la main (prioritaire sur la tranche INSEE). */
  effectifSaisi?: number;
  /** AAAA-MM-JJ */
  dateCreation?: string;
  /** L'entreprise est active d'après le répertoire public (undefined = non vérifié). */
  active?: boolean;
  codePostal?: string;
  commune?: string;
  departement?: string;
  entrepreneurIndividuel?: boolean;
  dirigeant?: Dirigeant;
  telephone?: string;
  email?: string;
  emailNominatif?: boolean;
  siteWeb?: string;
  logicielActuel: LogicielActuel;
  /** L'activité a été vérifiée (site, avis, chantiers…) : sans cette case, l'absence de signal = donnée inconnue. */
  activiteVerifiee: boolean;
  signauxActivite: SignalActivite[];
  signauxInteret: SignalInteret[];
  /** Champ → source de la donnée. */
  sources: Record<string, Source>;
  statut: Statut;
  notes?: string;
  creeLe: string;
  majLe: string;
}

export type TypeInteraction =
  | 'message_envoye' | 'appel' | 'reponse_positive' | 'reponse_negative' | 'rdv' | 'essai' | 'signature' | 'resiliation';

export interface Interaction {
  id: string;
  prospectId: string;
  /** AAAA-MM-JJ */
  date: string;
  canal: Canal;
  type: TypeInteraction;
  campagneId?: string;
  /** Identifiant du modèle de message utilisé (mesure de l'efficacité des messages). */
  varianteMessage?: string;
  note?: string;
}

export interface Campagne {
  id: string;
  nom: string;
  canal: Canal;
  /** Coût total HT engagé (outils, abonnements, temps valorisé, publicité…). */
  cout: number;
  dateDebut: string;
  dateFin?: string;
  description?: string;
}

export interface Parametres {
  prixMensuelHT: number;
  /** Marge brute réelle en % du prix (après hébergement, support, frais de paiement…). */
  margeBrutePct: number;
  /** Attrition mensuelle (%) utilisée tant que l'historique réel est insuffisant. */
  churnMensuelPct: number;
  /** Durée de rétention imposée (mois) ; 0 = calculée depuis l'attrition. */
  dureeRetentionMois: number;
  /** Coûts fixes mensuels de prospection (outils, abonnements…), hors campagnes. */
  coutsFixesMensuels: number;
  /** Plafond de messages personnalisés par jour (anti-envoi de masse). */
  quotaMessagesJour: number;
  /** Nom de l'expéditeur pour la signature des messages. */
  signature: string;
  nomProduit: string;
}

export interface Donnees {
  version: 1;
  prospects: Prospect[];
  interactions: Interaction[];
  campagnes: Campagne[];
  parametres: Parametres;
}

export const PARAMETRES_DEFAUT: Parametres = {
  prixMensuelHT: 15,
  margeBrutePct: 80,
  churnMensuelPct: 3,
  dureeRetentionMois: 0,
  coutsFixesMensuels: 0,
  quotaMessagesJour: 20,
  signature: '',
  nomProduit: 'notre ERP',
};
