from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select

from app.db import get_session
from app.models.node import Node, NodeCreate, NodeRead
from app.models.project import Project

router = APIRouter(prefix="/api/projects/{project_id}/nodes", tags=["nodes"])

VALID_AUTH = {"password", "key", "agent"}
VALID_ROLES = {"control-plane", "worker"}


def _to_read(node: Node) -> NodeRead:
    data = node.model_dump()
    if data.get("ssh_password"):
        data["ssh_password"] = "***"
    return NodeRead(**data)


def _validate(payload: NodeCreate) -> None:
    if payload.ssh_auth not in VALID_AUTH:
        raise HTTPException(status_code=400, detail=f"ssh_auth must be one of {sorted(VALID_AUTH)}")
    if payload.role not in VALID_ROLES:
        raise HTTPException(status_code=400, detail=f"role must be one of {sorted(VALID_ROLES)}")
    if payload.ssh_auth == "password" and not payload.ssh_password:
        raise HTTPException(status_code=400, detail="ssh_password is required when ssh_auth=password")
    if payload.ssh_auth == "key" and not payload.ssh_key_path:
        raise HTTPException(status_code=400, detail="ssh_key_path is required when ssh_auth=key")
    if payload.ssh_auth == "agent":
        # Clear any accidental secret material.
        payload.ssh_password = None
        payload.ssh_key_path = None


def _load_project(project_id: int, session: Session) -> Project:
    project = session.get(Project, project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    return project


@router.get("", response_model=list[NodeRead])
def list_nodes(project_id: int, session: Session = Depends(get_session)):
    _load_project(project_id, session)
    nodes = session.exec(
        select(Node).where(Node.project_id == project_id).order_by(Node.role, Node.hostname)
    ).all()
    return [_to_read(n) for n in nodes]


@router.post("", response_model=NodeRead, status_code=201)
def create_node(
    project_id: int,
    payload: NodeCreate,
    session: Session = Depends(get_session),
):
    _load_project(project_id, session)
    _validate(payload)

    existing = session.exec(
        select(Node).where(Node.project_id == project_id, Node.hostname == payload.hostname)
    ).first()
    if existing:
        raise HTTPException(status_code=409, detail=f"Node '{payload.hostname}' already declared")

    node = Node(project_id=project_id, **payload.model_dump())
    session.add(node)
    session.commit()
    session.refresh(node)
    return _to_read(node)


@router.delete("/{node_id}", status_code=204)
def delete_node(project_id: int, node_id: int, session: Session = Depends(get_session)):
    _load_project(project_id, session)
    node = session.get(Node, node_id)
    if not node or node.project_id != project_id:
        raise HTTPException(status_code=404, detail="Node not found")
    session.delete(node)
    session.commit()
    return None
