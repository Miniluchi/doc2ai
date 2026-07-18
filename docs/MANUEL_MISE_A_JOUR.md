# Manuel de mise à jour — Doc2AI

Ce manuel s'adresse à deux publics :

- **[Partie A — Utilisateur](#partie-a--mettre-à-jour-son-installation)** : mettre à jour une installation existante.
- **[Partie B — Mainteneur](#partie-b--publier-une-nouvelle-version)** : publier une nouvelle version.

Document rédigé pour la version **v0.1.0**.

---

## Partie A — Mettre à jour son installation

### 1. Sauvegarder avant toute chose

Deux éléments à sauvegarder : votre configuration (`.env`) et votre base de données.

**Le fichier `.env`** (à la racine du projet) — copiez-le simplement :

```bash
cp .env .env.backup
```

**La base de données** — c'est un fichier SQLite stocké dans un volume Docker. Copiez-le
depuis le conteneur backend (celui-ci doit être démarré) :

```bash
docker compose cp backend:/app/data/dev.db ./dev.db.backup
```

> Les fichiers Markdown déjà exportés sont, eux, dans votre dossier de destination sur le
> disque : ils ne sont pas affectés par la mise à jour.

### 2. Récupérer la nouvelle version

Si vous avez installé Doc2AI **via Git**, placez-vous sur la nouvelle version publiée
(remplacez `vX.Y.Z` par le numéro voulu) :

```bash
git fetch --tags
git checkout vX.Y.Z
```

Si vous avez installé **via une archive**, téléchargez la nouvelle archive depuis la page
des releases (<https://github.com/Miniluchi/doc2ai/releases>), extrayez-la, puis
**recopiez votre `.env`** dans le nouveau dossier.

### 3. Reconstruire et relancer

Depuis la racine du projet :

```bash
docker compose down
docker compose build --no-cache
docker compose up -d
```

La base de données est mise à niveau **automatiquement** au démarrage du backend : les
migrations de schéma éventuelles sont appliquées toutes seules, vous n'avez rien à lancer.

### 4. Vérifier après la mise à jour

```bash
docker compose ps                     # les 3 services doivent être "Up"
curl http://localhost:3000/api/health # doit répondre un JSON success:true
```

Ouvrez ensuite **http://localhost:5173** : vos sources et votre historique doivent
toujours être là. Suivez les journaux en cas de doute :

```bash
docker compose logs -f backend
```

### 5. Revenir en arrière en cas d'échec

Si la nouvelle version pose problème, revenez au tag précédent et reconstruisez :

```bash
docker compose down
git checkout <tag-précédent>          # ex. v0.1.0
docker compose build --no-cache
docker compose up -d
```

Restaurez aussi votre `.env` si vous l'aviez modifié (`cp .env.backup .env`).

> ⚠️ **Base de données.** Le retour arrière du **code** est simple, mais Doc2AI ne sait
> pas *annuler* une migration de schéma déjà appliquée (les migrations ne vont que vers
> l'avant). Si la mise à jour a modifié le schéma, remettez votre base sauvegardée avant
> de redémarrer l'ancienne version :
> ```bash
> docker compose cp ./dev.db.backup backend:/app/data/dev.db
> docker compose restart backend
> ```
> C'est précisément pour ce cas que la sauvegarde de l'étape 1 est indispensable.

---

## Partie B — Publier une nouvelle version

> **On ne pousse jamais directement sur `main`.** Toutes les modifications passent par une
> **branche dédiée** puis une **pull request** relue et fusionnée. Le tag et la release ne
> sont créés qu'ensuite, sur `main` à jour.

### 1. Créer une branche dédiée

```bash
git checkout main && git pull
git checkout -b release/vX.Y.Z   # ou feature/... , fix/... selon la nature du changement
```

### 2. Choisir le numéro de version (SemVer)

Doc2AI suit le versionnage sémantique `MAJEUR.MINEUR.CORRECTIF` :

| Type | Quand l'incrémenter | Exemple |
|---|---|---|
| **MAJEUR** | rupture de compatibilité (config, API, données) | `0.1.0` → `1.0.0` |
| **MINEUR** | nouvelle fonctionnalité rétrocompatible | `0.1.0` → `0.2.0` |
| **CORRECTIF** | correction de bug, sans changement de comportement | `0.1.0` → `0.1.1` |

### 3. Mettre à jour le numéro dans les `package.json`

Le numéro figure à **deux endroits**, à garder synchronisés : `backend/package.json` et
`frontend/package.json` (champ `"version"`). Modifiez les deux vers le nouveau numéro.

### 4. Migrations de schéma (si le schéma a changé)

Si vous avez modifié `backend/src/db/schema.ts`, générez la migration correspondante et
**committez le fichier SQL produit** dans `backend/drizzle/` :

```bash
cd backend && bun run db:generate
```

Ces fichiers sont livrés avec la release et appliqués automatiquement au démarrage chez
l'utilisateur. Ne modifiez pas à la main les migrations déjà publiées.

### 5. Committer et ouvrir une pull request

Committez sur votre branche, poussez-la, puis ouvrez la PR vers `main` :

```bash
git add -A
git commit -m "Release vX.Y.Z"
git push -u origin release/vX.Y.Z
gh pr create --base main --fill
```

Faites relire et fusionner la PR dans `main`. **Ne taguez pas** tant qu'elle n'est pas
fusionnée.

### 6. Taguer et publier la release (après fusion)

Une fois la PR fusionnée, repassez sur `main` à jour, créez le tag et poussez-le :

```bash
git checkout main && git pull
git tag vX.Y.Z
git push origin vX.Y.Z
```

Puis publiez la release en générant les notes à partir des PR fusionnées depuis le tag
précédent :

```bash
gh release create vX.Y.Z --title "vX.Y.Z" --generate-notes
```

`--generate-notes` rédige le changelog depuis les titres des pull requests. Relisez et
complétez les notes si nécessaire, en signalant explicitement toute **rupture de
compatibilité** et toute action manuelle requise côté utilisateur.
