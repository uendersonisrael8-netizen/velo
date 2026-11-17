"""API FastAPI da velo ia.

Rotas:
    GET    /health
    POST   /chat
    GET    /history/{conversation_id}
    DELETE /history/{conversation_id}

A API é feita para ser chamada pelo servidor Next.js, nunca diretamente pelo
navegador. Por isso não há CORS e todas as rotas de dados exigem `X-API-Key`
quando `VELO_IA_API_KEY` está definida.
"""

from __future__ import annotations

import logging
import os
import secrets
import sys
from contextlib import asynccontextmanager
from dataclasses import dataclass
from pathlib import Path
from typing import AsyncIterator

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, Header, HTTPException, Query, Request
from pydantic import BaseModel, Field, field_validator
from starlette.concurrency import run_in_threadpool

BASE_DIR = Path(__file__).resolve().parent

if __package__:
    from .version import __version__
    from .engine import EngineConfig, EngineNotReady, VeloIaEngine
    from .memory import DEFAULT_HISTORY_LIMIT, MemoryStore
else:
    # Funciona tanto com `python ai/serve_velo_ia.py` quanto com os arquivos
    # soltos na raiz de um Hugging Face Space (`python app.py`).
    sys.path.insert(0, str(BASE_DIR))
    from version import __version__
    from engine import EngineConfig, EngineNotReady, VeloIaEngine
    from memory import DEFAULT_HISTORY_LIMIT, MemoryStore

load_dotenv(BASE_DIR / ".env")

logging.basicConfig(
    level=os.getenv("VELO_IA_LOG_LEVEL", "INFO").upper(),
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
)
logger = logging.getLogger("velo_ia.api")

TRUTHY = {"1", "true", "yes", "on", "sim"}


def env_flag(name: str, default: bool = False) -> bool:
    value = os.getenv(name)
    if value is None:
        return default
    return value.strip().lower() in TRUTHY


def env_path(name: str, default: Path) -> str:
    value = os.getenv(name, "").strip()
    if not value:
        return str(default)
    path = Path(value).expanduser()
    return str(path if path.is_absolute() else (BASE_DIR / path).resolve())


@dataclass(frozen=True)
class Settings:
    api_key: str
    model_name: str
    adapter_path: str
    memory_db: str
    mock: bool
    load_in_4bit: bool
    zero_gpu: bool
    host: str
    port: int

    @classmethod
    def from_env(cls) -> "Settings":
        return cls(
            api_key=os.getenv("VELO_IA_API_KEY", "").strip(),
            model_name=os.getenv(
                "VELO_IA_MODEL", "Qwen/Qwen2.5-3B-Instruct"
            ).strip(),
            adapter_path=env_path("VELO_IA_ADAPTER", BASE_DIR / "velo-ia-lora"),
            memory_db=env_path("VELO_IA_MEMORY_DB", BASE_DIR / "velo_ia_memory.db"),
            mock=env_flag("VELO_IA_MOCK", False),
            load_in_4bit=env_flag("VELO_IA_4BIT", True),
            zero_gpu=env_flag("VELO_IA_ZERO_GPU", False),
            host=os.getenv("VELO_IA_HOST", "127.0.0.1").strip(),
            port=int(os.getenv("VELO_IA_PORT", "8000")),
        )


class ChatRequest(BaseModel):
    conversation_id: str = Field(min_length=8, max_length=80)
    message: str = Field(min_length=1, max_length=2000)

    @field_validator("conversation_id")
    @classmethod
    def validate_conversation_id(cls, value: str) -> str:
        return MemoryStore.validate_conversation_id(value)

    @field_validator("message")
    @classmethod
    def validate_message(cls, value: str) -> str:
        text = value.strip()
        if not text:
            raise ValueError("A mensagem não pode ficar vazia.")
        return text


class ChatResponse(BaseModel):
    reply: str
    conversation_id: str
    model: str
    mock: bool


class MessageOut(BaseModel):
    id: int
    role: str
    content: str
    created_at: str


class HistoryResponse(BaseModel):
    conversation_id: str
    messages: list[MessageOut]


class ClearResponse(BaseModel):
    ok: bool
    deleted: int


