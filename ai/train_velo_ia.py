#!/usr/bin/env python3
"""Fine-tuning LoRA da velo ia.

Exemplo:
    python ai/train_velo_ia.py \
        --model Qwen/Qwen2.5-3B-Instruct \
        --dataset ai/dataset_amigo.jsonl \
        --output-dir ai/velo-ia-lora

O script usa `transformers`, `peft` e `datasets`. Em GPU, tenta quantização
4-bit com bitsandbytes; em CPU, treina em float32 (bem mais lento). O resultado
é um adaptador LoRA pequeno, carregado por `ai/engine.py`.
"""

from __future__ import annotations

import argparse
import json
import math
import os
import random
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import torch
from datasets import load_dataset
from peft import LoraConfig, get_peft_model, prepare_model_for_kbit_training
from transformers import (
    AutoModelForCausalLM,
    AutoTokenizer,
    BitsAndBytesConfig,
    Trainer,
    TrainingArguments,
)

BASE_DIR = Path(__file__).resolve().parent
DEFAULT_MODEL = "Qwen/Qwen2.5-3B-Instruct"
DEFAULT_DATASET = BASE_DIR / "dataset_amigo.jsonl"
DEFAULT_OUTPUT = BASE_DIR / "velo-ia-lora"

LORA_TARGET_MODULES = [
    "q_proj",
    "k_proj",
    "v_proj",
    "o_proj",
    "gate_proj",
    "up_proj",
    "down_proj",
]


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Fine-tuning LoRA da velo ia (amiga virtual do velo)."
    )
    parser.add_argument("--model", default=DEFAULT_MODEL, help="Modelo base do Hugging Face.")
    parser.add_argument(
        "--dataset",
        default=str(DEFAULT_DATASET),
        help="Arquivo JSONL com exemplos no formato {\"messages\": [...]}.",
    )
    parser.add_argument(
        "--output-dir",
        default=str(DEFAULT_OUTPUT),
        help="Pasta onde o adaptador LoRA será salvo.",
    )
    parser.add_argument("--epochs", type=float, default=3.0)
    parser.add_argument("--batch-size", type=int, default=1)
    parser.add_argument("--grad-accum", type=int, default=8)
    parser.add_argument("--lr", type=float, default=2e-4)
    parser.add_argument("--max-seq-len", type=int, default=1024)
    parser.add_argument("--lora-r", type=int, default=16)
    parser.add_argument("--lora-alpha", type=int, default=32)
    parser.add_argument("--lora-dropout", type=float, default=0.05)
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument(
        "--no-4bit",
        action="store_true",
        help="Desliga a quantização 4-bit mesmo com GPU disponível.",
    )
    parser.add_argument(
        "--cpu",
        action="store_true",
        help="Força CPU (útil para testar o pipeline com um modelo pequeno).",
    )
    return parser.parse_args()


def validate_dataset(dataset: Any) -> None:
    """Garante o formato mínimo antes de gastar tempo tokenizando."""
    if len(dataset) == 0:
        raise ValueError("O dataset está vazio.")

    for index, example in enumerate(dataset):
        messages = example.get("messages")
        if not isinstance(messages, list) or len(messages) < 2:
            raise ValueError(f"Exemplo {index}: 'messages' precisa ter pelo menos 2 itens.")
        if messages[0].get("role") != "user":
            raise ValueError(f"Exemplo {index}: a conversa deve começar com 'user'.")
        if messages[-1].get("role") != "assistant":
            raise ValueError(f"Exemplo {index}: a conversa deve terminar com 'assistant'.")

        expected = "user"
        for turn, message in enumerate(messages):
            role = message.get("role")
            content = message.get("content")
            if role not in {"user", "assistant"}:
                raise ValueError(f"Exemplo {index}, turno {turn}: role inválido ({role!r}).")
            if role != expected:
                raise ValueError(
                    f"Exemplo {index}, turno {turn}: esperava {expected!r}, veio {role!r}."
                )
            if not isinstance(content, str) or not content.strip():
                raise ValueError(f"Exemplo {index}, turno {turn}: conteúdo vazio.")
            expected = "assistant" if expected == "user" else "user"

    print(f"dataset validado: {len(dataset)} conversas.")


