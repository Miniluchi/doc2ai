# Système de supervision — Doc2AI

Ce document décrit le dispositif de supervision et d'alerte de Doc2AI : ce qui est
surveillé, par quelles sondes, selon quels seuils, et comment une défaillance est
signalée.

---

## 1. Périmètre de supervision

Doc2AI n'est pas un service centralisé : chaque utilisateur déploie sa propre
instance sur sa machine, via Docker. Il n'existe donc pas d'instance unique que
l'éditeur pourrait surveiller pour tout le monde, et une instance qui tourne sur
le poste d'un utilisateur n'est joignable par personne d'autre.

Le périmètre retenu distingue deux niveaux :

| Niveau | Ce qui est surveillé | Où | Bénéficiaire |
|---|---|---|---|
| **Local** | Les 3 conteneurs et l'état interne de l'application | Chez chaque utilisateur, embarqué dans le dépôt | Tout utilisateur de Doc2AI |
| **Applicatif** | L'instance de référence, via son endpoint de santé | Uptime Kuma, pile Docker distincte | L'équipe projet |

Ce découpage répond à une contrainte de conception : **aucun utilisateur ne doit se
voir imposer l'installation d'un service de supervision dont il n'a pas l'usage.**
Les sondes locales sont donc de simples `healthcheck` Docker et un endpoint HTTP,
sans dépendance supplémentaire ; Uptime Kuma est déployé séparément, en dehors du
dépôt, et n'est pas livré aux utilisateurs.

### Ce qui est réellement en place, et ses limites

L'instance supervisée et Uptime Kuma tournent aujourd'hui **sur la même machine**,
dans deux piles Docker distinctes. Ce n'est pas l'idéal théorique, et il faut en
mesurer la portée exacte :

| Type de panne | Détectée ? |
|---|---|
| Backend, frontend ou Redis arrêté ou en erreur | ✅ oui |
| Dossier d'export inaccessible en écriture | ✅ oui |
| Boucle de synchronisation figée | ✅ oui |
| Conteneur Uptime Kuma arrêté | ❌ non |
| Arrêt ou perte totale de la machine hôte | ❌ non |

Autrement dit, la supervision couvre les défaillances **de l'application**, mais pas
celles **de son hôte** : si la machine s'éteint, le superviseur s'éteint avec elle et
personne n'est alerté.

L'architecture cible consiste à héberger Uptime Kuma sur une machine distincte de
l'instance supervisée, ce qui lève cette limite. Elle n'a pas été retenue ici parce
que l'instance de référence tourne sur un poste de développement portable : une cible
qui se met en veille et change de réseau produirait un flux continu de fausses
alertes, sans valeur de supervision. Superviser une instance réellement disponible en
permanence suppose de la déployer au préalable sur un serveur — ce qui dépasse le
cadre actuel du projet.

### Une spécificité de ce logiciel

Doc2AI est un outil de **synchronisation en arrière-plan** : son travail réel
(détecter les documents modifiés et les convertir) se déroule sans intervention de
l'utilisateur. Vérifier que le serveur HTTP répond ne suffit donc pas à établir
qu'il est disponible : une instance peut répondre `200` à toutes les requêtes tout
en ayant cessé de synchroniser depuis trois jours. Du point de vue de
l'utilisateur, ce logiciel-là est en panne.

Le dispositif ne se contente pas de mesurer la disponibilité du service HTTP : il
vérifie que **la fonction métier est effectivement rendue**.

---

## 2. Architecture : qui contacte qui ?

**C'est Uptime Kuma qui interroge Doc2AI, et non l'inverse** (modèle *pull*).
Uptime Kuma envoie périodiquement une requête HTTP sur l'endpoint de santé de
l'instance supervisée et juge la réponse.

