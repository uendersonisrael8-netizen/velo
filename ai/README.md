---
title: velo ia
emoji: 💛
colorFrom: yellow
colorTo: pink
sdk: gradio
app_file: app.py
app_port: 7860
python_version: "3.12"
startup_duration_timeout: 30m
pinned: false
short_description: amiga virtual do velo
models:
  - Qwen/Qwen2.5-3B-Instruct
---

# velo ia — amiga virtual do velo

Esta pasta é o serviço de IA do velo **e** o repositório do Hugging Face Space
que o hospeda de graça no ZeroGPU.

| Arquivo | Função |
| --- | --- |
| `app.py` | Entrada do Space: monta o FastAPI + Gradio e decora as funções com `@spaces.GPU`. |
| `train_velo_ia.py` | Fine-tuning LoRA com `transformers`, `peft` e `datasets`. |
| `colab_treino.ipynb` | Notebook pronto para treinar no Google Colab (GPU grátis). |
| `dataset_amigo.jsonl` | 10 diálogos de exemplo, informais e empáticos. |
| `engine.py` | Carrega o modelo/adaptador e gera respostas. |
| `memory.py` | Memória de curto prazo em SQLite (últimas 15 mensagens no prompt). |
| `serve_velo_ia.py` | API FastAPI consumida pelo servidor Next.js. |
| `prompts.py` | Prompt de sistema e mensagem de boas-vindas. |
| `requirements*.txt` | Dependências de servir e treinar. |
| `Dockerfile` | Imagem para VPS/Render/Railway/Fly.io (sem ZeroGPU). |

> A IA se chama **velo ia**. O navegador e o app Android nunca falam com esta
> API diretamente: o Next.js autentica a pessoa, aplica rate limit e repassa a
> mensagem com a `X-API-Key`. O modelo e o segredo ficam só no servidor.

---

## 1. Requisitos

- **Python 3.10 a 3.12** (recomendado 3.11; o Space usa 3.12).
- Para treinar com conforto: GPU NVIDIA com **12 GB+ de VRAM** para um modelo
  3B em 4-bit. Um modelo 2B cabe em menos VRAM. No Colab, use uma GPU T4 grátis.
- Sem GPU, o treino roda em CPU, mas é muito lento. Para testar a interface,
  use o **modo mock** (`VELO_IA_MOCK=1`) e não baixe modelo nenhum.
- O modelo padrão é o **Qwen 2.5 3B Instruct** (Apache 2.0, sem gate). Também
  funciona com Llama 3.2 Instruct, mas ele exige aceitar a licença no Hugging
  Face e autenticar com `HF_TOKEN`.

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

## 5. Hospedagem gratuita no Hugging Face Spaces (ZeroGPU)

Esta é a opção gratuita recomendada: o Space roda de graça, o ZeroGPU aloca
uma GPU NVIDIA sob demanda e o adaptador LoRA + SQLite continuam funcionando.
O único limite é a cota diária de GPU da conta (veja abaixo).

> **Por que não um Space Docker?** O ZeroGPU só está disponível para o SDK
> **Gradio**. Spaces Docker não recebem ZeroGPU e, para contas novas, exigem
> plano pago. Por isso o `app.py` monta o FastAPI e o Gradio na mesma porta:
> a API usada pelo velo fica em `/chat` e a interface de teste em `/demo`.

### 5.1 Criar a conta e o Space

1. Crie uma conta em <https://huggingface.co/join> e confirme o e-mail.
2. Gere um token de escrita em <https://huggingface.co/settings/tokens>.
3. Na web, clique em **New Space**:
   - **Space name:** `velo-ia`
   - **SDK:** `Gradio`
   - **Hardware:** `ZeroGPU` (a opção gratuita)
   - **Visibility:** `Public` (ou `Private`, se preferir)
4. O Space vai criar um repositório vazio. A URL final será
   `https://<seu-usuario>-velo-ia.hf.space`.

### 5.2 Enviar os arquivos

Instale o CLI e autentique:

```powershell
py -3.11 -m pip install -U "huggingface_hub[cli]"
hf auth login
```

Envie **o conteúdo da pasta `ai/`** para a raiz do Space. O `README.md` desta
pasta já tem o frontmatter que o Hugging Face usa como configuração do Space, e
`app.py` é o entrypoint:

