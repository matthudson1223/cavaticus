import logging
import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from .routers.agent import router
from .routers.providers import router as providers_router

# Setup logging
debug = os.getenv("DEBUG") == "cavaticus"
logging.basicConfig(
    level=logging.DEBUG if debug else logging.INFO,
    format="[cavaticus:agent] %(asctime)s %(levelname)s: %(message)s",
)
logger = logging.getLogger(__name__)
if debug:
    logger.info("Verbose mode enabled")

app = FastAPI(title="Cavaticus Agent")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(router)
app.include_router(providers_router)
