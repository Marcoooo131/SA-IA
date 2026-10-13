# Actions restantes avant un déploiement professionnel

## 1. Validations (bloquant — aucune donnée réelle avant)

- [ ] **DPO / juridique** : base légale, information des clients (et des conseillers) sur la transcription assistée, texte de la case « interlocuteur informé », durée de conservation de l'historique (ou désactivation), AIPD.
- [ ] Fournisseur d'IA approuvé (contrat, DPA, région, non-réutilisation des données) ; modèle choisi après évaluation.
- [ ] RSSI : revue de code, test d'intrusion du serveur local et de la passerelle, analyse des dépendances, signature des exécutables.
- [ ] Représentants du personnel si requis (outil traitant la voix des conseillers).

## 2. Tests sur le terrain

- [ ] Dérouler `PROCEDURE_TEST_AUDIO.md` sur chaque modèle de poste et de casque (USB, Bluetooth), avec Teams, le softphone de l'entreprise et le navigateur.
- [ ] Mesurer la transcription sur 30 à 50 appels **fictifs joués par des personnes** (ou anonymisés autorisés) : taux d'erreur, chiffres et noms propres, latence, charge CPU. Choisir le modèle (`small` / `medium`) ou décider d'un fournisseur cloud.
- [ ] Évaluer les notes (grille de `phonecall-agent/docs/EVALUATION.md`) : zéro erreur critique sur le jeu de référence.
- [ ] Ajuster le prompt v2 avec des exemples de Phone Call réels anonymisés et validés (nouvelle version, réévaluation).

## 3. Développements

- [ ] SSO de l'entreprise (OIDC) entre le poste et la passerelle, à la place des jetons statiques.
- [ ] Tester la fenêtre WebView2 et l'arrêt à la fermeture sur Windows 10 et 11.
- [ ] Option *process loopback* (capture d'une seule application, Windows 10 2004+/11) si le loopback global pose problème.
- [ ] Si un fournisseur de transcription cloud est retenu : adaptateur `Recognizer` en flux + jetons temporaires délivrés par la passerelle.
- [ ] Installateur (MSIX ou MSI) signé, mise à jour automatique, déploiement du modèle de transcription.
- [ ] Rotation de la clé de l'historique ; export / effacement à la demande.
- [ ] Supervision : remontée anonyme des métriques techniques (latence, retard, erreurs) si l'entreprise le souhaite.
- [ ] Intégration CRM : uniquement si une API ou un connecteur **officiel et autorisé** existe — connecteur côté passerelle (interface `CRMConnector` de `phonecall-agent`), avec association au bon dossier, vérification de l'écriture et anti-doublon. Sinon, rester en copier-coller.

## 4. Pilote

- [ ] 5 à 10 conseillers volontaires, formation de 30 minutes (choix du périphérique, relecture obligatoire, arrêt).
- [ ] Mesures : temps gagné par appel, part des notes modifiées, erreurs relevées, incidents audio.
- [ ] Revue hebdomadaire, puis décision de généralisation.
