"""Thin wrapper around the `kind` CLI for local cluster provisioning.

Uses Docker Desktop as the underlying container runtime. All commands are
non-blocking and return structured results so the API can expose them.
"""

from __future__ import annotations

import json
import shutil
import subprocess
from dataclasses import dataclass


@dataclass
class CommandResult:
    ok: bool
    stdout: str
    stderr: str
    returncode: int


def _run(cmd: list[str], timeout: int = 300) -> CommandResult:
    try:
        proc = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=timeout,
        )
        return CommandResult(
            ok=proc.returncode == 0,
            stdout=(proc.stdout or "").strip(),
            stderr=(proc.stderr or "").strip(),
            returncode=proc.returncode,
        )
    except FileNotFoundError:
        return CommandResult(
            ok=False,
            stdout="",
            stderr=f"Command not found: {cmd[0]}",
            returncode=127,
        )
    except subprocess.TimeoutExpired as exc:
        return CommandResult(
            ok=False,
            stdout="",
            stderr=f"Timeout after {exc.timeout}s",
            returncode=124,
        )


def kind_available() -> bool:
    return shutil.which("kind") is not None


def docker_available() -> bool:
    if shutil.which("docker") is None:
        return False
    return _run(["docker", "info", "--format", "{{.ServerVersion}}"], timeout=10).ok


def list_clusters() -> list[str]:
    res = _run(["kind", "get", "clusters"])
    if not res.ok:
        return []
    return [line for line in res.stdout.splitlines() if line and line != "No kind clusters found."]


# Digest-pinned node images shipped by kind v0.31.0.
# https://github.com/kubernetes-sigs/kind/releases/tag/v0.31.0
KIND_NODE_IMAGES: dict[str, str] = {
    "1.35": "kindest/node:v1.35.0@sha256:452d707d4862f52530247495d180205e029056831160e22870e37e3f6c1ac31f",
    "1.34": "kindest/node:v1.34.3@sha256:08497ee19eace7b4b5348db5c6a1591d7752b164530a36f855cb0f2bdcbadd48",
    "1.33": "kindest/node:v1.33.7@sha256:d26ef333bdb2cbe9862a0f7c3803ecc7b4303d8cea8e814b481b09949d353040",
    "1.32": "kindest/node:v1.32.11@sha256:5fc52d52a7b9574015299724bd68f183702956aa4a2116ae75a63cb574b35af8",
    "1.31": "kindest/node:v1.31.14@sha256:6f86cf509dbb42767b6e79debc3f2c32e4ee01386f0489b3b2be24b0a55aac2b",
}


def create_cluster(name: str, k8s_version: str = "1.34") -> CommandResult:
    image = KIND_NODE_IMAGES.get(k8s_version)
    cmd = ["kind", "create", "cluster", "--name", name]
    if image:
        cmd += ["--image", image]
    return _run(cmd, timeout=600)


def delete_cluster(name: str) -> CommandResult:
    return _run(["kind", "delete", "cluster", "--name", name], timeout=120)


def cluster_info(name: str) -> dict:
    # Late import to avoid circular dependency (cluster_ctx imports _run from here).
    from app.services.cluster_ctx import cluster_args

    nodes = _run(["kubectl", *cluster_args(name), "get", "nodes", "-o", "json"])
    if not nodes.ok:
        return {"nodes": [], "error": nodes.stderr}
    try:
        data = json.loads(nodes.stdout)
    except json.JSONDecodeError:
        return {"nodes": [], "error": "Failed to parse kubectl output"}
    def _ready(conditions: list[dict]) -> str:
        for cond in conditions:
            if cond.get("type") == "Ready":
                return "Ready" if cond.get("status") == "True" else "NotReady"
        return "Unknown"

    return {
        "nodes": [
            {
                "name": item["metadata"]["name"],
                "status": _ready(item["status"].get("conditions", [])),
                "version": item["status"]["nodeInfo"]["kubeletVersion"],
                "roles": sorted(
                    label.split("/", 1)[1]
                    for label in item["metadata"].get("labels", {})
                    if label.startswith("node-role.kubernetes.io/")
                ),
            }
            for item in data.get("items", [])
        ]
    }
