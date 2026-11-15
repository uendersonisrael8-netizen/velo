# velo.

**o mundo em movimento.** Uma rede social editorial para vídeos curtos, fotografia e os pequenos momentos entre um scroll e outro.

O velo funciona **somente com Supabase**. Não existe modo demonstração, dados de exemplo, perfis fictícios nem fallback local. Sem configuração, o app abre em **modo prévia**: feed, explorar, perfis, login e cadastro ficam visíveis, mas as ações reais só funcionam depois que as variáveis forem preenchidas. Com configuração, visitantes navegam pelo feed e pelos perfis; login é exigido apenas para curtir, comentar, seguir, publicar ou abrir o próprio perfil e guardados.

---

## Stack

| Camada | Tecnologia |
| --- | --- |
| App | Next.js 16 (App Router), React 19, TypeScript |
| Estilo | Tailwind CSS 4, design tokens próprios |
| Dados | Supabase (Auth, Postgres, Storage, Realtime) |
| Validação | Zod + validação de mídia no cliente |
| Ícones | lucide-react |

Tipografia: **Plus Jakarta Sans** para interface e **Instrument Serif** para títulos editoriais. Tema escuro `#0A0A0A` / claro `#FFFFFF`, com um único acento: **signal orange** (`#FF4D1C` no escuro, `#EF430C` no claro).

---

## Rodando localmente

Requisitos: Node.js 20.9+ e npm.

```bash
npm install
npm run dev
```