def require_api_key(
    request: Request,
    x_api_key: str | None = Header(default=None, alias="X-API-Key"),
) -> None:
    expected = request.app.state.settings.api_key
    if not expected:
        # Em desenvolvimento local a chave é opcional. Em produção, defina
        # VELO_IA_API_KEY e configure o mesmo valor no Next.js.
        return
    if not x_api_key or not secrets.compare_digest(x_api_key, expected):
        raise HTTPException(status_code=401, detail="API key inválida.")


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    settings = Settings.from_env()
    app.state.settings = settings
    app.state.memory = MemoryStore(settings.memory_db)

    engine = VeloIaEngine(
        EngineConfig(
            model_name=settings.model_name,
            adapter_path=settings.adapter_path,
            mock=settings.mock,
            load_in_4bit=settings.load_in_4bit,
            zero_gpu=settings.zero_gpu,
        )
    )
    app.state.engine = engine
    # O Space pode injetar aqui uma função decorada com @spaces.GPU antes do
    # startup. Fora do ZeroGPU, usamos a geração normal do engine.
    if not hasattr(app.state, "generate"):
        app.state.generate = engine.generate

    if not settings.api_key:
        logger.warning(
            "VELO_IA_API_KEY não definida: a API está sem autenticação. "
            "Defina a chave antes de expor o servidor na internet."
        )

    if settings.mock:
        logger.info("modo mock ativo (VELO_IA_MOCK=1).")
    else:
        logger.info("carregando modelo no startup...")
        try:
            await run_in_threadpool(engine.load)
        except Exception as exc:  # noqa: BLE001 - o servidor continua de pé
            logger.exception("falha ao carregar o modelo: %s", exc)
            engine.mark_error(exc)

    yield

    logger.info("encerrando velo ia.")


app = FastAPI(
    title="velo ia",
    description="API da amiga virtual do velo. Uso interno, autenticada por API key.",
    version=__version__,
    lifespan=lifespan,
    docs_url=None,
    redoc_url=None,
    openapi_url=None,
)


@app.get("/")
def root(request: Request) -> dict[str, object]:
    engine: VeloIaEngine = request.app.state.engine
    return {
        "name": "velo ia",
        "version": __version__,
        "mock": engine.mock,
        "ready": engine.ready,
        "demo": "/demo",
    }


@app.get("/health")
def health(request: Request) -> dict[str, object]:
    settings: Settings = request.app.state.settings
    engine: VeloIaEngine = request.app.state.engine
    return {
        "ok": True,
        "name": "velo ia",
        "version": __version__,
        "status": "ok" if engine.ready else "degraded",
        "ready": engine.ready,
        "mock": engine.mock,
        "zero_gpu": settings.zero_gpu,
        "model": settings.model_name,
        "error": engine.error,
    }


@app.post(
    "/chat",
    response_model=ChatResponse,
    dependencies=[Depends(require_api_key)],
)
async def chat(payload: ChatRequest, request: Request) -> ChatResponse:
    settings: Settings = request.app.state.settings
    memory: MemoryStore = request.app.state.memory
    engine: VeloIaEngine = request.app.state.engine

    conversation_id = payload.conversation_id
    history = memory.recent_messages(conversation_id, limit=DEFAULT_HISTORY_LIMIT)
    user_message_id = memory.add_message(conversation_id, "user", payload.message)

    try:
        generator = getattr(request.app.state, "generate", engine.generate)
        reply = await run_in_threadpool(generator, history, payload.message)
        if not reply.strip():
            raise RuntimeError("O modelo retornou uma resposta vazia.")
    except EngineNotReady as exc:
        memory.delete_message(user_message_id)
        raise HTTPException(
            status_code=503,
            detail="A velo ia está indisponível agora. Tente de novo em instantes.",
        ) from exc
    except Exception as exc:  # noqa: BLE001
        memory.delete_message(user_message_id)
        logger.exception("falha ao gerar resposta: %s", exc)
        raise HTTPException(
            status_code=502,
            detail="A velo ia não conseguiu responder agora. Tente de novo.",
        ) from exc

    memory.add_message(conversation_id, "assistant", reply)
    return ChatResponse(
        reply=reply,
        conversation_id=conversation_id,
        model=settings.model_name,
        mock=engine.mock,
    )


@app.get(
    "/history/{conversation_id}",
    response_model=HistoryResponse,
    dependencies=[Depends(require_api_key)],
)
def history(
    conversation_id: str,
    request: Request,
    limit: int = Query(default=50, ge=1, le=200),
) -> HistoryResponse:
    memory: MemoryStore = request.app.state.memory
    try:
        messages = memory.history(conversation_id, limit=limit)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return HistoryResponse(conversation_id=conversation_id, messages=messages)


@app.delete(
    "/history/{conversation_id}",
    response_model=ClearResponse,
    dependencies=[Depends(require_api_key)],
)
def clear_history(conversation_id: str, request: Request) -> ClearResponse:
    memory: MemoryStore = request.app.state.memory
    try:
        deleted = memory.clear(conversation_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return ClearResponse(ok=True, deleted=deleted)


if __name__ == "__main__":
    import uvicorn

    settings = Settings.from_env()
    uvicorn.run(
        app,
        host=settings.host,
        port=settings.port,
        log_level=os.getenv("VELO_IA_LOG_LEVEL", "info").lower(),
    )
