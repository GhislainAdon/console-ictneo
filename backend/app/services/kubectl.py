"""Thin kubectl wrapper used by the Resource Explorer.

All functions accept a cluster name (kind-<name>) and return structured
results. Destructive operations (delete / patch / exec) are confined to
explicit endpoints in the API layer; this module just shells out.
"""

from __future__ import annotations

import json
import shlex

from app.services.kind_manager import CommandResult, _run

# Kinds the Resource Explorer knows how to list in a namespace.
LISTABLE_KINDS: list[str] = [
    "deployment",
    "statefulset",
    "daemonset",
    "replicaset",
    "pod",
    "service",
    "ingress",
    "configmap",
    "secret",
    "persistentvolumeclaim",
    "job",
    "cronjob",
    "horizontalpodautoscaler",
    "networkpolicy",
    "serviceaccount",
    "role",
    "rolebinding",
]


def _ctx(cluster: str) -> str:
    return cluster if cluster.startswith("kind-") else f"kind-{cluster}"


def _base(cluster: str, namespace: str | None) -> list[str]:
    cmd = ["kubectl", "--context", _ctx(cluster)]
    if namespace:
        cmd += ["-n", namespace]
    return cmd


def list_resources(cluster: str, namespace: str, kind: str) -> dict:
    if kind not in LISTABLE_KINDS:
        return {"ok": False, "error": f"unsupported kind: {kind}"}
    res = _run(_base(cluster, namespace) + ["get", kind, "-o", "json"])
    if not res.ok:
        return {"ok": False, "error": res.stderr}
    try:
        data = json.loads(res.stdout) if res.stdout else {"items": []}
    except json.JSONDecodeError:
        return {"ok": False, "error": "failed to parse kubectl output"}

    items = []
    for item in data.get("items", []):
        md = item.get("metadata", {})
        status = item.get("status", {})
        ready = None
        if kind == "deployment":
            spec_replicas = item.get("spec", {}).get("replicas", 0)
            ready_replicas = status.get("readyReplicas", 0) or 0
            ready = f"{ready_replicas}/{spec_replicas}"
        elif kind == "pod":
            phase = status.get("phase", "")
            ready_containers = sum(
                1 for c in status.get("containerStatuses", []) if c.get("ready")
            )
            total_containers = len(status.get("containerStatuses", []) or [])
            ready = f"{ready_containers}/{total_containers} · {phase}"
        items.append(
            {
                "name": md.get("name"),
                "namespace": md.get("namespace"),
                "age": md.get("creationTimestamp"),
                "ready": ready,
                "labels": md.get("labels", {}),
            }
        )
    return {"ok": True, "items": items, "kind": kind}


def describe(cluster: str, namespace: str, kind: str, name: str) -> dict:
    res = _run(_base(cluster, namespace) + ["get", kind, name, "-o", "yaml"])
    if not res.ok:
        return {"ok": False, "error": res.stderr}
    return {"ok": True, "yaml": res.stdout}


def delete(cluster: str, namespace: str, kind: str, name: str) -> CommandResult:
    return _run(_base(cluster, namespace) + ["delete", kind, name, "--wait=false"])


def patch(cluster: str, namespace: str, kind: str, name: str, patch_body: dict) -> CommandResult:
    return _run(
        _base(cluster, namespace)
        + ["patch", kind, name, "--type=merge", "-p", json.dumps(patch_body)]
    )


def exec_in_pod(
    cluster: str,
    namespace: str,
    pod: str,
    container: str | None,
    command: str,
) -> CommandResult:
    cmd = _base(cluster, namespace) + ["exec", pod]
    if container:
        cmd += ["-c", container]
    # Split the user-supplied command like a shell would. A shell is NOT
    # involved — we exec the argv directly inside the container.
    try:
        parts = shlex.split(command)
    except ValueError as exc:
        return CommandResult(ok=False, stdout="", stderr=f"invalid command: {exc}", returncode=2)
    if not parts:
        return CommandResult(ok=False, stdout="", stderr="empty command", returncode=2)
    cmd += ["--", *parts]
    return _run(cmd, timeout=120)


def logs(cluster: str, namespace: str, pod: str, container: str | None, tail: int = 200) -> CommandResult:
    cmd = _base(cluster, namespace) + ["logs", pod, f"--tail={tail}"]
    if container:
        cmd += ["-c", container]
    return _run(cmd, timeout=60)