def build_example(
    example: dict[str, Any],
    tokenizer: Any,
    max_seq_len: int,
) -> dict[str, list[int]]:
    messages = example["messages"]
    prompt_messages = messages[:-1]

    full_text = tokenizer.apply_chat_template(
        messages,
        tokenize=False,
        add_generation_prompt=False,
    )
    prompt_text = tokenizer.apply_chat_template(
        prompt_messages,
        tokenize=False,
        add_generation_prompt=True,
    )

    full = tokenizer(
        full_text,
        add_special_tokens=False,
        truncation=True,
        max_length=max_seq_len,
    )
    prompt = tokenizer(
        prompt_text,
        add_special_tokens=False,
        truncation=True,
        max_length=max_seq_len,
    )

    input_ids = list(full["input_ids"])
    labels = list(input_ids)
    prompt_length = min(len(prompt["input_ids"]), len(labels))

    # Só a resposta da velo ia gera perda. Os turnos da pessoa e o prompt de
    # sistema ficam mascarados com -100.
    for index in range(prompt_length):
        labels[index] = -100

    return {
        "input_ids": input_ids,
        "attention_mask": list(full["attention_mask"]),
        "labels": labels,
    }


class ChatDataCollator:
    def __init__(self, tokenizer: Any) -> None:
        self.pad_token_id = tokenizer.pad_token_id
        if self.pad_token_id is None:
            raise ValueError("O tokenizer precisa de um pad_token.")

    def __call__(self, features: list[dict[str, list[int]]]) -> dict[str, torch.Tensor]:
        max_length = max(len(feature["input_ids"]) for feature in features)
        input_ids: list[list[int]] = []
        attention_mask: list[list[int]] = []
        labels: list[list[int]] = []

        for feature in features:
            padding = max_length - len(feature["input_ids"])
            input_ids.append(feature["input_ids"] + [self.pad_token_id] * padding)
            attention_mask.append(feature["attention_mask"] + [0] * padding)
            labels.append(feature["labels"] + [-100] * padding)

        return {
            "input_ids": torch.tensor(input_ids, dtype=torch.long),
            "attention_mask": torch.tensor(attention_mask, dtype=torch.long),
            "labels": torch.tensor(labels, dtype=torch.long),
        }


def load_model(args: argparse.Namespace) -> tuple[Any, Any, bool]:
    tokenizer = AutoTokenizer.from_pretrained(args.model)
    if tokenizer.pad_token is None:
        tokenizer.pad_token = tokenizer.eos_token
    tokenizer.padding_side = "right"

    use_cuda = torch.cuda.is_available() and not args.cpu
    use_4bit = use_cuda and not args.no_4bit

    model_kwargs: dict[str, Any] = {"low_cpu_mem_usage": True}
    if use_cuda:
        dtype = torch.bfloat16 if torch.cuda.is_bf16_supported() else torch.float16
        model_kwargs["torch_dtype"] = dtype
        model_kwargs["device_map"] = "auto"
    else:
        model_kwargs["torch_dtype"] = torch.float32

    if use_4bit:
        try:
            import bitsandbytes  # noqa: F401

            model_kwargs["quantization_config"] = BitsAndBytesConfig(
                load_in_4bit=True,
                bnb_4bit_quant_type="nf4",
                bnb_4bit_compute_dtype=torch.bfloat16,
                bnb_4bit_use_double_quant=True,
            )
            print("quantização 4-bit ativada.")
        except ImportError:
            print("bitsandbytes não encontrado; treinando sem quantização.")
            use_4bit = False
    elif not use_cuda:
        print("AVISO: treinando em CPU. Use um modelo pequeno e poucos passos.")

    model = AutoModelForCausalLM.from_pretrained(args.model, **model_kwargs)
    model.config.use_cache = False

    if use_4bit:
        model = prepare_model_for_kbit_training(
            model, use_gradient_checkpointing=use_cuda
        )

    lora_config = LoraConfig(
        r=args.lora_r,
        lora_alpha=args.lora_alpha,
        lora_dropout=args.lora_dropout,
        bias="none",
        task_type="CAUSAL_LM",
        target_modules=LORA_TARGET_MODULES,
    )
    model = get_peft_model(model, lora_config)
    model.print_trainable_parameters()
    return model, tokenizer, use_4bit


