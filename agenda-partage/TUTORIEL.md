# Agenda d'équipe : tutoriel de lancement

L'agenda est un **site web** : il n'y a rien à installer pour s'en servir.

> 🔗 **Lien de l'agenda (à partager aux agents)** : **https://marcoooo131.github.io/SA-IA/agenda/**

Il fonctionne sur ordinateur, tablette et téléphone, avec n'importe quel navigateur récent (Edge, Chrome,
Firefox, Safari). Vous seul êtes administrateur. Les agents ne s'inscrivent nulle part : vous créez leur
compte.

---

# A. Pour vous (administrateur), une seule fois

## Étape 1 : vous connecter

1. Ouvrez **https://marcoooo131.github.io/SA-IA/agenda/**.
2. Saisissez votre e-mail (`marcantoinebriand6@gmail.com`) et le mot de passe choisi dans Supabase.
3. Vous arrivez sur le **Tableau de bord**. Le menu **Administration** n'apparaît que pour vous.

> Page grise ou ancienne version ? Ajoutez `?v=2` à la fin de l'adresse, ou appuyez sur **Ctrl + F5**.

## Étape 2 : régler l'agenda

**Administration › Paramètres** :
- **Nom affiché** : le nom de l'équipe, en haut à gauche ;
- **Fuseau horaire** : `Europe/Paris` ;
- **Début / fin de journée** et **durée par défaut** d'un rendez-vous ;
- **Les collaborateurs peuvent supprimer…** : laissez décoché si vous voulez être seul à supprimer.

**Administration › Catégories** : renommez, recolorez ou ajoutez vos catégories (ex. « Rappel Movers »).

## Étape 3 : créer le compte de chaque agent

