# Tuto : lancer l'agent Dispatch Movers sur votre PC (Windows)

Pas besoin de savoir programmer : on **double-clique** des fichiers et on modifie **un** fichier texte
avec le Bloc-notes. Comptez 20 à 30 minutes la première fois.

> Tant que vous n'avez pas validé une affectation vous-même, l'agent **ne modifie rien** dans le CRM.
> Le mode par défaut est la **Simulation** : il lit et propose, c'est tout.

---

## Étape 1 : installer Python (une seule fois)

1. Allez sur **https://www.python.org/downloads/** et cliquez sur le bouton jaune *Download Python 3.x*.
2. Ouvrez le fichier téléchargé.
3. ⚠️ **Avant de cliquer sur « Install Now », cochez la case « Add python.exe to PATH »** en bas de la fenêtre.
4. Cliquez sur **Install Now** et attendez la fin.

> Si votre PC professionnel refuse l'installation (droits administrateur), demandez au support
> informatique d'installer **Python 3.12** avec l'option « Add to PATH ».

## Étape 2 : récupérer l'agent

1. Ouvrez la page du projet sur GitHub : **https://github.com/Marcoooo131/SA-IA**
2. Cliquez sur le bouton vert **Code**, puis sur **Download ZIP**.
3. Dans *Téléchargements*, faites un clic droit sur `SA-IA-main.zip`, puis **Extraire tout…**, et
   choisissez par exemple `Documents`.
4. Ouvrez le dossier `Documents\SA-IA-main\movers-dispatch\windows`. Vous y voyez cinq fichiers :

| Fichier | À quoi il sert |
|---|---|
| `1-installer.bat` | installe l'agent (une seule fois) |
| `2-demo.bat` | essai sur de **fausses** données, sans toucher au CRM |
| `3-decouvrir.bat` | lit le CRM pour trouver les informations à recopier dans la configuration |
| `4-lancer.bat` | lance l'agent sur le vrai CRM |
| `5-exporter-corrections.bat` | exporte vos corrections dans un fichier Excel (étape 9) |

## Étape 3 : installer l'agent

Double-cliquez sur **`1-installer.bat`**. Une fenêtre noire s'ouvre et l'installation prend quelques
minutes. Attendez le message **« Installation terminée »**, puis appuyez sur une touche.

> Si Windows affiche « Windows a protégé votre ordinateur », cliquez sur **Informations complémentaires**,
> puis sur **Exécuter quand même**.

## Étape 4 : essayer sans risque (données fictives)

Double-cliquez sur **`2-demo.bat`**. Le tableau de bord s'ouvre dans votre navigateur.

1. Laissez **Simulation** coché et cliquez sur **Lancer le traitement**.
2. Le tableau se remplit de 10 mails et tâches **inventés**. Pour chacun, il indique le Case trouvé, l'Owner et le
   prénom qui serait mis dans *Worked By*, ou la raison pour laquelle l'agent préfère vous laisser décider.
3. Essayez **Supervisé**, puis **Lancer le traitement** : des boutons **Valider Estefania**, **Valider Kader**…
   apparaissent. C'est ce que vous ferez plus tard sur les vrais mails.
4. Pour arrêter, fermez la fenêtre noire.

## Étape 5 : indiquer l'adresse du CRM

1. Dans le dossier `movers-dispatch`, ouvrez **`dispatch.toml`** avec le **Bloc-notes** (clic droit,
   **Ouvrir avec**, **Bloc-notes**). Ce fichier a été créé à l'étape 3.
2. Ouvrez le CRM dans Edge comme d'habitude et regardez la barre d'adresse, par exemple :
   `https://serveur.exemple.net/SectorAlarmFR/main.aspx#219231512`
3. Gardez tout **jusqu'à `/SectorAlarmFR`** (sans `/main.aspx…`) et collez-le à cette ligne :

   ```toml
   environment_url = "https://serveur.exemple.net/SectorAlarmFR"
   ```
4. Enregistrez (**Ctrl + S**).

## Étape 6 : trouver vos quatre collègues dans le CRM

Double-cliquez sur **`3-decouvrir.bat`**.

1. Une fenêtre **Edge** s'ouvre sur le CRM. Connectez-vous comme d'habitude si on vous le demande.
2. Revenez à la fenêtre noire et attendez. L'agent **lit seulement**, il ne modifie rien.
3. Le résultat s'affiche. Il est aussi enregistré dans **`decouverte.txt`**, dans le dossier `movers-dispatch`.

