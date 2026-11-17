"""Carregamento do modelo e geração de respostas da velo ia.

O servidor tenta carregar o modelo base e o adaptador LoRA. Em desenvolvimento,
defina `VELO_IA_MOCK=1` para conversar com a interface sem GPU e sem baixar
pesos. O modo mock nunca é ativado silenciosamente em produção: se o modelo
falhar, `/health` reporta o erro e `/chat` responde 503.
"""

from __future__ import annotations

import logging
import re
import threading
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Sequence

from .prompts import SYSTEM_PROMPT

logger = logging.getLogger("velo_ia.engine")

DEFAULT_MODEL = "Qwen/Qwen2.5-3B-Instruct"
DEFAULT_MAX_INPUT_TOKENS = 4096
DEFAULT_MAX_NEW_TOKENS = 320

CRISIS_TERMS = (
    "suicid",
    "me matar",
    "me matando",
    "tirar minha vida",
    "tirar a minha vida",
    "acabar com tudo",
    "acabar com a minha vida",
    "me cortar",
    "me machucar",
    "automutil",
    "não quero mais viver",
    "nao quero mais viver",
    "não vale a pena viver",
    "nao vale a pena viver",
    "sumir do mundo",
)

CRISIS_REPLY = (
    "eu tô aqui com você, e o que você sentiu importa muito. 💛\n\n"
    "quando a dor chega nesse ponto, não precisa atravessar isso sozinho. "
    "no brasil, o CVV atende 24h de graça no 188 — por telefone, chat ou e-mail. "
    "se houver risco agora, ligue 190; em emergência de saúde, 192 (SAMU).\n\n"
    "se puder, avise uma pessoa de confiança e fique perto de alguém. "
    "você não é um incômodo por pedir ajuda. quer me contar onde você está agora?"
)

MOCK_REPLIES = (
    "tô aqui. 💛 me conta um pouco mais do que tá acontecendo? não precisa resumir bonito, pode falar do jeito que vier.",
    "entendi. às vezes a cabeça embaralha tudo antes da gente conseguir nomear. o que mais tá pesando aí hoje?",
    "isso soa cansativo. você quer desabafar sem interrupção ou prefere que eu te ajude a pensar em um próximo passo pequeno?",
    "olha, não vou te dar uma frase pronta porque isso não resolve. mas eu tô prestando atenção. como você tá se sentindo agora, de verdade?",
    "faz sentido sentir isso. quer que eu fique aqui um pouco, só conversando, ou você precisa de uma ideia prática pra destravar o dia?",
)


@dataclass(frozen=True)
class EngineConfig:
    model_name: str = DEFAULT_MODEL
    adapter_path: str = ""
    mock: bool = False
    load_in_4bit: bool = True
    # ZeroGPU (Hugging Face Spaces): o `spaces` emula CUDA fora das funções
    # decoradas. Nesse modo carregamos o modelo direto em `cuda` e deixamos o
    # runtime empacotar os pesos para a GPU real na primeira chamada.
    zero_gpu: bool = False
    max_input_tokens: int = DEFAULT_MAX_INPUT_TOKENS
    max_new_tokens: int = DEFAULT_MAX_NEW_TOKENS
    temperature: float = 0.8
    top_p: float = 0.92
    repetition_penalty: float = 1.08


class EngineNotReady(RuntimeError):
    """O modelo não está carregado e o modo mock está desligado."""


def contains_crisis_language(text: str) -> bool:
    normalized = re.sub(r"\s+", " ", text.lower()).strip()
    return any(term in normalized for term in CRISIS_TERMS)


