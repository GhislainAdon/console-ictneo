import json
import re
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.services.kind_manager import _run

router = APIRouter(prefix="/api/clusters/{cluster}/namespaces", tags=["namespaces"])

# Kubernetes namespace name rules (RFC 1123): lowercase alphanumeric or '-', must
# start and end with alphanumeric, 1..63 chars.
NAMESPACE_RE = re.compile(r"^[a-z0-9]([-a-z0-9]{0,61}[a-z0-9])?$")


class NamespaceCreate(BaseModel):
    name: str


def _context(cluster: str) -> str:
    # kind clusters are exposed as "kind-<name>". Accept either form.
    return cluster if cluster.startswith("kind-") else f"kind-{cluster}"


@router.get("")
def list_namespaces(cluster: str):
    ctx = _context(cluster)
    res = _run(["kubectl", "--context", ctx, "get", "namespaces", "-o", "json"])
    if not res.ok:
        raise HTTPException(status_code=502, detail=res.stderr or "kubectl failed")
    try:
        data = json.loads(res.stdout)
    except json.JSONDecodeError:
        raise HTTPException(status_code=502, detail="Failed to parse kubectl output")
    return {
        "namespaces": [
            {
                "name": item["metadata"]["name"],
                "status": item["status"]["phase"],
                "created_at": item["metadata"].get("creationTimestamp"),
            }
            for item in data.get("items", [])
        ]
    }


@router.post("", status_code=201)
def create_namespace(cluster: str, payload: NamespaceCreate):
    if not NAMESPACE_RE.match(payload.name):
        raise HTTPException(
            status_code=400,
            detail="Namespace name must match RFC 1123 (lowercase, alphanumeric, '-', 1..63 chars)",
        )
    ctx = _context(cluster)
    res = _run(["kubectl", "--context", ctx, "create", "namespace", payload.name])
    if not res.ok:
        status = 409 if "already exists" in res.stderr.lower() else 502
        raise HTTPException(status_code=status, detail=res.stderr or "kubectl failed")
    return {"name": payload.name, "status": "Active"}


@router.delete("/{name}", status_code=204)
def delete_namespace(cluster: str, name: str):
    if name in {"default", "kube-system", "kube-public", "kube-node-lease"}:
        raise HTTPException(status_code=400, detail=f"Refusing to delete protected namespace '{name}'")
    ctx = _context(cluster)
    res = _run(
        ["kubectl", "--context", ctx, "delete", "namespace", name, "--wait=false"],
        timeout=60,
    )
    if not res.ok:
        status = 404 if "not found" in res.stderr.lower() else 502
        raise HTTPException(status_code=status, detail=res.stderr or "kubectl failed")
    return None
