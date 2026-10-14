# Configuration des clés et jetons

Principe : **aucune clé dans le code, dans un fichier ou dans Git.** Deux modes, choisis dans
`config.env` (`PCD_NOTES_CLIENT`) :

| Mode | Où est la clé Claude | Pour qui |
|---|---|---|
| `local` — **note sans IA** (mode du paquet téléchargeable) | aucune clé : synthèse de 10 lignes faite par le programme, rien n'est envoyé | tous les postes, coût nul |
| `anthropic` — **clé dans l'application** (option payante) | coffre Windows de chaque PC, saisie par le bouton « Clé API » | un ou quelques postes |
| `gateway` — passerelle de l'entreprise | serveur passerelle uniquement ; les postes ont un jeton révocable | déploiement à plusieurs conseillers |

```
Mode anthropic : Poste ──(HTTPS, clé du coffre Windows)──► API Claude (Anthropic)
Mode gateway   : Poste ──(HTTPS + jeton révocable)──► Passerelle phonecall-agent ──(clé API)──► API Claude
```

Dans les deux modes, le prompt versionné, la sortie structurée et les contrôles anti-invention sont
**le même code** (`phonecall_agent.note_service`) ; seule la transcription texte quitte le PC,
à la fin de l'appel. L'audio ne quitte jamais le PC.

## 0. Mode « clé dans l'application » (`PCD_NOTES_CLIENT=anthropic`)

1. Créer la clé : console.anthropic.com › **API Keys** › *Create Key* (compte de l'entreprise, avec
   une limite de dépense mensuelle réglée dans *Limits*). Une clé par poste ou par utilisateur
   facilite la révocation.
2. Dans l'application : bouton **« Clé API »** › coller la clé › **« Vérifier et enregistrer »**.
   La clé est vérifiée auprès d'Anthropic (lecture du modèle, sans génération ni coût), puis
   enregistrée dans le Gestionnaire d'identification Windows (`PhoneCallDesktop / anthropic-api-key`).
3. L'interface ne peut **jamais relire** la clé : elle peut seulement l'enregistrer, la remplacer ou
   la supprimer. La clé n'est écrite dans aucun fichier ni dans les journaux.
4. Révocation : supprimer la clé sur console.anthropic.com (effet immédiat sur tous les postes qui
   l'utilisent), puis « Supprimer la clé de ce PC » dans l'application.

Réglages (`config.env`) : `PCD_ANTHROPIC_MODEL` (défaut `claude-opus-5-5`), `PCD_ANTHROPIC_EFFORT`
(défaut `medium`), `PCD_BUSINESS_CONFIG` (catégories et format de la note ; défaut : `business.yaml`
à côté de l'exécutable — exemple **à faire valider** par le métier).
En profil `dev` ou `test` uniquement, `PCD_ANTHROPIC_API_KEY` peut fournir la clé (ignorée en production).

| Secret | Où il vit | Qui le gère |
|---|---|---|
| Clé Claude, mode `gateway` (`PCA_ANTHROPIC_API_KEY`) | gestionnaire de secrets du **serveur** passerelle uniquement | DSI |
| Clé Claude, mode `anthropic` | **Gestionnaire d'identification Windows** du poste (`PhoneCallDesktop / anthropic-api-key`) | utilisateur, via « Clé API » |
| Empreintes des jetons des postes (`PCA_NOTE_API_TOKENS_SHA256`) | configuration du serveur passerelle | DSI |
| Jeton d'un poste / d'un utilisateur | **Gestionnaire d'identification Windows** du poste (entrée `PhoneCallDesktop / gateway-token`) | DSI / utilisateur |
| Clé de chiffrement de l'historique local | Gestionnaire d'identification Windows (`PhoneCallDesktop / history-key`), créée automatiquement si l'historique est activé | automatique |

## 1. Mode passerelle — serveur

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

## 2. Mode passerelle — poste conseiller

Enregistrer le jeton dans le coffre Windows (une fois par utilisateur Windows) :

```powershell
python -c "import getpass, phonecall_desktop.secrets_store as s; s.set_gateway_token(getpass.getpass('Jeton : '))"
```

ou, en déploiement, par un script d'installation exécuté dans la session de l'utilisateur
(`cmdkey` n'est pas adapté : utiliser l'API Credential Manager / keyring).

Contrôle : `PhoneCallDesktop.exe --selftest --report selftest.txt` puis, dans l'application, une génération sur le mode
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
