# Tutoriel : mettre Venio en ligne gratuitement, pas à pas

Durée : environ **45 minutes**. Coût : **0 €**, sans carte bancaire.
Vous allez utiliser quatre services. La base de données Supabase est **déjà prête** (projet `venio`).

```
 Clients et entreprises
        │
        ▼
 ┌──────────────┐  /api/…   ┌──────────────┐        ┌──────────────────────┐
 │   Netlify    │ ────────▶ │    Render    │ ─────▶ │ Supabase (base de    │
 │ (les pages)  │           │  (l'API)     │        │ données + photos)    │
 └──────────────┘           └──────┬───────┘        └──────────────────────┘
                                   │ emails
                                   ▼
                            ┌──────────────┐
                            │    Brevo     │
                            └──────────────┘
```

> Les noms de menus peuvent changer légèrement d'une version à l'autre de ces sites. Si un bouton n'est pas
> exactement au même endroit, cherchez le libellé le plus proche.

---

## Avant de commencer : votre fiche de valeurs

Ouvrez un fichier texte **sur votre ordinateur** (ou un gestionnaire de mots de passe) et notez-y au fur et à
mesure les valeurs ci-dessous. **Ne les envoyez à personne, ni dans un chat** : ce sont les clés de votre plateforme.

| # | Valeur | Où la trouver | Exemple de forme |
|---|---|---|---|
| A | Mot de passe de la base | vous le choisissez (étape 1) | `Kx7pQ2mZ9vR4tY8wL3nB6cD1` |
| B | Hôte du pooler Supabase | étape 1 | `aws-0-eu-west-3.pooler.supabase.com` |
| C | Adresse de la base (pour Render) | étape 1, construite avec A et B | `postgresql+asyncpg://venio.ycmtyvcftzmnsezueykf:A@B:5432/postgres` |
| D | Clé secrète Supabase | étape 1 | `sb_secret_…` |
| E | Identifiant SMTP Brevo | étape 2 | `xxxxxx@smtp-brevo.com` |
| F | Clé SMTP Brevo | étape 2 | `xsmtpsib-…` |
| G | Adresse d'envoi des emails | étape 2 | `Venio <contact@votre-entreprise.fr>` |
| H | Adresse de l'API Render | étape 3 | `https://venio-api-xxxx.onrender.com` |
| I | Adresse du site Netlify | étape 4 | `https://venio-pilote.netlify.app` |

---

## Étape 1 — Supabase (10 min)

Connectez-vous sur **supabase.com** et ouvrez le projet **venio**.

### 1.1 Choisir le mot de passe de la base (valeur A)

1. Choisissez un mot de passe de **24 caractères minimum, uniquement lettres et chiffres**
   (pas de `@`, `:`, `/`, `#`, `%` ni d'espace : ils casseraient l'adresse de connexion).
   Un gestionnaire de mots de passe peut le générer pour vous. Notez-le en **A**.
2. Dans le menu de gauche, cliquez sur **SQL Editor**, puis **New query**.
3. Collez cette ligne en remplaçant le texte entre guillemets par votre mot de passe **A** (gardez les guillemets simples) :
   ```sql
   ALTER ROLE venio WITH PASSWORD 'VOTRE_MOT_DE_PASSE_A';
   ```
4. Cliquez sur **Run**. Le résultat doit indiquer « Success. No rows returned ».
5. Effacez la requête de l'éditeur (elle contient votre mot de passe).

### 1.2 Récupérer l'hôte du pooler (valeur B) et construire l'adresse (valeur C)

1. En haut de la page du projet, cliquez sur le bouton **Connect**.
2. Choisissez la méthode **Session pooler** (et non *Direct connection* ni *Transaction pooler*).
3. Vous voyez une adresse du type :
   `postgresql://postgres.ycmtyvcftzmnsezueykf:[YOUR-PASSWORD]@aws-0-eu-west-3.pooler.supabase.com:5432/postgres`
4. Notez en **B** la partie entre `@` et `:5432` (ex. `aws-0-eu-west-3.pooler.supabase.com`).
5. Construisez la valeur **C** en remplaçant A et B :
   ```
   postgresql+asyncpg://venio.ycmtyvcftzmnsezueykf:A@B:5432/postgres
   ```
   Points d'attention :
   - le début est `postgresql+asyncpg://` (et non `postgresql://`) ;
   - l'utilisateur est `venio.ycmtyvcftzmnsezueykf` (et non `postgres.…`) ;
   - le port est **5432**.

### 1.3 Récupérer la clé secrète (valeur D)

1. Menu de gauche : **Project Settings** (roue dentée) → **API Keys**.
2. Dans la partie **Secret keys**, copiez la clé (bouton de copie ou « Reveal »). Si aucune n'existe, créez-en une.
   À défaut, l'onglet des anciennes clés (*Legacy*) propose la clé **service_role** : elle fonctionne aussi.
3. Notez-la en **D**. Elle donne un accès complet : ne la mettez jamais dans le code ni sur le site.

✅ **Contrôle** : vous avez A, B, C et D.

