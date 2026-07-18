# Manuel de déploiement — Doc2AI v0.1.0

Ce manuel décrit l'installation et le déploiement de **Doc2AI**, il s'adresse à un utilisateur technique dont le **seul prérequis est Docker**. Aucune
connaissance de la stack n'est nécessaire.

> **Périmètre de la v0.1.0** — Seul **Google Drive** est opérationnel. Le support
> SharePoint / OneDrive (Microsoft) est présent dans la configuration mais **désactivé
> et non fonctionnel** dans cette version. Ce manuel ne documente donc que Google Drive.

---

## 1. Prérequis

### Logiciels

- **Docker** et **Docker compose** sont installés
- **Git** (uniquement si vous récupérez le code par clone plutôt que par archive).
- **OpenSSL** pour générer les secrets.
- Un **compte Google** avec accès à la [Google Cloud Console](https://console.cloud.google.com/)
  afin de créer les identifiants OAuth.

### Ports réseau

Les ports suivants doivent être **libres** sur la machine hôte (ils sont configurables):

| Port | Service |
|---|---|
| `5173` | Frontend (interface web) |
| `3000` | Backend (API) |
| `6379` | Redis |

---

## 2. Configurer le fichier `.env`

Copiez le modèle et renseignez les valeurs :

```bash
cp .env.example .env
```

| Variable | Rôle | À renseigner |
|---|---|---|
| `BACKEND_PORT` | Port hôte de l'API (toujours 3000 en interne) | Défaut `3000`, à changer si occupé |
| `FRONTEND_PORT` | Port hôte de l'interface web | Défaut `5173` |
| `REDIS_PORT` | Port hôte de Redis | Défaut `6379` |
| `DATABASE_URL` | Base SQLite | Laisser par défaut |
| `JWT_SECRET` | Clé de signature des jetons d'API | **Générer** (voir ci-dessous) |
| `ENCRYPTION_KEY` | Clé de chiffrement des identifiants OAuth en base | **Générer** (voir ci-dessous) |
| `NODE_ENV` | Mode d'exécution (Docker force `production`) | Laisser par défaut |
| `LOG_LEVEL` | Verbosité des journaux (`info`/`debug`/`warn`/`error`) | Défaut `info` |
| `SYNC_INTERVAL_MINUTES` | Intervalle de vérification des sources, en minutes | Défaut `15` |
| `MICROSOFT_CLIENT_ID` | SharePoint/OneDrive — **non opérationnel en v0.1.0** | Laisser tel quel |
| `MICROSOFT_CLIENT_SECRET` | idem | Laisser tel quel |
| `MICROSOFT_TENANT_ID` | idem | Laisser tel quel |
| `GOOGLE_CLIENT_ID` | Identifiant OAuth Google | **Obligatoire** (voir ci-dessous) |
| `GOOGLE_CLIENT_SECRET` | Secret OAuth Google | **Obligatoire** (voir ci-dessous) |
| `GOOGLE_REDIRECT_URI` | URL de retour OAuth, doit correspondre à la Google Cloud Console | Défaut OK si `BACKEND_PORT=3000` |
| `REDIS_URL` | Connexion Redis (`redis` = nom du service Docker) | Laisser par défaut |
| `EXPORT_PATH` | Dossier racine hôte où écrire les Markdown (monté en volume) | Voir ci-dessous |

### Générer les secrets

`JWT_SECRET` et `ENCRYPTION_KEY` reçoivent chacun une valeur aléatoire **distincte**. Lancez
la commande deux fois et collez chaque résultat entre guillemets :

```bash
openssl rand -base64 32
```

### Obtenir les identifiants OAuth Google

1. Dans la [Google Cloud Console](https://console.cloud.google.com/), créez ou sélectionnez un projet.
2. **API et services → Bibliothèque** : activez **Google Drive API**.
3. **API et services → Écran de consentement OAuth** : configurez l'écran (type « Externe »),
   puis ajoutez votre compte Google comme utilisateur de test.
4. **API et services → Identifiants → Créer des identifiants → ID client OAuth**, type
   **Application Web**.
5. Dans **URI de redirection autorisés**, ajoutez exactement la valeur de `GOOGLE_REDIRECT_URI` :
   ```
   http://localhost:3000/api/auth/google/callback
   ```
6. Copiez le **Client ID** et le **Client secret** affichés dans `GOOGLE_CLIENT_ID` et
   `GOOGLE_CLIENT_SECRET`.

### `EXPORT_PATH`

Dossier racine de l'hôte autorisé en écriture ; vous en choisirez un **sous-dossier** comme
destination dans l'interface. Ex. avec `EXPORT_PATH=/Users/username/Documents` et le
sous-dossier `mes-projets/doc2ai`, les fichiers sont écrits dans
`/Users/username/Documents/mes-projets/doc2ai`. Valeur par défaut : `./exports`.

---

## 3. Lancer l'application

Depuis la racine du projet (là où se trouvent `docker-compose.yml` et votre `.env`) :

```bash
docker compose up -d
```

Elle construit les images si nécessaire, puis démarre les trois services en arrière-plan
(`-d`). **La première exécution prend environ 30 secondes** (compilation du frontend et du
backend, téléchargement de Redis) ; les démarrages suivants sont quasi instantanés.

Suivre les journaux en direct (`Ctrl+C` quitte le suivi sans arrêter les conteneurs) :

```bash
docker compose logs -f
```

---

## 4. Vérifier le bon fonctionnement

### a) État des conteneurs

```bash
docker compose ps
```

Les trois services (`backend`, `frontend`, `redis`) doivent être à l'état `running` / `Up`.

### b) Santé de l'API backend

```bash
curl http://localhost:3000/api/health
```

### c) Interface web

Ouvrez **<http://localhost:5173>** dans un navigateur. L'interface Doc2AI doit s'afficher.
Vous pouvez alors :

1. Connecter un compte **Google Drive** via OAuth.
2. Choisir les dossiers à surveiller et la destination d'export des fichiers Markdown.
3. Laisser le service de monitoring détecter les changements et convertir automatiquement
   les nouveaux documents (selon `SYNC_INTERVAL_MINUTES`).

Formats pris en charge : **DOCX / DOC**, **PDF** et **Google Docs** (exportés puis convertis
en Markdown).

---

## 5. Problèmes courants et solutions

**« port is already allocated » / « address already in use » au démarrage**
Un des ports (5173, 3000 ou 6379) est déjà utilisé. Modifiez `FRONTEND_PORT`, `BACKEND_PORT`
ou `REDIS_PORT` dans `.env`, puis relancez `docker compose up -d`. Si vous changez le port
backend, mettez aussi à jour `GOOGLE_REDIRECT_URI` (et l'URI déclarée côté Google).

**La connexion Google échoue avec « redirect_uri_mismatch »**
L'URI de redirection déclarée dans la Google Cloud Console ne correspond pas exactement à
`GOOGLE_REDIRECT_URI`. Vérifiez qu'elles sont identiques au caractère près (protocole, port,
chemin `/api/auth/google/callback`). Toute modification du `.env` nécessite un
`docker compose up -d --build`, car l'ID client Google est aussi injecté au build du frontend.

**La page <http://localhost:5173> ne répond pas**
Attendez ~30 s après le premier `up`. Sinon, consultez les journaux :
```bash
docker compose logs -f frontend
docker compose logs -f backend
```

**Le backend redémarre en boucle**
Vérifiez que `JWT_SECRET` et `ENCRYPTION_KEY` sont bien renseignés dans `.env` (valeurs non
vides). Consultez `docker compose logs backend` pour le message d'erreur précis.

**Les fichiers convertis n'apparaissent pas sur l'hôte**
Vérifiez que `EXPORT_PATH` pointe vers un dossier existant et accessible en écriture, et que
Docker Desktop est autorisé à partager ce dossier (Docker Desktop → Settings → Resources →
File sharing sur macOS/Windows). Le sous-dossier choisi dans l'UI est créé sous `EXPORT_PATH`.

**J'ai modifié le `.env` mais rien ne change**
Reconstruisez les images pour prendre en compte les variables injectées au build :
```bash
docker compose up -d --build
```

**Repartir de zéro (⚠️ efface les données)**
Voir la section 7.

---

## 7. Arrêt et désinstallation

### Arrêter (en conservant les données)

```bash
docker compose down
```

Arrête et supprime les conteneurs et le réseau. Les **volumes de données sont conservés** :
un `docker compose up -d` ultérieur retrouve votre base et vos fichiers.

### Redémarrer

```bash
docker compose up -d
```

### Désinstallation complète (⚠️ suppression des données)

Pour supprimer aussi les volumes (base de données SQLite, cache Redis, stockage temporaire) :

```bash
docker compose down -v
```

Les fichiers Markdown déjà exportés sur l'hôte dans `EXPORT_PATH` **ne sont pas** supprimés
par cette commande ; retirez-les manuellement si besoin.

Pour aussi libérer l'espace disque des images construites :

```bash
docker compose down -v --rmi local
```

Enfin, supprimez le dossier du projet cloné/extrait si vous n'en avez plus besoin.

---

## Annexe — Commandes utiles

| Commande | Description |
|---|---|
| `docker compose up -d` | Démarrer tous les services (build si nécessaire) |
| `docker compose up -d --build` | Forcer la reconstruction puis démarrer |
| `docker compose ps` | Lister l'état des conteneurs |
| `docker compose logs -f` | Suivre les journaux de tous les services |
| `docker compose logs -f backend` | Suivre uniquement les journaux du backend |
| `docker compose down` | Arrêter les services (données conservées) |
| `docker compose down -v` | Arrêter et supprimer les volumes (données effacées) |

> **Note sur `./start.sh`** — Le script `start.sh` présent à la racine est **réservé au
> développement**. Il exécute `docker compose down`, puis une reconstruction complète sans
> cache (`docker compose build --no-cache`), un `up -d` et un suivi des logs, et gère une
> allocation de ports spécifique à l'environnement de développement (variable
> `CONDUCTOR_PORT`). **Ne l'utilisez pas pour un déploiement** : la reconstruction sans cache
> est lente et inutile en production. Utilisez `docker compose up -d`.
