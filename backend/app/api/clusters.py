from pathlib import Path

from fastapi import APIRouter, HTTPException
from fastapi.responses import PlainTextResponse
from pydantic import BaseModel
from sqlmodel import Session

from app.db import engine
from app.models.cluster import Cluster
from app.services import cluster_ctx, external_cluster, kind_manager

router = APIRouter(prefix="/api/clusters", tags=["clusters"])

# The script lives at different paths depending on deployment mode:
#   - Host/dev   : <repo-root>/scripts/register-cluster.sh
#                  (app/api/clusters.py → app/api → app → backend → console → <root>)
#   - Container  : /app/scripts/register-cluster.sh (copied by Dockerfile)
_here = Path(__file__).resolve()
_REGISTER_SCRIPT_CANDIDATES = [
    _here.parents[4] / "scripts" / "register-cluster.sh" if len(_here.parents) > 4 else None,
    Path("/app/scripts/register-cluster.sh"),
]


def _resolve_register_script() -> Path | None:
    for candidate in _REGISTER_SCRIPT_CANDIDATES:
        if candidate is not None and candidate.exists():
            return candidate
    return None


class CreateClusterRequest(BaseModel):
    name: str
    k8s_version: str = "1.34"


class RegisterExternalRequest(BaseModel):
    name: str
    payload: str  # base64 blob from register-cluster.sh


@router.get("/health")
def health():
    return {
        "docker": kind_manager.docker_available(),
        "kind": kind_manager.kind_available(),
    }


@router.get("")
def list_clusters():
    return {"clusters": cluster_ctx.list_all()}


@router.post("", status_code=202)
def create_cluster(payload: CreateClusterRequest):
    try:
        cluster_ctx.validate_cluster_name(payload.name)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    if not kind_manager.kind_available():
        raise HTTPException(status_code=503, detail="kind CLI not installed")
    if not kind_manager.docker_available():
        raise HTTPException(status_code=503, detail="Docker daemon not reachable")
    result = kind_manager.create_cluster(payload.name, payload.k8s_version)
    if result.ok:
        # Insert the kind row so cluster_args() picks it up immediately.
        with Session(engine) as session:
            existing = cluster_ctx.get(payload.name)
            if existing is None:
                session.add(
                    Cluster(
                        name=payload.name,
                        source="kind",
                        k8s_version=payload.k8s_version,
                    )
                )
                session.commit()
    return {
        "ok": result.ok,
        "stdout": result.stdout,
        "stderr": result.stderr,
    }


@router.post("/external", status_code=201)
def register_external(body: RegisterExternalRequest):
    try:
        row = external_cluster.register(body.name, body.payload)
    except external_cluster.ClusterNameConflict as exc:
        # UNIQUE constraint is the single source of truth for name collisions.
        # No pre-check — pre-check was racy and left orphan kubeconfig files.
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    except ValueError as exc:
        # Bad name / bad base64 / bad JSON / missing keys — all client errors.
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(
            status_code=400,
            detail=(
                f"cluster unreachable or kubectl verify failed: {exc}. "
                "Check that the console can reach the API-server "
                "(firewall / VPN / Teleport / IP allowlist)."
            ),
        ) from exc
    return {
        "name": row.name,
        "source": row.source,
        "k8s_version": row.k8s_version,
        "server_url": row.server_url,
        "created_at": row.created_at.isoformat() if row.created_at else None,
    }


@router.get("/register-script", response_class=PlainTextResponse)
def register_script():
    path = _resolve_register_script()
    if path is None:
        raise HTTPException(status_code=500, detail="register-cluster.sh not found")
    return PlainTextResponse(
        path.read_text(encoding="utf-8"),
        media_type="application/x-shellscript",
    )


@router.delete("/{name}")
def delete_cluster(name: str):
    row = cluster_ctx.get(name)
    if row is not None and row.source == "external":
        cluster_ctx.delete(name)
        return {"ok": True, "stdout": f"external cluster '{name}' removed", "stderr": ""}

    # kind path — either a tracked row or a cluster that pre-exists without a row
    if not kind_manager.kind_available():
        raise HTTPException(status_code=503, detail="kind CLI not installed")
    live = set(kind_manager.list_clusters())
    if row is None and name not in live:
        raise HTTPException(status_code=404, detail=f"no cluster named '{name}'")
    result = kind_manager.delete_cluster(name)
    if row is not None:
        cluster_ctx.delete(name)
    return {
        "ok": result.ok,
        "stdout": result.stdout,
        "stderr": result.stderr,
    }


@router.get("/{name}")
def cluster_info(name: str):
    return kind_manager.cluster_info(name)