```powershell
hf upload <seu-usuario>/velo-ia ai --repo-type space `
  --exclude ".venv/**" `
  --exclude "velo-ia-lora/**" `
  --exclude "*.db" `
  --exclude "*.db-*" `
  --exclude "__pycache__/**" `
  --exclude "outputs/**"
```

Se preferir Git:

```powershell
git clone https://huggingface.co/spaces/<seu-usuario>/velo-ia
Copy-Item ai\* huggingface-velo-ia -Recurse -Force
cd huggingface-velo-ia
git add .
git commit -m "velo ia no ZeroGPU"
git push
```

### 5.3 Configurar o Space

Em **Settings → Variables and secrets**:

| Nome | Tipo | Valor |
| --- | --- | --- |
| `VELO_IA_API_KEY` | Secret | segredo longo, o mesmo da Vercel |
| `VELO_IA_MODEL` | Variable | `Qwen/Qwen2.5-3B-Instruct` |
| `VELO_IA_ADAPTER` | Variable | `<seu-usuario>/velo-ia-lora` (opcional) |
| `VELO_IA_MEMORY_DB` | Variable | `/data/velo_ia_memory.db` (só com storage persistente) |
| `HF_TOKEN` | Secret | seu token, se o modelo/adaptador for gated ou privado |
| `VELO_IA_GPU_DURATION` | Variable | `90` (tempo máximo de cada chamada, em segundos) |

O `app.py` define `VELO_IA_ZERO_GPU=1` sozinho quando o pacote `spaces` existe.
Não defina `VELO_IA_MOCK=1` no Space se quiser o modelo real.

### 5.4 Esperar o build e testar

O primeiro build instala o Gradio, o PyTorch e baixa o modelo — pode levar
vários minutos. Quando o Space ficar **Running**, teste:

```powershell
Invoke-RestMethod -Uri "https://<seu-usuario>-velo-ia.hf.space/health"
```

A resposta deve ter `"status": "ok"`, `"ready": true` e `"zero_gpu": true`.

Teste uma mensagem (o `X-API-Key` é o mesmo `VELO_IA_API_KEY`):

```powershell
$body = @{
  conversation_id = "user_teste123456"
  message = "oi, tudo bem?"
} | ConvertTo-Json

Invoke-RestMethod `
  -Method Post `
  -Uri "https://<seu-usuario>-velo-ia.hf.space/chat" `
  -Headers @{ "X-API-Key" = "SEU_SEGREDO" } `
  -ContentType "application/json" `
  -Body $body
```

A interface de teste fica em
`https://<seu-usuario>-velo-ia.hf.space/demo`.

### 5.5 Configurar a Vercel

Em **Project → Settings → Environment Variables → Production**, adicione:

| Variável | Valor |
| --- | --- |
| `VELO_IA_API_URL` | `https://<seu-usuario>-velo-ia.hf.space` (sem barra no fim) |
| `VELO_IA_API_KEY` | o mesmo segredo do Space |
| `VELO_IA_HF_TOKEN` | `hf_...` (recomendado: atribui a cota ZeroGPU à sua conta) |
| `VELO_IA_TIMEOUT_MS` | `55000` |

Depois faça um novo deploy (**Deployments → Redeploy**). Pela CLI:

```powershell
vercel env add VELO_IA_API_URL production
vercel env add VELO_IA_API_KEY production
vercel env add VELO_IA_HF_TOKEN production
vercel env add VELO_IA_TIMEOUT_MS production
vercel --prod
```

> O `VELO_IA_HF_TOKEN` fica **só no servidor Next.js**. Ele é enviado como
> `Authorization: Bearer ...` para o Space e nunca chega ao navegador.

### 5.6 Cota, cold start e fallback

- **Cota gratuita:** uma conta gratuita tem cerca de **5 minutos de GPU por
  dia**; PRO tem 40 minutos. Cada resposta de um modelo 3B costuma consumir
  5–15 segundos. Para mais mensagens, use um modelo menor
  (`Qwen/Qwen2.5-1.5B-Instruct` ou `Qwen/Qwen2.5-0.5B-Instruct`) ou o PRO.
