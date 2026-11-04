# Conformité — ce qui est implémenté, ce qui reste à valider

> Rien ici ne constitue un avis juridique. Chaque point marqué ⚠️ doit être validé par un juriste
> spécialisé (droit de la consommation, plateformes, paiements, données) avant le lancement.

| Sujet | Implémenté | ⚠️ À valider / compléter |
|---|---|---|
| RGPD — droits | Export JSON (`/api/me/export`), anonymisation du compte, journal d'audit | Registre des traitements, DPO, durées de conservation, AIPD |
| Cookies | Bandeau « tout refuser » aussi simple qu'« accepter », aucun traceur avant choix, preuve en base (`ConsentRecord`), attribution persistante uniquement avec consentement, durée 6 mois | Qualification exacte du cookie d'affiliation par la CNIL |
| Mots de passe | bcrypt (coût 12), politique minimale, jetons hachés à usage unique, sessions révoquées au changement | 2FA pour les administrateurs |
| Injections / XSS | Prisma (requêtes paramétrées), Zod, React (échappement), en-têtes de sécurité | CSP stricte |
| Accès | Contrôles dans chaque service, tests de permissions | Test d'intrusion |
| Commissions | Calcul serveur, taux figés, bornes administrées, transitions contraintes, audit | — |
| Double paiement | Idempotence webhooks, mises à jour conditionnelles, clés d'idempotence Stripe | — |
| Fraude | Anti auto-attribution, limitation de débit, vérification pro, KYC prestataire, gel en litige | Scoring de fraude, plafonds |
| Information précontractuelle | Distinction vendeur particulier / professionnel sur fiche, panier et commande | Textes définitifs |
| Rétractation / garanties | Mentions et délai de validation de 14 j pour vendeurs pros | Formulaire type de rétractation, procédure de retour |
| Transparence plateforme (L111-7, P2B) | Classement explicite, barèmes affichés depuis les paramètres | Préavis de modification des conditions pour les pros |
| DSA | Signalements, décisions motivées notifiées, traçabilité des professionnels (SIRET), catégories contrôlées, mots-clés surveillés | Point de contact, rapport de transparence, recours |
| DAC7 | Pré-rapport CSV par vendeur et par année (`/api/export/dac7`) | Collecte des données fiscales complètes (NIF, date de naissance…), déclaration à la DGFiP |
| Produits réglementés | Catégories « contrôlées » → modération obligatoire | Liste exhaustive, contrôles d'âge / autorisations |
| Documents | Trames CGU, CGV, confidentialité, cookies, collaboration, transparence | Rédaction finale, médiateur de la consommation |
