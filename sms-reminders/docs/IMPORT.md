# Importer des rendez-vous

*Importation des clients* (responsable ou administrateur). Rien n'est enregistré avant la
validation finale.

1. **Fichier** : `.csv` (séparateur `;`, `,` ou tabulation ; UTF-8 ou Windows-1252) ou `.xlsx`
   (première feuille ; première ligne = noms de colonnes). 5 Mo et 5 000 lignes maximum
   (paramétrable).
2. **Correspondance des colonnes** : proposée automatiquement d'après les intitulés, modifiable.
3. **Validation et aperçu** : chaque ligne est classée *Nouveau*, *Déjà enregistré*,
   *Doublon dans le fichier* ou *Erreur*, avec ses avertissements.
4. **Valider l'import** : seuls les nouveaux rendez-vous sont créés et leurs relances programmées.
   Les lignes brutes du fichier sont alors supprimées.

Exemples : [../examples/rendez-vous-exemple.csv](../examples/rendez-vous-exemple.csv) et
[../examples/rendez-vous-exemple.xlsx](../examples/rendez-vous-exemple.xlsx) (données fictives),
aussi téléchargeable depuis la page d'import.

## Champs

| Champ | Obligatoire | Formats acceptés |
|---|---|---|
| Numéro client interne | oui | texte libre (identifiant CRM). Jamais le téléphone : un avertissement apparaît si les deux se ressemblent |
| Nom et prénom | oui | une colonne (`DUPONT Marie`, `Marie DUPONT`, `Marie Dupont` — découpage signalé pour vérification) **ou** colonnes Nom + Prénom |
| Téléphone mobile | oui | `06 00 00 00 01`, `0600000001`, `+33 6 00 00 00 01` ; un 0 initial perdu par Excel est restauré. Les fixes sont refusés |
| Date | oui | `17/10/2026`, `17/10/26`, `2026-10-17`, `17.10.2026`, cellule date Excel |
| Heure | oui | `14:00`, `14h00`, `14h`, `9h30`, cellule heure Excel — heure de Paris |
| Date et heure | alternative | `17/10/2026 14:00` dans une seule colonne |
| Service | oui pour programmer | `Movers`, `Takeovers` (casse et espaces indifférents). Vide : rendez-vous créé **sans relance** jusqu'à ce que le service soit renseigné. Autre valeur : erreur |
| Confirmé | non | `oui`, `x`, `1`, `confirmé` / `non`, vide, `à confirmer`. Un rendez-vous confirmé ne reçoit aucune relance |
| Identifiant du rendez-vous (CRM) | non | s'il est présent, c'est l'identité du rendez-vous |

Refusés : rendez-vous déjà passé, heure inexistante (passage à l'heure d'été), téléphone invalide,
date ou heure illisible, service inconnu. Avertis : rendez-vous dans moins de 48 h (les relances
déjà échues ne partiront pas), heure ambiguë (passage à l'heure d'hiver), prénom manquant, autre
rendez-vous existant pour le même client.

## Doublons

Un rendez-vous est identifié par son **identifiant CRM** s'il est fourni, sinon par
**numéro client + service + date + heure**.

- Une ligne correspondant à un rendez-vous déjà enregistré est ignorée : aucune nouvelle relance
  (ré-importer le même fichier est sans effet).
- Deux lignes identiques dans le fichier : seule la première est retenue.
- Un même client peut avoir plusieurs rendez-vous (dates ou services différents) : ils sont tous
  importés, avec un avertissement invitant à vérifier qu'il ne s'agit pas d'un report.
- Un rendez-vous **reporté** doit être modifié sur sa fiche (les relances sont recalculées), pas
  ré-importé : sans identifiant CRM, l'ancienne et la nouvelle date seraient deux rendez-vous.
