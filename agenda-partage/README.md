# Agenda partagé — rouge & noir

Application web d'agenda d'équipe : plusieurs collaborateurs consultent, créent, modifient et organisent
des rendez-vous **dans le même agenda, synchronisé en temps réel**, depuis un ordinateur, une tablette ou un
téléphone.

- **Interface** : React 19 + TypeScript + Tailwind CSS 4 + FullCalendar 6 (vues jour, semaine, mois, liste).
- **Serveur** : Supabase (offre gratuite) — base PostgreSQL, authentification, temps réel, stockage des fichiers.
- **Sécurité** : toutes les autorisations sont appliquées **dans la base** (Row Level Security + déclencheurs),
  pas seulement dans l'interface. Aucune clé secrète dans le navigateur.
- **Hébergement** : site statique (GitHub Pages déjà configuré dans ce dépôt, ou Netlify / Vercel / Cloudflare Pages).

Aucune donnée fictive : l'application démarre vide et chaque rendez-vous est enregistré dans votre base Supabase.

---

## 1. Fonctionnalités

| Domaine | Ce qui est fait |
|---|---|
| Tableau de bord | RDV du jour, de la semaine, à confirmer, reportés ; prochains RDV ; dernières modifications (en direct) ; filtre « toute l'équipe » / un collaborateur ; création rapide |
| Agenda | Vues jour / semaine / mois / liste, navigation, « Aujourd'hui », glisser-déposer et redimensionnement (si autorisé), clic sur un créneau = nouveau RDV, couleurs par catégorie, légende |
| Recherche & filtres | Recherche globale (toutes dates, côté serveur) par titre, client, lieu, description, notes, responsable, catégorie ; filtre instantané ; filtres collaborateur / catégorie / statut / masquer les annulés ; « Mes rendez-vous » |
| Rendez-vous | Titre, date, début/fin, journée entière, plusieurs jours, client, responsable, catégorie, lieu, description, notes, statut (À confirmer, Confirmé, En cours, Terminé, Annulé, Reporté), liens, pièces jointes (10 Mo), confidentialité |
| Chevauchements | Avertissement en direct dans le formulaire (et après un glisser-déposer) quand le responsable a déjà un RDV sur le créneau — sans jamais révéler le contenu d'un RDV confidentiel |
| Fiche détaillée | Toutes les infos, changement de statut en un clic, modification, commentaires, comptes rendus après le RDV, fichiers, historique complet (qui, quand, quoi : ancienne → nouvelle valeur), créateur, responsable, dernière modification, lien partageable |
| Temps réel | Toute création / modification / suppression apparaît chez les autres sans recharger ; resynchronisation automatique au retour sur l'onglet ou du réseau ; indicateur « En direct / Hors ligne » |
| Notifications internes | Cloche : « X vous a confié un RDV », modification, annulation, commentaire sur vos RDV |
| Comptes & rôles | Connexion e-mail + mot de passe, mot de passe oublié, invitation par e-mail ou mot de passe provisoire ; rôles Administrateur / Collaborateur ; droit « modifie tous les RDV » ; désactivation de compte |
| Administration | Utilisateurs, catégories (nom, couleur, activation), paramètres (nom, fuseau horaire de l'équipe, horaires, durée par défaut, suppression par les collaborateurs) |
| Export | CSV compatible Excel (période affichée, filtres appliqués) |
| Fuseaux horaires | Stockage en UTC ; affichage dans le fuseau de l'équipe ou celui choisi dans le profil ; changements d'heure gérés |
| Mobile | Navigation par onglets en bas, bouton « + » central, formulaires en panneau plein écran, champs natifs date/heure, installable sur l'écran d'accueil |

### Règles d'accès (appliquées par la base de données)

| Action | Administrateur | Collaborateur |
|---|---|---|
| Voir l'agenda partagé | ✅ tout | ✅ tout, sauf le **contenu** des RDV confidentiels des autres (créneau « Occupé ») |
| Créer un RDV | ✅ | ✅ (il en est automatiquement le créateur) |
| Modifier un RDV | ✅ tous | ✅ ceux qu'il a créés ou dont il est responsable ; tous les RDV non confidentiels si l'admin lui accorde « Modifie tous les RDV » |
| Supprimer un RDV | ✅ | ❌ par défaut (il peut passer le RDV en « Annulé ») ; ✅ ses propres RDV si l'admin l'active |
| Commenter, ajouter un compte rendu ou un fichier | ✅ | ✅ sur les RDV qu'il peut voir |
| Gérer utilisateurs, catégories, paramètres | ✅ | ❌ |
| Visiteur non connecté | ❌ rien | ❌ rien |

Garde-fous supplémentaires : le créateur, les dates de création/modification et l'historique sont imposés par le
serveur (impossibles à falsifier) ; un collaborateur ne peut pas modifier son propre rôle ; il reste toujours au moins
un administrateur actif ; un compte désactivé ne voit plus rien ; la recherche ne renvoie jamais un RDV confidentiel
d'un autre ; les fichiers sont dans un stockage privé (liens temporaires de 5 minutes).

---

## 2. Mise en service (environ 20 minutes)

### Étape 1 — Créer le projet Supabase (gratuit)

1. Créez un compte sur <https://supabase.com> puis **New project**.
   - Région : la plus proche de l'équipe (ex. *West EU (Paris)* ou *Central EU (Frankfurt)*).
   - Notez le mot de passe de la base dans un gestionnaire de mots de passe.
   - L'offre **Free** suffit pour démarrer (500 Mo de base, 1 Go de fichiers, temps réel inclus). Aucun service payant
     n'est activé par ce projet.
   - ⚠️ Sur l'offre gratuite, un projet **inactif pendant 7 jours** est mis en pause (réactivation en un clic). Une
     équipe qui utilise l'agenda chaque jour n'est pas concernée.

### Étape 2 — Créer la base de données

Au choix :

- **Sans installation** : Supabase > **SQL Editor** > *New query* > collez tout le contenu de
  [`supabase/migrations/20261027000000_agenda_init.sql`](supabase/migrations/20261027000000_agenda_init.sql) > **Run**.
- **Avec la CLI** (recommandé ensuite pour les évolutions) :
  ```bash
  cd agenda-partage
  npx supabase login
  npx supabase link --project-ref <identifiant-du-projet>   # visible dans l'URL du tableau de bord
  npx supabase db push
  ```

La migration crée les tables, les règles de sécurité, l'historique, les notifications, le stockage privé des pièces
jointes, l'abonnement temps réel et 6 catégories modifiables (Rendez-vous client, Réunion interne, Intervention, Appel,
Formation, Autre).

