# Rappels Movers : tutoriel

Quand l'agent Dispatch attribue une **tâche**, il lit la ligne **« Horaire de Rappel : 14h30 - 28/10 »** de
sa description. Il l'ajoute à un fichier de rappels **trié par heure**, rangé dans le **dossier Teams** de
l'équipe. Chaque agent ouvre ce fichier avec la page des rappels, coche son prénom, et reçoit une
**notification Windows 15 minutes avant** chacun de ses rappels.

> 🔗 **Page des rappels** : **https://marcoooo131.github.io/SA-IA/rappels/**
>
> La page ne contient **aucune donnée**. Elle lit le fichier **sur le PC de l'agent** : les noms des clients
> restent dans Teams / OneDrive et ne sont jamais envoyés sur Internet.

---

# A. Vous (administrateur) : une seule fois

## Étape 1 : créer le dossier dans Teams

1. Dans le **canal Teams** de l'équipe › onglet **Fichiers** › **+ Nouveau** › **Dossier** : nommez-le
   **`Rappels`**.
2. Toujours dans **Fichiers**, cliquez sur **Synchroniser**, puis acceptez l'ouverture de OneDrive. Le
   dossier apparaît dans l'Explorateur Windows, à gauche, sous le nom de l'entreprise.
3. Dans l'Explorateur, ouvrez ce dossier `Rappels`, cliquez dans la **barre d'adresse** et copiez le chemin,
   par exemple `C:\Users\vous\Sector Alarm\Movers - Documents\Rappels`.

## Étape 2 : régler l'agent Dispatch (`dispatch.toml`)

Si votre agent date d'avant ce tutoriel, mettez-le d'abord à jour (tutoriel de l'agent, étape 12).
Ouvrez `dispatch.toml` avec le Bloc-notes et ajoutez cette section, par exemple juste avant les
`[[collaborators]]`. Collez votre chemin **entre apostrophes** `'…'` (avec des apostrophes, pas besoin de
doubler les `\`) :

```toml
[rappels]
active = true
dossier = 'C:\Users\vous\Sector Alarm\Movers - Documents\Rappels'
libelles = ["horaire", "rappel", "rappeler", "creneau", "rdv", "rendez-vous"]
fuseau = "Europe/Paris"
garder_jours = 2
```

Enregistrez.

## Étape 3 : vérifier tout de suite (`6-rappels.bat`)

Dans `movers-dispatch\windows`, double-cliquez sur **`6-rappels.bat`** et répondez **o** pour ajouter
un **rappel d'essai** dans 20 minutes pour tout le monde. La fenêtre indique :
- **« Fichier écrit : …\Rappels\rappels-movers.json »** : c'est bon. Le fichier apparaît dans Teams
  (onglet **Fichiers › Rappels**) dès que OneDrive l'a synchronisé, en général en moins d'une minute ;
- **« Les rappels sont désactivés »** : la section `[rappels]` manque, ou `active = false` ;
- **« dossier introuvable »** : le chemin ne correspond pas au dossier synchronisé. Recopiez-le depuis la
  barre d'adresse de l'Explorateur ;
- **« faute de frappe »** : un guillemet ou un `\` pose problème. Mettez le chemin entre apostrophes `'…'`.

Le rappel d'essai permet de tester la page et les notifications avec les agents (étape B). Il disparaît
seul après 2 jours.

Ensuite, relancez **`4-lancer.bat`** comme d'habitude : le fichier est mis à jour à chaque attribution de
tâche et à la fin de chaque passage de l'agent.

Après le premier passage, le dossier contient deux fichiers, mis à jour à chaque passage de l'agent :
- **`rappels-movers.json`** : le fichier lu par la page ;
- **`rappels-movers.csv`** : le même contenu, à ouvrir dans Excel.

> L'agent n'écrit **rien** en mode **Simulation**. Une tâche sans « Horaire de Rappel » (ou avec un horaire
> illisible) est attribuée normalement, mais n'apparaît pas dans les rappels. C'est noté dans le journal
> (`rappel_sans_horaire`).

---

# B. Chaque agent : une seule fois (3 minutes)

1. **Synchroniser le dossier** : canal Teams › **Fichiers** › dossier **Rappels** › **Synchroniser**.
2. **Ouvrir la page** dans **Edge** ou **Chrome** : **https://marcoooo131.github.io/SA-IA/rappels/**
3. **1. Le fichier des rappels** › **Ouvrir le fichier des rappels** › choisir **`rappels-movers.json`**
   dans le dossier synchronisé.
4. **2. Je suis…** › cocher **son prénom**. On peut en cocher plusieurs, par exemple pour remplacer un
   collègue absent.
5. **3. Notifications** › **Activer les notifications** › **Autoriser**, puis **Tester**.
6. Conseillé : **Edge › menu … › Applications › Installer ce site en tant qu'application**, pour avoir les
   rappels dans leur propre fenêtre, à laisser ouverte (réduite) toute la journée.

## Ensuite, chaque jour

- Ouvrir l'application « Rappels Movers ». La page se souvient du fichier et du prénom coché.
- Si Edge demande **« Reprendre le fichier »**, cliquer dessus, puis **Autoriser**. C'est une sécurité
  du navigateur, une fois par session.
- La page **relit le fichier toute seule** (toutes les 30 secondes) dès que Teams le met à jour.
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
| Le fichier n'est pas dans Teams | lancer `6-rappels.bat` (étape 3) : il écrit le fichier ou dit ce qui bloque |
| Un nouveau rappel n'apparaît pas | OneDrive synchronisé (icône nuage en bas à droite) ? l'agent Dispatch a-t-il tourné ? |
| Le bouton ne relit pas le fichier tout seul | navigateur autre qu'Edge / Chrome : rouvrir le fichier, ou utiliser Edge |
| Le rappel n'est pas dans la liste | la tâche a-t-elle bien une ligne « Horaire de Rappel : 14h30 - 28/10 » ? |
| Rappel à la mauvaise heure | vérifier l'ordre heure / date dans la tâche ; l'heure est celle de Paris |
