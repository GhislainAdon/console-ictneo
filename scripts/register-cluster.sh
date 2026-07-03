#!/usr/bin/env bash
# console-ictneo — register-cluster.sh
#
# Run this script against a Kubernetes cluster you want to attach to the
# console-ictneo console. It creates a dedicated ServiceAccount with a chosen
# RBAC level, extracts the credentials, and prints a single base64 JSON
# blob that the console will accept on its "Register external cluster"
# screen.
#
# Requirements (on the machine running this script):
#   - kubectl configured and pointing at the target cluster
#   - cluster-admin permissions on that cluster (one-time setup)
#
# Usage:
#   bash register-cluster.sh                    # defaults to --role view
#   bash register-cluster.sh --role view        # read-only
#   bash register-cluster.sh --role edit        # read/write on most kinds
#   bash register-cluster.sh --role admin       # cluster-admin
#
# Idempotent — re-running rotates the token.

set -euo pipefail

ROLE="view"
while [[ $# -gt 0 ]]; do
  case "$1" in
    --role)
      ROLE="${2:-}"
      shift 2
      ;;
    --role=*)
      ROLE="${1#--role=}"
      shift
      ;;
    -h|--help)
      sed -n '2,22p' "$0"
      exit 0
      ;;
    *)
      echo "unknown flag: $1" >&2
      exit 2
      ;;
  esac
done

case "$ROLE" in
  view)  CLUSTER_ROLE="view" ;;
  edit)  CLUSTER_ROLE="edit" ;;
  admin) CLUSTER_ROLE="cluster-admin" ;;
  *)
    echo "invalid --role '$ROLE' (expected: view|edit|admin)" >&2
    exit 2
    ;;
esac

NS="console-ictneo"
SA="console-pilot"
CRB="console-pilot-${ROLE}"
SECRET="console-pilot-token"

echo "[1/6] Ensuring namespace ${NS}..." >&2
kubectl create namespace "${NS}" --dry-run=client -o yaml | kubectl apply -f - >/dev/null

echo "[2/6] Ensuring ServiceAccount ${SA}..." >&2
kubectl apply -f - >/dev/null <<EOF
apiVersion: v1
kind: ServiceAccount
metadata:
  name: ${SA}
  namespace: ${NS}
EOF

echo "[3/6] Dropping any previous ClusterRoleBindings for ${SA}..." >&2
# Dropping old bindings lets the caller change the role on re-run.
kubectl get clusterrolebinding -o json \
  | awk 'BEGIN{RS="},"}/console-pilot-[a-z]+/{print}' >/dev/null 2>&1 || true
for role in view edit admin; do
  kubectl delete clusterrolebinding "console-pilot-${role}" --ignore-not-found=true >/dev/null
done

echo "[4/6] Creating ClusterRoleBinding ${CRB} → ${CLUSTER_ROLE}..." >&2
kubectl apply -f - >/dev/null <<EOF
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRoleBinding
metadata:
  name: ${CRB}
roleRef:
  apiGroup: rbac.authorization.k8s.io
  kind: ClusterRole
  name: ${CLUSTER_ROLE}
subjects:
  - kind: ServiceAccount
    name: ${SA}
    namespace: ${NS}
EOF

echo "[5/6] Provisioning long-lived token Secret..." >&2
# On K8s >= 1.24 SA tokens are no longer auto-created, so we attach an
# explicit kubernetes.io/service-account-token Secret.
kubectl apply -f - >/dev/null <<EOF
apiVersion: v1
kind: Secret
metadata:
  name: ${SECRET}
  namespace: ${NS}
  annotations:
    kubernetes.io/service-account.name: ${SA}
type: kubernetes.io/service-account-token
EOF

# Wait until the controller fills in .data.token (up to 30s).
for i in $(seq 1 30); do
  TOKEN_B64="$(kubectl -n "${NS}" get secret "${SECRET}" -o jsonpath='{.data.token}' 2>/dev/null || true)"
  if [[ -n "${TOKEN_B64}" ]]; then
    break
  fi
  sleep 1
done
if [[ -z "${TOKEN_B64}" ]]; then
  echo "error: timed out waiting for SA token on Secret ${NS}/${SECRET}" >&2
  exit 1
fi

CA_B64="$(kubectl -n "${NS}" get secret "${SECRET}" -o jsonpath='{.data.ca\.crt}')"
TOKEN="$(echo "${TOKEN_B64}" | base64 -d 2>/dev/null || echo "${TOKEN_B64}" | base64 --decode)"

SERVER="$(kubectl config view --raw --minify -o jsonpath='{.clusters[0].cluster.server}')"

if [[ -z "${SERVER}" || -z "${CA_B64}" || -z "${TOKEN}" ]]; then
  echo "error: missing one of server/ca/token; refusing to emit partial payload" >&2
  exit 1
fi

echo "[6/6] Done. Paste the string below into the console:" >&2
echo >&2
echo "----- BEGIN CONSOLE-ICTNEO PAYLOAD -----" >&2

# Portable base64 (GNU and BSD/macOS): strip newlines with tr.
printf '{"server":"%s","ca_cert_b64":"%s","token":"%s"}' \
  "${SERVER}" "${CA_B64}" "${TOKEN}" \
  | base64 | tr -d '\n'
echo

echo "----- END CONSOLE-ICTNEO PAYLOAD -----" >&2
echo "Role granted: ${ROLE} (ClusterRole: ${CLUSTER_ROLE})" >&2
