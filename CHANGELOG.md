# Changelog

Toutes les modifications notables de Doc2AI sont consignées dans ce fichier.

Le format s'appuie sur [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/),
et le projet suit le [versionnage sémantique](https://semver.org/lang/fr/).

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

[0.1.1]: https://github.com/Miniluchi/doc2ai/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/Miniluchi/doc2ai/releases/tag/v0.1.0
