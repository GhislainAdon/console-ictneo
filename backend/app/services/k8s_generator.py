"""Generate plain Kubernetes resource manifests from simple form inputs.

Each function returns a Python dict matching the Kubernetes API shape, which
is then dumped as YAML.
"""

from __future__ import annotations

from typing import Any
import yaml


class _NoAliasDumper(yaml.SafeDumper):
    def ignore_aliases(self, data):  # noqa: D401
        return True


def dump(obj: Any) -> str:
    return yaml.dump(obj, Dumper=_NoAliasDumper, sort_keys=False, default_flow_style=False)


def deployment(spec: dict) -> dict:
    name = spec["name"]
    namespace = spec.get("namespace", "default")
    image = spec["image"]
    replicas = int(spec.get("replicas", 1))
    port = int(spec.get("port", 80))
    env = spec.get("env", [])
    labels = {"app": name, **spec.get("labels", {})}

    return {
        "apiVersion": "apps/v1",
        "kind": "Deployment",
        "metadata": {"name": name, "namespace": namespace, "labels": labels},
        "spec": {
            "replicas": replicas,
            "selector": {"matchLabels": {"app": name}},
            "template": {
                "metadata": {"labels": labels},
                "spec": {
                    "containers": [
                        {
                            "name": name,
                            "image": image,
                            "ports": [{"containerPort": port}],
                            "env": env,
                            "resources": spec.get(
                                "resources",
                                {
                                    "requests": {"cpu": "100m", "memory": "128Mi"},
                                    "limits": {"cpu": "500m", "memory": "512Mi"},
                                },
                            ),
                        }
                    ]
                },
            },
        },
    }


def statefulset(spec: dict) -> dict:
    base = deployment(spec)
    base["kind"] = "StatefulSet"
    base["spec"]["serviceName"] = spec.get("serviceName", spec["name"])
    storage = spec.get("storage", "1Gi")
    base["spec"]["volumeClaimTemplates"] = [
        {
            "metadata": {"name": "data"},
            "spec": {
                "accessModes": ["ReadWriteOnce"],
                "resources": {"requests": {"storage": storage}},
            },
        }
    ]
    return base


def daemonset(spec: dict) -> dict:
    base = deployment(spec)
    base["kind"] = "DaemonSet"
    base["spec"].pop("replicas", None)
    return base


def service(spec: dict) -> dict:
    name = spec["name"]
    return {
        "apiVersion": "v1",
        "kind": "Service",
        "metadata": {
            "name": name,
            "namespace": spec.get("namespace", "default"),
            "labels": {"app": name},
        },
        "spec": {
            "type": spec.get("type", "ClusterIP"),
            "selector": {"app": spec.get("selector", name)},
            "ports": [
                {
                    "name": "http",
                    "port": int(spec.get("port", 80)),
                    "targetPort": int(spec.get("targetPort", spec.get("port", 80))),
                    "protocol": "TCP",
                }
            ],
        },
    }


def ingress(spec: dict) -> dict:
    name = spec["name"]
    host = spec["host"]
    service_name = spec.get("service", name)
    service_port = int(spec.get("port", 80))
    tls = bool(spec.get("tls", False))
    annotations = spec.get("annotations", {})

    manifest = {
        "apiVersion": "networking.k8s.io/v1",
        "kind": "Ingress",
        "metadata": {
            "name": name,
            "namespace": spec.get("namespace", "default"),
            "annotations": annotations,
        },
        "spec": {
            "ingressClassName": spec.get("ingressClassName", "nginx"),
            "rules": [
                {
                    "host": host,
                    "http": {
                        "paths": [
                            {
                                "path": "/",
                                "pathType": "Prefix",
                                "backend": {
                                    "service": {
                                        "name": service_name,
                                        "port": {"number": service_port},
                                    }
                                },
                            }
                        ]
                    },
                }
            ],
        },
    }
    if tls:
        manifest["spec"]["tls"] = [{"hosts": [host], "secretName": f"{name}-tls"}]
    return manifest


def configmap(spec: dict) -> dict:
    return {
        "apiVersion": "v1",
        "kind": "ConfigMap",
        "metadata": {
            "name": spec["name"],
            "namespace": spec.get("namespace", "default"),
        },
        "data": spec.get("data", {}),
    }


def secret(spec: dict) -> dict:
    return {
        "apiVersion": "v1",
        "kind": "Secret",
        "metadata": {
            "name": spec["name"],
            "namespace": spec.get("namespace", "default"),
        },
        "type": spec.get("type", "Opaque"),
        "stringData": spec.get("data", {}),
    }


