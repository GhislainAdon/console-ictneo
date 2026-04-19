"""Central kubectl/helm arg resolver for cluster targets.

All shell-out helpers (kubectl.py, helm_manager.py, kind_manager.py) route
through ``cluster_args(name)`` to decide whether to target a local ``kind``
cluster via ``--context kind-<name>`` or an external cluster via
``--kubeconfig <path-to-file>``.

The SQLite ``cluster`` table is the source of truth. Kind clusters are kept
in sync automatically by ``reconcile_kind_clusters`` — it compares
``kind get clusters`` against the DB and inserts/removes rows as needed.
External rows are authoritative (they exist only because a user registered
them via the API).
"""

from __future__ import annotations

import json
import re
from pathlib import Path

from sqlmodel import Session, select

from app.db import DATA_DIR, engine
from app.models.cluster import Cluster
from app.services.kind_manager import _run, list_clusters as kind_list

# RFC 1123 DNS label — the same rule Kubernetes applies to namespaces and
# kind cluster names. Used to gate any input that becomes a filename, a
# kubeconfig context name, or a shell argument downstream.
_NAME_RE = re.compile(r"^[a-z0-9]([-a-z0-9]*[a-z0-9])?$")


def validate_cluster_name(name: str) -> None:
    """Raise ``ValueError`` if ``name`` is unsafe to use as an identifier.

    Rejects path traversal (``../``), whitespace, YAML metacharacters, and
    anything that would surprise downstream shell-outs. Accepts only
    lowercase letters, digits, and ``-``; must start and end alphanumeric;
    1..63 characters.
    """
    if not isinstance(name, str) or not name:
        raise ValueError("cluster name is required")
    if len(name) > 63:
        raise ValueError("cluster name must be 63 characters or fewer")
    if not _NAME_RE.match(name):
        raise ValueError(
            "cluster name must match RFC 1123 "
            "(lowercase letters, digits, and '-'; start/end alphanumeric)"
        )


def _kubeconfig_abs(path: str | None) -> Path | None:
    if not path:
        return None
    p = Path(path)
    return p if p.is_absolute() else (DATA_DIR / path)


def cluster_args(name: str) -> list[str]:
    """Return kubectl/helm arguments targeting ``name``.

    Unknown names fall back to ``--context kind-<name>`` so freshly-created
    kind clusters keep working before the first reconciliation runs.
    """
    with Session(engine) as session:
        row = session.exec(select(Cluster).where(Cluster.name == name)).first()
    if row and row.source == "external" and row.kubeconfig_path:
        abs_path = _kubeconfig_abs(row.kubeconfig_path)
        if abs_path and abs_path.exists():
            return ["--kubeconfig", str(abs_path)]
    # kind source (or unknown)
    ctx = name if name.startswith("kind-") else f"kind-{name}"
    return ["--context", ctx]


def _detect_kind_version(name: str) -> str:
    ctx = name if name.startswith("kind-") else f"kind-{name}"
    res = _run(["kubectl", "--context", ctx, "version", "-o", "json"], timeout=15)
    if not res.ok:
        return ""
    try:
        data = json.loads(res.stdout)
        git = data.get("serverVersion", {}).get("gitVersion", "") or ""
    except json.JSONDecodeError:
        return ""
    # "v1.34.3" → "1.34"
    trimmed = git.lstrip("v")
    parts = trimmed.split(".")
    return ".".join(parts[:2]) if len(parts) >= 2 else trimmed


def reconcile_kind_clusters() -> None:
    live = set(kind_list())
    with Session(engine) as session:
        rows = session.exec(select(Cluster).where(Cluster.source == "kind")).all()
        known = {r.name for r in rows}
        # drop kind rows that no longer exist on disk
        for row in rows:
            if row.name not in live:
                session.delete(row)
        # insert newly-discovered kind clusters
        for name in live - known:
            version = _detect_kind_version(name)
            session.add(Cluster(name=name, source="kind", k8s_version=version))
        session.commit()


def list_all() -> list[dict]:
    """Reconcile, then return every cluster row as a plain dict.

    ``kubeconfig_path`` is stripped from the output — it's an internal
    implementation detail and not safe to expose.
    """
    reconcile_kind_clusters()
    with Session(engine) as session:
        rows = session.exec(select(Cluster).order_by(Cluster.created_at)).all()
    return [
        {
            "name": r.name,
            "source": r.source,
            "k8s_version": r.k8s_version,
            "server_url": r.server_url,
            "created_at": r.created_at.isoformat() if r.created_at else None,
        }
        for r in rows
    ]


def get(name: str) -> Cluster | None:
    with Session(engine) as session:
        return session.exec(select(Cluster).where(Cluster.name == name)).first()


def delete(name: str) -> Cluster | None:
    """Remove a row + its kubeconfig file (if any). Returns the row if found."""
    with Session(engine) as session:
        row = session.exec(select(Cluster).where(Cluster.name == name)).first()
        if row is None:
            return None
        if row.source == "external":
            abs_path = _kubeconfig_abs(row.kubeconfig_path)
            if abs_path and abs_path.exists():
                try:
                    abs_path.unlink()
                except OSError:
                    pass
        session.delete(row)
        session.commit()
        return row
