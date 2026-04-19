import os
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.db import init_db
from app.api import (
    catalog,
    clusters,
    generators,
    k8s,
    namespaces,
    nodes,
    projects,
    releases,
)

app = FastAPI(
    title="cloud-ictneo console API",
    version="0.1.0",
    description="Dashboard API for provisioning Kubernetes projects",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def on_startup() -> None:
    init_db()


@app.get("/api/health")
def health():
    return {"status": "ok", "service": "cloud-ictneo-console"}


app.include_router(projects.router)
app.include_router(nodes.router)
app.include_router(catalog.router)
app.include_router(generators.router)
app.include_router(clusters.router)
app.include_router(namespaces.router)
app.include_router(releases.router)
app.include_router(k8s.router)

# Serve the built frontend in Docker mode. The dev flow (start.sh) leaves
# CONSOLE_STATIC_DIR unset and keeps Vite on :5173.
_static_dir = os.environ.get("CONSOLE_STATIC_DIR")
if _static_dir and Path(_static_dir).is_dir():
    app.mount("/", StaticFiles(directory=_static_dir, html=True), name="static")