def pvc(spec: dict) -> dict:
    return {
        "apiVersion": "v1",
        "kind": "PersistentVolumeClaim",
        "metadata": {
            "name": spec["name"],
            "namespace": spec.get("namespace", "default"),
        },
        "spec": {
            "accessModes": spec.get("accessModes", ["ReadWriteOnce"]),
            "resources": {"requests": {"storage": spec.get("storage", "1Gi")}},
            "storageClassName": spec.get("storageClassName", "local-path"),
        },
    }


def job(spec: dict) -> dict:
    name = spec["name"]
    return {
        "apiVersion": "batch/v1",
        "kind": "Job",
        "metadata": {"name": name, "namespace": spec.get("namespace", "default")},
        "spec": {
            "template": {
                "spec": {
                    "containers": [
                        {
                            "name": name,
                            "image": spec["image"],
                            "command": spec.get("command", []),
                        }
                    ],
                    "restartPolicy": "OnFailure",
                }
            },
            "backoffLimit": int(spec.get("backoffLimit", 3)),
        },
    }


def cronjob(spec: dict) -> dict:
    inner_job = job(spec)
    return {
        "apiVersion": "batch/v1",
        "kind": "CronJob",
        "metadata": {
            "name": spec["name"],
            "namespace": spec.get("namespace", "default"),
        },
        "spec": {
            "schedule": spec.get("schedule", "*/5 * * * *"),
            "jobTemplate": {"spec": inner_job["spec"]},
        },
    }


def hpa(spec: dict) -> dict:
    return {
        "apiVersion": "autoscaling/v2",
        "kind": "HorizontalPodAutoscaler",
        "metadata": {
            "name": spec["name"],
            "namespace": spec.get("namespace", "default"),
        },
        "spec": {
            "scaleTargetRef": {
                "apiVersion": "apps/v1",
                "kind": spec.get("targetKind", "Deployment"),
                "name": spec.get("targetName", spec["name"]),
            },
            "minReplicas": int(spec.get("minReplicas", 1)),
            "maxReplicas": int(spec.get("maxReplicas", 5)),
            "metrics": [
                {
                    "type": "Resource",
                    "resource": {
                        "name": "cpu",
                        "target": {
                            "type": "Utilization",
                            "averageUtilization": int(
                                spec.get("targetCPU", 70)
                            ),
                        },
                    },
                }
            ],
        },
    }


def networkpolicy(spec: dict) -> dict:
    return {
        "apiVersion": "networking.k8s.io/v1",
        "kind": "NetworkPolicy",
        "metadata": {
            "name": spec["name"],
            "namespace": spec.get("namespace", "default"),
        },
        "spec": {
            "podSelector": {"matchLabels": {"app": spec.get("selector", spec["name"])}},
            "policyTypes": spec.get("policyTypes", ["Ingress"]),
            "ingress": spec.get("ingress", [{"from": [{"podSelector": {}}]}]),
        },
    }


def service_account(spec: dict) -> dict:
    return {
        "apiVersion": "v1",
        "kind": "ServiceAccount",
        "metadata": {
            "name": spec["name"],
            "namespace": spec.get("namespace", "default"),
        },
    }


def role(spec: dict) -> dict:
    return {
        "apiVersion": "rbac.authorization.k8s.io/v1",
        "kind": "Role",
        "metadata": {
            "name": spec["name"],
            "namespace": spec.get("namespace", "default"),
        },
        "rules": spec.get(
            "rules",
            [
                {
                    "apiGroups": [""],
                    "resources": ["pods"],
                    "verbs": ["get", "list", "watch"],
                }
            ],
        ),
    }


def role_binding(spec: dict) -> dict:
    return {
        "apiVersion": "rbac.authorization.k8s.io/v1",
        "kind": "RoleBinding",
        "metadata": {
            "name": spec["name"],
            "namespace": spec.get("namespace", "default"),
        },
        "subjects": [
            {
                "kind": "ServiceAccount",
                "name": spec.get("serviceAccount", spec["name"]),
                "namespace": spec.get("namespace", "default"),
            }
        ],
        "roleRef": {
            "kind": "Role",
            "name": spec.get("role", spec["name"]),
            "apiGroup": "rbac.authorization.k8s.io",
        },
    }


GENERATORS = {
    "Deployment": deployment,
    "StatefulSet": statefulset,
    "DaemonSet": daemonset,
    "Service": service,
    "Ingress": ingress,
    "ConfigMap": configmap,
    "Secret": secret,
    "PersistentVolumeClaim": pvc,
    "Job": job,
    "CronJob": cronjob,
    "HorizontalPodAutoscaler": hpa,
    "NetworkPolicy": networkpolicy,
    "ServiceAccount": service_account,
    "Role": role,
    "RoleBinding": role_binding,
}


def generate(kind: str, spec: dict) -> str:
    if kind not in GENERATORS:
        raise ValueError(f"Unsupported resource kind: {kind}")
    return dump(GENERATORS[kind](spec))
