# velo ia — amiga virtual do velo

Esta pasta contém o serviço de IA do velo:

| Arquivo | Função |
| --- | --- |
| `train_velo_ia.py` | Fine-tuning LoRA com `transformers`, `peft` e `datasets`. |
| `dataset_amigo.jsonl` | 10 diálogos de exemplo, informais e empáticos. |
| `engine.py` | Carrega o modelo/adaptador e gera respostas. |
| `memory.py` | Memória de curto prazo em SQLite (últimas 15 mensagens no prompt). |
| `serve_velo_ia.py` | API FastAPI consumida pelo servidor Next.js. |
| `prompts.py` | Prompt de sistema e mensagem de boas-vindas. |
| `requirements*.txt` | Dependências de servir e treinar. |

> A IA se chama **velo ia**. O navegador e o app Android nunca falam com esta
> API diretamente: o Next.js autentica a pessoa, aplica rate limit e repassa a
> mensagem com a `X-API-Key`. O modelo e o segredo ficam só no servidor.

---

## 1. Requisitos

- **Python 3.10 a 3.12** (recomendado 3.11).
- Para treinar com conforto: GPU NVIDIA com **12 GB+ de VRAM** para um modelo
  3B em 4-bit. Um modelo 2B cabe em menos VRAM.
- Sem GPU, o treino roda em CPU, mas é muito lento. Para testar a interface,
  use o **modo mock** (`VELO_IA_MOCK=1`) e não baixe modelo nenhum.
- O modelo Llama 3.2 exige aceitar a licença no Hugging Face e autenticar:
  `huggingface-cli login` (ou `HF_TOKEN`). O Gemma 2 também exige aceite.

## 2. Instalar as dependências

### Windows (PowerShell)

```powershell
cd "C:\caminho\para\velo"
py -3.11 -m venv ai\.venv
ai\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
pip install -r ai\requirements-train.txt
```

Se o PowerShell bloquear a ativação:

```powershell
Set-ExecutionPolicy -Scope CurrentUser RemoteSigned
```

### macOS / Linux

```bash
cd /caminho/para/velo
python3.11 -m venv ai/.venv
source ai/.venv/bin/activate
python -m pip install --upgrade pip
pip install -r ai/requirements-train.txt
```

Para servir sem treinar, `pip install -r ai/requirements.txt` já basta.

## 3. Configurar

```bash
cp ai/.env.example ai/.env
```

Edite `ai/.env` e defina pelo menos `VELO_IA_API_KEY`. Gere um segredo com:

```bash
openssl rand -hex 32
```

No `.env.local` do Next.js (e nas variáveis da Vercel), use os mesmos valores:

```env
VELO_IA_API_URL=http://127.0.0.1:8000
VELO_IA_API_KEY=o-mesmo-segredo-do-ai/.env
```

Em produção, `VELO_IA_API_URL` precisa ser uma URL **HTTPS** pública do
serviço Python.

## 4. Rodar a API em modo mock (sem modelo)

Ótimo para desenvolver a tela de chat sem GPU:

```bash
# no ai/.env: VELO_IA_MOCK=1
python -m ai.serve_velo_ia
```

ou:

```bash
uvicorn ai.serve_velo_ia:app --host 127.0.0.1 --port 8000
```

Teste:

```bash
curl http://127.0.0.1:8000/health
```

```bash
curl -X POST http://127.0.0.1:8000/chat \
  -H "Content-Type: application/json" \
  -H "X-API-Key: SEU_SEGREDO" \
  -d '{"conversation_id":"anon_teste123456","message":"oi, tudo bem?"}'
```

## 5. Treinar o adaptador LoRA

O dataset de exemplo tem 10 conversas — suficiente para demonstrar o pipeline,
**não** para uma amiga virtual de produção. Para um resultado decente, reúna
algumas centenas ou milhares de diálogos no mesmo formato.

```bash
python ai/train_velo_ia.py \
  --model meta-llama/Llama-3.2-3B-Instruct \
  --dataset ai/dataset_amigo.jsonl \
  --output-dir ai/velo-ia-lora \
  --epochs 3 \
  --batch-size 1 \
  --grad-accum 8 \
  --lr 2e-4 \
  --max-seq-len 1024
```

Windows (uma linha):

```powershell
python ai\train_velo_ia.py --model meta-llama/Llama-3.2-3B-Instruct --dataset ai\dataset_amigo.jsonl --output-dir ai\velo-ia-lora --epochs 3 --batch-size 1 --grad-accum 8 --lr 2e-4 --max-seq-len 1024
```

