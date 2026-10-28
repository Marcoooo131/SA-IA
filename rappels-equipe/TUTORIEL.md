# Rappels Movers : tutoriel

Quand l'agent Dispatch attribue une **tâche**, il lit la ligne **« Horaire de Rappel : 14h30 - 28/10 »** de
sa description. Il l'ajoute à un fichier de rappels **trié par heure**, rangé dans un dossier **`Rappels`** de
votre OneDrive, partagé à l'équipe. Chaque agent ouvre ce fichier avec la page des rappels, coche son prénom, et reçoit une
**notification Windows 15 minutes avant** chacun de ses rappels.

> 🔗 **Page des rappels** : **https://marcoooo131.github.io/SA-IA/rappels/**
>
> La page ne contient **aucune donnée**. Elle lit le fichier **sur le PC de l'agent** : les noms des clients
> restent dans OneDrive et ne sont jamais envoyés sur Internet.

---

# A. Vous (administrateur) : une seule fois

## Étape 1 : mettre à jour l'agent Dispatch

1. Fermez la fenêtre noire de l'agent.
2. Mettez de côté **`dispatch.toml`** et **`movers_dispatch.db`** (dossier `movers-dispatch`).
3. Téléchargez **https://github.com/Marcoooo131/SA-IA/archive/refs/heads/main.zip**, supprimez l'ancien
   dossier `SA-IA-main`, puis extrayez le ZIP au même endroit.
4. Remettez vos deux fichiers dans le nouveau dossier `movers-dispatch`.

## Étape 2 : double-cliquer sur `6-rappels.bat`

Dans `movers-dispatch\windows`, double-cliquez sur **`6-rappels.bat`** et répondez **o**. **Rien à écrire
à la main** : l'outil
- active les rappels dans `dispatch.toml` ;
- trouve votre **OneDrive** et y crée le dossier **`Rappels`** s'il n'existe pas (s'il existe déjà, il
  l'utilise) ;
- y écrit le fichier avec un **rappel d'essai** dans 20 minutes pour tout le monde.

La fenêtre affiche **« Fichier écrit : C:\Users\…\OneDrive - …\Rappels\rappels-movers.json »**. Si elle
affiche **« OneDrive introuvable »**, ouvrez OneDrive (icône nuage en bas à droite), connectez-vous avec
votre compte professionnel, puis relancez `6-rappels.bat`.

Le rappel d'essai disparaît seul après 2 jours. Ensuite, relancez **`4-lancer.bat`** comme d'habitude :
le fichier est mis à jour à chaque attribution de tâche. Le dossier contient :
- **`rappels-movers.json`** : le fichier lu par la page ;
- **`rappels-movers.csv`** : le même contenu, à ouvrir dans Excel.

## Étape 3 : partager le dossier aux agents

Explorateur Windows › **OneDrive – (entreprise)** › clic droit sur **`Rappels`** › **Partager** › saisir
les adresses des agents › droit **Peut afficher** › **Envoyer**.

> L'agent n'écrit **rien** en mode **Simulation**. Une tâche sans « Horaire de Rappel » (ou avec un horaire
> illisible) est attribuée normalement, mais n'apparaît pas dans les rappels. C'est noté dans le journal
> (`rappel_sans_horaire`).

---

# B. Chaque agent : une seule fois (3 minutes)

1. **Récupérer le dossier** : ouvrir le lien de partage reçu par e-mail › **Ajouter un raccourci à Mes
   fichiers**. Le dossier `Rappels` apparaît alors dans leur OneDrive, dans l'Explorateur.
2. **Ouvrir la page** dans **Edge** ou **Chrome** : **https://marcoooo131.github.io/SA-IA/rappels/**
3. **1. Le fichier des rappels** › **Ouvrir le fichier des rappels** › choisir **`rappels-movers.json`**
   dans le dossier `Rappels` de leur OneDrive.
4. **2. Je suis…** › cocher **son prénom**. On peut en cocher plusieurs, par exemple pour remplacer un
   collègue absent.
5. **3. Notifications** › **Activer les notifications** › **Autoriser**, puis **Tester**.
6. Conseillé : **Edge › menu … › Applications › Installer ce site en tant qu'application**, pour avoir les
   rappels dans leur propre fenêtre, à laisser ouverte (réduite) toute la journée.

## Ensuite, chaque jour

- Ouvrir l'application « Rappels Movers ». La page se souvient du fichier et du prénom coché.
- Si Edge demande **« Reprendre le fichier »**, cliquer dessus, puis **Autoriser**. C'est une sécurité
  du navigateur, une fois par session.
- La page **relit le fichier toute seule** (toutes les 30 secondes) dès que OneDrive le met à jour.
- Une **notification** apparaît 15 minutes avant chaque rappel (réglable de 5 à 30 min). Cliquer dessus
  ouvre la tâche dans le CRM.
- Les rappels sont **triés par heure** et regroupés en « Aujourd'hui », « Demain », etc. Celui qui
  approche est surligné en orange.

---

# En cas de souci

| Problème | Solution |
|---|---|
| Pas de notification | page fermée ? notifications autorisées (bouton **Tester**) ? prénom coché ? |
| « Notifications bloquées » | cadenas à gauche de l'adresse › **Notifications** › **Autoriser**, puis recharger la page |
| Le fichier n'est pas dans le dossier | lancer `6-rappels.bat` (étape 2) : il écrit le fichier ou dit ce qui bloque |
| Un nouveau rappel n'apparaît pas | OneDrive synchronisé (icône nuage en bas à droite) ? l'agent Dispatch a-t-il tourné ? |
| Le bouton ne relit pas le fichier tout seul | navigateur autre qu'Edge / Chrome : rouvrir le fichier, ou utiliser Edge |
| Le rappel n'est pas dans la liste | la tâche a-t-elle bien une ligne « Horaire de Rappel : 14h30 - 28/10 » ? |
| Rappel à la mauvaise heure | vérifier l'ordre heure / date dans la tâche ; l'heure est celle de Paris |
