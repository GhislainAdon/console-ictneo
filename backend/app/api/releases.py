from datetime import datetime
from pathlib import Path
import tempfile

import yaml
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlmodel import Session, select

from app.db import get_session
from app.models.project import Project
from app.models.release import (
    Release,
    ReleaseCreate,
    ReleaseRead,
    ReleaseUpdate,
)
from app.services import helm_manager

router = APIRouter(prefix="/api", tags=["helm-manager"])


def _load_project(project_id: int, session: Session) -> Project:
    project = session.get(Project, project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    return project


# ----- repo + chart helpers -------------------------------------------------


class RepoAdd(BaseModel):
    name: str
    url: str


@router.get("/helm/repos")
def list_repos():
    return {"repos": helm_manager.repo_list()}


@router.post("/helm/repos")
def add_repo(payload: RepoAdd):
    if not helm_manager.helm_available():
        raise HTTPException(status_code=503, detail="helm CLI not installed")
    res = helm_manager.repo_add(payload.name, payload.url)
    if not res.ok:
        raise HTTPException(status_code=502, detail=res.stderr or "helm repo add failed")
    helm_manager.repo_update()
    return {"ok": True}


class ShowValuesQuery(BaseModel):
    repo_name: str
    chart: str
    version: str = ""


@router.post("/helm/values")
def show_values(payload: ShowValuesQuery):
    res = helm_manager.show_values(payload.repo_name, payload.chart, payload.version)
    if not res.ok:
        raise HTTPException(status_code=502, detail=res.stderr or "helm show values failed")
    return {"values_yaml": res.stdout}


@router.post("/helm/chart")
def show_chart(payload: ShowValuesQuery):
    res = helm_manager.show_chart(payload.repo_name, payload.chart, payload.version)
    if not res.ok:
        raise HTTPException(status_code=502, detail=res.stderr or "helm show chart failed")
    return {"chart_yaml": res.stdout}


# ----- releases CRUD --------------------------------------------------------


@router.get("/projects/{project_id}/releases", response_model=list[ReleaseRead])
def list_project_releases(project_id: int, session: Session = Depends(get_session)):
    _load_project(project_id, session)
    return session.exec(
        select(Release).where(Release.project_id == project_id).order_by(Release.created_at.desc())
    ).all()


@router.post("/projects/{project_id}/releases", response_model=ReleaseRead, status_code=201)
def create_release(
    project_id: int,
    payload: ReleaseCreate,
    session: Session = Depends(get_session),
):
    _load_project(project_id, session)
    existing = session.exec(
        select(Release).where(
            Release.project_id == project_id,
            Release.cluster == payload.cluster,
            Release.namespace == payload.namespace,
            Release.name == payload.name,
        )
    ).first()
    if existing:
        raise HTTPException(
            status_code=409,
            detail=f"Release '{payload.name}' already exists in {payload.cluster}/{payload.namespace}",
        )
    release = Release(project_id=project_id, **payload.model_dump())
    session.add(release)
    session.commit()
    session.refresh(release)
    return release


@router.get("/releases/{release_id}", response_model=ReleaseRead)
def get_release(release_id: int, session: Session = Depends(get_session)):
    release = session.get(Release, release_id)
    if not release:
        raise HTTPException(status_code=404, detail="Release not found")
    return release


@router.patch("/releases/{release_id}", response_model=ReleaseRead)
def update_release(
    release_id: int,
    payload: ReleaseUpdate,
    session: Session = Depends(get_session),
):
    release = session.get(Release, release_id)
    if not release:
        raise HTTPException(status_code=404, detail="Release not found")
    data = payload.model_dump(exclude_unset=True)
    for key, value in data.items():
        setattr(release, key, value)
    release.updated_at = datetime.utcnow()
    session.add(release)
    session.commit()
    session.refresh(release)
    return release


@router.delete("/releases/{release_id}", status_code=204)
def delete_release(release_id: int, session: Session = Depends(get_session)):
    release = session.get(Release, release_id)
    if not release:
        raise HTTPException(status_code=404, detail="Release not found")
    session.delete(release)
    session.commit()
    return None


# ----- deploy / upgrade / uninstall / status --------------------------------


def _write_values(values: dict) -> str:
    fd = tempfile.NamedTemporaryFile(
        prefix="ictneo-values-", suffix=".yaml", delete=False, mode="w", encoding="utf-8"
    )
    yaml.safe_dump(values, fd, sort_keys=False)
    fd.close()
    return fd.name


@router.post("/releases/{release_id}/deploy")
def deploy_release(release_id: int, session: Session = Depends(get_session)):
    release = session.get(Release, release_id)
    if not release:
        raise HTTPException(status_code=404, detail="Release not found")
    if not helm_manager.helm_available():
        raise HTTPException(status_code=503, detail="helm CLI not installed")

    values_path = _write_values(release.values_override) if release.values_override else None
    try:
        res = helm_manager.install_or_upgrade(
            release_name=release.name,
            repo_name=release.repo_name,
            chart=release.chart,
            version=release.version,
            cluster=release.cluster,
            namespace=release.namespace,
            values_yaml_path=values_path,
        )
    finally:
        if values_path:
            Path(values_path).unlink(missing_ok=True)

    release.status = "deployed" if res.ok else "failed"
    release.last_deployed_at = datetime.utcnow() if res.ok else release.last_deployed_at
    release.updated_at = datetime.utcnow()
    session.add(release)
    session.commit()
    session.refresh(release)

    return {
        "ok": res.ok,
        "stdout": res.stdout,
        "stderr": res.stderr,
        "release": ReleaseRead(**release.model_dump()),
    }


@router.post("/releases/{release_id}/uninstall")
def uninstall_release(release_id: int, session: Session = Depends(get_session)):
    release = session.get(Release, release_id)
    if not release:
        raise HTTPException(status_code=404, detail="Release not found")
    res = helm_manager.uninstall(release.name, release.cluster, release.namespace)
    if res.ok:
        release.status = "uninstalled"
        release.updated_at = datetime.utcnow()
        session.add(release)
        session.commit()
    return {"ok": res.ok, "stdout": res.stdout, "stderr": res.stderr}


@router.get("/releases/{release_id}/status")
def release_status(release_id: int, session: Session = Depends(get_session)):
    release = session.get(Release, release_id)
    if not release:
        raise HTTPException(status_code=404, detail="Release not found")
    return helm_manager.status(release.name, release.cluster, release.namespace)