class VeloIaEngine:
    def __init__(self, config: EngineConfig) -> None:
        self.config = config
        self.mock = config.mock
        self.ready = config.mock
        self.error: str | None = None
        self._model: Any = None
        self._tokenizer: Any = None
        self._torch: Any = None
        self._lock = threading.Lock()
        self._mock_index = 0

    # ------------------------------------------------------------------
    # Carregamento
    # ------------------------------------------------------------------
    def load(self) -> None:
        if self.mock:
            logger.info("velo ia em modo mock: nenhum modelo será carregado.")
            self.ready = True
            return

        with self._lock:
            if self.ready:
                return

            try:
                import torch
                from peft import PeftModel
                from transformers import AutoModelForCausalLM, AutoTokenizer
            except ImportError as exc:  # pragma: no cover - depende do ambiente
                self.error = (
                    "Dependências de IA ausentes. Rode "
                    "`pip install -r ai/requirements.txt`."
                )
                raise EngineNotReady(self.error) from exc

            self._torch = torch
            model_name = self.config.model_name

            logger.info("carregando tokenizer de %s", model_name)
            tokenizer = AutoTokenizer.from_pretrained(model_name)
            if tokenizer.pad_token is None:
                tokenizer.pad_token = tokenizer.eos_token
            tokenizer.padding_side = "right"

            use_cuda = torch.cuda.is_available()
            quantization_config = None

            if self.config.zero_gpu:
                # No ZeroGPU o CUDA é emulado no processo principal. Carregar
                # direto em `cuda` deixa os pesos prontos para o runtime
                # empacotar e enviar à GPU real na primeira chamada decorada.
                use_cuda = True
                dtype = torch.bfloat16
                model_kwargs: dict[str, Any] = {
                    "torch_dtype": dtype,
                    "device_map": "cuda",
                    "low_cpu_mem_usage": True,
                }
                logger.info("ZeroGPU: carregando o modelo direto em cuda (emulação).")
            else:
                if use_cuda and self.config.load_in_4bit:
                    try:
                        import bitsandbytes  # noqa: F401
                        from transformers import BitsAndBytesConfig

                        quantization_config = BitsAndBytesConfig(
                            load_in_4bit=True,
                            bnb_4bit_quant_type="nf4",
                            bnb_4bit_compute_dtype=torch.bfloat16,
                            bnb_4bit_use_double_quant=True,
                        )
                        logger.info("carregando modelo em 4-bit (nf4)")
                    except ImportError:
                        logger.warning(
                            "bitsandbytes não instalado; carregando o modelo sem "
                            "quantização. Instale bitsandbytes para economizar VRAM."
                        )

                if use_cuda:
                    dtype = (
                        torch.bfloat16
                        if torch.cuda.is_bf16_supported()
                        else torch.float16
                    )
                    model_kwargs = {
                        "torch_dtype": dtype,
                        "device_map": "auto",
                        "low_cpu_mem_usage": True,
                    }
                else:
                    dtype = torch.float32
                    model_kwargs = {
                        "torch_dtype": dtype,
                        "low_cpu_mem_usage": True,
                    }
                    logger.warning(
                        "nenhuma GPU CUDA encontrada; o modelo vai rodar em CPU e "
                        "pode responder devagar."
                    )

            if quantization_config is not None:
                model_kwargs["quantization_config"] = quantization_config

            logger.info("carregando modelo %s", model_name)
            model = AutoModelForCausalLM.from_pretrained(
                model_name, **model_kwargs
            )

            adapter_ref = self.config.adapter_path.strip()
            adapter_path = Path(adapter_ref).expanduser() if adapter_ref else Path()
            # Aceita tanto uma pasta local quanto um repositório do Hub
            # (`usuario/velo-ia-lora`). O adaptador continua opcional.
            hub_adapter = bool(
                adapter_ref
                and re.fullmatch(r"[\w.-]+/[\w.-]+", adapter_ref)
                and not adapter_path.exists()
            )
            if adapter_ref and (adapter_path / "adapter_config.json").is_file():
                logger.info("aplicando adaptador LoRA de %s", adapter_path)
                model = PeftModel.from_pretrained(model, str(adapter_path))
            elif hub_adapter:
                logger.info("aplicando adaptador LoRA do Hub: %s", adapter_ref)
                model = PeftModel.from_pretrained(model, adapter_ref)
            else:
                logger.warning(
                    "adaptador LoRA não encontrado em %s; usando o modelo base. "
                    "Rode ai/train_velo_ia.py para criar o adaptador.",
                    adapter_ref or "(vazio)",
                )

            model.eval()
            self._tokenizer = tokenizer
            self._model = model
            self.ready = True
            self.error = None
            logger.info("velo ia pronta para conversar.")

    def mark_error(self, error: BaseException) -> None:
        self.ready = False
        self.error = str(error)

    # ------------------------------------------------------------------
    # Geração
    # ------------------------------------------------------------------
    def generate(
        self,
        history: Sequence[dict[str, object]],
        user_message: str,
    ) -> str:
        message = user_message.strip()
        if not message:
            raise ValueError("Mensagem vazia.")

        # Camada determinística de segurança: em temas de risco, não deixamos a
        # resposta depender do humor do modelo.
        if contains_crisis_language(message):
            return CRISIS_REPLY

        if self.mock:
            return self._mock_reply(message)

        if not self.ready or self._model is None or self._tokenizer is None:
            raise EngineNotReady(self.error or "O modelo da velo ia não está carregado.")

        messages = self._build_messages(history, message)
        prompt = self._apply_template(messages)

        with self._lock:
            return self._generate_locked(prompt)

    def _build_messages(
        self,
        history: Sequence[dict[str, object]],
        user_message: str,
    ) -> list[dict[str, str]]:
        messages: list[dict[str, str]] = [
            {"role": "system", "content": SYSTEM_PROMPT}
        ]
        for item in history:
            role = str(item.get("role", ""))
            content = str(item.get("content", "")).strip()
            if role in {"user", "assistant"} and content:
                messages.append({"role": role, "content": content})
        messages.append({"role": "user", "content": user_message})
        return messages

    def _apply_template(self, messages: list[dict[str, str]]) -> str:
        tokenizer = self._tokenizer
        if hasattr(tokenizer, "apply_chat_template"):
            return tokenizer.apply_chat_template(
                messages,
                tokenize=False,
                add_generation_prompt=True,
            )
        # Fallback para modelos sem template de chat.
        lines = []
        for message in messages:
            lines.append(f"{message['role']}: {message['content']}")
        lines.append("assistant:")
        return "\n".join(lines)

    def _generate_locked(self, prompt: str) -> str:
        torch = self._torch
        tokenizer = self._tokenizer
        model = self._model

        encoded = tokenizer(
            prompt,
            return_tensors="pt",
            truncation=True,
            max_length=self.config.max_input_tokens,
        )
        device = next(model.parameters()).device
        encoded = {key: value.to(device) for key, value in encoded.items()}

        generation_kwargs: dict[str, Any] = {
            "max_new_tokens": self.config.max_new_tokens,
            "do_sample": True,
            "temperature": self.config.temperature,
            "top_p": self.config.top_p,
            "repetition_penalty": self.config.repetition_penalty,
            "pad_token_id": tokenizer.pad_token_id,
            "eos_token_id": tokenizer.eos_token_id,
        }

        with torch.inference_mode():
            output = model.generate(**encoded, **generation_kwargs)

        input_length = int(encoded["input_ids"].shape[-1])
        generated = output[0][input_length:]
        reply = tokenizer.decode(generated, skip_special_tokens=True)
        return self._clean_reply(reply)

    @staticmethod
    def _clean_reply(value: str) -> str:
        text = value.strip()
        text = re.sub(r"^(velo ia|assistant|assistente)\s*:\s*", "", text, flags=re.I)
        text = re.sub(r"\n{3,}", "\n\n", text)
        return text[:4000].strip()

    def _mock_reply(self, message: str) -> str:
        lowered = message.lower()
        if any(term in lowered for term in ("vídeo", "video", "post", "feed", "foto")):
            return (
                "claro! duas ideias que funcionam bem no velo: 1) um vídeo de 15s "
                "com o “antes e depois” de um cantinho que você arrumou; 2) um "
                "mini diário visual do seu trajeto favorito, com um som calmo. "
                "qual combina mais com você?"
            )
        if any(term in lowered for term in ("ansios", "ansiedade", "não consigo dormir", "nao consigo dormir")):
            return (
                "ansiedade adora virar festa justo na hora de dormir, né? tenta "
                "não brigar com o relógio. baixa a luz, deixa o celular um pouco "
                "de lado e escolhe só uma coisa pequena pra resolver amanhã. "
                "uma noite ruim não estraga tudo."
            )
        if any(term in lowered for term in ("trabalho", "chefe", "emprego", "entrevista")):
            return (
                "trabalho tem um jeito especial de ocupar a cabeça mesmo fora do "
                "horário, né? quer me contar o que aconteceu ou prefere pensar "
                "juntos em algo pequeno que te faça sentir mais no controle amanhã?"
            )
        if any(term in lowered for term in ("namor", "crush", "relacionamento", "mensagem")):
            return (
                "essa espera de resposta é cruel. mas visualizar não é a mesma "
                "coisa que ignorar de propósito. você tá com vontade de mandar "
                "outra mensagem ou de respirar um pouco antes?"
            )
        if any(term in lowered for term in ("obrigad", "valeu", "brigad")):
            return "imagina. 💛 tô aqui quando você precisar — e também quando só quiser jogar conversa fora."

        reply = MOCK_REPLIES[self._mock_index % len(MOCK_REPLIES)]
        self._mock_index += 1
        return reply
