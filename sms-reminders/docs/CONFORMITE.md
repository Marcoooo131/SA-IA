# Sécurité, RGPD et règles applicables aux SMS

> Ce document n'est pas un avis juridique. Il recense ce que l'application met en œuvre et les
> points que le service juridique / le DPO doit **valider avant tout envoi réel**. Tant que
> cette validation n'est pas enregistrée dans *Paramètres → Conformité*, l'application refuse
> d'envoyer des SMS réels.

## 1. Nature des messages : opérationnel ou commercial

En France, la prospection directe par SMS auprès de particuliers est encadrée par l'article
L.34-5 du Code des postes et des communications électroniques (consentement préalable, sauf
exception client pour des produits ou services analogues, mention d'opposition gratuite de type
« STOP »). Un rappel de rendez-vous **purement informatif**, envoyé dans le cadre d'une relation
existante, n'est en principe pas de la prospection — **à condition de ne contenir aucun contenu
commercial** (offre, promotion, incitation à souscrire, lien marketing).

Points à valider :
- le texte des six templates (aucun contenu commercial, expéditeur identifiable) ;
- le contexte de chaque service (Movers, Takeovers) : le client a-t-il demandé ou accepté ce
  rendez-vous ? a-t-il été informé qu'il recevrait des rappels par SMS ? ;
- la présence d'un moyen de s'opposer aux SMS (mention « STOP » ou autre) — obligatoire pour la
  prospection, recommandée ici ; dépend des capacités du fournisseur et de l'expéditeur
  (un expéditeur alphanumérique ne permet pas de répondre) ;
- les conditions d'utilisation du fournisseur et des opérateurs (enregistrement de l'expéditeur,
  contenus autorisés, plages d'envoi) ;
- les plages horaires : avec des durées exactes de 48 h / 24 h, un rendez-vous tôt le matin
  produit des SMS tôt le matin. Une **plage sans envoi** peut être activée
  (*Paramètres → Politique*) ; les SMS concernés sont alors décalés à la fin de la plage s'ils
  restent dans leur fenêtre de validité, sinon expirés. Décision métier à prendre.

L'application ne considère pas qu'un rappel est autorisé par défaut : l'envoi réel exige la
validation enregistrée, un expéditeur par service, des templates actifs, un numéro mobile valide
et absent de la liste d'opposition.

## 2. RGPD

| Exigence | Mise en œuvre / à faire |
|---|---|
| Base légale (art. 6) | **À déterminer** par le DPO (exécution du contrat ou intérêt légitime, selon le service) |
| Information des personnes (art. 13-14) | **À faire** : mention des rappels SMS dans les documents remis au client |
| Registre des traitements (art. 30) | **À faire** : inscrire le traitement « relances SMS des rendez-vous » |
| Minimisation | seules les données nécessaires sont stockées ; le numéro client n'apparaît dans un SMS que si le template le demande |
| Droit d'opposition | liste d'opposition (bouton sur chaque fiche, page dédiée, opposition signalée par le fournisseur) vérifiée avant chaque envoi |
| Droit d'effacement | « Effacement des données » sur la fiche (administrateur) : rendez-vous, SMS et historique supprimés ; seule une trace sans donnée personnelle subsiste |
| Durée de conservation | rendez-vous, SMS et historique supprimés **180 jours** après la date du rendez-vous (paramétrable, **durée à valider**) ; fichiers d'import non validés purgés après 24 h ; données brutes d'un import supprimées dès sa validation |
| Sous-traitance (art. 28) | **À faire** : contrat avec le fournisseur SMS et l'hébergeur |
| Transferts hors UE | **À vérifier** selon le fournisseur retenu (localisation des données, clauses contractuelles types) |
| Sécurité (art. 32) | voir § 3 |

## 3. Sécurité

Mis en œuvre :
- authentification obligatoire ; mots de passe hachés (scrypt) ; verrouillage temporaire après
  5 échecs ; session signée de 8 h, cookie `HttpOnly`, `SameSite=Strict`, `Secure` hors dev ;
- trois rôles contrôlés **côté serveur** sur chaque route ;
- jeton CSRF sur toutes les actions ; en-têtes de sécurité (CSP sans script inline, anti-iframe,
  `no-store`) ;
- validation côté serveur de toutes les saisies (import, formulaires, paramètres) ;
- secrets uniquement dans des variables d'environnement ; démarrage refusé hors dev/test si la
  configuration est dangereuse (secret absent, SQLite, cookies non sécurisés, signature fournisseur
  désactivée) ;
- webhook fournisseur authentifié par signature ;
- journal d'audit : connexions, échecs, imports, confirmations, modifications, paramètres,
  templates, oppositions, effacements, purges ;
- journaux techniques sans données clients (identifiants seulement, filtre de masquage des
  numéros, journaux d'accès HTTP désactivés car ils contiendraient les recherches).

À prévoir en production :
- authentification d'entreprise (SSO / OIDC) à la place des comptes locaux ;
- HTTPS obligatoire (proxy), accès réseau restreint (VPN / réseau interne) ;
- chiffrement des sauvegardes et du disque de la base ;
- revue des droits et des comptes à intervalle régulier.

## 4. Confirmation interne ≠ réponse du client

La case « Rendez-vous confirmé » enregistre une **confirmation interne de l'équipe** (source
`team`), affichée comme telle. Aucune réponse de client n'est interprétée aujourd'hui ; la source
`customer_reply` est réservée à une intégration future fiable (réponses SMS authentifiées ou CRM).
