"""Catalog of available K8s versions, addons and cert providers.

Derived from the cloud-ictneo script.sh + add-ons/ directory.
"""

K8S_VERSIONS = ["1.34", "1.33", "1.32", "1.31", "1.30", "1.29"]

CERT_PROVIDERS = [
    {
        "id": "letsencrypt",
        "name": "Let's Encrypt",
        "description": "ACME HTTP-01 via cert-manager",
        "fields": ["email"],
    },
    {
        "id": "cloudflare",
        "name": "Cloudflare Origin CA",
        "description": "Origin certificates via cloudflare-origin-issuer",
        "fields": ["api_token", "zone"],
    },
]

# Addons matching the existing add-ons/ directory in the repo
ADDONS = [
    {
        "id": "cert-manager",
        "name": "cert-manager",
        "category": "security",
        "description": "Certificates and issuers management",
        "default": True,
        "required": True,
    },
    {
        "id": "ingress-nginx",
        "name": "Ingress NGINX",
        "category": "network",
        "description": "HTTP/HTTPS reverse proxy ingress controller",
        "default": True,
        "required": True,
    },
    {
        "id": "local-path-provisioner",
        "name": "Local Path Provisioner",
        "category": "storage",
        "description": "Default storage class (local-path)",
        "default": True,
    },
    {
        "id": "rook-ceph",
        "name": "Rook Ceph",
        "category": "storage",
        "description": "Distributed storage (block / object / filesystem)",
        "default": False,
    },
    {
        "id": "argocd",
        "name": "Argo CD",
        "category": "gitops",
        "description": "GitOps continuous delivery for Kubernetes",
        "default": True,
    },
    {
        "id": "harbor",
        "name": "Harbor",
        "category": "registry",
        "description": "Cloud native container registry",
        "default": False,
    },
    {
        "id": "gitlab",
        "name": "GitLab",
        "category": "devops",
        "description": "Self-hosted Git + CI/CD platform",
        "default": False,
    },
    {
        "id": "keycloak",
        "name": "Keycloak",
        "category": "iam",
        "description": "SSO / OIDC identity and access management",
        "default": False,
    },
    {
        "id": "openldap",
        "name": "OpenLDAP",
        "category": "iam",
        "description": "Directory backend (used by Keycloak)",
        "default": False,
    },
    {
        "id": "phpldapadmin",
        "name": "phpLDAPadmin",
        "category": "iam",
        "description": "Web UI for OpenLDAP",
        "default": False,
    },
    {
        "id": "teleport",
        "name": "Teleport",
        "category": "access",
        "description": "Secure access plane (SSH / K8s / DB)",
        "default": False,
    },
    {
        "id": "monitoring",
        "name": "Prometheus + Grafana",
        "category": "observability",
        "description": "Metrics, dashboards and alerting",
        "default": True,
    },
    {
        "id": "vaultwarden",
        "name": "Vaultwarden",
        "category": "security",
        "description": "Self-hosted Bitwarden-compatible vault",
        "default": False,
    },
    {
        "id": "dolphin-scheduler",
        "name": "Dolphin Scheduler",
        "category": "data",
        "description": "Distributed workflow scheduler",
        "default": False,
    },
    {
        "id": "flink",
        "name": "Apache Flink",
        "category": "data",
        "description": "Stream processing engine",
        "default": False,
    },
    {
        "id": "kafka",
        "name": "Apache Kafka",
        "category": "data",
        "description": "Distributed event streaming platform",
        "default": False,
    },
]

RESOURCE_KINDS = [
    "Deployment",
    "StatefulSet",
    "DaemonSet",
    "Job",
    "CronJob",
    "Service",
    "Ingress",
    "ConfigMap",
    "Secret",
    "PersistentVolumeClaim",
    "HorizontalPodAutoscaler",
    "NetworkPolicy",
    "ServiceAccount",
    "Role",
    "RoleBinding",
]