Voici à quoi il ressemble (exemple inventé) :

```
== Versions du Web API qui répondent
  v8.2  (configurée : v8.2)

== Contrôles préalables
  ! Collaborateur « Kader » : systemuserid non renseigné (voir `discover`).
  ! Collaborateur « Estefania » : systemuserid non renseigné (voir `discover`).
  ...

== Files dont le nom contient « Movers »
  queue_name = "Movers"   (queueid …)

== Utilisateurs Dynamics 365 par prénom (à reporter dans [[collaborators]] après vérification)
  Kader : 1 résultat(s)
    systemuser_id = "1a2b3c4d-0000-0000-0000-000000000001"   Kader Nom  <DOMAINE\kader.nom>  actif
  Estefania : 1 résultat(s)
    systemuser_id = "1a2b3c4d-0000-0000-0000-000000000002"   Estefania Nom  <DOMAINE\estefania.nom>  actif
  ...
```

4. Dans `dispatch.toml`, en bas du fichier, recopiez pour chaque collègue la valeur `systemuser_id`
   (le long code entre guillemets) de la **bonne personne** :

   ```toml
   [[collaborators]]
   key = "kader"
   first_name = "Kader"
   systemuser_id = "1a2b3c4d-0000-0000-0000-000000000001"
   ```

   Si plusieurs personnes portent le même prénom, choisissez celle dont le **nom complet** correspond
   à votre collègue et qui est **actif**.
5. Enregistrez (**Ctrl + S**) et relancez `3-decouvrir.bat` pour vérifier.

Au premier passage, les quatre lignes « ! … systemuserid non renseigné » sont **normales** : elles
disparaissent une fois les codes recopiés. Quand tout est bon, la rubrique *Contrôles préalables* affiche **OK**.
Toute autre ligne qui commence par **`!`** est un problème à régler : voir **En cas de souci** en bas.

## Étape 7 : lancer sur le vrai CRM, d'abord en Simulation

Double-cliquez sur **`4-lancer.bat`**. Connectez-vous dans Edge si besoin. Le tableau de bord s'ouvre ensuite.

1. Laissez **Simulation** coché et cliquez sur **Lancer le traitement**.
2. Comparez chaque ligne avec ce que **vous** auriez fait à la main. La colonne *Worked By* donne le
   prénom proposé, et la colonne *Motif* explique pourquoi.
3. Faites-le **plusieurs jours** de suite, tant que les propositions ne sont pas toujours justes.
   Pendant toute cette phase, **rien n'est modifié** dans le CRM.

## Étape 8 : faire les affectations (mode Supervisé)

Quand la Simulation vous paraît fiable :

1. Cochez **Supervisé**, puis cliquez sur **Lancer le traitement**.
2. Pour chaque mail, l'agent affiche **Valider Kader** (par exemple), une liste **Corriger**, et **Refuser**.
3. Cliquez sur **Valider** et confirmez. L'agent écrit *Worked By* dans le CRM, puis relit la valeur pour
   vérifier. La ligne passe à **Affecté**.
4. Vérifiez les premiers dans le CRM : ouvrez le mail, puis **…** → **Queue Item Details** → *Worked By*.

Les lignes **Validation humaine** sont les cas où l'agent n'est pas sûr : plusieurs Cases, Owner hors des
quatre collègues, pas de compte… Sur ces lignes :

1. choisissez le collègue dans la liste **Attribuer à…** ;
2. cliquez sur **Attribuer**, puis confirmez.

L'agent écrit *Worked By* et vérifie. Il refuse toujours de remplacer un *Worked By* déjà rempli.

Les mails et tâches **déjà correctement renseignés** ne sont pas affichés : ils sont seulement comptés
dans la case « ignorés ».

Le gros bouton rouge **Arrêt immédiat** stoppe tout : plus aucune écriture après le clic.

## Étape 9 : les deux semaines de supervision (corriger l'agent)

**À savoir :** l'agent n'apprend pas tout seul. Il suit des règles écrites, par exemple « le Case actif ou
annulé passe avant le résolu ». C'est voulu : il ne peut pas changer de comportement sans qu'on le sache.
Vos corrections servent à **réécrire ses règles**. Voici comment faire.

**Chaque jour**, en mode **Supervisé**, pour chaque proposition :