Opções úteis:

- `--no-4bit`: desliga a quantização (mais VRAM, às vezes mais estável).
- `--cpu`: força CPU para testar o pipeline com um modelo pequeno.
- `--lora-r 8` / `--lora-alpha 16`: adaptador menor.
- `--epochs 1`: teste rápido.

O resultado fica em `ai/velo-ia-lora/` (`adapter_config.json`,
`adapter_model.safetensors`, tokenizer e `velo-ia-training.json`). Aponte
`VELO_IA_ADAPTER` para essa pasta e reinicie a API.

### Formato do dataset

Cada linha é um JSON independente:

```json
{"messages":[{"role":"user","content":"oi"},{"role":"assistant","content":"oi! tudo bem?"}]}
```

Regras: começa com `user`, termina com `assistant`, alterna os papéis e não
deixa conteúdo vazio. O script valida tudo antes de tokenizar. Só as respostas
da velo ia geram perda (os turnos da pessoa são mascarados com `-100`).

## 6. Rodar a API com o modelo real

No `ai/.env`: `VELO_IA_MOCK=0` e `VELO_IA_ADAPTER=velo-ia-lora`.

```bash
python -m ai.serve_velo_ia
```

O carregamento pode levar alguns minutos na primeira vez (download dos pesos).
A API só fica `ready` quando o modelo e o adaptador terminam de carregar. Se
algo falhar, `/health` mostra `status: "degraded"` e o chat responde 503 — o
processo não cai.

## 7. Endpoints

| Método | Rota | Descrição |
| --- | --- | --- |
| `GET` | `/health` | Status, modelo, modo mock e erro de carregamento. |
| `POST` | `/chat` | Recebe `{ conversation_id, message }`, salva e responde. |
| `GET` | `/history/{conversation_id}?limit=50` | Histórico para a tela de chat. |
| `DELETE` | `/history/{conversation_id}` | Limpa a conversa. |

Todas as rotas de dados exigem `X-API-Key` quando `VELO_IA_API_KEY` está
definida. O `conversation_id` é derivado no servidor Next.js: `user_<uuid>` para
quem está autenticado e `anon_<token>` para visitantes (cookie HttpOnly).

### Memória

- Cada conversa guarda até **200 mensagens**.
- A cada nova pergunta, as **últimas 15 mensagens** são enviadas ao modelo.
- O SQLite usa WAL e fica em `ai/velo_ia_memory.db` por padrão.
- Em produção, monte um **disco persistente** para o arquivo do banco. Sem
  isso, cada deploy/reinício perde o histórico. Para várias réplicas, troque o
  SQLite por Postgres (a interface de `memory.py` é pequena e isolada).

## 8. Segurança e privacidade

- Não exponha esta API sem `VELO_IA_API_KEY`.
- Use HTTPS (proxy reverso, Render/Railway/Fly.io ou uma VPS).
- O Next.js aplica rate limit por pessoa (15 mensagens/10 min) e por IP
  (40/10 min) antes de chamar esta API.
- O prompt proíbe diagnósticos e orienta ajuda profissional em crise. Além
  disso, `engine.py` tem uma camada determinística: mensagens com sinais de
  risco recebem uma resposta fixa com CVV 188, SAMU 192 e 190.
- Não envie dados sensíveis para o modelo. A conversa fica no SQLite do
  serviço; a política de retenção é sua.
- A IA é transparente: ela não finge ser humana nem substitui terapia.

## 9. Problemas comuns

| Sintoma | Causa provável |
| --- | --- |
| `401 API key inválida` | `VELO_IA_API_KEY` diferente entre Next.js e API. |
| `/health` com `degraded` | Modelo não baixou, licença não aceita ou VRAM insuficiente. Veja o log. |
| `CUDA out of memory` | Reduza `--max-seq-len`, use 4-bit ou um modelo 2B. |
| `bitsandbytes` não instala | No Windows, instale manualmente; sem ele o modelo roda sem 4-bit. |
| Resposta muito lenta | Modelo em CPU. Use GPU ou o modo mock para desenvolver. |
| `apply_chat_template` ausente | Modelo sem template de chat; use Llama 3.2 Instruct ou Gemma 2 IT. |

## 10. Limitações do dataset de exemplo

Os 10 diálogos servem para validar o formato, o treino e a integração. Eles não
cobrem a diversidade de pessoas, sotaques e situações reais. Antes de publicar,
amplie o dataset com conversas autorizadas, revise vieses e faça avaliação
humana das respostas.