---

## Étape 2 — Brevo, l'envoi des emails (10 min)

> Vous pouvez sauter cette étape pour l'instant : Venio fonctionnera, mais les emails seront seulement
> « préparés » (affichés « Non envoyé (mode test) » dans l'espace entreprise). Vous y reviendrez plus tard.

1. Créez un compte sur **brevo.com** (offre gratuite). Brevo peut demander de compléter votre profil
   d'entreprise et d'attendre la validation du compte avant le premier envoi.
2. **Adresse d'envoi** : menu en haut à droite (votre nom) → **Senders, domains & dedicated IPs** (ou
   *Expéditeurs*) → **Senders** → **Add a sender**. Saisissez le nom affiché et votre adresse email
   professionnelle, puis cliquez sur le lien de validation reçu par email.
   Notez en **G** sous la forme `Nom affiché <adresse@exemple.fr>`.
3. **Clé SMTP** : menu en haut à droite → **SMTP & API** → onglet **SMTP** → **Generate a new SMTP key**.
   Notez l'**identifiant (Login)** en **E** et la **clé** en **F** (elle n'est affichée qu'une fois).

✅ **Contrôle** : vous avez E, F et G (ou vous avez choisi de reporter les emails).

---

## Étape 3 — Render, l'API (15 min dont 5 min d'attente)

1. Connectez-vous sur **render.com** (avec votre compte GitHub).
2. Cliquez sur **New +** → **Blueprint**.
3. Si le dépôt **SA-IA** n'apparaît pas : cliquez sur **Configure account** / **Connect GitHub**, autorisez
   Render à accéder au dépôt `SA-IA`, puis revenez.