```
  Machine hôte
 ┌──────────────────────────────────────────────────────────────┐
 │  pile « uptime-kuma »                pile « doc2ai »          │
 │  ┌──────────────────────┐          ┌──────────────────────┐  │
 │  │                      │  GET     │  doc2ai-backend      │  │
 │  │   Uptime Kuma        ├─────────►│  /api/monitoring/    │  │
 │  │                      │  toutes  │      health          │  │
 │  │   ├─ seuils          │  les 60s │                      │  │
 │  │   └─ notifications   │◄─────────┤  200 / 503 + JSON    │  │
 │  └──────────┬───────────┘  réponse └──────────────────────┘  │
 └─────────────┼────────────────────────────────────────────────┘
               ▼  en cas de panne
        Discord / e-mail
```

Les deux piles étant sur des réseaux Docker distincts, Uptime Kuma joint l'API par
`host.docker.internal:3000`, c'est-à-dire par le port publié sur l'hôte. Ce chemin
est délibéré : il emprunte exactement la même route qu'un navigateur utilisateur, et
détecterait donc aussi une défaillance de publication du port, ce qu'un accès direct
par le réseau interne de Docker masquerait.

Ce choix se justifie sur trois points :

- **Aucune modification de l'application.** Doc2AI expose déjà son état ; il n'a
  pas à connaître l'existence d'un superviseur, ni son adresse.
- **L'arrêt de l'application est détecté par construction.** Si le conteneur ou
  Docker s'arrêtent, la requête échoue (délai dépassé ou connexion refusée) et
  l'alerte part, sans que l'application ait eu à signaler quoi que ce soit.
- **Aucune donnée ne sort de l'instance.** Le superviseur va chercher
  l'information ; l'instance n'émet rien vers l'extérieur.

L'alternative, le mode *push* (l'application envoie un battement de cœur
périodique à Uptime Kuma, qui alerte lorsqu'il cesse d'arriver), a été écartée.
Elle est utile lorsque l'instance surveillée est inaccessible depuis l'extérieur —
derrière un NAT ou un pare-feu — mais elle imposerait à **toutes** les
installations de Doc2AI d'émettre des données vers un service tiers, ce qui est
contraire au principe d'un outil auto-hébergé.

> **Prérequis réseau.** Le modèle *pull* suppose qu'Uptime Kuma puisse joindre
> l'instance supervisée. C'est le cas ici puisque les deux tournent sur la même
> machine : aucun endpoint de santé n'est exposé publiquement, et aucune redirection
> de port vers Internet n'a été mise en place — l'application détient des
> identifiants OAuth et un accès en écriture au disque de l'utilisateur.

---

## 3. Les sondes

### 3.1 Sondes applicatives

Trois sondes, exécutées à la demande par l'endpoint `/api/monitoring/health`
(implémentation : [`backend/src/services/healthService.ts`](../backend/src/services/healthService.ts)).

Chaque sonde renvoie son état, la **valeur observée** et le **seuil** qui l'a
jugée, afin qu'un résultat dégradé soit interprétable sans lire le code.

| Sonde | Ce qu'elle vérifie | Défaillance qu'elle détecte |
|---|---|---|
| `exportPath` | La racine d'export **et le dossier de destination de chaque source active** sont réellement inscriptibles | Panne **silencieuse** : le dossier d'export est un montage lié vers le disque de l'hôte. Si un chemin disparaît ou passe en lecture seule, plus aucun fichier n'est écrit. |
| `syncFreshness` | L'âge de la dernière synchronisation réussie | Boucle de synchronisation **figée** dans un processus par ailleurs vivant : l'API répond, mais plus aucun document nouveau n'est détecté. |
| `monitoring` | Le service de surveillance tourne et dispose d'un moniteur par source active | Service de surveillance arrêté, ou source connectée qui n'est plus réellement surveillée. |

Chaque sonde s'exécute sous un **délai de garde de 2 secondes** : une dépendance
bloquée est signalée comme en panne plutôt que de bloquer l'endpoint lui-même.
L'état global correspond au **pire** état constaté parmi les trois sondes
(`ok` → `degraded` → `down`).

