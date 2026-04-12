from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.services import kubectl

router = APIRouter(prefix="/api/k8s/{cluster}", tags=["k8s"])


@router.get("/kinds")
def kinds():
    return {"kinds": kubectl.LISTABLE_KINDS}


@router.get("/{namespace}/{kind}")
def list_resources(cluster: str, namespace: str, kind: str):
    res = kubectl.list_resources(cluster, namespace, kind.lower())
    if not res["ok"]:
        raise HTTPException(status_code=502, detail=res.get("error", "kubectl failed"))
    return res


@router.get("/{namespace}/{kind}/{name}")
def describe(cluster: str, namespace: str, kind: str, name: str):
    res = kubectl.describe(cluster, namespace, kind.lower(), name)
    if not res["ok"]:
        raise HTTPException(status_code=502, detail=res.get("error", "kubectl failed"))
    return res


@router.delete("/{namespace}/{kind}/{name}")
def delete(cluster: str, namespace: str, kind: str, name: str):
    res = kubectl.delete(cluster, namespace, kind.lower(), name)
    if not res.ok:
        raise HTTPException(status_code=502, detail=res.stderr or "kubectl failed")
    return {"ok": True, "stdout": res.stdout}


class PatchBody(BaseModel):
    patch: dict


@router.post("/{namespace}/{kind}/{name}/patch")
def patch(cluster: str, namespace: str, kind: str, name: str, body: PatchBody):
    res = kubectl.patch(cluster, namespace, kind.lower(), name, body.patch)
    if not res.ok:
        raise HTTPException(status_code=502, detail=res.stderr or "kubectl failed")
    return {"ok": True, "stdout": res.stdout}


class ExecBody(BaseModel):
    command: str
    container: str | None = None


@router.post("/{namespace}/pod/{name}/exec")
def exec_pod(cluster: str, namespace: str, name: str, body: ExecBody):
    res = kubectl.exec_in_pod(cluster, namespace, name, body.container, body.command)
    return {"ok": res.ok, "stdout": res.stdout, "stderr": res.stderr, "exit_code": res.returncode}


@router.get("/{namespace}/pod/{name}/logs")
def logs(cluster: str, namespace: str, name: str, container: str | None = None, tail: int = 200):
    res = kubectl.logs(cluster, namespace, name, container, tail)
    if not res.ok:
        raise HTTPException(status_code=502, detail=res.stderr or "kubectl failed")
    return {"stdout": res.stdout}
