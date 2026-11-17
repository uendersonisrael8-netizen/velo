"""Entrypoint do Hugging Face Space da velo ia (SDK Gradio + ZeroGPU).

O Space expõe:

    /        status em JSON
    /health  saúde do modelo
    /chat    endpoint usado pelo servidor Next.js (X-API-Key)
    /demo    interface Gradio para testar a IA no navegador

O `spaces` precisa ser importado antes de qualquer módulo que toque em CUDA
(torch/transformers). Por isso ele é o primeiro import deste arquivo.
"""

from __future__ import annotations

import os
import sys
from pathlib import Path

try:
    import spaces  # type: ignore
except ImportError:  # execução local, sem o runtime do ZeroGPU
    spaces = None

BASE_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(BASE_DIR))

import gradio as gr

from engine import EngineNotReady
from serve_velo_ia import app as api_app

if spaces is not None:
    os.environ.setdefault("VELO_IA_ZERO_GPU", "1")

GPU_DURATION = int(os.getenv("VELO_IA_GPU_DURATION", "90"))


def gpu(duration: int = GPU_DURATION):
    """Aplica @spaces.GPU quando o runtime existe; senão vira um no-op."""
    if spaces is not None:
        return spaces.GPU(duration=duration)

    def decorator(function):
        return function

    return decorator


@gpu()
def generate_for_api(history, message):
    """Geração usada pelo FastAPI /chat. O decorator reserva a GPU."""
    return api_app.state.engine.generate(history, message)


# O lifespan do FastAPI respeita esta função já injetada.
api_app.state.generate = generate_for_api


@gpu()
def respond(message, history):
    """Handler do Gradio. Precisa ser decorado para o ZeroGPU detectá-lo."""
    text = (message or "").strip()
    history = list(history or [])
    if not text:
        return "", history

    recent = [
        item
        for item in history
        if isinstance(item, dict) and item.get("role") in {"user", "assistant"}
    ][-15:]

    try:
        reply = api_app.state.engine.generate(recent, text)
    except EngineNotReady:
        reply = "A velo ia está carregando o modelo. Tente de novo em instantes."
    except Exception:
        reply = "A velo ia não conseguiu responder agora. Tente de novo."

    return "", history + [
        {"role": "user", "content": text},
        {"role": "assistant", "content": reply},
    ]


with gr.Blocks(title="velo ia") as demo:
    gr.Markdown(
        "# velo ia\n"
        "Amiga virtual do velo. A API usada pelo app fica em `/chat`; "
        "este chat é só para testar o modelo."
    )
    chatbot = gr.Chatbot(type="messages", label="Conversa", height=420)
    with gr.Row():
        message = gr.Textbox(
            placeholder="Escreva uma mensagem...",
            show_label=False,
            scale=5,
            max_lines=4,
        )
        send = gr.Button("Enviar", variant="primary", scale=1)
    send.click(respond, [message, chatbot], [message, chatbot])
    message.submit(respond, [message, chatbot], [message, chatbot])

demo.queue(default_concurrency_limit=1)

# O Gradio fica em /demo; /health, /chat e /history continuam no FastAPI,
# na mesma porta 7860.
api_app = gr.mount_gradio_app(api_app, demo, path="/demo")


def _report_zerogpu_startup() -> None:
    """Reporta as funções @spaces.GPU manualmente.

    O pacote `spaces` costuma fazer isso no `launch()` do Gradio. Como servimos
    o Gradio com `mount_gradio_app` + uvicorn, chamamos o mesmo hook aqui. Sem
    isso o Space encerra com "No @spaces.GPU function detected during startup".
    """
    if spaces is None:
        return
    try:
        from spaces.zero import startup as zero_startup

        zero_startup()
        print("zerogpu: startup report enviado", flush=True)
    except Exception as exc:  # pragma: no cover - depende do runtime
        print(f"zerogpu: falha ao enviar startup report: {exc}", flush=True)


if __name__ == "__main__":
    import uvicorn

    _report_zerogpu_startup()
    # 7860 é a porta que o proxy do Space espera. Não use $PORT: em Spaces
    # Gradio ele aponta para 7861, que já é usado pelo proxy interno.
    port = int(os.getenv("APP_PORT") or "7860")
    uvicorn.run(api_app, host="0.0.0.0", port=port, log_level="info")
