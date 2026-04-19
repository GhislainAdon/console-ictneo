# syntax=docker/dockerfile:1.7
#
# Build context must be the REPO ROOT (not console/), so the image can pull
# in both console/ and scripts/register-cluster.sh. docker-compose.yml sets
# this; if you invoke `docker build` manually, run it from the repo root:
#
#   docker build -f console/Dockerfile -t cloud-ictneo/console:local .

# ---- Stage 1: build the frontend into static assets -------------------------
FROM node:20-alpine AS web

WORKDIR /web
COPY console/frontend/package.json console/frontend/package-lock.json ./
# `npm install` (not `npm ci`) because the project's lockfile is not always
# in strict sync with package.json; we want the image to build reliably from
# a clean checkout regardless.
RUN npm install --no-audit --no-fund
COPY console/frontend/ ./
RUN npm run build      # → /web/dist

# ---- Stage 2: python runtime with kubectl + helm ----------------------------
FROM python:3.12-slim AS runtime

ARG TARGETARCH=amd64
ARG HELM_VERSION=v3.16.1

ENV PYTHONUNBUFFERED=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PIP_NO_CACHE_DIR=1 \
    CONSOLE_STATIC_DIR=/app/static \
    PATH=/usr/local/bin:$PATH

RUN set -eux; \
    apt-get update; \
    apt-get install -y --no-install-recommends curl ca-certificates bash; \
    KUBECTL_VERSION="$(curl -fsSL https://dl.k8s.io/release/stable.txt)"; \
    curl -fsSLo /usr/local/bin/kubectl \
      "https://dl.k8s.io/release/${KUBECTL_VERSION}/bin/linux/${TARGETARCH}/kubectl"; \
    chmod 0755 /usr/local/bin/kubectl; \
    curl -fsSL "https://get.helm.sh/helm-${HELM_VERSION}-linux-${TARGETARCH}.tar.gz" \
      | tar -xz -C /tmp; \
    install -m 0755 "/tmp/linux-${TARGETARCH}/helm" /usr/local/bin/helm; \
    rm -rf "/tmp/linux-${TARGETARCH}"; \
    apt-get purge -y curl; \
    apt-get autoremove -y; \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY console/backend/requirements.txt ./
RUN pip install -r requirements.txt

COPY console/backend/ /app/
COPY scripts/register-cluster.sh /app/scripts/register-cluster.sh
COPY --from=web /web/dist /app/static

RUN mkdir -p /app/data/kubeconfigs
VOLUME ["/app/data"]

EXPOSE 8765

CMD ["python", "-m", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8765"]
