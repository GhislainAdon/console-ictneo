from datetime import datetime
from typing import Optional
from sqlmodel import Field, SQLModel


class NodeBase(SQLModel):
    hostname: str
    address: str = ""  # IP or FQDN; empty means same as hostname
    role: str = "worker"  # control-plane | worker
    os_family: str = "debian"  # debian | redhat
    ssh_user: str = "root"
    ssh_port: int = 22
    ssh_auth: str = "agent"  # password | key | agent
    ssh_password: Optional[str] = None  # only set when ssh_auth == "password"
    ssh_key_path: Optional[str] = None  # only set when ssh_auth == "key"
    labels: str = ""  # free-form comma-separated labels


class Node(NodeBase, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    project_id: int = Field(foreign_key="project.id", index=True)
    created_at: datetime = Field(default_factory=datetime.utcnow)


class NodeCreate(NodeBase):
    pass


class NodeRead(NodeBase):
    id: int
    project_id: int
    created_at: datetime
    # Mask the password when reading; the raw value is never returned.
    ssh_password: Optional[str] = None