4. Sélectionnez le dépôt **SA-IA**.
5. **Branch** : `claude/saas-booking-platform-xvbma3`. **Blueprint path** : `render.yaml` (valeur par défaut).
6. Donnez un nom au blueprint (ex. `venio`) et continuez. Render affiche le service **venio-api** et
   demande les valeurs manquantes :

   | Variable | Valeur à saisir |
   |---|---|
   | `VENIO_DATABASE_URL` | **C** |
   | `VENIO_SUPABASE_SERVICE_KEY` | **D** |
   | `VENIO_PUBLIC_BASE_URL` | provisoirement `https://exemple.netlify.app` (corrigé à l'étape 5) |
   | `VENIO_SMTP_USER` | **E** (ou `aucun` si vous avez reporté Brevo) |
   | `VENIO_SMTP_PASSWORD` | **F** (ou `aucun`) |
   | `VENIO_EMAIL_FROM` | **G** (ou `Venio <no-reply@venio.local>`) |

   Les autres variables (clé de signature, mode production…) sont remplies automatiquement.
7. Cliquez sur **Apply** / **Deploy Blueprint**. La construction prend environ 5 minutes ;
   suivez-la dans l'onglet **Logs** du service `venio-api`.
8. Quand le statut passe à **Live**, copiez l'adresse affichée en haut de la page du service
   (`https://venio-api-xxxx.onrender.com`) et notez-la en **H**.
9. **Test** : ouvrez dans votre navigateur `H/api/health`
   (ex. `https://venio-api-xxxx.onrender.com/api/health`). Vous devez voir : `{"status":"ok"}`.

✅ **Contrôle** : `/api/health` répond `{"status":"ok"}`. Sinon, voir le **Dépannage** en bas.

---

## Étape 4 — Netlify, le site (10 min)

1. Connectez-vous sur **netlify.com** (avec votre compte GitHub).
2. **Add new project** (ou *Add new site*) → **Import an existing project** → **GitHub**.
   Autorisez Netlify à accéder au dépôt **SA-IA** si demandé, puis sélectionnez-le.
3. Réglages de déploiement :
   - **Branch to deploy** : `claude/saas-booking-platform-xvbma3`
   - **Base directory** : `venio/web`
   - **Build command** et **Publish directory** : laissez ce que Netlify propose (lu dans `venio/web/netlify.toml`).
4. Cliquez sur **Add environment variables** (ou *Show advanced*) et ajoutez :
   - **Key** : `VENIO_API_URL` — **Value** : **H** (sans `/` final, ex. `https://venio-api-xxxx.onrender.com`).
5. Cliquez sur **Deploy**. Comptez 3 à 5 minutes.
6. **Nom du site** : *Project configuration* (ou *Site configuration*) → **Change project name** →
   par exemple `venio-pilote`. Votre adresse devient `https://venio-pilote.netlify.app` : notez-la en **I**.
7. **Test** : ouvrez **I**. La page d'accueil de Venio doit s'afficher.

> Si vous modifiez plus tard `VENIO_API_URL`, relancez un déploiement avec
> **Deploys → Trigger deploy → Clear cache and deploy site** : cette valeur est prise en compte à la construction.

✅ **Contrôle** : la page d'accueil de Venio s'affiche sur **I**.

---

## Étape 5 — Relier les deux (2 min)

1. Retournez sur **Render** → service **venio-api** → onglet **Environment**.
2. Modifiez `VENIO_PUBLIC_BASE_URL` et mettez **I** (ex. `https://venio-pilote.netlify.app`, sans `/` final).
   Cette adresse sert aux liens des emails (« reporter ou annuler mon rendez-vous »).
3. Si vous avez fait l'étape 2 (Brevo), changez aussi `VENIO_EMAIL_PROVIDER` de `log` à `smtp`.
4. Cliquez sur **Save Changes** (Render redéploie automatiquement, environ 3 minutes).

---

## Étape 6 — Empêcher la mise en veille de l'API (2 min)

L'offre gratuite de Render endort l'API après 15 minutes sans visite ; le visiteur suivant attend alors
près d'une minute. Supabase va l'appeler toutes les 10 minutes pour la garder éveillée.

1. Supabase → projet **venio** → **SQL Editor** → **New query**.
2. Collez ce texte en remplaçant l'adresse par **H** :
   ```sql
   create extension if not exists pg_cron;
   create extension if not exists pg_net;
   select cron.schedule('venio-keepalive', '*/10 * * * *',
     $$ select net.http_get('https://venio-api-xxxx.onrender.com/api/health') $$);
   ```
3. Cliquez sur **Run**. Le résultat affiche un numéro de tâche.

> Une seule API gratuite allumée en permanence reste dans le quota de Render (750 heures par mois).

---

## Étape 7 — Vérification complète (5 min)

1. Sur **I**, cliquez sur **Essai gratuit** et créez votre espace (choisissez *Rénovation* ou *Déménagement*).
2. Dans **Paramètres**, vérifiez vos horaires et l'email qui reçoit les nouvelles demandes.
3. Sur votre téléphone, ouvrez votre page publique (bouton **Copier mon lien de réservation** sur l'accueil) et
   faites une réservation test **avec une photo**.
4. Vérifiez :
   - la demande apparaît dans **Demandes**, avec la photo ;
   - dans **Envois**, les messages passent à « Envoyé » (ou « Non envoyé (mode test) » si Brevo est reporté) ;
   - vous recevez l'email de confirmation et l'alerte « Nouveau rendez-vous ».
5. Depuis l'email de confirmation, testez **Reporter** puis **Annuler**.

🎉 Si tout fonctionne, vous pouvez inviter vos premiers pilotes : chacun crée son espace depuis **I**.

---

## Dépannage

| Symptôme | Cause probable | Solution |
|---|---|---|
| Render : déploiement en échec, logs avec `password authentication failed` | Mot de passe différent entre l'étape 1.1 et l'adresse C, ou utilisateur `postgres.` au lieu de `venio.` | Refaire 1.1 puis corriger `VENIO_DATABASE_URL` |
| Render : `connection refused`, `timeout` ou `Network is unreachable` | Adresse « Direct connection » utilisée au lieu du **Session pooler** | Reprendre l'hôte **Session pooler** (étape 1.2) |
| Render : erreurs `prepared statement` | Port 6543 (Transaction pooler) | Utiliser le port **5432** |
| Render : `VENIO_SECRET_KEY doit être défini` | La clé n'a pas été générée | Environment → `VENIO_SECRET_KEY` → **Generate** |
| `/api/health` met une minute à répondre | API endormie | Normal si l'étape 6 n'est pas faite ; la faire |
| Site Netlify : pages d'entreprise en erreur ou « Connexion impossible » | `VENIO_API_URL` absente, erronée ou avec `/` final | Corriger, puis **Clear cache and deploy site** |
| Connexion acceptée mais retour immédiat à la page de connexion | Site ouvert en `http://` | Toujours utiliser l'adresse en `https://` |
| Dépôt de photo refusé (« erreur inattendue ») | Clé D erronée | Corriger `VENIO_SUPABASE_SERVICE_KEY` |
| Emails « Échec » dans **Envois** | Expéditeur Brevo non validé, compte Brevo pas encore activé ou clé SMTP erronée | Vérifier l'étape 2 ; le détail de l'erreur s'affiche sous le statut |
| Emails toujours « Non envoyé (mode test) » | `VENIO_EMAIL_PROVIDER` vaut encore `log` | Passer à `smtp` (étape 5) |
| Les liens des emails mènent à `exemple.netlify.app` | Étape 5 non faite | Mettre **I** dans `VENIO_PUBLIC_BASE_URL` |

Si un problème persiste, copiez les **dernières lignes des logs Render** (onglet *Logs*) dans la conversation
**en retirant toute ligne contenant un mot de passe ou une clé**, et je vous indiquerai la correction.

---

## Après la mise en ligne

- **Mises à jour du code** : chaque modification poussée sur la branche est redéployée automatiquement par
  Render et Netlify.
- **Évolutions de la base** : Claude les applique sur Supabase via le connecteur.
- **Limites de la version gratuite** : adaptée à quelques dizaines d'entreprises pilotes. Pour un lancement
  public, prévoir les offres payantes d'entrée de gamme de Render et Supabase (vérifier leurs tarifs du moment).