Abra [http://localhost:3000](http://localhost:3000). Sem `.env.local`, o app abre em **modo prévia**: a interface normal, o feed vazio e as telas de login/cadastro aparecem; um aviso discreto lembra que o Supabase ainda não está configurado. Não há conteúdo fake.

### Scripts

```bash
npm run dev        # servidor de desenvolvimento
npm run build      # build de produção
npm run start      # serve o build
npm run lint       # ESLint
npm run typecheck  # TypeScript sem emitir arquivos
npm run cap:sync   # sincroniza o web app com o projeto Android
npm run cap:open   # abre o projeto no Android Studio
npm run android:debug   # gera o APK de debug (requer Android SDK)
npm run android:release # gera o AAB de release (requer keystore)
```

---

## Configuração do Supabase

### 1. Crie o projeto

Crie um projeto em [supabase.com](https://supabase.com) e abra o **SQL Editor**.

### 2. Rode o schema

No painel do Supabase:

1. Vá em **SQL Editor → New query**.
2. Copie **todo** o conteúdo de [`supabase/schema.sql`](supabase/schema.sql).
3. Cole no editor e clique em **Run**.

O script é idempotente e cria:

- tabelas `profiles`, `posts`, `comments`, `likes`, `saves`, `follows` e `stories`;
- índices, constraints e o trigger que cria o perfil automaticamente no signup;
- triggers que mantêm contadores de likes, salvos, comentários e follows;
- RLS e policies de leitura/escrita para cada tabela;
- o bucket público `media` no Storage, com limite de 50 MB;
- a tabela `comments` na publicação `supabase_realtime`.

Se preferir rodar por terminal, use a connection string do seu projeto em **Project Settings → Database** (nunca a coloque no cliente):

```bash
# bash / macOS / Linux
psql "$DATABASE_URL" -f supabase/schema.sql

# PowerShell
psql $env:DATABASE_URL -f supabase/schema.sql
```

### 3. Preencha o `.env.local`

Copie `.env.example` para `.env.local` na raiz do projeto e preencha exatamente:

```env
NEXT_PUBLIC_SUPABASE_URL=https://seu-projeto.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=sua-chave-anon-publica
```

As duas são obrigatórias. Pegue os valores em **Project Settings → API**:

- `Project URL` → `NEXT_PUBLIC_SUPABASE_URL`
- `anon public` (ou `publishable`) → `NEXT_PUBLIC_SUPABASE_ANON_KEY`

> Use somente a **anon key** no cliente. A `service_role` ignora RLS e nunca deve aparecer em variáveis `NEXT_PUBLIC_*`, no repositório ou no navegador.

### 4. Configure as URLs de autenticação

Em **Authentication → URL Configuration**:

- **Site URL**: `http://localhost:3000` em desenvolvimento e a URL final em produção.
- **Redirect URLs**: `http://localhost:3000/**` e `https://seu-dominio/**`. O `/**` já cobre `/auth/callback`.

Se quiser que o cadastro já entre direto (sem confirmar e-mail), desative **Authentication → Providers → Email → Confirm email**. Com a confirmação ativa, o velo mostra a tela “Confira seu e-mail” e o link do e-mail volta para `/auth/callback`, que troca o código pela sessão.

### 5. Login com Google (opcional, desativado na interface)

O fluxo OAuth continua implementado no backend, mas o botão **Continuar com Google** e o componente `GoogleButton` foram removidos de `/login` e `/signup`: o acesso fica apenas por e-mail e senha. As instruções abaixo servem caso queira reativar o provider e recriar o botão, que chama `supabase.auth.signInWithOAuth({ provider: "google" })` e volta para a rota `/auth/callback`, que troca o código PKCE pela sessão.

1. No [Google Cloud Console](https://console.cloud.google.com/apis/credentials), crie um **OAuth client ID** do tipo **Web application**.
2. Em **Authorized JavaScript origins**, adicione `http://localhost:3000` (e o domínio de produção).
3. Em **Authorized redirect URIs**, adicione exatamente a URL de callback do **Supabase**:
   ```text
   https://<project-ref>.supabase.co/auth/v1/callback
   ```
   `<project-ref>` é o subdomínio do seu projeto (o mesmo de `NEXT_PUBLIC_SUPABASE_URL`). **Não** coloque `/auth/callback` do app aqui — o Google fala com o Supabase, e o Supabase devolve o usuário para o app.
4. No painel do Supabase, abra **Authentication → Providers → Google**, ative o provider e cole o **Client ID** e o **Client Secret**.
5. Em **Authentication → URL Configuration → Redirect URLs**, confirme que `http://localhost:3000/**` (e `https://seu-dominio/**`) estão listadas. É para lá que o Supabase redireciona depois do Google.
6. Rode novamente `supabase/schema.sql` para atualizar o trigger de perfil. Ele passa a usar `full_name`/`name` e `avatar_url`/`picture` dos metadados do Google; se o handle derivado do e-mail já existir, recebe um sufixo automático.

Sem um botão na interface, o provider sozinho não inicia o fluxo OAuth. Nenhum segredo do Google vai para o `.env.local`: o Client Secret fica somente no painel do Supabase.

### 6. Reinicie o servidor

```bash
npm run dev
```

Na primeira visita, o feed abre direto para qualquer visitante. Crie uma conta em `/signup` e entre com e-mail e senha para curtir, comentar, seguir, publicar e acessar seu perfil e guardados. O feed e os stories começam vazios até alguém publicar.

O `src/proxy.ts` roda em todas as rotas, mas só exige sessão nas privadas (`/upload`, `/profile` e `/saved`): renova a sessão do Supabase via cookies e redireciona quem não está autenticado para `/login` antes de renderizar. Feed, explorar, perfis públicos, login e cadastro são abertos e não pagam o custo de validar o JWT no servidor.

---

## O que o schema garante

- **Perfil automático**: um trigger em `auth.users` cria a linha em `profiles`. No cadastro por e-mail usa `handle` e `display_name`; no Google usa `full_name`/`name` e `avatar_url`/`picture`, com sufixo automático se o handle já existir. O app também tem um fallback que cria o perfil no primeiro acesso caso o trigger ainda não esteja atualizado.
- **Contadores consistentes**: likes, saves, comentários e follows atualizam `likes_count`, `comments_count`, `saves_count`, `followers_count` e `following_count` via triggers, não pelo cliente.
- **RLS em todas as tabelas**: leitura pública onde faz sentido; escrita sempre limitada a `auth.uid()`.
- **Privilégios por coluna**: o cliente não consegue escrever contadores diretamente em `profiles` nem em `posts`.
- **Storage**: bucket público `media`, limite de 50 MB, MIME types de vídeo/imagem e upload restrito à pasta `media/<user_id>/...`.
- **Stories**: expiram em 24 h (`expires_at`) e a policy de leitura só devolve stories ativos.
- **Realtime**: a tabela `comments` entra na publicação `supabase_realtime`.

---

## Rotas

| Rota | Descrição |
| --- | --- |
| `/login`, `/signup` | Entrar e criar conta real (Supabase Auth), com e-mail e senha |
| `POST /api/auth/login` | Login server-side: rate limit, validação Zod, checagem de Origin e cookies de sessão |
| `POST /api/auth/signup` | Cadastro server-side: rate limit, validação Zod e criação do perfil |
| `/auth/callback` | Troca o código PKCE (Google ou confirmação de e-mail) pela sessão e volta ao feed |
| `/` | Feed vertical com player, progresso, volume global, curtir, salvar e comentários em tempo real |
| `/explore` | Busca por tag, criador, legenda ou lugar; filtros de vídeo/foto; sugestões de criadores |
| `/upload` | Publicação de `.mp4`, `.webm`, JPG, PNG ou WebP com legenda, tags, local e áudio |
| `/profile` | Perfil editável, estatísticas, abas de publicações e guardados |
| `/saved` | Coleção pessoal de posts salvos |
| `/u/[handle]` | Perfil público com follow |

Rotas abertas: `/`, `/explore`, `/u/[handle]`, `/login`, `/signup` e `/auth/callback`. Rotas privadas: `/upload`, `/profile` e `/saved`; sem sessão, o `proxy` redireciona para `/login` no servidor. Nas rotas públicas, as ações restritas usam `ensureAuth()` no cliente para avisar e levar ao login.

---

## Funcionalidades

### Feed e player
- Autoplay silencioso ao entrar na viewport, pausa ao sair.
- Barra de progresso, seek por clique, botão de play/pause.
- Volume global persistido; o mesmo volume vale para feed e stories.
- Duplo clique/toque para curtir com animação.
- Curtir, salvar, compartilhar e seguir direto do card.
- Comentários em painel lateral, com atualização em tempo real.

### Layout responsivo
- Ponto de corte em **768px** (`md`): abaixo dele vale o layout mobile; a partir dele, o desktop.
- **Mobile:** feed em tela cheia (`100dvh`) com scroll-snap vertical, ações flutuando à direita e navegação fixa na parte inferior. O header editorial some apenas no feed; nas demais rotas ele permanece fixo.
- **Desktop:** sidebar fixa à esquerda, player vertical centralizado com os botões de interação ao lado e right rail a partir de `xl` (1280px).
- `useIsMobile` (`matchMedia` + `useSyncExternalStore`) alterna comportamentos — setas no desktop, snap e toque no mobile — e reseta o scroll ao girar a tela ou redimensionar a janela.
- `/login` e `/signup` ajustam espaçamentos e tipografia e rolam sem corte a partir de 320px de largura.
- Viewport com `width=device-width, initial-scale=1, maximum-scale=5, viewport-fit=cover`; campos de texto usam 16px no mobile para evitar o zoom automático do iOS.

### Stories
- Barra horizontal com anel de não vistos e estado de visto persistido.
- Visualização fullscreen com progresso, navegação por toque/teclado, segurar para pausar e controle de volume.
- Compositor para publicar uma foto ou vídeo de até 60 segundos.

### Explorar
- Busca sem acentos, por `#tag`, `@pessoa`, legenda ou local.
- Filtros de mídia e chips de tags em alta derivados das publicações reais.
- Grade com lightbox e painel de comentários.
- Sugestões de criadores com follow, também derivadas de posts reais.

### Upload e perfil
- Validação de tipo/tamanho no cliente, extração de poster de vídeo e compressão de avatar.
- Preview antes de publicar.
- Perfil com nome, handle, bio, link, local e avatar; edição com validação Zod.
- Contadores de publicações, seguidores e seguindo.

---

## Estrutura

```text
src/
  proxy.ts            # sessão e proteção de rotas no servidor
  app/
    (app)/            # feed, explore, upload, profile, saved, u/[handle]
    (auth)/           # login e signup
    api/auth/         # login e cadastro server-side (rate limit + Zod)
    auth/callback/    # troca do código PKCE (Google/e-mail) pela sessão
  components/
    auth/             # formulários de entrada e cadastro
    feed/             # player, comentários, stories, grade e lightbox
    explore/          # busca e descoberta
    upload/           # fluxo de publicação
    profile/          # perfil próprio, público e edição
    providers/        # AppProvider, tema, toasts
    shell/            # sidebar, navegação, aviso de prévia
    ui/               # Avatar, Dialog, EmptyState, etc.
  lib/
    media.ts          # validação, duração, poster, compressão
    preferences.ts    # volume e stories vistos (localStorage)
    sanitize.ts       # normalização de e-mail, texto e links externos
    validation.ts     # schemas Zod
    security/         # rate limit em memória
    supabase/         # client, server, session, queries e mappers
android/              # projeto Capacitor (WebView apontando para a Vercel)
supabase/
  schema.sql          # banco, RLS, storage, realtime
```

### Dados locais

Somente preferências de interface ficam no navegador:

- `velo:audio:v1` — volume e mudo.
- `velo:stories-seen:v1` — stories já vistos.

Todo o conteúdo (perfis, posts, comentários, likes, salvos, follows e stories) existe apenas no Supabase.

---

## Segurança e produção

O que já está no projeto:

- RLS habilitada em todas as tabelas, com policies separadas de select/insert/update/delete.
- Escrita amarrada a `auth.uid()`; ninguém edita post, comentário ou perfil de outra pessoa.
- Contadores atualizados apenas por triggers `security definer`.
- Bucket com leitura pública e escrita restrita à pasta do próprio usuário.
- Validação de mídia: MIME type, extensão, tamanho e duração máxima (3 min no feed, 60 s em stories).
- Limites de texto no banco e no cliente (caption, bio, tags, comentários).
- **Login e cadastro server-side**: as rotas `POST /api/auth/login` e `POST /api/auth/signup` validam o JSON com Zod, recusam bodies acima de 8 KB, checam o header `Origin` contra o próprio site e respondem com `Cache-Control: private, no-store`.
- **Rate limiting**: 30 tentativas por IP e 8 por conta a cada 10 minutos no login; 5 cadastros por IP e 3 por e-mail por hora. O contador é em memória por instância — em produção multi-instância, troque por Redis/Upstash ou uma tabela no Supabase. O Supabase Auth também aplica limites próprios.
- **E-mail normalizado** (NFKC + trim + lowercase) no formulário, na API e no schema Zod. A senha é preservada exatamente como digitada, sem trim: espaços e maiúsculas fazem parte dela. O login não exige mais o mínimo de 8 caracteres do cadastro, então contas antigas com senhas curtas continuam entrando.
- **Fallback de perfil**: se a sessão autenticou mas a leitura de `profiles` falhou, o login continua válido com um perfil mínimo vindo dos metadados do Auth, em vez de mostrar “senha incorreta”.
- **Sanitização central** em `src/lib/sanitize.ts`: normaliza Unicode, remove caracteres de controle, zero-width e bidirecionais. Links de perfil só são renderizados se passarem por `safeExternalUrl` (apenas `http:`/`https:`).
- **Headers de segurança** em `next.config.ts`: CSP (self + Supabase + fotos de perfil do Google, `frame-ancestors 'none'`, `frame-src 'none'`, `manifest-src 'self'` e `upgrade-insecure-requests`), `nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy`, `Permissions-Policy`, COOP/CORP, `X-Permitted-Cross-Domain-Policies` e HSTS com `preload` em produção.
- Sessão validada no servidor: `src/proxy.ts` usa `@supabase/ssr` + `getClaims()` para renovar os cookies e bloquear rotas privadas antes do render.
- Cookies de auth com `SameSite=Lax`, `Secure` em produção, `Path=/` e rotação de tokens. Eles não são `HttpOnly` porque o browser client precisa ler a sessão para Realtime e queries com RLS; a proteção equivalente vem da CSP, do `SameSite`, dos tokens de curta duração e da RLS.
- Mensagens de erro de auth/banco são genéricas para o usuário; detalhes técnicos só aparecem no console em desenvolvimento.
- Nenhum segredo no cliente além da anon key pública. O `.gitignore` bloqueia `.env*` (exceto `.env.example`), keystores e artefatos de build.

Checklist antes de ir ao ar:

1. **Auth**: ative confirmação de e-mail, defina Site URL/Redirect URLs de produção, configure o provider Google, cadastre as variáveis na Vercel e avalie CAPTCHA no signup (Supabase Auth).
2. **CSP**: revise a policy de `next.config.ts` se adicionar novos hosts e considere nonces/hashes no lugar de `'unsafe-inline'` para scripts.
3. **Rate limiting distribuído**: o limite atual é por instância. Se a Vercel escalar várias funções, use Upstash/Redis ou uma tabela com `upsert` atômico.
4. **Rate limit nas demais ações**: proteja upload, comentários e follows com limites por usuário/IP (Supabase Edge Functions, proxy ou provedor de borda).
5. **Moderação**: defina fluxo de denúncia, bloqueio de usuários e revisão de mídia. O schema atual não tem tabela de reports.
6. **Limpeza de mídia**: agende `delete from public.stories where expires_at < now()` com `pg_cron` e remova do Storage arquivos de stories/posts apagados. A policy esconde stories expirados, mas os arquivos continuam no bucket.
7. **Paginação**: o feed carrega um snapshot. Para escala, adicione cursor por `created_at`/`id` e prefetch infinito.
8. **Backups e monitoramento**: habilite backups do Postgres, alertas de erro e revisão periódica das policies.

### Sobre o bucket público

O bucket `media` é público para que feed e stories carreguem direto, sem URLs assinadas. Isso significa que qualquer pessoa com a URL acessa o arquivo. Se o produto exigir privacidade, troque para bucket privado e gere signed URLs na leitura. O limite de 50 MB e os MIME types permitidos já estão configurados no schema.

---

## PWA e app instalável

O velo pode ser instalado como PWA no Android, iOS e desktop:

- `src/app/manifest.ts` gera `/manifest.webmanifest` com `display: standalone`, `orientation: portrait`, cores e ícones 192/512 + maskable.
- Ícones em `public/icons/` e `apple-touch-icon` para iOS.
- `src/app/layout.tsx` declara manifest, `appleWebApp`, `formatDetection`, `themeColor` e `viewport-fit=cover`.
- O layout usa `env(safe-area-inset-*)` na navegação inferior e no shell para conviver com notch e barra de gestos.

Não há service worker: o app depende de rede para Auth, Storage e RLS. A página `public/index.html` é apenas um fallback exibido pelo WebView do Capacitor quando a produção não responde.

---

## App Android (Capacitor)

O projeto Android fica em `android/` e usa **Capacitor 8**. O WebView aponta para a produção na Vercel (`https://velo-iota-bice.vercel.app`), então o APK abre sempre a versão publicada. Essa escolha preserva o App Router, as rotas dinâmicas, os cookies e as queries com RLS — um export estático quebraria tudo isso.

### Pré-requisitos

- Node.js 20.9+
- JDK 21
- Android Studio com SDK 36 (ou Android SDK + Gradle 8+)

### Compilar o APK

```bash
npm install
npx cap sync android
npm run android:debug
```

O APK de debug sai em `android/app/build/outputs/apk/debug/app-debug.apk`.

Para release:

```bash
keytool -genkeypair -v -keystore velo-release.jks -alias velo -keyalg RSA -keysize 2048 -validity 10000
# crie android/keystore.properties (ignorado pelo Git) com storeFile, storePassword,
# keyAlias e keyPassword, e configure o signingConfig no build.gradle
npm run android:release
```

O AAB de release sai em `android/app/build/outputs/bundle/release/app-release.aab`. **Nunca commite** o keystore nem o `keystore.properties`.

### Configuração

- `capacitor.config.ts` define `appId app.velo.social`, `appName velo` e `webDir public`.
- `CAPACITOR_SERVER_URL` troca a URL carregada pelo WebView (útil para testar uma preview da Vercel sem editar o arquivo).
- `android/app/src/main/AndroidManifest.xml`: `allowBackup=false`, `fullBackupContent=false`, `dataExtractionRules`, `usesCleartextTraffic=false`, `networkSecurityConfig` e `windowSoftInputMode=adjustResize`.
- `res/xml/network_security_config.xml` bloqueia HTTP em texto claro e confia apenas nas âncoras do sistema (sem pinning, para não quebrar na renovação de certificados).
- Ícones adaptativos, ícone redondo e splash da marca foram gerados para todas as densidades em `android/app/src/main/res/`.

### Limitações do APK

- Sem JDK/Android SDK instalados, `npm run android:debug` não roda; o projeto está pronto, mas a compilação precisa ser feita em uma máquina com o SDK.
- O APK usa a produção da Vercel. Para apontar para outro ambiente, defina `CAPACITOR_SERVER_URL` antes de `npx cap sync`.
- A sessão fica nos cookies do WebView; backup e transferência entre aparelhos estão desativados de propósito.

---

## Deploy na Vercel (plano gratuito)

Você pode publicar de duas formas: pela CLI (mais rápido, sem GitHub) ou pelo painel com um repositório GitHub. As duas usam o mesmo build `npm run build`.

### Deploy pela CLI

```bash
npx vercel login
npx vercel link --yes --project velo
npx vercel env add NEXT_PUBLIC_SUPABASE_URL --environment production,preview,development --value "https://<project-ref>.supabase.co" --yes
npx vercel env add NEXT_PUBLIC_SUPABASE_ANON_KEY --environment production,preview,development --value "<sua-chave-anon>" --yes
npx vercel deploy --prod --yes
```

O comando final imprime a **Production URL** (`https://<projeto>.vercel.app`). Variáveis `NEXT_PUBLIC_*` precisam existir **antes** do build; se mudar alguma, rode um novo `vercel deploy --prod`.

### 1. Suba para o GitHub

Com o GitHub CLI autenticado (`gh auth login`), crie o repositório público e envie tudo em um comando:

```bash
git init
git add .
git commit -m "velo: login estável, segurança, PWA e app Android"
git branch -M main
gh repo create velo --public --source=. --remote=origin --push
```

Se preferir o fluxo manual:

```bash
git remote add origin https://github.com/<seu-usuario>/<seu-repo>.git
git push -u origin main
```

O `.gitignore` já ignora `.env.local`, `.next`, `node_modules`, `.vercel`, keystores e artefatos Android. Nunca commite a `service_role` key.

### 2. Importe na Vercel

1. Crie uma conta em [vercel.com](https://vercel.com) e clique em **Add New → Project**.
2. Conecte o GitHub e importe o repositório.
3. O framework **Next.js** é detectado automaticamente. Mantenha **Build Command** `npm run build` e **Output Directory** `.next`.
4. Em **Environment Variables**, adicione as duas variáveis em **Production**, **Preview** e **Development**:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
5. Clique em **Deploy**.

> `NEXT_PUBLIC_*` é embutido no bundle durante o build. Se trocar a URL ou a chave, faça um novo deploy (não basta reiniciar a função).

### 3. Ajuste as URLs no Supabase

Depois do primeiro deploy, copie o domínio `https://seu-projeto.vercel.app` e vá em **Authentication → URL Configuration**:

- **Site URL**: `https://seu-projeto.vercel.app`
- **Redirect URLs**: adicione `https://seu-projeto.vercel.app/**` e mantenha `http://localhost:3000/**` para desenvolvimento.
- Para Preview Deployments, adicione também `https://*-<seu-time>.vercel.app/**` (o Supabase aceita wildcard).

Sem esse ajuste, o link de confirmação de e-mail e o retorno do Google apontam para o domínio errado.

### 4. Ajuste o Google Cloud

- **Authorized JavaScript origins**: adicione `https://seu-projeto.vercel.app`.
- **Authorized redirect URIs**: mantenha apenas `https://<project-ref>.supabase.co/auth/v1/callback`.
- O Client ID e o Client Secret continuam somente no painel do Supabase.

### 5. Confirme o build

A Vercel executa `npm run build`. O projeto passa em `npm run lint`, `npm run typecheck` e `npm run build`; se o deploy falhar, confira os logs e se as duas variáveis `NEXT_PUBLIC_*` existem no ambiente de **Production**.

### Limites dos planos gratuitos

- **Supabase Free**: o projeto pausa após cerca de 7 dias sem atividade; são 500 MB de banco, 1 GB de Storage e 5 GB de egress. Vídeos curtos consomem Storage rápido.
- **Vercel Hobby**: uso pessoal/não comercial, 100 GB de bandwidth por mês e limites de execução das funções. Confira os valores atuais nas páginas de pricing antes de publicar.

---

## SEO e indexação

O SEO é gerado pelo App Router, com metadados por página e rotas nativas:

| Recurso | Onde fica | O que faz |
| --- | --- | --- |
| Título, description, keywords | `src/app/layout.tsx` e `src/lib/site.ts` | Padrões globais e textos da marca |
| Metadados por página | `src/lib/seo.ts` (`buildPageMetadata`) | Canonical, Open Graph, Twitter Card e `robots` de cada rota |
| Open Graph | `public/og-velo.png` | Imagem 1200×630 usada no compartilhamento de links |
| `robots.txt` | `src/app/robots.ts` | Permite a indexação e bloqueia rotas privadas |
| `sitemap.xml` | `src/app/sitemap.ts` | Rotas estáticas + perfis públicos do Supabase, com revalidação de 1 h |
| Dados estruturados | `layout.tsx` e `u/[handle]/page.tsx` | JSON-LD `WebSite` (com busca) e `ProfilePage` |

Rotas privadas (`/upload`, `/profile`, `/saved`, `/login`, `/signup` e `/auth/*`) recebem `noindex, nofollow`. Feed, Explore e perfis públicos são indexáveis; o perfil usa nome, bio e avatar reais na description e no Open Graph.

### URL canônica

A ordem de precedência é:

1. `NEXT_PUBLIC_SITE_URL` — use quando tiver domínio próprio;
2. `VERCEL_PROJECT_PRODUCTION_URL` — preenchida automaticamente pela Vercel;
3. `http://localhost:3000` — desenvolvimento.

Defina `NEXT_PUBLIC_SITE_URL` na Vercel antes do build se o domínio final não for o `*.vercel.app` do projeto. Como é uma variável `NEXT_PUBLIC_*`, mudá-la exige um novo deploy.

### Google Search Console

1. Acesse [search.google.com/search-console](https://search.google.com/search-console) e adicione uma propriedade do tipo **Prefixo de URL** com `https://velo-iota-bice.vercel.app`.
2. Confirme a propriedade pelo método que preferir (para Vercel, o mais simples é um registro TXT no DNS ou a verificação por arquivo HTML em `public/`).
3. Em **Sitemaps**, envie `https://velo-iota-bice.vercel.app/sitemap.xml`.
4. Use **Inspeção de URL** nas páginas principais e clique em **Solicitar indexação**.

A indexação não é imediata: o Google precisa rastrear, processar e escolher exibir as páginas. O `robots.txt` e o sitemap apenas facilitam o trabalho; acompanhe em **Páginas** e **Sitemaps** nas próximas semanas.

---

## Limitações conhecidas

- O feed não tem paginação infinita nem recomendação por algoritmo.
- Autoplay com som é bloqueado por navegadores; o vídeo começa silencioso e o volume é escolhido pelo usuário.
- Stories expirados dependem de limpeza agendada no banco/Storage.
- O projeto não inclui moderação, denúncias ou bloqueio de usuários.
- O rate limit de login/cadastro é em memória e por instância. Em produção com várias funções, troque por Redis/Upstash ou uma tabela no Supabase.
- A CSP mantém `'unsafe-inline'` para os scripts inline do Next.js. Migrar para nonce/hash é o próximo passo de endurecimento.
- O APK precisa de JDK 21 e Android SDK 36 para compilar; o projeto está pronto, mas a compilação não roda só com Node.js.
- `npm audit` reporta 7 vulnerabilidades moderadas de desenvolvimento no `minimatch` usado pelo ESLint/TypeScript ESLint. Não há versão corrigida publicada e o pacote não vai para o bundle de produção.
- A sessão do Supabase não é `HttpOnly` porque o browser client precisa lê-la para Realtime e RLS. A proteção equivalente é `Secure` + `SameSite=Lax` + CSP + tokens de curta duração.

---

Feito para parecer uma revista, não uma planilha. **velo.**
