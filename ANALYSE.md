# Analyse & axes d'amélioration — console-ictneo

> Analyse réalisée le 2026-07-02 lors de la migration du dossier `console/`
> depuis le repo `cloud-ictneo` vers ce repo dédié (historique git préservé,
> 26 commits).

## 1. Vue d'ensemble

Dashboard de gestion Kubernetes centralisé :

- Provisionnement de clusters locaux **kind**
- Pilotage de clusters K8s **externes** (enregistrement via blob base64 :
  server + CA + token)
- CRUD namespaces, exploration de 17 kinds de ressources (get / describe /
  delete / logs / exec)
- **Helm** : gestion de repos, install / upgrade / uninstall de releases,
  génération de charts complets (Helm Builder)
- Génération de manifests K8s bruts (Resource Forge) et de scripts de
  bootstrap kubeadm (Debian/RHEL)
- Exécution SSH sur des nodes d'infrastructure (Paramiko — modes agent /
  clé / mot de passe)

### Architecture

```
Frontend  React 19 + Vite 8 + TypeScript + Zustand          [5173 dev]
                     │ HTTP/REST (fetch typé)
Backend   FastAPI ≥0.115 + Uvicorn                          [8765]
    ├─ DB        : SQLite + SQLModel (ORM)
    ├─ CLI       : kind v0.31.0, kubectl, helm v3.16.1 (subprocess argv)
    ├─ SSH       : Paramiko ≥3.5
    └─ Templates : Jinja2 (kubeconfig, scripts bootstrap)
Docker    multi-stage (node:20-alpine → python:3.12-slim)
```

## 2. Points forts

- Code clair et bien structuré (séparation `api/` / `services/` / `models/`)
- **Aucune injection SQL** — tout passe par l'ORM SQLModel
- **Aucun `shell=True`** — tous les subprocess utilisent des listes argv ;
  l'exec dans un pod passe par `shlex.split()` (`services/kubectl.py:115`)
- YAML manipulé exclusivement via `yaml.safe_load` / `safe_dump`
- Validation RFC 1123 sur les noms de clusters (`services/cluster_ctx.py:33`)
  et de namespaces (`api/namespaces.py:12`)
- Versions kubectl/helm épinglées dans le Dockerfile, build multi-stage
- `docker-compose.yml` bindé sur `127.0.0.1` uniquement
- Client API frontend entièrement typé, vérification `res.ok` systématique
- Le README documente honnêtement les limites de sécurité (dev-only)

## 3. Risques identifiés

| # | Risque | Sévérité | Localisation |
|---|--------|----------|--------------|
| 1 | **Aucune authentification / autorisation** sur l'API | Haute (si exposé) | `app/main.py` — toutes les routes |
| 2 | **Mots de passe SSH en clair dans SQLite** | Haute | `models/node.py:14`, utilisés `services/ssh_runner.py:66` |
| 3 | **Conteneur exécuté en root** (pas de `USER`) | Haute | `Dockerfile` |
| 4 | Kubeconfigs (tokens bearer) en clair sur disque, chmod 0600 inopérant sous Windows/NTFS | Moyenne | `services/external_cluster.py:57-69` |
| 5 | CORS wildcard `allow_origins=["*"]` + credentials | Moyenne | `app/main.py:26-32` |
| 6 | Commande SSH non validée côté API (Paramiko `exec_command` sans parsing) | Moyenne | `api/nodes.py:118-127` → `ssh_runner.py:102` |
| 7 | Params URL `cluster`/`namespace`/`kind`/`name` non validés RFC 1123 sur les routes k8s (kubectl valide en aval, mais pas de défense en profondeur) | Moyenne | `api/k8s.py` |
| 8 | Routes **synchrones bloquantes** : `kind create cluster` (timeout 600 s) bloque un worker Uvicorn pendant toute la création | Moyenne | `api/clusters.py`, `services/kind_manager.py:25` |
| 9 | URL de repo Helm non validée (format/HTTPS) | Faible | `api/releases.py:44-51` |
| 10 | SQLite avec `check_same_thread=False` — verrouillage grossier sous charge | Faible | `app/db.py:13` |
| 11 | **Aucun test, aucun lint backend, aucune CI** | — | tout le repo |
| 12 | Pas de healthcheck Docker, pas de limites de ressources | Faible | `Dockerfile`, `docker-compose.yml` |

