from datetime import datetime
from typing import Optional

from sqlmodel import Field, SQLModel


class Cluster(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    name: str = Field(index=True, unique=True)
    source: str = Field(default="kind")  # "kind" | "external"
    k8s_version: str = ""
    server_url: Optional[str] = None
    kubeconfig_path: Optional[str] = None  # relative to backend/data/
    created_at: datetime = Field(default_factory=datetime.utcnow)
