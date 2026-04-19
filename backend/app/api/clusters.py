from pathlib import Path

from fastapi import APIRouter, HTTPException
from fastapi.responses import PlainTextResponse
from pydantic import BaseModel
from sqlmodel import Session

from app.db import engine
from app.models.cluster import Cluster
from app.services import cluster_ctx, external_cluster, kind_manager

router = APIRouter(prefix="/api/clusters", tags=["clusters"])

# scripts/ lives at the repo root, three parents above app/api/clusters.py
# (app/api/clusters.py → app/api → app → backend → console → <root>).
_REGISTER_SCRIPT = (
    Path(__file__).resolve().parents[4] / "scripts" / "register-cluster.sh"
)


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
    # Fail fast on name collision — the DB uniqueness constraint would catch
    # it too, but we want a clean 409 with a useful message.
    if cluster_ctx.get(body.name) is not None:
        raise HTTPException(
            status_code=409,
            detail=f"a cluster named '{body.name}' already exists",
        )
    try:
        row = external_cluster.register(body.name, body.payload)
    except ValueError as exc:
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
    if not _REGISTER_SCRIPT.exists():
        raise HTTPException(status_code=500, detail="register-cluster.sh not found")
    return PlainTextResponse(
        _REGISTER_SCRIPT.read_text(encoding="utf-8"),
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
