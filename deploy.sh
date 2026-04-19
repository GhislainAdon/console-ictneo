#!/usr/bin/env bash
# cloud-ictneo · console · one-shot Docker deploy
#
# Builds the image (multi-stage node + python), ensures the data volume
# exists, and starts the container bound to 127.0.0.1:8765.
#
# Usage:
#   ./deploy.sh          # build + up
#   ./deploy.sh down     # stop and remove the container
#   ./deploy.sh logs     # follow container logs

set -euo pipefail

cd "$(dirname "$0")"

COMPOSE=(docker compose)
if ! docker compose version >/dev/null 2>&1; then
  if command -v docker-compose >/dev/null 2>&1; then
    COMPOSE=(docker-compose)
  else
    echo "error: neither 'docker compose' nor 'docker-compose' found on PATH" >&2
    echo "install Docker Desktop (https://www.docker.com/products/docker-desktop/) and retry." >&2
    exit 1
  fi
fi

cmd="${1:-up}"
case "$cmd" in
  up|"")
    mkdir -p data/kubeconfigs
    "${COMPOSE[@]}" up -d --build
    echo
    echo "Console ready at: http://127.0.0.1:8765"
    echo "API docs:         http://127.0.0.1:8765/docs"
    echo "Follow logs:      ./deploy.sh logs"
    ;;
  down)
    "${COMPOSE[@]}" down
    ;;
  logs)
    "${COMPOSE[@]}" logs -f
    ;;
  ps)
    "${COMPOSE[@]}" ps
    ;;
  *)
    echo "unknown command: $cmd (expected: up | down | logs | ps)" >&2
    exit 2
    ;;
esac
