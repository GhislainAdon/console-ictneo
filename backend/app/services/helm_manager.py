"""Wrapper around the `helm` CLI: repo add/update, fetch default values,
install/upgrade with values override, uninstall, status, and list releases.

All cluster-scoped commands route through ``cluster_args`` so that the same
code path handles local kind clusters (``--kube-context kind-<name>``) and
external clusters (``--kubeconfig <path>``). Helm accepts both forms for the
same flags (``--kube-context`` and ``--kubeconfig``), so we just splice
whatever ``cluster_args`` returns into the argv.
"""

from __future__ import annotations

import json
import shutil

from app.services.cluster_ctx import cluster_args
from app.services.kind_manager import CommandResult, _run


def helm_available() -> bool:
    return shutil.which("helm") is not None


def _helm_cluster_args(cluster: str) -> list[str]:
    # cluster_args returns ["--context", ...] or ["--kubeconfig", ...]. Helm
    # uses "--kube-context" not "--context", so swap the flag when needed.
    args = cluster_args(cluster)
    if args and args[0] == "--context":
        return ["--kube-context", *args[1:]]
    return args


def repo_add(name: str, url: str) -> CommandResult:
    return _run(["helm", "repo", "add", name, url, "--force-update"], timeout=60)


def repo_update() -> CommandResult:
    return _run(["helm", "repo", "update"], timeout=120)


def repo_list() -> list[dict]:
    res = _run(["helm", "repo", "list", "-o", "json"])
    if not res.ok or not res.stdout:
        return []
    try:
        return json.loads(res.stdout)
    except json.JSONDecodeError:
        return []


def show_values(repo_name: str, chart: str, version: str = "") -> CommandResult:
    """Return the default values.yaml content for a chart as text (stdout)."""
    cmd = ["helm", "show", "values", f"{repo_name}/{chart}"]
    if version:
        cmd += ["--version", version]
    return _run(cmd, timeout=120)


def show_chart(repo_name: str, chart: str, version: str = "") -> CommandResult:
    cmd = ["helm", "show", "chart", f"{repo_name}/{chart}"]
    if version:
        cmd += ["--version", version]
    return _run(cmd, timeout=60)


def install_or_upgrade(
    *,
    release_name: str,
    repo_name: str,
    chart: str,
    version: str,
    cluster: str,
    namespace: str,
    values_yaml_path: str | None,
) -> CommandResult:
    cmd = [
        "helm",
        "upgrade",
        "--install",
        release_name,
        f"{repo_name}/{chart}",
        *_helm_cluster_args(cluster),
        "--namespace",
        namespace,
        "--create-namespace",
        "--wait",
        "--timeout",
        "5m",
    ]
    if version:
        cmd += ["--version", version]
    if values_yaml_path:
        cmd += ["-f", values_yaml_path]
    return _run(cmd, timeout=600)


def uninstall(release_name: str, cluster: str, namespace: str) -> CommandResult:
    return _run(
        [
            "helm",
            "uninstall",
            release_name,
            *_helm_cluster_args(cluster),
            "--namespace",
            namespace,
        ],
        timeout=300,
    )


def status(release_name: str, cluster: str, namespace: str) -> dict:
    res = _run(
        [
            "helm",
            "status",
            release_name,
            *_helm_cluster_args(cluster),
            "--namespace",
            namespace,
            "-o",
            "json",
        ]
    )
    if not res.ok:
        return {"ok": False, "error": res.stderr}
    try:
        data = json.loads(res.stdout)
    except json.JSONDecodeError:
        return {"ok": False, "error": "failed to parse helm status"}
    info = data.get("info", {})
    return {
        "ok": True,
        "name": data.get("name"),
        "namespace": data.get("namespace"),
        "status": info.get("status"),
        "first_deployed": info.get("first_deployed"),
        "last_deployed": info.get("last_deployed"),
        "description": info.get("description"),
        "version": data.get("version"),
        "chart": (data.get("chart") or {}).get("metadata", {}).get("name"),
        "chart_version": (data.get("chart") or {}).get("metadata", {}).get("version"),
    }


def list_releases(cluster: str, namespace: str | None = None) -> list[dict]:
    cmd = ["helm", "list", *_helm_cluster_args(cluster), "-o", "json"]
    if namespace:
        cmd += ["--namespace", namespace]
    else:
        cmd += ["--all-namespaces"]
    res = _run(cmd, timeout=60)
    if not res.ok or not res.stdout:
        return []
    try:
        return json.loads(res.stdout)
    except json.JSONDecodeError:
        return []
