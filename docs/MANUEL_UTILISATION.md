# Manuel d'utilisation — Doc2AI

Ce manuel suppose que l'application est **déjà installée et démarrée**. Si ce n'est pas le
cas, voir le [manuel de déploiement](MANUEL_DEPLOIEMENT.md).

Ouvrez l'application dans votre navigateur : **http://localhost:5173**

---

## 1. Connecter votre compte Google

La connexion Google se fait au moment où vous créez votre première source.

1. Cliquez sur **Add source** (bouton en haut à droite du tableau de bord).
2. Dans la fenêtre qui s'ouvre, choisissez **Google Drive** comme plateforme
3. Une étape **Connect to Google Drive** apparaît : cliquez sur **Sign in with Google**.
4. Une fenêtre Google s'ouvre. Choisissez votre compte et autorisez l'accès.
5. La fenêtre se referme automatiquement. Votre nom, votre e-mail et votre photo s'affichent alors sur fond vert : vous êtes connecté.

**Durée de la session.** La connexion reste valable **24 heures**. Passé ce délai, un
message vous indique « Your Google session has expired, please reconnect » : il suffit de
recliquer sur **Sign in with Google** pour repartir.

---

## 2. Créer une source à surveiller

Une « source » équivaut a un dossier Google Drive a surveiller.

**Étape 1 — Informations de base.** Plateforme (**Google Drive**) et **nom** de la source.

**Étape 2 — Connexion.** Connectez votre compte Google si ce n'est pas déjà fait.

**Étape 3 — Configuration du dossier.**

- **Folder to monitor** : cliquez sur le champ pour ouvrir l'explorateur de votre Google
  Drive, puis sélectionnez le dossier à surveiller.
- Un **aperçu** s'affiche dessous (« Files that will be automatically converted ») : il
  liste les fichiers du dossier qui seront convertis. Si rien n'apparaît, c'est qu'aucun
  fichier compatible n'a été trouvé.
- **Where to save converted files** : saisissez le sous-dossier de destination. Le début du
  chemin (défini à l'installation) est affiché en gris devant le champ ; vous n'indiquez
  que la partie qui suit, par exemple `doc2ai-exports`. Le chemin doit être **relatif**
  (lettres, chiffres, tirets, underscores et `/` uniquement).

**Étape 4 — Filtres avancés (facultatif).** Cette section est repliée par défaut ;
dépliez-la seulement si besoin.

- **File types to process** : les extensions à convertir, séparées par des virgules
  (par défaut `.docx,.pdf,.doc,.txt`).
- **Files to ignore** : des mots présents dans le nom des fichiers à ignorer
  (par défaut `temp,draft,~$`).

Cliquez enfin sur **Create source**. La nouvelle source apparaît sur le tableau de bord.

### Formats pris en charge

Les formats **DOCX**, **DOC**, **PDF** et **Google Docs** sont supportés. Les fichiers seronts convertis en Markdown.

---

## 3. Lire le tableau de bord

Le tableau de bord (page d'accueil) affiche trois compteurs en haut :

- **Connected sources** — nombre de sources configurées. Un badge « X active » indique
  combien sont en cours de surveillance.
- **Converted files** — nombre de fichiers convertis au cours des **dernières 24 heures**.
- **System status** — état de la surveillance : **Active** si au moins une source est
  surveillée, sinon **Inactive**, avec le nombre de sources suivies.

En dessous, la section **Document sources** liste vos sources sous forme de cartes. Chaque
carte indique :

- le **nom** de la source et la plateforme (Google Drive) ;
- un badge de **statut** : **Active** (surveillée), **Inactive**, ou **Error** (problème à
  vérifier) ;
- **Source path** : le dossier Drive surveillé ;
- **Destination** : le dossier où sont écrits les fichiers Markdown ;
- **Last successful sync** : date de la dernière synchronisation réussie (« Never » si
  aucune n'a encore eu lieu) ;
- **Extensions** : les types de fichiers pris en compte ;
- **Recent jobs** : le nombre de conversions récentes, avec un badge **Errors** si l'une
  d'elles a échoué.

Si vous n'avez encore aucune source, un message « No document sources » vous invite à en
créer une avec **Add your first source**.

---

## 4. Surveillance automatique et synchronisation manuelle

### Surveillance automatique

Une fois une source active, l'application vérifie **régulièrement** son dossier Drive et
convertit les documents nouveaux ou modifiés, sans intervention de votre part. Par défaut,
cette vérification a lieu **environ toutes les 15 minutes**. Le compteur **Converted files** et la date
**Last successful sync** se mettent à jour au fil des conversions.

### Synchronisation manuelle

Pour ne pas attendre le prochain cycle, vous pouvez lancer une synchronisation
immédiatement :

1. Sur la carte de la source, cliquez sur le menu **⋯** (en haut à droite).
2. Choisissez **Sync now**.

La source est vérifiée tout de suite et les nouveaux documents sont convertis.

### Vérifier la connexion

Le même menu **⋯** propose **Test connection** : cette option vérifie que l'application
accède toujours à votre dossier Drive. Un bandeau vert (**Connection OK**) ou rouge
(**Connection failed**) vous indique le résultat. Utile si une source passe en statut
**Error**.

---

## 5. Modifier ou supprimer une source

### Modifier

Pour changer le dossier surveillé, la destination ou les filtres d'une source, le plus
simple est de **supprimer** la source concernée puis d'en **créer une nouvelle** avec les
bons réglages (voir section 2).

### Supprimer

1. Sur la carte de la source, ouvrez le menu **⋯**.
2. Cliquez sur **Delete**.
3. Une confirmation apparaît (« Delete source? »). Validez avec **Delete**.

> ⚠️ La suppression est **définitive** : la source et son historique de conversions sont
> effacés. En revanche, les fichiers Markdown déjà produits **restent** dans votre dossier
> de destination.
