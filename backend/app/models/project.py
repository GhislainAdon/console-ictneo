from datetime import datetime
from typing import Optional
from sqlmodel import Field, SQLModel, Column, JSON


class ProjectBase(SQLModel):
    name: str = Field(index=True, unique=True)
    description: str = ""
    k8s_version: str = "1.34"
    cert_provider: str = "letsencrypt"  # letsencrypt | cloudflare
    domain: str = "example.local"
    addons: list[str] = Field(default_factory=list, sa_column=Column(JSON))
    addon_config: dict = Field(default_factory=dict, sa_column=Column(JSON))


class Project(ProjectBase, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
    status: str = "draft"  # draft | provisioning | ready | error
    cluster_name: Optional[str] = None


class ProjectCreate(ProjectBase):
    pass


class ProjectUpdate(SQLModel):
    description: Optional[str] = None
    k8s_version: Optional[str] = None
    cert_provider: Optional[str] = None
    domain: Optional[str] = None
    addons: Optional[list[str]] = None
    addon_config: Optional[dict] = None
    status: Optional[str] = None
    cluster_name: Optional[str] = None


class ProjectRead(ProjectBase):
    id: int
    created_at: datetime
    updated_at: datetime
    status: str
    cluster_name: Optional[str] = None
