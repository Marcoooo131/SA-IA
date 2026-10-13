# Configuration des clés et jetons

Principe : **aucune clé de fournisseur d'IA sur les postes, dans le code ou dans Git.**

```
Poste conseiller ──(HTTPS + jeton personnel révocable)──► Passerelle phonecall-agent ──(clé API)──► Fournisseur IA approuvé
```

| Secret | Où il vit | Qui le gère |
|---|---|---|
| Clé du fournisseur IA (ex. `PCA_ANTHROPIC_API_KEY`) | gestionnaire de secrets du **serveur** passerelle uniquement | DSI |
| Empreintes des jetons des postes (`PCA_NOTE_API_TOKENS_SHA256`) | configuration du serveur passerelle | DSI |
| Jeton d'un poste / d'un utilisateur | **Gestionnaire d'identification Windows** du poste (entrée `PhoneCallDesktop / gateway-token`) | DSI / utilisateur |
| Clé de chiffrement de l'historique local | Gestionnaire d'identification Windows (`PhoneCallDesktop / history-key`), créée automatiquement si l'historique est activé | automatique |

## 1. Passerelle (serveur)

Voir `phonecall-agent/docs/INSTALLATION.md`. Réglages propres au poste conseiller :

```bash
PCA_GENERATION_PROVIDER=anthropic
PCA_ANTHROPIC_API_KEY=<depuis le gestionnaire de secrets>
PCA_ANTHROPIC_MODEL=claude-opus-5-5          # choix à confirmer après évaluation (docs/COUTS.md)
PCA_NOTE_API_TOKENS_SHA256=<empreinte1>,<empreinte2>
PCA_NOTE_API_RATE_PER_MINUTE=20
```

Créer un jeton pour un utilisateur ou un poste :

```bash
python -m phonecall_agent.cli new-note-token "poste-conseiller-042"
# → Jeton (à remettre une seule fois) : pcn_…
# → Empreinte à ajouter à PCA_NOTE_API_TOKENS_SHA256 : 3f2a…
```

**Révocation** : retirer l'empreinte de `PCA_NOTE_API_TOKENS_SHA256` et redémarrer la passerelle.
Cible pour la production : authentification par le **SSO de l'entreprise** (OIDC, jeton
d'accès court par utilisateur) à la place de ces jetons statiques.

## 2. Poste conseiller

Enregistrer le jeton dans le coffre Windows (une fois par utilisateur Windows) :

```powershell
python -c "import getpass, phonecall_desktop.secrets_store as s; s.set_gateway_token(getpass.getpass('Jeton : '))"
```

ou, en déploiement, par un script d'installation exécuté dans la session de l'utilisateur
(`cmdkey` n'est pas adapté : utiliser l'API Credential Manager / keyring).

Contrôle : `PhoneCallDiag.exe --selftest` puis, dans l'application, une génération sur le mode
test. Une erreur « Accès au service de génération refusé » indique un jeton absent, faux ou révoqué.

Effacer le jeton :

```powershell
python -c "import phonecall_desktop.secrets_store as s; s.delete_gateway_token()"
```

## 3. Variables de développement

En profil `dev` ou `test` uniquement, `PCD_GATEWAY_TOKEN` peut fournir le jeton (jamais en
production : il est ignoré). Ne jamais committer de fichier `.env` ou `config.env` : ils sont
ignorés par Git (`.gitignore`).

## 4. Fournisseur de transcription

Par défaut, la transcription est **locale** : aucune clé. Si un fournisseur cloud est retenu
(Azure Speech, AssemblyAI…), sa clé doit rester sur la passerelle, qui délivrera aux postes des
**jetons temporaires** propres au fournisseur — à concevoir avec le fournisseur choisi et le DPO.
