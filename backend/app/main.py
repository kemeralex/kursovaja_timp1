import logging
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles

from app.core.logging_config import setup_logging
from app.middleware.rate_limit import RateLimitMiddleware
from app.routers.auth import router as auth_router
from app.routers.chats import router as chats_router
from app.routers.messages import router as messages_router
from app.routers.upload import router as upload_router
from app.routers.users import router as users_router
from app.routers.ws import router as ws_router
from app.startup import on_startup

UPLOAD_DIR = Path(__file__).resolve().parents[1] / "uploads"
UPLOAD_DIR.mkdir(exist_ok=True)


@asynccontextmanager
async def lifespan(app: FastAPI):
    setup_logging()
    on_startup()
    yield


app = FastAPI(
    title="KMB Messenger API",
    version="1.0.0",
    redirect_slashes=True,
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.add_middleware(RateLimitMiddleware)

logger = logging.getLogger("kmb")


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logger.error("Unhandled error on %s: %s", request.url.path, exc)
    return JSONResponse(status_code=500, content={"detail": "Internal server error"})


app.mount("/uploads", StaticFiles(directory=str(UPLOAD_DIR)), name="uploads")

app.include_router(auth_router)
app.include_router(users_router)
app.include_router(chats_router)
app.include_router(messages_router)
app.include_router(upload_router)
app.include_router(ws_router)


@app.get("/")
def root():
    return {"message": "KMB backend running", "version": "1.0.0"}


@app.get("/health")
def health():
    return {"status": "ok"}