- **Cold start:** o primeiro pedido depois de um período ocioso pode demorar.
  O proxy do Next.js espera até `VELO_IA_TIMEOUT_MS` (55 s na Vercel).
- **Fallback mock:** em desenvolvimento, `VELO_IA_MOCK=1` no `ai/.env` faz a
  API responder sem modelo. Se você definir `VELO_IA_MOCK=1` no `.env.local`
  do Next.js, o próprio proxy responde com mensagens de demonstração quando a
  API não está configurada. **Não use isso em produção.**
- **SQLite efêmero:** o disco gratuito do Space não é persistente. O histórico
  sobrevive a reinícios do processo, mas some quando o Space é reconstruído.
  Para persistir, anexe storage pago e aponte `VELO_IA_MEMORY_DB` para
  `/data/velo_ia_memory.db`, ou troque o SQLite por Postgres.

## 6. Treinar o adaptador LoRA

O dataset de exemplo tem 10 conversas — suficiente para demonstrar o pipeline,
**não** para uma amiga virtual de produção. Para um resultado decente, reúna
algumas centenas ou milhares de diálogos no mesmo formato.

### No Google Colab (GPU grátis)

Abra `ai/colab_treino.ipynb` no Colab, selecione **Runtime → Change runtime
type → T4 GPU** e execute as células. O notebook clona o repositório, instala
as dependências, treina e compacta o adaptador para download.

### Localmente

```bash
python ai/train_velo_ia.py \
  --model Qwen/Qwen2.5-3B-Instruct \
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
python ai\train_velo_ia.py --model Qwen/Qwen2.5-3B-Instruct --dataset ai\dataset_amigo.jsonl --output-dir ai\velo-ia-lora --epochs 3 --batch-size 1 --grad-accum 8 --lr 2e-4 --max-seq-len 1024
```

Opções úteis:

- `--no-4bit`: desliga a quantização (mais VRAM, às vezes mais estável).
- `--cpu`: força CPU para testar o pipeline com um modelo pequeno.
- `--lora-r 8` / `--lora-alpha 16`: adaptador menor.
- `--epochs 1`: teste rápido.

O resultado fica em `ai/velo-ia-lora/` (`adapter_config.json`,
`adapter_model.safetensors`, tokenizer e `velo-ia-training.json`).

### Publicar o adaptador no Hub

O engine aceita uma pasta local **ou** um repositório do Hugging Face:

```powershell
hf repos create <seu-usuario>/velo-ia-lora --repo-type model
hf upload <seu-usuario>/velo-ia-lora ai/velo-ia-lora . --repo-type model
```

No Space, defina `VELO_IA_ADAPTER=<seu-usuario>/velo-ia-lora`. Se o repositório
for privado, configure `HF_TOKEN` no Space.

### Formato do dataset

Cada linha é um JSON independente:

```json
{"messages":[{"role":"user","content":"oi"},{"role":"assistant","content":"oi! tudo bem?"}]}
```

Regras: começa com `user`, termina com `assistant`, alterna os papéis e não
deixa conteúdo vazio. O script valida tudo antes de tokenizar. Só as respostas
da velo ia geram perda (os turnos da pessoa são mascarados com `-100`).

## 7. Rodar a API com o modelo real

No `ai/.env`: `VELO_IA_MOCK=0` e `VELO_IA_ADAPTER=velo-ia-lora` (ou o repo do
Hub). Também é possível subir a versão com Gradio:

```bash
python ai/app.py
```

A API fica em `http://127.0.0.1:7860` e a interface em `/demo`.

O carregamento pode levar alguns minutos na primeira vez (download dos pesos).
A API só fica `ready` quando o modelo e o adaptador terminam de carregar. Se
algo falhar, `/health` mostra `status: "degraded"` e o chat responde 503 — o
processo não cai.

## 8. Docker e outras hospedagens

O `ai/Dockerfile` serve para VPS, Render, Railway, Fly.io ou um Space Docker
com GPU paga:

```powershell
docker build -f ai/Dockerfile -t velo-ia .
docker run --rm -p 8000:8000 `
  -e VELO_IA_MOCK=1 `
  -e VELO_IA_API_KEY=troque-por-um-segredo `
  -v velo-ia-data:/data `
  velo-ia
```