def main() -> None:
    args = parse_args()
    random.seed(args.seed)
    torch.manual_seed(args.seed)

    dataset_path = Path(args.dataset).expanduser().resolve()
    if not dataset_path.is_file():
        raise SystemExit(f"dataset não encontrado: {dataset_path}")

    output_dir = Path(args.output_dir).expanduser().resolve()
    output_dir.mkdir(parents=True, exist_ok=True)

    raw_dataset = load_dataset("json", data_files=str(dataset_path), split="train")
    validate_dataset(raw_dataset)

    model, tokenizer, used_4bit = load_model(args)

    tokenized = raw_dataset.map(
        lambda example: build_example(example, tokenizer, args.max_seq_len),
        remove_columns=raw_dataset.column_names,
        desc="tokenizando conversas",
    )
    tokenized = tokenized.filter(
        lambda example: any(label != -100 for label in example["labels"]),
        desc="removendo exemplos sem resposta treinável",
    )
    if len(tokenized) == 0:
        raise SystemExit("Nenhum exemplo utilizável depois da tokenização.")

    use_cuda = torch.cuda.is_available() and not args.cpu
    bf16 = use_cuda and torch.cuda.is_bf16_supported()
    fp16 = use_cuda and not bf16

    training_args = TrainingArguments(
        output_dir=str(output_dir / "checkpoints"),
        num_train_epochs=args.epochs,
        per_device_train_batch_size=args.batch_size,
        gradient_accumulation_steps=args.grad_accum,
        learning_rate=args.lr,
        lr_scheduler_type="cosine",
        warmup_ratio=0.03,
        logging_steps=5,
        save_strategy="epoch",
        save_total_limit=2,
        bf16=bf16,
        fp16=fp16,
        optim="paged_adamw_8bit" if used_4bit else "adamw_torch",
        gradient_checkpointing=use_cuda,
        report_to="none",
        remove_unused_columns=False,
        seed=args.seed,
        data_seed=args.seed,
        dataloader_pin_memory=use_cuda,
    )

    trainer = Trainer(
        model=model,
        args=training_args,
        train_dataset=tokenized,
        data_collator=ChatDataCollator(tokenizer),
        processing_class=tokenizer,
    )

    print(
        "iniciando treino:",
        f"{len(tokenized)} exemplos,",
        f"{math.ceil(len(tokenized) / max(1, args.batch_size * args.grad_accum))} "
        "passos por época (aprox.).",
    )
    trainer.train()

    model.save_pretrained(str(output_dir))
    tokenizer.save_pretrained(str(output_dir))

    metadata = {
        "name": "velo ia",
        "base_model": args.model,
        "dataset": str(dataset_path),
        "examples": len(tokenized),
        "epochs": args.epochs,
        "learning_rate": args.lr,
        "lora_r": args.lora_r,
        "lora_alpha": args.lora_alpha,
        "max_seq_len": args.max_seq_len,
        "used_4bit": used_4bit,
        "finished_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
    }
    (output_dir / "velo-ia-training.json").write_text(
        json.dumps(metadata, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )

    print(f"\nadaptador salvo em: {output_dir}")
    print("Aponte VELO_IA_ADAPTER para essa pasta e reinicie a API.")


if __name__ == "__main__":
    main()
