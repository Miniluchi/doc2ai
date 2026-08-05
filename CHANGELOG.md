# Changelog

Toutes les modifications notables de Doc2AI sont consignées dans ce fichier.

Le format s'appuie sur [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/),
et le projet suit le [versionnage sémantique](https://semver.org/lang/fr/).

## [0.1.2] — 2026-08-05

Version de maintenance : correction d'un bug d'export silencieux, mise en place de la
supervision, nettoyage d'une dépendance inutilisée. Aucune nouvelle fonctionnalité.

### Corrigé

- **Un export en échec ne passe plus pour un succès.** Lorsque le dossier de
  destination n'était pas accessible en écriture, l'erreur était journalisée en
  simple avertissement puis ignorée : la tâche était marquée comme terminée, le
  fichier enregistré comme converti et la synchronisation comptée comme réussie,
  alors qu'aucun fichier n'atteignait le disque de l'utilisateur. Un export en échec
  fait désormais échouer la tâche, avec le chemin concerné dans le message d'erreur.
  (#52, #53)

### Ajouté

- **Système de supervision et d'alerte** (#51, #53) :
  - `healthcheck` Docker sur les trois conteneurs, et démarrage ordonné : le backend
    attend que Redis accepte réellement des connexions.
  - Trois sondes applicatives sur `/api/monitoring/health` — accessibilité en écriture
    des dossiers d'export, fraîcheur de la synchronisation, état de la boucle de
    surveillance — chacune rapportant la valeur observée et le seuil appliqué.
  - Séparation entre sonde de vivacité (`/api/health`, sans accès disque) et sonde
    approfondie (`/api/monitoring/health`).
  - Documentation du dispositif : `docs/SUPERVISION.md`.

### Modifié

- La vérification des dossiers d'export **écrit réellement un fichier témoin** au lieu
  de se fier aux droits déclarés. Sur un montage lié, les permissions peuvent indiquer
  « inscriptible » alors que le système de fichiers de l'hôte refuse l'écriture — cas
  dans lequel la sonde concluait à tort que tout allait bien. (#53)
- La vérification porte désormais sur la racine d'export **et sur le dossier de
  destination de chaque source active**, et non plus sur la seule racine. (#53)

### Supprimé

- Dépendance `bcryptjs` et ses types, déclarés mais jamais importés : le projet ne
  stocke aucun mot de passe, les identifiants OAuth étant chiffrés via `node:crypto`.
  (#49, #50)

## [0.1.1] — 2026-08-04

Version de maintenance : aucune nouvelle fonctionnalité, uniquement des correctifs
de sécurité, du nettoyage d'interface et de la documentation utilisateur.

### Sécurité

- Suppression de la dépendance `multer`, qui portait **8 vulnérabilités de niveau
  élevé** (CVE-2025-47935, CVE-2025-47944, CVE-2025-48997, CVE-2025-7338,
  CVE-2026-2359, CVE-2026-3304, CVE-2026-3520, CVE-2026-5079), toutes des vecteurs
  de déni de service. L'analyse a montré que la bibliothèque n'était **jamais
  importée** par l'application : elle a donc été retirée plutôt que mise à jour,
  ce qui élimine les 8 alertes sans risque de régression. (#46, #47)

### Ajouté

- Manuel de déploiement destiné à un utilisateur technique dont le seul prérequis
  est Docker (`docs/MANUEL_DEPLOIEMENT.md`).
- Manuel d'utilisation de l'application (`docs/MANUEL_UTILISATION.md`).
- Manuel de mise à jour, couvrant à la fois la mise à jour d'une installation
  existante et la publication d'une nouvelle version (`docs/MANUEL_MISE_A_JOUR.md`).

### Modifié

- Les options **SharePoint** et **OneDrive** du formulaire d'ajout de source sont
  désormais explicitement désactivées et signalées « (coming soon) », au lieu
  d'être proposées alors qu'elles ne fonctionnent pas. (#28)
- Mise à jour des dépendances applicatives : `axios` 1.6.2 → 1.19.0 (backend),
  `tailwindcss` 4.1.13 → 4.3.3, `@radix-ui/react-checkbox` et
  `@radix-ui/react-label` (frontend).

### Supprimé

- Bouton « Settings » et entrée de menu « Configure » de l'interface : ces
  contrôles n'étaient reliés à aucune fonctionnalité. (#28)
- Composants d'interface inutilisés (`sidebar`, hook `use-mobile`). (#28)

### Interne

Ces changements n'affectent pas l'application déployée, mais soutiennent sa
maintenance :

- Correction de la configuration Dependabot, qui ne générait aucune mise à jour de
  version : elle couvre désormais les dépendances backend et frontend (bun), les
  images Docker et les actions GitHub, avec une fréquence hebdomadaire. (#32)
- Ajout de formulaires d'issue structurés pour la consignation des anomalies et
  les propositions d'amélioration. (#45)
- Mise à jour des actions de CI (`actions/checkout`, `sonarqube-scan-action`) et
  des outils de développement (`prettier`, `eslint-plugin-react-refresh`,
  `@types/node`, `bcryptjs`).

## [0.1.0] — 2026-05-15

Première version publiée.

### Ajouté

- Conversion automatique de documents (DOCX/DOC, PDF, Google Docs) en Markdown.
- Connexion à Google Drive via OAuth et surveillance continue des dossiers choisis,
  avec conversion automatique des documents nouveaux ou modifiés.
- Mises à jour en temps réel de l'interface via Server-Sent Events. (#22)
- Déploiement conteneurisé complet (backend, frontend, Redis) via Docker Compose.
- Infrastructure de tests unitaires backend et frontend, intégrée à la CI. (#25, #26)
- Chaîne d'intégration continue : vérification du formatage, lint, tests et build
  sur chaque pull request. (#16, #26)

### Connu / limitations

- Seul **Google Drive** est opérationnel. Le support SharePoint / OneDrive est
  présent dans la configuration mais non fonctionnel.

[0.1.2]: https://github.com/Miniluchi/doc2ai/compare/v0.1.1...v0.1.2
[0.1.1]: https://github.com/Miniluchi/doc2ai/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/Miniluchi/doc2ai/releases/tag/v0.1.0