1. **Administration › Utilisateurs › Ajouter un collaborateur**.
2. Laissez **Mot de passe provisoire** (aucun e-mail n'est envoyé).
3. Saisissez le **nom**, l'**e-mail** de l'agent et un **mot de passe provisoire** (8 caractères minimum).
4. **Créer le compte**. Le compte est actif tout de suite.
5. Envoyez à l'agent, par Teams ou de vive voix :
   > Agenda : https://marcoooo131.github.io/SA-IA/agenda/
   > Identifiant : *son e-mail* — Mot de passe provisoire : *…* (à changer dans « Mon profil »)

Dans la liste, vous pouvez ensuite :
- **Modifie tous les RDV** : autoriser un agent à modifier aussi les rendez-vous des autres ;
- **Actif** : décocher pour couper l'accès d'un agent (son historique est conservé) ;
- 🗑 : supprimer définitivement un compte.

> Une personne qui aurait obtenu un compte autrement reste **« en attente »** et ne voit rien tant que vous
> ne cochez pas **Actif**.

---

# B. Pour chaque agent, la première fois (5 minutes)

## Étape 4 : première connexion

1. Ouvrir le lien, se connecter avec l'e-mail et le mot de passe provisoire.
2. **Mon profil** › renseigner son nom, choisir sa couleur, puis **Changer de mot de passe**.

## Étape 5 : installer l'agenda comme une application (conseillé)

L'agenda s'ouvre alors dans sa propre fenêtre, comme un logiciel, et peut rester ouvert toute la journée.
- **Edge (PC)** : menu **…** › **Applications** › **Installer ce site en tant qu'application** ;
- **Chrome (PC)** : icône **Installer** (écran avec une flèche) à droite de la barre d'adresse ;
- **iPhone (Safari)** : bouton **Partager** › **Sur l'écran d'accueil** ;
- **Android (Chrome)** : menu **⋮** › **Ajouter à l'écran d'accueil**.

## Étape 6 : activer les notifications

**Mon profil › Notifications sur cet appareil › Autoriser les notifications**, puis **Autoriser** dans la
fenêtre du navigateur. Ensuite :
- une notification apparaît quand on vous **confie** ou **modifie** un rendez-vous (vous ou l'agent Dispatch) ;
- un **rappel** apparaît **15 minutes avant** chacun de vos rendez-vous (réglable de 5 à 60 min).

> ⚠️ L'agenda doit rester **ouvert** (fenêtre réduite ou onglet en arrière-plan suffit). Agenda fermé =
> pas de rappel sur l'ordinateur. Pour un rappel même agenda fermé : étape 7.
> Si les notifications ont été refusées par erreur : cliquez sur le cadenas à gauche de l'adresse ›
> **Notifications** › **Autoriser**.

## Étape 7 (facultatif) : voir ses rendez-vous dans Outlook

1. **Mon profil › Mes rendez-vous dans Outlook › Copier**.
2. **Outlook (nouveau ou web)** : Calendrier › **Ajouter un calendrier** › **S'abonner à partir du web** ›
   coller le lien › nom « Agenda équipe » › **Importer**.
   **Outlook classique** : Calendrier › **Ajouter un calendrier** › **À partir d'Internet…** › coller › **OK**.

Vos rendez-vous apparaissent dans Outlook. Ce calendrier est en **lecture seule** : on modifie toujours
dans l'agenda. Outlook se met à jour à son rythme, de 30 minutes à quelques heures. Le lien est personnel :
ne le partagez pas.

---

# C. Utilisation au quotidien

| Je veux… | Je fais… |
|---|---|
| Créer un rendez-vous | bouton rouge **+ Nouveau rendez-vous** (ou cliquer sur un créneau de l'agenda) |
| Voir ma journée / ma semaine | **Agenda** › Jour / Semaine / Mois / Liste ; **Mes rendez-vous** pour ne voir que les miens |
| Retrouver un client | barre de **recherche** en haut (nom, titre, lieu, notes) |
| Confirmer, terminer, reporter | ouvrir le rendez-vous › **Changer le statut** |
| Déplacer un rendez-vous | le glisser dans l'agenda (ou **Modifier**) |
| Noter ce qui s'est passé | fiche du rendez-vous › **Comptes rendus** |
| Échanger avec un collègue | fiche › **Commentaires** |
| Joindre un devis, une photo | fiche › **Fichiers** (10 Mo max) |
| Savoir qui a changé quoi | fiche › **Historique** |
| Un rendez-vous confidentiel | cocher **Rendez-vous confidentiel** : les collègues ne voient qu'un créneau « Occupé » |
| Exporter vers Excel | **Agenda** › **Export CSV** (période affichée) |

Tout se met à jour **en direct** chez tout le monde (indicateur vert **En direct** en haut à droite).
Si une alerte orange « Chevauchement » apparaît dans le formulaire, le collaborateur a déjà un rendez-vous
sur ce créneau : on peut enregistrer quand même.

---

# D. Relier l'agent Dispatch Movers à l'agenda

Quand l'agent attribue une **tâche** (Worked By), il lit la ligne **« Horaire de Rappel : 14h30 - 28/10 »**
de la description et réserve ce créneau dans l'agenda du collaborateur, qui reçoit la notification puis le
rappel 15 minutes avant.

## Étape 8 : mettre à jour l'agent Dispatch

1. Fermez la fenêtre noire de l'agent.
2. Mettez de côté **`dispatch.toml`** et **`movers_dispatch.db`** (dossier `movers-dispatch`).
3. Téléchargez la nouvelle version :
   **https://github.com/Marcoooo131/SA-IA/archive/refs/heads/main.zip**
4. Supprimez l'ancien dossier `SA-IA-main`, puis extrayez le ZIP au même endroit, **hors OneDrive**
   (`%USERPROFILE%\SA-IA`).
5. Remettez vos deux fichiers dans le nouveau dossier `movers-dispatch`.

## Étape 9 : générer le jeton

Dans l'agenda : **Administration › Paramètres › Agent Dispatch Movers › Générer le jeton** › **Copier**.
Le jeton ne s'affiche qu'une fois. S'il est perdu, générez-en un nouveau : l'ancien cesse de fonctionner.

## Étape 10 : compléter `dispatch.toml`

Ouvrez `dispatch.toml` avec le Bloc-notes.

1. **Ajoutez** cette section, par exemple juste avant les `[[collaborators]]`, et collez le jeton entre
   les guillemets :

```toml
[agenda]
active = true
adresse = "https://zpoubfotwszesqxyfhev.supabase.co/functions/v1/dispatch-booking"
jeton = "COLLER-LE-JETON-ICI"
source_horaire = "description"
libelles = ["horaire", "rappel", "rappeler", "creneau", "rdv", "rendez-vous"]
fuseau = "Europe/Paris"
duree_minutes = 15
categorie = "Appel"
```

2. Sous **chaque** `[[collaborators]]`, ajoutez la ligne `email_agenda` avec l'e-mail de connexion de cette
   personne à l'agenda :

```toml
[[collaborators]]
key = "kader"
first_name = "Kader"
systemuser_id = "…"                       # déjà rempli, ne pas toucher
email_agenda = "kader@exemple.fr"         # ← à ajouter
```

3. Enregistrez (**Ctrl + S**).

## Étape 11 : relancer et vérifier

1. Double-cliquez sur **`1-installer.bat`** (une nouvelle pièce, `tzdata`, s'installe), puis **`4-lancer.bat`**.
2. Si un réglage manque, le bandeau du tableau de bord de l'agent affiche **« Réservation dans l'agenda : … »**
   avec ce qu'il faut corriger.
3. Test : créez dans le CRM une tâche de test avec `Horaire de Rappel : 16h00 - <date de demain>`, laissez
   l'agent l'attribuer (mode Supervisé, puis **Valider**) : le rendez-vous apparaît dans l'agenda du
   collaborateur, catégorie « Appel », avec un lien vers la tâche.

À savoir :
- **Mode Simulation** : rien n'est réservé.
- Une même tâche donne **toujours le même** rendez-vous. Si l'horaire change, le rendez-vous est déplacé.
- **Horaire de Rappel vide ou illisible** : rien n'est réservé, c'est noté dans le journal de l'agent
  (`agenda_sans_echeance`), et la tâche est quand même attribuée.
- **Agenda injoignable** : `agenda_echec` dans le journal ; le dispatch continue normalement.

---

# En cas de souci

| Problème | Solution |
|---|---|
| Page grise ou blanche | **Ctrl + F5**, ou ajouter `?v=2` à l'adresse ; sinon fenêtre de navigation privée |
| « E-mail ou mot de passe incorrect » | vérifier l'e-mail ; l'administrateur peut recréer le compte |
| « Accès en attente » | l'administrateur doit cocher **Actif** pour ce compte |
| Pas de notification | agenda fermé ? notifications autorisées (étape 6) ? « Alertes et rappels activés » coché ? |
| « Hors ligne » en haut à droite | connexion Internet coupée : l'agenda se resynchronise seul au retour du réseau |
| Rendez-vous Dispatch absents | bandeau de l'agent, `email_agenda` du collaborateur, compte agenda **Actif**, jeton récent |
