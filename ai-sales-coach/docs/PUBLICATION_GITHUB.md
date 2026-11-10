# Procédure de publication sur GitHub

## 1. Avant de publier : vérifications de confidentialité

- [ ] Aucun fichier `.env` n'est suivi : `git ls-files | grep -E '(^|/)\.env$'` ne doit rien afficher.
- [ ] Aucune donnée locale : `git ls-files | grep -E 'data/runtime|\.db$|\.enc$|encryption.key'` → rien.
- [ ] Aucun appel réel ni document interne dans `data/samples/` (seuls les appels **fictifs** sont publiés).
- [ ] Aucune clé API dans le code : `git grep -nE '(sk-[A-Za-z0-9]{10,}|api[_-]?key\s*=\s*["'"'"'][^"'"'"']+)'` → rien.
- [ ] Les tests passent : `python -m pytest`.

Le fichier `.gitignore` du projet exclut déjà `.env`, `data/runtime/`, `*.db`, `*.enc` et la clé locale.

## 2. Premier dépôt

```bash
git init
git add .
git status            # relire la liste des fichiers ajoutés
git commit -m "AI Sales Coach : version initiale"
git branch -M main
git remote add origin https://github.com/<compte>/<depot>.git
git push -u origin main
```

Recommandation : dépôt **privé** tant que la documentation métier ou des exemples internes peuvent y être ajoutés.

## 3. Intégration continue

Le workflow `.github/workflows/ai-sales-coach-tests.yml` (à la racine du dépôt) exécute les tests sur
Python 3.11 et 3.13 à chaque modification du dossier `ai-sales-coach/`.

## 4. Publier une version

```bash
git tag -a v1.0.0 -m "AI Sales Coach 1.0.0"
git push origin v1.0.0
```

Puis sur GitHub : **Releases → Draft a new release**, choisissez le tag, décrivez les changements.

## 5. Protéger le dépôt

- Activez **Secret scanning** et **Push protection** (Settings → Code security).
- Protégez la branche `main` (revue obligatoire, tests verts).
- Ne stockez les clés de production que dans des secrets d'environnement (jamais dans le dépôt).
