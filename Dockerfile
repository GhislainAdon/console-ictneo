# syntax=docker/dockerfile:1.7
#
# Build context = this repo's root. Everything the image needs (backend/,
# frontend/, scripts/register-cluster.sh) lives in this repo:
#
#   docker build -t console-ictneo:local .

# ---- Stage 1: build the frontend into static assets -------------------------
FROM node:22-alpine AS web

WORKDIR /web
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY frontend/ ./
RUN npm run build      # → /web/dist

# ---- Stage 2: python runtime with kubectl + helm ----------------------------
FROM python:3.12-slim AS runtime

ARG TARGETARCH=amd64
ARG HELM_VERSION=v3.22.1

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

COPY backend/requirements.txt ./
RUN pip install -r requirements.txt

COPY backend/ /app/
COPY scripts/register-cluster.sh /app/scripts/register-cluster.sh
COPY --from=web /web/dist /app/static

# Run as a dedicated non-root user; /app/data is the only writable path
# (SQLite DB + kubeconfigs). --create-home gives helm/kubectl a HOME for
# their config/cache dirs.
RUN useradd --system --create-home --uid 10001 console \
    && mkdir -p /app/data/kubeconfigs \
    && chown -R console:console /app/data
VOLUME ["/app/data"]

USER console

EXPOSE 8765

CMD ["python", "-m", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8765"]
