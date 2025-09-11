# Doc2AI Backend

Backend API pour Doc2AI - Convertit automatiquement les documents en Markdown pour les IA.

## Installation

```bash
# Installer les dépendances
npm install

# Copier la configuration d'exemple
cp .env.example .env

# Configurer les variables d'environnement dans .env
# Générer et migrer la base de données
npm run prisma:generate
npm run prisma:migrate
```

## Configuration

### Variables d'environnement (.env)

```env
# Base de données
DATABASE_URL="file:./dev.db"

# Sécurité
JWT_SECRET="your-super-secret-jwt-key-here"
ENCRYPTION_KEY="your-32-char-encryption-key-here"

# API Configuration
PORT=3000
NODE_ENV=development
CORS_ORIGIN="http://localhost:5173"

# Microsoft Graph API (SharePoint/OneDrive)
MICROSOFT_CLIENT_ID="your-microsoft-client-id"
MICROSOFT_CLIENT_SECRET="your-microsoft-client-secret"  
MICROSOFT_TENANT_ID="your-tenant-id"

# Google Drive API
GOOGLE_CLIENT_ID="your-google-client-id"
GOOGLE_CLIENT_SECRET="your-google-client-secret"

# Storage
STORAGE_PATH="./storage"
TEMP_PATH="./temp"
```

## Démarrage

### Développement
```bash
npm run dev
```

### Production
```bash
npm start
```

## API Documentation

### Sources (`/api/sources`)
- `GET /api/sources` - Liste toutes les sources
- `POST /api/sources` - Crée une nouvelle source
- `GET /api/sources/:id` - Détails d'une source
- `PUT /api/sources/:id` - Met à jour une source
- `DELETE /api/sources/:id` - Supprime une source
- `POST /api/sources/:id/test` - Test de connectivité
- `POST /api/sources/:id/sync` - Synchronisation manuelle

### Conversions (`/api/conversions`)
- `GET /api/conversions` - Liste des jobs de conversion
- `POST /api/conversions` - Lance une conversion manuelle
- `GET /api/conversions/:id` - Statut d'une conversion
- `DELETE /api/conversions/:id` - Annule une conversion

### Monitoring (`/api/monitoring`)
- `GET /api/monitoring/status` - Statut du monitoring
- `POST /api/monitoring/start` - Démarre le monitoring
- `POST /api/monitoring/stop` - Arrête le monitoring
- `GET /api/monitoring/logs` - Logs de synchronisation

## Architecture

```
src/
├── controllers/      # Contrôleurs API
├── services/        # Services métier
├── integrations/    # Connecteurs drives
├── converters/      # Moteurs de conversion
├── models/          # Modèles de données (Prisma)
├── middleware/      # Middlewares Express
├── routes/          # Définition des routes
├── config/          # Configuration
└── utils/           # Utilitaires
```

## Plateformes supportées

### Microsoft SharePoint/OneDrive
- Authentification via Microsoft Graph API
- Support des documents Office (.docx, .doc)
- Synchronisation en temps réel

### Google Drive
- Authentification OAuth 2.0
- Conversion automatique des Google Docs
- Notifications de changements

## Conversion de documents

### Formats supportés
- **DOCX/DOC** → Markdown (via mammoth.js)
- **PDF** → Markdown (via pdf-parse)

### Fonctionnalités
- Préservation du formatage de base
- Extraction des images (références)
- Support des tableaux
- Métadonnées automatiques

## Monitoring

Le service de monitoring surveille automatiquement les drives configurés et déclenche les conversions lors de changements.

### Fonctionnalités
- Polling périodique des sources
- Détection des nouveaux fichiers
- Queue de conversion
- Logs détaillés
- Health checks

## Sécurité

- **Chiffrement** : Credentials chiffrés en base
- **Rate limiting** : Protection anti-abus
- **CORS** : Configuration stricte
- **Helmet** : Headers de sécurité
- **Validation** : Sanitisation des entrées

## Base de données

Utilise Prisma avec SQLite (développement) ou PostgreSQL (production).

### Modèles principaux
- **Source** : Configuration des drives
- **ConversionJob** : Jobs de conversion
- **SyncLog** : Historique des synchronisations
- **ConvertedFile** : Index des fichiers convertis

## Scripts disponibles

```bash
npm run dev              # Développement avec nodemon
npm start                # Production
npm run prisma:generate  # Génère le client Prisma
npm run prisma:migrate   # Applique les migrations
npm run prisma:studio    # Interface graphique DB
npm run lint             # Vérifie le code
npm test                 # Lance les tests
```

## Développement

### Ajout d'une nouvelle plateforme

1. Créer le connecteur dans `src/integrations/`
2. Étendre la factory `DriveConnectorFactory`
3. Ajouter la validation dans les middlewares
4. Tester l'intégration

### Ajout d'un format de conversion

1. Créer le convertisseur dans `src/converters/`
2. Étendre la factory `ConverterFactory`
3. Implémenter l'interface `BaseConverter`
4. Ajouter les tests

## Déploiement

### Docker (recommandé)
```bash
# Build de l'image
docker build -t doc2ai-backend .

# Run du container
docker run -p 3000:3000 -e DATABASE_URL="..." doc2ai-backend
```

### Production
- Configurer PostgreSQL
- Définir les variables d'environnement
- Utiliser un process manager (PM2)
- Configurer les logs
- Mettre en place la supervision

## Troubleshooting

### Problèmes courants

**Erreur de connexion aux drives**
- Vérifier les credentials
- Contrôler les permissions
- Tester la connectivité réseau

**Jobs de conversion échoués**
- Vérifier les formats supportés
- Contrôler l'espace disque
- Examiner les logs détaillés

**Monitoring non démarré**
- Vérifier la configuration
- Contrôler les permissions de lecture
- Redémarrer le service