#### Pourquoi la sonde `exportPath` écrit réellement un fichier

Vérifier les droits avec `access(W_OK)` ne suffit pas, et l'expérience l'a montré
en conditions réelles. Le dossier d'export est un **montage lié** vers le disque
de l'hôte, et le conteneur tourne en `root` : les bits de permission peuvent
indiquer « inscriptible » alors que la couche de partage de fichiers de l'hôte
refuse l'écriture. L'appel `access` renvoyait donc un succès pendant que chaque
export échouait en `EACCES` — précisément la panne que cette sonde doit détecter.

La sonde crée donc un fichier témoin temporaire, puis le supprime. Seule une
écriture réelle dit la vérité. Un dossier de destination qui n'existe pas encore
n'est pas considéré comme une panne : il est créé au premier export.

### 3.2 Sondes d'infrastructure

Trois `healthcheck` Docker, qui surveillent la disponibilité des conteneurs.

| Conteneur | Test | Intervalle | Délai de démarrage |
|---|---|---|---|
| `backend` | `GET /api/health` | 30 s | 30 s (couvre les migrations de base au démarrage) |
| `frontend` | Page d'entrée servie par nginx | 30 s | 5 s |
| `redis` | `redis-cli ping` | 30 s | 5 s |

Ces sondes remplissent aussi un rôle d'**ordonnancement au démarrage** : grâce à
`depends_on: condition: service_healthy`, le backend attend que Redis accepte
réellement des connexions, et le frontend attend que l'API réponde — au lieu
d'attendre le simple démarrage du conteneur voisin.

### 3.3 Deux endpoints, deux rôles

| Endpoint | Rôle | Coût | Consommateur |
|---|---|---|---|
| `/api/health` | *Liveness* — le processus répond | Aucune E/S, réponse immédiate | `HEALTHCHECK` Docker |
| `/api/monitoring/health` | *Readiness* — la fonction métier est rendue | Accès disque, exécution des sondes | Uptime Kuma, interface |

Cette séparation évite un accès disque toutes les 30 secondes pour le seul besoin
du `healthcheck` Docker, tout en offrant au superviseur une vue approfondie.

---

## 4. Seuils et critères de qualité

Les seuils sont **relatifs à la configuration** de l'instance, et non figés : ils
se dérivent de `SYNC_INTERVAL_MINUTES` (15 minutes par défaut).

| Sonde | Dégradé | En panne | Justification |
|---|---|---|---|
| `syncFreshness` | > 2 × l'intervalle (30 min) | > 4 × l'intervalle (60 min) | Un cycle manqué peut venir d'une erreur temporaire de l'API Google ; plusieurs cycles consécutifs manqués signalent une boucle bloquée. |
| `exportPath` | — | Racine absente, ou racine / destination non inscriptible | Binaire : sans dossier inscriptible, aucun fichier n'atteint l'utilisateur. |
| `monitoring` | Moniteurs manquants pour certaines sources | Service arrêté | Un moniteur manquant dégrade sans mettre en panne : l'API et les fichiers déjà convertis restent accessibles, seuls les changements nouveaux passent inaperçus. |

### Distinction entre « dégradé » et « en panne »

L'endpoint ne renvoie **503 que sur l'état `down`** ; l'état `degraded` renvoie
`200`. Cette distinction est délibérée : un service dégradé continue de répondre et
de servir les fichiers déjà convertis, il a seulement cessé de détecter les
nouveautés. Confondre les deux reviendrait à déclencher une alerte de panne pour
une dégradation partielle, et à user la vigilance de l'équipe.

### Critères de performance

