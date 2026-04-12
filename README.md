# cloud-ictneo · Command Console

Futuristic sci-fi dashboard that turns the `cloud-ictneo` installer into a
multi-project Kubernetes generator: create / list / delete projects, pick a
Kubernetes version, toggle addons, choose a cert provider, forge raw K8s
resources, and export a full Helm chart with `values-dev.yaml`,
`values-test.yaml` and `values-prod.yaml`.

## Stack

| Layer    | Tech                                           |
| -------- | ---------------------------------------------- |
| Backend  | FastAPI, SQLModel, SQLite, PyYAML              |
| Frontend | React + Vite + TypeScript, Framer Motion       |
| Local K8s| [kind](https://kind.sigs.k8s.io) over Docker   |

The backend lives in [backend/](backend/), the frontend in [frontend/](frontend/).

## Features

- **Projects** — CRUD from a sci-fi form. Each project holds its K8s version,
  cert provider, domain, and enabled addons.
- **Addons Matrix** — all addons from [../add-ons/](../add-ons/) exposed as
  toggleable tiles grouped by category (security, network, storage, gitops,
  registry, devops, iam, access, observability, data).
- **Cert Provider** — pick `Let's Encrypt` (ACME) or `Cloudflare Origin CA`.
- **K8s Versions** — 1.29 → 1.34 selectable per project.
- **Resource Forge** — generate Deployment, StatefulSet, DaemonSet, Service,
  Ingress, ConfigMap, Secret, PVC, Job, CronJob, HPA, NetworkPolicy,
  ServiceAccount, Role, RoleBinding. Copy to clipboard.
- **Helm Builder** — generates a complete chart (Chart.yaml, templates,
  \_helpers.tpl, values.yaml + dev/test/prod overrides) and ships it as a
  downloadable `.zip`.
- **Cluster Ops** — provisions a local `kind` cluster per project using the
  selected K8s version, stores the cluster name on the project, and lets you
  tear it down again. Falls back gracefully when Docker / kind are offline.

## Run

```bash
# from the repo root
cd console
./start.sh
```

Then open <http://127.0.0.1:5173/>.

### Manual

```bash
# backend
cd backend
python -m venv .venv
PYO3_USE_ABI3_FORWARD_COMPATIBILITY=1 .venv/Scripts/python -m pip install -r requirements.txt
.venv/Scripts/python -m uvicorn app.main:app --host 127.0.0.1 --port 8765

# frontend (separate shell)
cd frontend
npm install
npm run dev
```

## Requirements

- Python 3.10+ (tested with 3.14 — requires `PYO3_USE_ABI3_FORWARD_COMPATIBILITY=1`)
- Node.js 18+
- Docker Desktop (optional — for the "Provision Kind Cluster" feature)
- `kind` in `$PATH` (optional — same reason)

## API

| Method   | Path                            | Notes                              |
| -------- | ------------------------------- | ---------------------------------- |
| GET      | `/api/health`                   | liveness                           |
| GET      | `/api/catalog/k8s-versions`     | available K8s versions             |
| GET      | `/api/catalog/cert-providers`   | letsencrypt · cloudflare           |
| GET      | `/api/catalog/addons`           | full addons catalog                |
| GET      | `/api/catalog/resources`        | resource kinds supported by Forge  |
| GET      | `/api/projects`                 | list                               |
| POST     | `/api/projects`                 | create                             |
| GET      | `/api/projects/{id}`            | read                               |
| PATCH    | `/api/projects/{id}`            | update                             |
| DELETE   | `/api/projects/{id}`            | remove                             |
| POST     | `/api/generate/helm/preview`    | returns map of filename → content  |
| POST     | `/api/generate/helm/download`   | streams a chart `.zip`             |
| POST     | `/api/generate/resource`        | returns one manifest as YAML       |
| GET      | `/api/clusters/health`          | docker + kind availability         |
| GET      | `/api/clusters`                 | list kind clusters                 |
| POST     | `/api/clusters`                 | create kind cluster                |
| DELETE   | `/api/clusters/{name}`          | delete kind cluster                |

## Data

SQLite file at `backend/data/console.db`. Delete it to reset all projects.
