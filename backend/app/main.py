from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.db import init_db
from app.api import catalog, clusters, generators, namespaces, nodes, projects

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