| Critère | Valeur visée |
|---|---|
| Temps de réponse de `/api/health` | < 100 ms (aucune E/S) |
| Temps de réponse de `/api/monitoring/health` | < 2 s (délai de garde par sonde) |
| Disponibilité visée de l'instance de référence | 99 % sur un mois glissant |
| Fraîcheur de la synchronisation | Dernière synchronisation < 30 min |

---

## 5. Modalité de signalement

### Configuration du moniteur dans Uptime Kuma

| Paramètre | Valeur | Pourquoi |
|---|---|---|
| Type de moniteur | HTTP(s) | Interroge l'endpoint et juge le code de statut |
| URL | `http://<hôte>:3000/api/monitoring/health` | Endpoint approfondi, pas la sonde de liveness |
| Intervalle | 60 s | Compromis entre réactivité et charge |
| Nouvelles tentatives avant alerte | **3** | Évite les fausses alertes sur un incident réseau passager : une alerte n'est émise qu'après 3 échecs consécutifs, soit environ 3 minutes d'indisponibilité réelle |
| Délai d'expiration de la requête | 10 s | Une réponse plus lente est traitée comme un échec |

Un code `503` (état `down`) ou l'absence de réponse déclenche donc une alerte après
trois échecs consécutifs.

### Détection de l'état dégradé

L'état `degraded` renvoyant `200`, un moniteur HTTP simple ne le détecte pas. Un
**second moniteur**, de type requête JSON, cible le champ `data.status` de la
réponse et signale toute valeur différente de `ok`. Les deux moniteurs se
répartissent ainsi les rôles :

- moniteur HTTP → **panne** (alerte immédiate, priorité haute) ;
- moniteur JSON → **dégradation** (alerte informative, à traiter en heures ouvrées).

### Canaux de notification

Les notifications sont envoyées par Uptime Kuma vers le canal configuré (Discord,
e-mail SMTP, ou tout autre connecteur pris en charge). Le message contient le nom
du moniteur, l'état, le code de retour et l'horodatage. Uptime Kuma notifie
également le **rétablissement**, ce qui permet de clore l'incident sans
vérification manuelle.

### Historisation

Uptime Kuma conserve l'historique des états, ce qui fournit le taux de
disponibilité sur 24 h, 30 jours et 1 an, ainsi que la chronologie des incidents.
Ces éléments alimentent le suivi de la qualité de service et la préparation des
axes d'amélioration.

---

## 6. Limites connues

- **Le superviseur partage l'hôte de l'application supervisée.** Une panne de la
  machine emporte les deux, et aucune alerte n'est émise. Les défaillances de
  l'application sont couvertes, celles de son hôte ne le sont pas. Lever cette
  limite suppose d'héberger Uptime Kuma sur une machine distincte (voir § 1).
- **Docker Compose ne redémarre pas un conteneur `unhealthy`.** Les `healthcheck`
  apportent de l'observabilité et de l'ordonnancement au démarrage, pas de
  l'auto-réparation. La politique `restart: unless-stopped` ne couvre que les
  arrêts du processus, pas un processus vivant mais défaillant.
- **Les instances auto-hébergées par les utilisateurs ne sont pas supervisées à
  distance**, par choix (voir le périmètre). Elles disposent en revanche des
  `healthcheck` locaux et de l'endpoint de santé, qu'un utilisateur averti peut
  brancher sur sa propre supervision.
- **La sonde `exportPath` écrit un fichier témoin à chaque appel.** C'est le prix de
  la fiabilité sur un montage lié (voir § 3.1). Le fichier est immédiatement
  supprimé, mais l'endpoint approfondi n'est donc pas totalement sans effet de bord.
- **La sonde `syncFreshness` ne distingue pas** une absence de changement à
  synchroniser d'une boucle bloquée : elle mesure la date de la dernière
  synchronisation réussie, laquelle avance à chaque cycle même sans document
  modifié. Un cycle qui échoue silencieusement côté API Google resterait donc
  visible, mais un cycle qui n'est jamais déclenché l'est tout autant.
