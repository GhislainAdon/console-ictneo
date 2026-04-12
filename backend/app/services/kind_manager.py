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
            stdout=proc.stdout.strip(),
            stderr=proc.stderr.strip(),
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


def create_cluster(name: str, k8s_version: str = "1.34") -> CommandResult:
    # Kind uses image tags like kindest/node:v1.34.0
    image = f"kindest/node:v{k8s_version}.0"
    return _run(["kind", "create", "cluster", "--name", name, "--image", image], timeout=600)


def delete_cluster(name: str) -> CommandResult:
    return _run(["kind", "delete", "cluster", "--name", name], timeout=120)


def cluster_info(name: str) -> dict:
    context = f"kind-{name}"
    nodes = _run(["kubectl", "--context", context, "get", "nodes", "-o", "json"])
    if not nodes.ok:
        return {"nodes": [], "error": nodes.stderr}
    try:
        data = json.loads(nodes.stdout)
    except json.JSONDecodeError:
        return {"nodes": [], "error": "Failed to parse kubectl output"}
    return {
        "nodes": [
            {
                "name": item["metadata"]["name"],
                "status": next(
                    (
                        cond["type"]
                        for cond in item["status"]["conditions"]
                        if cond["status"] == "True"
                    ),
                    "Unknown",
                ),
                "version": item["status"]["nodeInfo"]["kubeletVersion"],
            }
            for item in data.get("items", [])
        ]
    }
