import io
import zipfile
from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from app.services import helm_generator, k8s_generator

router = APIRouter(prefix="/api/generate", tags=["generate"])


class HelmRequest(BaseModel):
    project_name: str
    app_name: str = "app"
    image_repository: str = "nginx"
    image_tag: str = "stable"
    service_port: int = 80
    description: str | None = None


@router.post("/helm/preview")
def helm_preview(payload: HelmRequest):
    files = helm_generator.generate_chart(
        project_name=payload.project_name,
        app_name=payload.app_name,
        image_repository=payload.image_repository,
        image_tag=payload.image_tag,
        service_port=payload.service_port,
        description=payload.description,
    )
    return {"files": files}


@router.post("/helm/download")
def helm_download(payload: HelmRequest):
    files = helm_generator.generate_chart(
        project_name=payload.project_name,
        app_name=payload.app_name,
        image_repository=payload.image_repository,
        image_tag=payload.image_tag,
        service_port=payload.service_port,
        description=payload.description,
    )
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        for path, content in files.items():
            zf.writestr(path, content)
    buf.seek(0)
    return StreamingResponse(
        buf,
        media_type="application/zip",
        headers={
            "Content-Disposition": f'attachment; filename="{payload.app_name}-helm.zip"'
        },
    )


class ResourceRequest(BaseModel):
    kind: str
    spec: dict


@router.post("/resource")
def resource(payload: ResourceRequest):
    if payload.kind not in k8s_generator.GENERATORS:
        raise HTTPException(status_code=400, detail=f"Unsupported kind: {payload.kind}")
    try:
        yaml_str = k8s_generator.generate(payload.kind, payload.spec)
    except (KeyError, ValueError) as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {"kind": payload.kind, "yaml": yaml_str}
