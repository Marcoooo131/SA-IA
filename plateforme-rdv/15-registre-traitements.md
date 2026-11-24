# 15 — Registre des traitements (article 30 du RGPD) — version du 24/11/2026

> Tenu par Venio dans ses deux rôles. À compléter avec l'identité de l'entreprise à sa création (étape 1.5) et à
> mettre à jour à chaque nouveau traitement ou sous-traitant. Modèle inspiré du registre simplifié de la CNIL.

**Responsable / sous-traitant :** [Prénom Nom], entrepreneur individuel, nom commercial Venio, [adresse], SIREN
[numéro], contact : [email]. Pas de délégué à la protection des données désigné (non obligatoire à ce stade).

## Partie A — Venio responsable de traitement

| | A1. Gestion des comptes et abonnements | A2. Assistance | A3. Sécurité et journalisation | A4. Prospection de Venio auprès des professionnels |
|---|---|---|---|---|
| Finalité | Créer et gérer les espaces, facturer, gérer les impayés | Répondre aux demandes des clients | Protéger le service, enquêter en cas d'incident | Faire connaître Venio aux artisans |
| Base légale | Contrat ; obligation légale (facturation) | Contrat | Intérêt légitime | Intérêt légitime (B2B, en rapport avec l'activité) — à confirmer avec l'avocat |
| Personnes | Utilisateurs des entreprises clientes | Idem | Idem | Professionnels contactés |
| Données | Nom, email, mot de passe chiffré, entreprise, abonnement, acceptation des conditions (date, version) | Échanges | Journaux d'activité, dates de connexion | Nom, entreprise, coordonnées professionnelles |
| Destinataires | Venio ; Stripe (paiement) ; Brevo (emails) | Venio | Venio | Venio |
| Transferts hors UE | Stripe, Brevo : à vérifier (garanties) | — | — | — |
| Durée | Contrat + 3 ans ; factures 10 ans | 3 ans | Journal d'activité : 1 an | 3 ans après le dernier contact |
| Sécurité | Voir partie C | | | |

## Partie B — Venio sous-traitant (pour le compte de chaque entreprise cliente)

| Rubrique | Contenu |
|---|---|
| Responsables de traitement | Les entreprises clientes (liste tenue dans la base : table `tenant`) |
| Traitements réalisés | Prise de rendez-vous (questionnaire, créneaux, confirmation, rappels, report, annulation) ; dossier de demande ; récupération des appels manqués (réception de l'appel renvoyé, SMS, lien de réservation, demande de rappel) ; statistiques agrégées |
| Personnes | Prospects et clients des entreprises ; personnes ayant appelé l'entreprise |
| Données | Prénom, nom, téléphone, email, adresse du rendez-vous, réponses au questionnaire, photos facultatives, créneau ; numéro appelant, date et suite donnée à l'appel |
| Sous-traitants ultérieurs | Supabase (base et fichiers, Paris), Render (application, Francfort), Netlify (site), Brevo (emails, SMS), futur opérateur de téléphonie |
| Transferts hors UE | Sociétés américaines (Supabase, Render, Netlify) : données hébergées dans l'UE ; garanties à vérifier |
| Durées | Selon les instructions de l'entreprise ; au plus 3 ans après le dernier contact ; appels 12 mois ; parcours abandonnés 12 mois — **appliquées automatiquement chaque jour** (fonction `purge_retention`) |
| Droits des personnes | L'entreprise peut effacer un client et toutes ses données depuis son espace, et exporter ses données |

## Partie C — Mesures de sécurité (article 32)

Chiffrement des communications (HTTPS) · mots de passe Argon2 · jetons stockés hachés · cloisonnement des entreprises
au niveau de la base (RLS forcée, testée automatiquement) · accès aux fichiers réservé à l'entreprise · photos sans
métadonnées · journal des consultations, exports et suppressions · sauvegardes quotidiennes 7 jours (document 12) ·
audit de sécurité automatisé (document 13) · limitation des tentatives de connexion.

## Partie D — Registre des violations de données

| Date | Nature | Données et personnes concernées | Conséquences | Mesures prises | Notification CNIL (72 h) / clients |
|---|---|---|---|---|---|
| — | Aucune à ce jour | | | | |