| L'agent propose… | Vous faites |
|---|---|
| le bon collègue | **Valider** |
| le mauvais collègue | choisissez le bon dans **Corriger : le bon collègue est…**, cliquez sur **Corriger**, puis écrivez en quelques mots **pourquoi** (ex. « le Case Mover résolu était le bon », « le client a rappelé Kader ») |
| un collègue alors que l'élément ne revient à aucun des quatre | **Refuser** |
| rien, ligne « Validation humaine » | choisissez dans **Attribuer à…** (étape 8) |

**Corriger** écrit tout de suite la bonne personne dans le CRM, comme une attribution à la main. Le
« pourquoi » est le plus important : c'est lui qui permet de trouver la règle à changer. N'y mettez pas de
données client (nom, téléphone…).

En bas du tableau de bord, le **Bilan de la supervision** affiche :

- combien de propositions vous avez **validées telles quelles**, **corrigées** ou **refusées**, et le
  **taux d'accord** ;
- la **série** : le nombre de propositions validées d'affilée sans correction (elle repart à 0 à chaque
  correction ou refus) ;
- la liste des corrections, avec ce que l'agent avait vu.

**Une fois par semaine** (ou dès qu'une même erreur revient) :

1. Double-cliquez sur **`5-exporter-corrections.bat`** : il crée `corrections.csv` dans le dossier
   `movers-dispatch` (s'ouvre avec Excel).
2. Envoyez-moi ce fichier, ou recopiez-moi les lignes. Je transforme les corrections en nouvelles règles,
   comme on l'a fait pour « actif ou annulé avant résolu ».
3. Retéléchargez la nouvelle version et continuez la supervision. **Votre fichier `dispatch.toml` et votre
   journal `movers_dispatch.db` sont à garder** : recopiez-les dans le nouveau dossier `movers-dispatch`.

**Quand passer en Automatique ?** Quand le bilan affiche en vert **« 100 propositions validées d'affilée
sans correction »**. Ce chiffre se change dans `dispatch.toml`, ligne `readiness_streak`, section
`[agent]`. Il faut aussi l'accord de votre responsable. Il faut alors mettre `automatic_allowed = true`
dans `dispatch.toml` et taper `AUTOMATIQUE` dans le tableau de bord à chaque lancement. Même en
Automatique, l'agent ne traite **que** les cas sûrs : les autres restent en « Validation humaine » avec la
liste **Attribuer à…**.

---

## En cas de souci

| Message | Que faire |
|---|---|
| « Python est introuvable » | Refaire l'étape 1 en cochant bien **Add python.exe to PATH**, puis redémarrer le PC. |
| « Lancez d'abord 1-installer.bat » | Faire l'étape 3. |
| La fenêtre noire se ferme tout de suite | Clic droit sur le `.bat`, puis **Modifier**, pour vérifier qu'il est dans `movers-dispatch\windows`. Sinon, relancer `1-installer.bat`. |
| « Session Dynamics 365 non ouverte » ou « Connexion au CRM non faite dans le délai » | Vous ne vous êtes pas connecté dans la fenêtre Edge à temps (5 minutes) : relancer et se connecter. La fenêtre Edge doit rester ouverte, sur le CRM, tant que l'agent tourne. |
| « faute de frappe » dans `dispatch.toml` | Le message donne le numéro de ligne : chaque valeur doit être entre guillemets droits `"…"`, sans espace en début de ligne. |
| `! Mettre connection.api_version = "v9.0"` (ou autre) | Recopier cette valeur dans `dispatch.toml` à la ligne `api_version = …`, puis relancer `3-decouvrir.bat`. |
| `! Le champ Worked By … n'est pas modifiable` | Votre compte n'a pas le droit de modifier ce champ : en parler à l'administrateur du CRM. |
| `! systemuserid non renseigné` | Un des quatre `systemuser_id` est vide ou incomplet dans `dispatch.toml` (étape 6). |
| « Prénom CRM … différent du prénom configuré » | Le `systemuser_id` recopié n'est pas celui de la bonne personne (étape 6). |
| Le port 8765 est déjà utilisé | Une autre fenêtre de l'agent est encore ouverte : la fermer. |

Pour revoir ce que l'agent a fait, cliquez sur **Historique** dans le tableau de bord. Tout est aussi
enregistré dans `movers_dispatch.db`, dans le dossier `movers-dispatch` (à ne pas supprimer).

> **Bon à savoir** : l'agent utilise **votre** session du CRM, avec vos droits, et ne voit jamais votre
> mot de passe. Avant de l'utiliser au quotidien, faites valider cet usage par votre responsable ou le
> service informatique.