Para GPU NVIDIA, troque a imagem base por uma com CUDA e instale o PyTorch com
CUDA. O modo 4-bit (`VELO_IA_4BIT=1`) reduz a VRAM necessária. Serviços com
plano gratuito sem GPU (Render, Railway) só conseguem rodar o modo mock ou um
modelo muito pequeno em CPU — para produção gratuita de verdade, prefira o
ZeroGPU.

## 9. Endpoints

| Método | Rota | Descrição |
| --- | --- | --- |
| `GET` | `/` | Status resumido e link para `/demo`. |
| `GET` | `/health` | Status, modelo, modo mock, ZeroGPU e erro de carregamento. |
| `POST` | `/chat` | Recebe `{ conversation_id, message }`, salva e responde. |
| `GET` | `/history/{conversation_id}?limit=50` | Histórico para a tela de chat. |
| `DELETE` | `/history/{conversation_id}` | Limpa a conversa. |
| `GET` | `/demo` | Interface Gradio de teste (só no Space). |

Todas as rotas de dados exigem `X-API-Key` quando `VELO_IA_API_KEY` está
definida. O `conversation_id` é derivado no servidor Next.js: `user_<uuid>` para
quem está autenticado e `anon_<token>` para visitantes (cookie HttpOnly).

### Memória

- Cada conversa guarda até **200 mensagens**.
- A cada nova pergunta, as **últimas 15 mensagens** são enviadas ao modelo.
- O SQLite usa WAL e fica em `ai/velo_ia_memory.db` por padrão.
- No Space gratuito o disco é efêmero. Para persistir, use storage pago
  (`/data/velo_ia_memory.db`) ou troque o SQLite por Postgres. A interface de
  `memory.py` é pequena e isolada.

## 10. Segurança e privacidade

- Não exponha esta API sem `VELO_IA_API_KEY`.
- Use HTTPS (o Space já fornece; em VPS, use um proxy reverso).
- O Next.js aplica rate limit por pessoa (15 mensagens/10 min) e por IP
  (40/10 min) antes de chamar esta API.
- O `VELO_IA_HF_TOKEN` e a `VELO_IA_API_KEY` ficam só no servidor. Nunca use o
  prefixo `NEXT_PUBLIC_` nessas variáveis.
- O prompt proíbe diagnósticos e orienta ajuda profissional em crise. Além
  disso, `engine.py` tem uma camada determinística: mensagens com sinais de
  risco recebem uma resposta fixa com CVV 188, SAMU 192 e 190.
- Não envie dados sensíveis para o modelo. A conversa fica no SQLite do
  serviço; a política de retenção é sua.
- A IA é transparente: ela não finge ser humana nem substitui terapia.

## 11. Problemas comuns

| Sintoma | Causa provável |
| --- | --- |
| `401 API key inválida` | `VELO_IA_API_KEY` diferente entre Next.js e API. |
| `/health` com `degraded` | Modelo não baixou, licença não aceita ou VRAM insuficiente. Veja o log. |
| `CUDA out of memory` | Reduza `--max-seq-len`, use 4-bit ou um modelo 2B. |
| `No @spaces.GPU function detected` | O entrypoint não chamou `spaces.zero.startup()`. Use o `ai/app.py` deste repositório. |
| `CUDA has been initialized before importing spaces` | `import spaces` precisa ser a primeira linha do `app.py`. |
| Space em `Runtime error` | Veja os logs; normalmente é uma dependência faltando ou o modelo gated sem `HF_TOKEN`. |
| Cota ZeroGPU esgotada | Espere o reset diário, use um modelo menor ou assine o PRO. |
| `bitsandbytes` não instala | No Windows, instale manualmente; sem ele o modelo roda sem 4-bit. |
| Resposta muito lenta | Modelo em CPU. Use GPU ou o modo mock para desenvolver. |
| `apply_chat_template` ausente | Modelo sem template de chat; use Qwen 2.5 Instruct ou Llama 3.2 Instruct. |

## 12. Limitações do dataset de exemplo

Os 10 diálogos servem para validar o formato, o treino e a integração. Eles não
cobrem a diversidade de pessoas, sotaques e situações reais. Antes de publicar,
amplie o dataset com conversas autorizadas, revise vieses e faça avaliação
humana das respostas.
