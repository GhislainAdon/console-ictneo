# console-ictneo: detailed usage guide

Futuristic sci-fi standalone dashboard (extracted from `cloud-ictneo`) that lets you run
multiple Kubernetes projects from one place: declare target servers,
spin up local test clusters, manage namespaces, install Helm charts from
any upstream repo, explore running resources, and exec into pods or
into the servers themselves.

## Install

### Which mode should I pick?

The console has two runtime modes. They are mutually exclusive — pick the
one that matches the cluster you want to pilot.

| What you want to do                                             | Mode to use     | Command                       |
| --------------------------------------------------------------- | --------------- | ----------------------------- |
| Provision a new local `kind` cluster and work on it             | **Host**        | `./start.sh`    |
| Pilot Docker Desktop's built-in Kubernetes                      | **Host**        | `./start.sh`    |
| Pilot a remote cluster (VPS / cloud / LAN) with a public API    | **Docker**      | `./deploy.sh`   |
| Pilot a remote cluster through Teleport / VPN / tunnel          | **Either**      | —                             |

**Rule of thumb:** if the cluster's API-server is reachable via `127.0.0.1`
or `kubernetes.docker.internal` (anything that only exists on your laptop),
use **Host mode**. The console container can't reach those hostnames from
inside Docker Desktop's VM. See [Piloting Docker Desktop's Kubernetes from
Docker mode](#piloting-docker-desktops-kubernetes-from-docker-mode) for
the workaround if you really need both.

### Prerequisites

| Tool           | Needed by mode | Purpose                         | Install                                          |
| -------------- | -------------- | ------------------------------- | ------------------------------------------------ |
| Docker Desktop | both           | Docker daemon (host mode uses it for `kind`; Docker mode runs the container) | <https://www.docker.com/products/docker-desktop/> |
| Python 3.10+   | host only      | backend                         | `scoop install python` (tested on 3.14)          |
| Node.js 18+    | host only      | frontend (Vite dev)             | `scoop install nodejs-lts`                       |
| `kind`         | host only      | local test clusters             | `scoop install kind` (v0.31+)                    |
| `kubectl`      | host only      | Resource Explorer + Helm Manager| `scoop install kubectl`                          |
| `helm`         | host only      | Helm Manager + Helm Builder     | `scoop install helm`                             |

In Docker mode everything (`kubectl`, `helm`, the Python runtime) is baked
into the image, so the only host requirement is Docker Desktop itself.

### Mode A — Host (full-featured)

```bash
./start.sh
```

`start.sh` creates the Python venv, installs backend deps (with the
`PYO3_USE_ABI3_FORWARD_COMPATIBILITY=1` flag PyO3 needs on Python 3.14),
installs frontend deps, then launches:

- backend: <http://127.0.0.1:8765>
- frontend: <http://127.0.0.1:5173>

Open the frontend URL in a browser.

**What works in this mode:**

- ✅ Provision new local `kind` clusters from the UI
- ✅ Pilot Docker Desktop's Kubernetes (use context `docker-desktop`)
- ✅ Register and pilot remote external clusters
- ✅ SSH to target nodes (uses the host's `ssh-agent` / `~/.ssh/config`)

Stop with `Ctrl-C`. State (SQLite + kubeconfigs) is in
`backend/data/`.

### Mode B — Docker (pilot-only)

```bash
./deploy.sh
```

A single container serves both backend and the built frontend at
<http://127.0.0.1:8765>. The container **does not** ship `kind` or
`docker`, so it cannot provision new local clusters — it can only register
and pilot external clusters whose API-server is reachable from inside the
Docker Desktop VM.

| Command                           | What it does                   |
| --------------------------------- | ------------------------------ |
| `./deploy.sh` or `./deploy.sh up` | Build + start the container    |
| `./deploy.sh logs`                | Follow container logs          |
| `./deploy.sh ps`                  | Container status               |
| `./deploy.sh down`                | Stop and remove the container  |

**What works in this mode:**

- ❌ `kind` (missing from the image — by design)
- ❌ Docker Desktop's own Kubernetes (`127.0.0.1:6443` /
  `kubernetes.docker.internal` are not reachable from inside the container)
- ✅ Any remote cluster reachable from the Docker Desktop VM — a public
  or LAN-accessible API-server, a Teleport tunnel, a VPN-mapped IP, …

State (SQLite + kubeconfigs) is persisted on the host in `data/`
via a bind mount. Delete that directory to reset everything.

#### Piloting Docker Desktop's Kubernetes from Docker mode

If for some reason you cannot use host mode but still want to pilot Docker
Desktop's Kubernetes from a containerised console, rewrite the server URL
before pasting the payload:

```bash
bash scripts/register-cluster.sh --role admin \
  | base64 -d \
  | sed 's|kubernetes.docker.internal|host.docker.internal|; s|127.0.0.1|host.docker.internal|' \
  | base64 | tr -d '\n'
```

`host.docker.internal` is a Docker-Desktop-provided DNS name that resolves
to the host from inside any container. This is a workaround — host mode is
still the recommended path for Docker Desktop K8s.

### Switching modes

The two modes share no state, but they do both bind `127.0.0.1:8765`, so
only one can run at a time.

```bash
# Docker → Host
./deploy.sh down && ./start.sh

# Host → Docker
# (Ctrl-C the host process first, then:)
./deploy.sh
```

Registered external clusters live in different directories per mode
(`backend/data/kubeconfigs/` vs `data/kubeconfigs/`), so you'll re-register
if you switch. Local kind clusters are owned by the Docker daemon directly
and are visible from host mode only.

### Manual (for debugging)

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

## Usage

The sidebar drives everything. Pages are ordered top-to-bottom along the
typical provisioning flow.

### 1. Projects

Create and select a project. Each project holds:

- a **K8s version** (1.31..1.35, matched to the kind node images shipped
  by kind v0.31)
- a **cert provider** (`letsencrypt` or `cloudflare` origin CA)
- a **domain**
- an **addons matrix** (~16 addons, organised by category)
- a **target nodes** list (see below)
- a **Helm releases** list (see below)

Projects are stored in SQLite under `backend/data/console.db`.
Delete the file to reset everything.

#### Target Nodes

Once a project is selected, a **Target Nodes** panel appears below the
project fleet. Each node records:

| Field       | Values                                                                |
| ----------- | --------------------------------------------------------------------- |
| hostname    | unique within the project                                             |
| address     | IP or FQDN (blank = same as hostname)                                 |
| role        | `control-plane` or `worker`                                           |
| os_family   | `debian` (Ubuntu / Debian) or `redhat` (RHEL / Rocky / Alma / CentOS) |
| ssh_user    | default `root`                                                        |
| ssh_port    | default `22`                                                          |
| ssh_auth    | `agent` (pre-configured), `password`, or `key`                        |
| labels      | free-form comma-separated                                             |

**SSH auth modes**

- **agent** — no credentials are stored. The console uses the
  `ssh-agent` / `~/.ssh/config` of the host it runs on. Use this when
  you already have passwordless SSH set up.
- **password** — stored in SQLite, **redacted to `***` on every read**
  through the API. The raw value is only used to open the SSH connection.
- **key** — path to a private key file on the console host. Ed25519,
  ECDSA, and RSA are auto-detected.

Each node tile has two actions:

- **⤓ BOOTSTRAP** downloads a generated `bootstrap-<hostname>.sh`
  idempotent shell script that installs containerd + kubelet / kubeadm /
  kubectl pinned to the project's K8s version. It picks `apt` for debian
  targets and `dnf` + **EPEL** + docker-ce + kubernetes repos for redhat
  targets, tunes kernel modules / sysctl / swap, switches SELinux to
  permissive on RHEL, and opens the control-plane firewall ports if
  firewalld is active. Run it on the node (as a user with sudo).
- **▾ TERMINAL** expands an inline one-shot command runner. Type any
  shell command, hit Enter, and it is SSH-executed on the node using
  the auth mode you configured. Output + exit code are shown below.
  This is deliberately **not** an interactive PTY — for a real shell,
  use your own terminal.

### 2. Clusters

Configure the K8s version, cert provider, domain, and addons, then either
provision a local `kind` cluster with one click **or** register an existing
external cluster (see [Piloting an existing
cluster](#piloting-an-existing-cluster)). The page shows a unified table:
one row per cluster with a `source` badge (`kind` or `external`), the
detected K8s version, the API-server URL, and **Attach / Remove** actions.

Once a cluster is attached to the selected project, a **Namespaces** panel
appears below the launch sequence: list, create (RFC 1123 validated), and
delete namespaces in that cluster. The four system namespaces
(`default`, `kube-system`, `kube-public`, `kube-node-lease`) are refused
by name.

#### Piloting an existing cluster

The console can manage any Kubernetes cluster it can reach over the
network. Registration uses a one-shot ServiceAccount + ClusterRoleBinding
created on the target cluster; no credentials leave the cluster admin's
machine except a scoped bearer token.

1. In the UI, click **+ Register External** on the Clusters page.
2. Download `register-cluster.sh` from the drawer (or grab it from
   [scripts/register-cluster.sh](../scripts/register-cluster.sh)) and
   hand it to someone with `cluster-admin` on the target cluster.
3. They run it, picking the RBAC level they're comfortable granting:

   ```bash
   bash register-cluster.sh --role view    # read-only (default)
   bash register-cluster.sh --role edit    # read/write on most kinds
   bash register-cluster.sh --role admin   # cluster-admin
   ```

   The script creates namespace `console-ictneo`, ServiceAccount
   `console-pilot`, a ClusterRoleBinding at the chosen level, and a
   long-lived token Secret. It prints a single-line base64 blob.
4. Copy that blob into the drawer's **Base64 payload** field, give the
   cluster a display name, click **Register**.
5. The backend writes a minimal kubeconfig to
   `data/kubeconfigs/<name>.yaml` (mode `0600`), probes the cluster to
   detect its K8s version, and stores the row.
6. Optionally attach the new cluster to the current project — Resource
   Explorer, Helm Manager, and Namespaces now target it.

Revocation: on the target cluster, `kubectl delete sa console-pilot -n
console-ictneo` (or the matching ClusterRoleBinding) cuts access.
Re-running the script rotates the token.

Reachability: the console must be able to hit the cluster's API-server
directly. Behind NAT, use a VPN, Teleport, or an IP allowlist.

### 3. Resource Explorer

Once a project has an attached cluster, pick a namespace and a kind
(16 kinds supported: deployment, statefulset, daemonset, replicaset,
pod, service, ingress, configmap, secret, pvc, job, cronjob, hpa,
networkpolicy, serviceaccount, role, rolebinding) and see the live
list.

Per-item actions:

- click a row to **describe** it (full YAML on the right)
- **+ / −** scale deployments up/down one replica at a time (JSON merge patch)
- **DELETE** removes the resource (`kubectl delete --wait=false`)
- on pods, a one-shot **Exec** runner lets you type a command and see
  stdout + stderr + exit code

### 4. Resource Forge

Generate a single raw Kubernetes manifest from a form. Fifteen kinds
are supported. Copy-to-clipboard for pasting into `kubectl apply`.
Use this for quick one-off manifests.

### 5. Helm Builder

Generate a **brand-new Helm chart** from scratch for a project.
Produces `Chart.yaml`, `_helpers.tpl`, `deployment.yaml`, `service.yaml`,
`ingress.yaml`, `hpa.yaml`, `serviceaccount.yaml`, `configmap.yaml`,
plus `values.yaml` and per-env overrides `values-dev.yaml`,
`values-test.yaml`, `values-prod.yaml`. Inspect the tree in the browser
or download the whole chart as a `.zip`.

### 6. Helm Manager

Install and manage Helm releases from **any upstream repo** (bitnami,
jetstack, prometheus-community, your private registry, ...). Flow:

1. **Add a repo** (name + URL). The console runs `helm repo add` and
   `helm repo update` for you.
2. **Fill a draft release**: name, repo, chart, version, cluster,
   namespace. The cluster defaults to the one attached to the selected
   project.
3. Click **⤓ Load default values** to fetch the chart's `values.yaml`
   into the textarea.
4. Edit the textarea to override what you want (supports flat and
   nested YAML — `key: value` and 2-space indented maps).
5. **▸ Save Release** stores the draft in SQLite.
6. **▸ DEPLOY / UPGRADE** runs `helm upgrade --install` with your
   override against the configured context/namespace. The same button
   handles the initial install and later upgrades — the backend always
   uses `--install` so it's idempotent.
7. **⏹ UNINSTALL** runs `helm uninstall`.
8. **DELETE** removes the release record (does not uninstall from the
   cluster — use UNINSTALL first).

Statuses flow `draft → deployed → uninstalled`, or `failed` if the last
deploy/upgrade errored.

## API

All endpoints live under `/api`. Full OpenAPI schema at
<http://127.0.0.1:8765/docs>.

| Area           | Routes                                                                 |
| -------------- | ---------------------------------------------------------------------- |
| Projects       | `GET/POST /projects`, `GET/PATCH/DELETE /projects/{id}`                |
| Nodes          | `GET/POST /projects/{id}/nodes`, `DELETE /projects/{id}/nodes/{nid}`   |
| Node bootstrap | `GET /projects/{id}/nodes/{nid}/bootstrap.sh`                          |
| Node exec      | `POST /projects/{id}/nodes/{nid}/exec`                                 |
| Catalog        | `/catalog/{k8s-versions,cert-providers,addons,resources}`              |
| Clusters       | `/clusters` CRUD + `/clusters/health`                                  |
| Namespaces     | `/clusters/{name}/namespaces` CRUD                                     |
| Helm repos     | `GET/POST /helm/repos`, `POST /helm/values`, `POST /helm/chart`        |
| Releases       | `/projects/{id}/releases`, `/releases/{id}{,/deploy,/uninstall,/status}` |
| Generators     | `POST /generate/resource`, `POST /generate/helm/{preview,download}`    |
| kubectl        | `GET /k8s/{cluster}/{ns}/{kind}[/{name}]`, `DELETE`, `.../patch`, `.../exec`, `.../logs` |

## Data

SQLite file at `backend/data/console.db`. Forward-only column additions
run on every startup from `app/db.py::_COLUMN_ADDITIONS` so the dev DB
rolls forward without Alembic.

## Security notes

- SSH passwords are stored in SQLite **in clear text**. This is a local
  dev dashboard, not a production secret store. Prefer `agent` or `key`
  modes wherever possible.
- Delete `backend/data/console.db` to wipe everything.
- The backend binds to `127.0.0.1` by default — do not expose it without
  adding auth in front.