### Étape 3 — Régler l'authentification

Dans Supabase > **Authentication** :

1. **Sign In / Providers** > *Email* : activé. Désactivez **« Allow new users to sign up »** : seuls les administrateurs
   ajoutent des comptes (sinon n'importe qui pourrait s'inscrire — il serait collaborateur, mais verrait l'agenda).
2. **URL Configuration** :
   - *Site URL* : l'adresse publique de l'agenda (ex. `https://<compte>.github.io/SA-IA/agenda/`) ;
   - *Redirect URLs* : ajoutez la même adresse, plus `http://localhost:5173/` pour le développement.
3. **Users** > **Add user** > *Create new user* : votre e-mail + un mot de passe, cochez *Auto Confirm User*.
   **Le premier compte créé devient automatiquement administrateur.**

### Étape 4 — Fonction d'administration des comptes (recommandé)

Inviter, créer, bloquer ou supprimer un compte demande la clé secrète : c'est le rôle de la fonction serveur
[`supabase/functions/admin-users`](supabase/functions/admin-users/index.ts), exécutée chez Supabase (la clé n'est
jamais envoyée au navigateur).

- **Avec la CLI** : `npx supabase functions deploy admin-users`
- **Sans installation** : Supabase > **Edge Functions** > *Deploy a new function* > *Via Editor*, nommez-la
  `admin-users`, collez le contenu de `index.ts`, **Deploy**.

Sans cette fonction, l'application fonctionne : ajoutez alors les collaborateurs dans Supabase > Authentication >
Users > *Add user*, puis réglez leur rôle dans l'onglet **Administration** de l'agenda.

### Étape 5 — Relier l'application

Récupérez dans Supabase > **Project Settings** > **API** (ou *API Keys*) :
- **Project URL** ;
- la clé **anon / publishable** (publique par conception — **jamais** la clé `service_role` / `secret`).

#### En local

```bash
cd agenda-partage
cp .env.example .env.local      # puis renseignez les deux valeurs
npm install
npm run dev                     # http://localhost:5173
```

#### En ligne avec GitHub Pages (déjà prévu dans ce dépôt)

1. GitHub > dépôt > **Settings** > **Secrets and variables** > **Actions** > onglet **Variables** > *New repository variable* :
   - `AGENDA_SUPABASE_URL` = Project URL
   - `AGENDA_SUPABASE_ANON_KEY` = clé anon / publishable
2. **Settings** > **Pages** > *Source* : **GitHub Actions** (déjà le cas si le site du dépôt est publié).
3. Fusionnez sur `main` : le workflow « Déploiement GitHub Pages » publie l'agenda sur
   `https://<compte>.github.io/SA-IA/agenda/`.
4. Reportez cette adresse dans *Site URL* / *Redirect URLs* (étape 3).

#### Ailleurs (Netlify, Vercel, Cloudflare Pages — offres gratuites)

- Répertoire de base : `agenda-partage` · commande : `npm run build` · dossier publié : `dist`
- Variables d'environnement : `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`.

### Étape 6 — Inviter l'équipe

Connectez-vous avec le compte administrateur > **Administration** > **Ajouter un collaborateur** :
- *Invitation par e-mail* : la personne reçoit un lien pour choisir son mot de passe ;
- *Mot de passe provisoire* : compte créé immédiatement, à transmettre de vive voix (modifiable dans « Mon profil »).

> Le service d'e-mail intégré de Supabase est limité (quelques e-mails par heure, à usage de test). Pour des
> invitations et réinitialisations fiables, configurez un SMTP dans Authentication > **Emails** > *SMTP Settings*
> (ex. l'adresse e-mail de l'entreprise, ou Brevo / Resend qui ont une offre gratuite). Non activé sans votre accord.

---

## 3. Développement et tests

| Commande | Rôle |
|---|---|
| `npm run dev` | serveur de développement |
| `npm run build` | vérification TypeScript + build de production (`dist/`) |
| `npm test` | tests unitaires (dates/fuseaux, validation, filtres, chevauchements, droits, CSV, navigation) |
| `npm run test:db` | crée un PostgreSQL jetable, applique la migration et exécute **60 tests de sécurité** (RLS, rôles, confidentialité, historique, notifications, stockage). Nécessite les binaires PostgreSQL, ou `DATABASE_URL` vers une base vide |
| `npm run test:e2e` | tests d'interface Playwright sur ordinateur et mobile (Supabase simulé en mémoire, uniquement pour les tests) |

La CI GitHub ([`.github/workflows/agenda-partage.yml`](../.github/workflows/agenda-partage.yml)) exécute ces trois
séries à chaque modification du dossier.

### Architecture

```
agenda-partage/
├── supabase/
│   ├── migrations/…_agenda_init.sql   schéma, RLS, déclencheurs, RPC, stockage, temps réel
│   ├── functions/admin-users/          fonction serveur (invitation / blocage / suppression de comptes)
│   └── tests/                          tests de sécurité SQL + environnement Supabase minimal
├── src/
│   ├── lib/        logique pure : types, dates et fuseaux, validation (zod), filtres, droits, CSV, routes
│   ├── data/       accès Supabase (api.ts) et chargement temps réel de l'agenda (useAgenda)
│   ├── context/    session, équipe + synchronisation temps réel, notifications, formulaire/fiche, messages
│   ├── components/ mise en page, formulaire, fiche détaillée, composants d'interface
│   └── pages/      tableau de bord, agenda, administration, profil, connexion
└── e2e/            tests d'interface
```

**Temps réel** : chaque écriture incrémente une ligne de la table `sync_state` (qui ne contient aucune donnée
métier). Les navigateurs y sont abonnés via Supabase Realtime et rechargent alors ce qu'ils ont le droit de voir
(fonction `agenda_between`, qui masque les RDV confidentiels). Commentaires, fichiers, historique et notifications
sont diffusés directement, filtrés par la RLS de chaque abonné.

**Sauvegarde** : les données vivent dans PostgreSQL chez Supabase. L'offre gratuite n'inclut pas de restauration
automatique : faites une sauvegarde régulière (`npx supabase db dump --data-only -f sauvegarde.sql`, ou
Database > Backups sur une offre payante), et l'export CSV pour un usage bureautique.

---

## 4. Évolutions préparées (non activées)

| Évolution | Ce qui existe déjà | Ce qu'il faudrait ajouter |
|---|---|---|
| Rappels avant RDV | Table `notifications`, statuts, responsable, fuseau | Tâche planifiée (`pg_cron` + Edge Function) qui crée les rappels J-1 / H-1 |
| Notifications e-mail | Table `notifications` alimentée par la base | Edge Function déclenchée par *Database Webhook* sur `notifications`, + SMTP / Resend |
| SMS automatiques | idem ; le dépôt contient déjà `sms-reminders/` | Fournisseur SMS (Twilio, OVH…) — **payant, à valider** |
| Google Calendar / Outlook | Dates en UTC, liens partageables | Export iCal (abonnement) ou synchronisation OAuth via Edge Function |
| Export Excel | Export CSV opérationnel | Génération .xlsx (bibliothèque `exceljs`, déjà utilisée dans le dépôt) |
| Pièces jointes | ✅ opérationnelles (stockage privé, 10 Mo) | Aperçu des images, limite configurable |
| Commentaires et notifications internes | ✅ opérationnels | Mentions « @collègue », préférences de notification |

---

## 5. Configurations restantes (à faire de votre côté)

1. Créer le projet Supabase et exécuter la migration (étapes 1–2).
2. Désactiver l'inscription libre, renseigner *Site URL* / *Redirect URLs*, créer le premier compte (étape 3).
3. Déployer la fonction `admin-users` (étape 4, recommandé).
4. Renseigner `AGENDA_SUPABASE_URL` et `AGENDA_SUPABASE_ANON_KEY` dans les variables GitHub (étape 5) et vérifier que
   GitHub Pages utilise *GitHub Actions*.
5. Facultatif : SMTP pour les e-mails d'invitation, nom de l'équipe et fuseau horaire dans Administration > Paramètres,
   catégories à votre image.
