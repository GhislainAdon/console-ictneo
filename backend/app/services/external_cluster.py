"""Register an external Kubernetes cluster in the console.

The admin of the target cluster runs ``scripts/register-cluster.sh`` against
their cluster. The script emits a single base64-encoded JSON blob carrying
``{server, ca_cert_b64, token}``. The user pastes that blob into the UI; this
service decodes it, writes a minimal kubeconfig under ``data/kubeconfigs/``,
verifies reachability with ``kubectl cluster-info``, detects the server
version, and inserts a ``Cluster`` row with ``source="external"``.
"""

from __future__ import annotations

import base64
import json
import os
import stat
import uuid
from pathlib import Path

from jinja2 import Environment, FileSystemLoader, select_autoescape
from sqlalchemy.exc import IntegrityError
from sqlmodel import Session

from app.db import DATA_DIR, engine
from app.models.cluster import Cluster
from app.services.cluster_ctx import validate_cluster_name
from app.services.kind_manager import _run


class ClusterNameConflict(Exception):
    """Raised when another cluster already owns ``name``."""

KUBECONFIG_DIR = DATA_DIR / "kubeconfigs"
_TEMPLATE_DIR = Path(__file__).resolve().parent.parent / "templates"
_env = Environment(
    loader=FileSystemLoader(str(_TEMPLATE_DIR)),
    autoescape=select_autoescape(disabled_extensions=("j2",)),
    keep_trailing_newline=True,
)


def decode_payload(b64: str) -> dict:
    try:
        raw = base64.b64decode(b64.strip(), validate=True)
    except Exception as exc:  # noqa: BLE001 — surface any decode error
        raise ValueError(f"payload is not valid base64: {exc}") from exc
    try:
        data = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise ValueError(f"decoded payload is not JSON: {exc}") from exc
    missing = [k for k in ("server", "ca_cert_b64", "token") if not data.get(k)]
    if missing:
        raise ValueError(f"payload missing keys: {', '.join(missing)}")
    return data


def _render_and_write(path: Path, name: str, payload: dict) -> None:
    rendered = _env.get_template("kubeconfig.yaml.j2").render(
        name=name,
        server=payload["server"],
        ca_cert_b64=payload["ca_cert_b64"],
        token=payload["token"],
    )
    path.write_text(rendered, encoding="utf-8")
    # 0600 — no group/other access. On Windows, chmod is a best-effort no-op.
    try:
        os.chmod(path, stat.S_IRUSR | stat.S_IWUSR)
    except OSError:
        pass


def write_kubeconfig(name: str, payload: dict) -> Path:
    """Compatibility wrapper kept for callers/tests that want a single-shot write.

    For the production registration flow, use :func:`register` which goes
    through a temp → commit → rename sequence to avoid races.
    """
    validate_cluster_name(name)
    KUBECONFIG_DIR.mkdir(parents=True, exist_ok=True)
    target = KUBECONFIG_DIR / f"{name}.yaml"
    _render_and_write(target, name, payload)
    return target


def verify_and_detect(path: Path) -> tuple[str, str]:
    """Probe the cluster. Returns ``(k8s_version, server_url)``.

    Raises ``RuntimeError`` with the underlying stderr on any failure so the
    caller can surface a clear message to the user.
    """
    info = _run(["kubectl", "--kubeconfig", str(path), "cluster-info"], timeout=20)
    if not info.ok:
        raise RuntimeError(info.stderr or "cluster-info failed")

    ver = _run(["kubectl", "--kubeconfig", str(path), "version", "-o", "json"], timeout=20)
    if not ver.ok:
        raise RuntimeError(ver.stderr or "version lookup failed")
    try:
        data = json.loads(ver.stdout)
        git = data.get("serverVersion", {}).get("gitVersion", "") or ""
    except json.JSONDecodeError as exc:
        raise RuntimeError(f"could not parse kubectl version output: {exc}") from exc

    trimmed = git.lstrip("v")
    parts = trimmed.split(".")
    version = ".".join(parts[:2]) if len(parts) >= 2 else trimmed

    url = _run(
        ["kubectl", "--kubeconfig", str(path), "config", "view", "-o",
         "jsonpath={.clusters[0].cluster.server}"],
        timeout=10,
    )
    server_url = url.stdout.strip() if url.ok else ""
    return version, server_url


def register(name: str, b64_payload: str) -> Cluster:
    """End-to-end external cluster registration.

    Flow is atomic with respect to concurrent callers competing for the same
    ``name``:

    1. Validate the name (RFC 1123 — gates path traversal + YAML injection).
    2. Decode + verify the payload against a temp kubeconfig with a unique
       suffix, so a concurrent registration can never observe a partial file
       at the final path.
    3. Commit the DB row. The UNIQUE constraint on ``cluster.name`` is the
       single source of truth for "who won the race" — the loser gets a
       :class:`ClusterNameConflict`.
    4. Only after the row is committed do we rename the temp file to its
       final path. The winner's file is never overwritten by a loser.
    """
    validate_cluster_name(name)
    payload = decode_payload(b64_payload)

    KUBECONFIG_DIR.mkdir(parents=True, exist_ok=True)
    tmp_path = KUBECONFIG_DIR / f".tmp-{uuid.uuid4().hex}-{name}.yaml"
    _render_and_write(tmp_path, name, payload)

    try:
        version, server_url = verify_and_detect(tmp_path)

        final_rel = f"kubeconfigs/{name}.yaml"
        final_path = KUBECONFIG_DIR / f"{name}.yaml"

        row = Cluster(
            name=name,
            source="external",
            k8s_version=version,
            server_url=server_url,
            kubeconfig_path=final_rel,
        )
        with Session(engine) as session:
            session.add(row)
            try:
                session.commit()
            except IntegrityError as exc:
                session.rollback()
                raise ClusterNameConflict(
                    f"a cluster named '{name}' already exists"
                ) from exc
            session.refresh(row)

        # Row is committed — we own the final name. Move the verified
        # kubeconfig into place atomically.
        os.replace(tmp_path, final_path)
    except Exception:
        # Any failure before the replace: scrub the temp file. We never touch
        # the final path from the loser's code path.
        try:
            tmp_path.unlink()
        except OSError:
            pass
        raise

    return row
