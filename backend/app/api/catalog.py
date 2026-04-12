from fastapi import APIRouter

from app.catalog import ADDONS, CERT_PROVIDERS, K8S_VERSIONS, RESOURCE_KINDS

router = APIRouter(prefix="/api/catalog", tags=["catalog"])


@router.get("/k8s-versions")
def k8s_versions():
    return {"versions": K8S_VERSIONS}


@router.get("/cert-providers")
def cert_providers():
    return {"providers": CERT_PROVIDERS}


@router.get("/addons")
def addons():
    return {"addons": ADDONS}


@router.get("/resources")
def resources():
    return {"kinds": RESOURCE_KINDS}
