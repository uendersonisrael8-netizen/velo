# Imagem da API da velo ia para VPS, Render, Railway, Fly.io ou um Space
# Docker com GPU paga. No Hugging Face, o Space gratuito elegível usa o SDK
# Gradio + ZeroGPU; o CPU Basic de Spaces Gradio/Docker exige plano PRO.
# Veja `ai/app.py` e a seção de hospedagem no `ai/README.md`.
#
# Em CPU, use um modelo leve:
#   -e VELO_IA_MODEL=Qwen/Qwen2.5-0.5B-Instruct -e VELO_IA_MAX_NEW_TOKENS=160
#
# Build (na raiz do repositório):
#   docker build -f ai/Dockerfile -t velo-ia .
# Execução em modo mock, sem GPU:
#   docker run --rm -p 8000:8000 -e VELO_IA_MOCK=1 -e VELO_IA_API_KEY=troque velo-ia
#
# Para GPU NVIDIA, troque a base por uma imagem CUDA (por exemplo
# nvidia/cuda:12.4.1-runtime-ubuntu22.04) e instale o torch com CUDA antes de
# `requirements.txt`, ou use uma imagem oficial do PyTorch com CUDA.

FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PYTHONPATH=/app \
    VELO_IA_HOST=0.0.0.0 \
    VELO_IA_PORT=8000 \
    VELO_IA_MEMORY_DB=/data/velo_ia_memory.db \
    HF_HOME=/home/velo/.cache/huggingface

WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends libgomp1 \
    && rm -rf /var/lib/apt/lists/*

COPY ai/requirements.txt /app/ai/requirements.txt

# Torch CPU primeiro: evita baixar o wheel CUDA gigante em hosts sem GPU.
# Em uma imagem CUDA, remova esta linha e instale o torch com CUDA.
RUN python -m pip install --upgrade pip \
    && python -m pip install torch --index-url https://download.pytorch.org/whl/cpu \
    && python -m pip install -r /app/ai/requirements.txt

COPY ai /app/ai

RUN useradd --create-home --uid 10001 velo \
    && mkdir -p /data \
    && chown -R velo:velo /app /data /home/velo

USER velo

VOLUME ["/data"]
EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/health', timeout=4)"

CMD ["python", "-m", "ai.serve_velo_ia"]
