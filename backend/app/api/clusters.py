from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.services import kind_manager

router = APIRouter(prefix="/api/clusters", tags=["clusters"])


class CreateClusterRequest(BaseModel):
    name: str
    k8s_version: str = "1.34"


@router.get("/health")
def health():
    return {
        "docker": kind_manager.docker_available(),
        "kind": kind_manager.kind_available(),
    }


@router.get("")
def list_clusters():
    return {"clusters": kind_manager.list_clusters()}


@router.post("", status_code=202)
def create_cluster(payload: CreateClusterRequest):
    if not kind_manager.kind_available():
        raise HTTPException(status_code=503, detail="kind CLI not installed")
    if not kind_manager.docker_available():
        raise HTTPException(status_code=503, detail="Docker daemon not reachable")
    result = kind_manager.create_cluster(payload.name, payload.k8s_version)
    return {
        "ok": result.ok,
        "stdout": result.stdout,
        "stderr": result.stderr,
    }


@router.delete("/{name}")
def delete_cluster(name: str):
    if not kind_manager.kind_available():
        raise HTTPException(status_code=503, detail="kind CLI not installed")
    result = kind_manager.delete_cluster(name)
    return {
        "ok": result.ok,
        "stdout": result.stdout,
        "stderr": result.stderr,
    }


@router.get("/{name}")
def cluster_info(name: str):
    return kind_manager.cluster_info(name)