Le contexte « dashboard de dev local, bindé sur 127.0.0.1 » rend les points
1, 2, 4 et 5 acceptables *aujourd'hui* — mais chacun devient critique dès que
l'app est exposée au-delà de localhost.

## 4. Axes d'amélioration

### Court terme (hygiène, < 1 jour)

1. **Dockerfile non-root** : créer un user dédié (`RUN useradd -r console` +
   `USER console`) et ajouter un `HEALTHCHECK` sur `/api/health`.
2. **Défense en profondeur sur les routes k8s** : réutiliser le validateur
   RFC 1123 existant (`cluster_ctx.py`) comme dépendance FastAPI sur
   `cluster`, `namespace`, `kind`, `name`.
3. **Valider l'URL des repos Helm** (schéma `https://`, pas d'espace) avant
   `helm repo add`.
4. **Lint backend** : ajouter `ruff` (+ `ruff format`) et un
   `pyproject.toml` ; le frontend a déjà ESLint.
5. Ne plus jamais committer `data/` (fait lors de cette migration :
   `data/console.db` retiré du suivi, `.gitignore` étendu).

### Moyen terme (robustesse, ~1 semaine)

6. **Passer les routes longues en async** : `kind create` / `helm install`
   via `run_in_executor` ou `anyio.to_thread`, idéalement avec un modèle
   job (POST retourne un job-id, GET pour poller le statut) — évite les
   timeouts HTTP et les workers bloqués 10 minutes.
7. **Chiffrer les secrets au repos** : chiffrement symétrique
   (`cryptography.fernet`) des mots de passe SSH et des kubeconfigs, clé
   fournie par variable d'environnement — ou mieux, supprimer le mode
   `password` et n'accepter que agent/clé.
8. **Tests** : pytest sur les services purs (générateurs de manifests,
   bootstrap, helm chart builder — 100 % déterministes donc faciles à
   tester), + tests API avec `TestClient` et subprocess mockés.
9. **CI GitHub Actions** : lint (ruff + eslint) → tests → build Docker.
10. **Gestion d'erreurs frontend** : ajouter un Error Boundary global et un
    toast pour les erreurs API (actuellement chaque page gère seule).

### Long terme (production-ready)

11. **Authentification** : middleware OIDC (Zitadel est déjà l'IDP de la
    plateforme ICTNeo) ou déploiement derrière Teleport App Access —
    prérequis absolu avant toute exposition réseau.
12. **CORS restreint** à l'origine du frontend, piloté par variable
    d'environnement.
13. **Migrations DB** : remplacer le `ALTER TABLE` ad-hoc de `db.py` par
    Alembic ; envisager PostgreSQL si multi-utilisateur.
14. **Rate limiting / audit log** sur les endpoints sensibles (exec SSH,
    exec pod, delete ressource).
15. **Streaming des logs** : `kubectl logs -f` et sortie des commandes
    longues via WebSocket/SSE plutôt que réponse bloquante.

## 5. Verdict

**6,5 / 10 en l'état** — très bon socle de dashboard de dev : architecture
propre, pas de vulnérabilité d'injection, subprocess bien maîtrisés. Les
manques sont ceux d'un outil local assumé : pas d'auth, secrets en clair,
zéro test, conteneur root. Les axes court terme (1-5) sont peu coûteux et
à faire immédiatement ; les axes 6-10 rendent l'outil fiable en équipe ;
les axes 11-15 sont le prix d'une éventuelle mise en production.
