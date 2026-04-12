from datetime import datetime
from typing import Optional

from sqlmodel import Column, Field, JSON, SQLModel


class ReleaseBase(SQLModel):
    name: str                     # unique per (cluster, namespace)
    repo_name: str                # local helm repo alias (e.g. "bitnami")
    repo_url: str                 # e.g. "https://charts.bitnami.com/bitnami"
    chart: str                    # e.g. "postgresql"
    version: str = ""             # pinned chart version (empty = latest)
    cluster: str                  # kind cluster name / kube context
    namespace: str
    values_override: dict = Field(default_factory=dict, sa_column=Column(JSON))


class Release(ReleaseBase, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    project_id: int = Field(foreign_key="project.id", index=True)
    status: str = "draft"  # draft | deployed | failed | uninstalled
    last_deployed_at: Optional[datetime] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)


class ReleaseCreate(ReleaseBase):
    pass


class ReleaseUpdate(SQLModel):
    values_override: Optional[dict] = None
    version: Optional[str] = None
    namespace: Optional[str] = None


class ReleaseRead(ReleaseBase):
    id: int
    project_id: int
    status: str
    last_deployed_at: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime
