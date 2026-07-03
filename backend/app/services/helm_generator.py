"""Generate a Helm chart from a project spec.

Produces a dict of {relative_path: file_content_str} that can be written
to disk or streamed as a zip. Includes values-dev/test/prod.yaml.
"""

from __future__ import annotations

import yaml


def _ordered_yaml(data: dict) -> str:
    return yaml.safe_dump(data, sort_keys=False, default_flow_style=False)


def _base_values(env: str) -> dict:
    env_defaults = {
        "dev": {
            "replicaCount": 1,
            "resources": {
                "requests": {"cpu": "50m", "memory": "64Mi"},
                "limits": {"cpu": "250m", "memory": "256Mi"},
            },
            "ingress": {"enabled": True, "host": "dev.example.local"},
            "autoscaling": {"enabled": False},
            "image": {"tag": "latest", "pullPolicy": "Always"},
        },
        "test": {
            "replicaCount": 2,
            "resources": {
                "requests": {"cpu": "100m", "memory": "128Mi"},
                "limits": {"cpu": "500m", "memory": "512Mi"},
            },
            "ingress": {"enabled": True, "host": "test.example.local"},
            "autoscaling": {"enabled": False},
            "image": {"tag": "staging", "pullPolicy": "IfNotPresent"},
        },
        "prod": {
            "replicaCount": 3,
            "resources": {
                "requests": {"cpu": "250m", "memory": "256Mi"},
                "limits": {"cpu": "1000m", "memory": "1Gi"},
            },
            "ingress": {"enabled": True, "host": "example.local"},
            "autoscaling": {
                "enabled": True,
                "minReplicas": 3,
                "maxReplicas": 10,
                "targetCPUUtilizationPercentage": 70,
            },
            "image": {"tag": "stable", "pullPolicy": "IfNotPresent"},
        },
    }
    return env_defaults[env]


def _deployment_template() -> str:
    return """apiVersion: apps/v1
kind: Deployment
metadata:
  name: {{ include "app.fullname" . }}
  labels:
    {{- include "app.labels" . | nindent 4 }}
spec:
  {{- if not .Values.autoscaling.enabled }}
  replicas: {{ .Values.replicaCount }}
  {{- end }}
  selector:
    matchLabels:
      {{- include "app.selectorLabels" . | nindent 6 }}
  template:
    metadata:
      labels:
        {{- include "app.selectorLabels" . | nindent 8 }}
    spec:
      serviceAccountName: {{ include "app.fullname" . }}
      containers:
        - name: {{ .Chart.Name }}
          image: "{{ .Values.image.repository }}:{{ .Values.image.tag | default .Chart.AppVersion }}"
          imagePullPolicy: {{ .Values.image.pullPolicy }}
          ports:
            - name: http
              containerPort: {{ .Values.service.port }}
              protocol: TCP
          {{- with .Values.env }}
          env:
            {{- toYaml . | nindent 12 }}
          {{- end }}
          resources:
            {{- toYaml .Values.resources | nindent 12 }}
          {{- with .Values.livenessProbe }}
          livenessProbe:
            {{- toYaml . | nindent 12 }}
          {{- end }}
          {{- with .Values.readinessProbe }}
          readinessProbe:
            {{- toYaml . | nindent 12 }}
          {{- end }}
"""


def _service_template() -> str:
    return """apiVersion: v1
kind: Service
metadata:
  name: {{ include "app.fullname" . }}
  labels:
    {{- include "app.labels" . | nindent 4 }}
spec:
  type: {{ .Values.service.type }}
  ports:
    - port: {{ .Values.service.port }}
      targetPort: http
      protocol: TCP
      name: http
  selector:
    {{- include "app.selectorLabels" . | nindent 4 }}
"""


def _ingress_template() -> str:
    return """{{- if .Values.ingress.enabled -}}
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: {{ include "app.fullname" . }}
  labels:
    {{- include "app.labels" . | nindent 4 }}
  {{- with .Values.ingress.annotations }}
  annotations:
    {{- toYaml . | nindent 4 }}
  {{- end }}
spec:
  ingressClassName: {{ .Values.ingress.className | default "nginx" }}
  {{- if .Values.ingress.tls }}
  tls:
    - hosts:
        - {{ .Values.ingress.host }}
      secretName: {{ include "app.fullname" . }}-tls
  {{- end }}
  rules:
    - host: {{ .Values.ingress.host }}
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: {{ include "app.fullname" . }}
                port:
                  number: {{ .Values.service.port }}
{{- end }}
"""


def _hpa_template() -> str:
    return """{{- if .Values.autoscaling.enabled }}
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: {{ include "app.fullname" . }}
  labels:
    {{- include "app.labels" . | nindent 4 }}
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: {{ include "app.fullname" . }}
  minReplicas: {{ .Values.autoscaling.minReplicas }}
  maxReplicas: {{ .Values.autoscaling.maxReplicas }}
  metrics:
    - type: Resource
      resource:
        name: cpu
        target:
          type: Utilization
          averageUtilization: {{ .Values.autoscaling.targetCPUUtilizationPercentage }}
{{- end }}
"""


def _sa_template() -> str:
    return """apiVersion: v1
kind: ServiceAccount
metadata:
  name: {{ include "app.fullname" . }}
  labels:
    {{- include "app.labels" . | nindent 4 }}
"""


def _configmap_template() -> str:
    return """{{- if .Values.config }}
apiVersion: v1
kind: ConfigMap
metadata:
  name: {{ include "app.fullname" . }}-config
  labels:
    {{- include "app.labels" . | nindent 4 }}
data:
  {{- toYaml .Values.config | nindent 2 }}
{{- end }}
"""


def _helpers_template() -> str:
    return """{{/*
Expand the name of the chart.
*/}}
{{- define "app.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Create a default fully qualified app name.
*/}}
{{- define "app.fullname" -}}
{{- if .Values.fullnameOverride }}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- $name := default .Chart.Name .Values.nameOverride }}
{{- if contains $name .Release.Name }}
{{- .Release.Name | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- printf "%s-%s" .Release.Name $name | trunc 63 | trimSuffix "-" }}
{{- end }}
{{- end }}
{{- end }}

{{/*
Chart name and version label.
*/}}
{{- define "app.chart" -}}
{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Common labels
*/}}
{{- define "app.labels" -}}
helm.sh/chart: {{ include "app.chart" . }}
{{ include "app.selectorLabels" . }}
{{- if .Chart.AppVersion }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
{{- end }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end }}

{{/*
Selector labels
*/}}
{{- define "app.selectorLabels" -}}
app.kubernetes.io/name: {{ include "app.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end }}
"""


def generate_chart(
    project_name: str,
    app_name: str = "app",
    image_repository: str = "nginx",
    image_tag: str = "stable",
    service_port: int = 80,
    description: str | None = None,
) -> dict[str, str]:
    """Return a dict mapping file-path -> content for a complete Helm chart."""

    chart_yaml = {
        "apiVersion": "v2",
        "name": app_name,
        "description": description or f"Helm chart generated for project {project_name}",
        "type": "application",
        "version": "0.1.0",
        "appVersion": "1.0.0",
    }

    base_values = {
        "nameOverride": "",
        "fullnameOverride": "",
        "image": {
            "repository": image_repository,
            "tag": image_tag,
            "pullPolicy": "IfNotPresent",
        },
        "service": {"type": "ClusterIP", "port": service_port},
        "ingress": {
            "enabled": False,
            "className": "nginx",
            "host": "example.local",
            "tls": False,
            "annotations": {},
        },
        "resources": {
            "requests": {"cpu": "100m", "memory": "128Mi"},
            "limits": {"cpu": "500m", "memory": "512Mi"},
        },
        "autoscaling": {
            "enabled": False,
            "minReplicas": 1,
            "maxReplicas": 5,
            "targetCPUUtilizationPercentage": 80,
        },
        "replicaCount": 1,
        "env": [],
        "config": {},
        "livenessProbe": {"httpGet": {"path": "/", "port": "http"}},
        "readinessProbe": {"httpGet": {"path": "/", "port": "http"}},
    }

    files: dict[str, str] = {
        f"{app_name}/Chart.yaml": _ordered_yaml(chart_yaml),
        f"{app_name}/values.yaml": _ordered_yaml(base_values),
        f"{app_name}/values-dev.yaml": _ordered_yaml(_base_values("dev")),
        f"{app_name}/values-test.yaml": _ordered_yaml(_base_values("test")),
        f"{app_name}/values-prod.yaml": _ordered_yaml(_base_values("prod")),
        f"{app_name}/templates/_helpers.tpl": _helpers_template(),
        f"{app_name}/templates/deployment.yaml": _deployment_template(),
        f"{app_name}/templates/service.yaml": _service_template(),
        f"{app_name}/templates/ingress.yaml": _ingress_template(),
        f"{app_name}/templates/hpa.yaml": _hpa_template(),
        f"{app_name}/templates/serviceaccount.yaml": _sa_template(),
        f"{app_name}/templates/configmap.yaml": _configmap_template(),
        f"{app_name}/.helmignore": "# Patterns to ignore when building packages.\n.DS_Store\n.git/\n.gitignore\n*.tmproj\n.idea/\n.vscode/\n",
        f"{app_name}/README.md": (
            f"# {app_name}\n\n"
            f"Helm chart generated by console-ictneo for project `{project_name}`.\n\n"
            f"## Install (dev)\n\n"
            f"```bash\nhelm install {app_name} ./{app_name} -f ./{app_name}/values-dev.yaml\n```\n"
        ),
    }
    return files
