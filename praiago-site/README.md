# PraiaGo · Site institucional

Landing page do PraiaGo — explica como o app funciona pros três perfis (cliente,
ambulante e restaurante), com botões de download e link pro painel do
restaurante. **Não** fala do admin.

```bash
npm install
npm run dev     # http://localhost:5177
npm run build   # gera dist/
```

## O que tem em cada seção

| Seção | Arquivo | Observação |
|---|---|---|
| Abertura animada | `src/components/Intro.tsx` | 1× por sessão (`sessionStorage`), clique/tecla pula |
| Hero | `src/sections/Hero.tsx` | Parallax de ondas + botões de download |
| Como funciona | `src/sections/VideoScroll.tsx` | **Vídeo controlado pela rolagem** — ver abaixo |
| Pra quem é | `src/sections/Perfis.tsx` | Abas cliente / ambulante / restaurante |
| Eventos | `src/sections/Eventos.tsx` | Seção de destaque — ver abaixo |
| Recursos, Avaliações, Dúvidas | `src/sections/` | — |

### Seção de eventos

É a **única seção de fundo escuro** no meio das claras, de propósito: evento é
noite, e só o corte de luminosidade já segura o olho na rolagem. Tem luzes de
palco pulsando, confetes subindo, os chips de período (manhã/tarde/noite/
madrugada — os mesmos do app) acendendo em sequência sozinhos, o ingresso
flutuando com parallax e um QR decorativo que desenha em cascata quando entra na
tela.

Confetes e QR usam padrão gerado por **fórmula fixa**, nunca `Math.random()` —
com random eles mudam de lugar a cada re-render do React.

Todo texto, link e avaliação fica em **`src/dados.ts`** — dá pra mexer no
conteúdo sem abrir componente nenhum.

## Antes de publicar — 3 coisas pendentes

### 1. Links das lojas (`src/dados.ts` → `LOJAS`)
Os apps ainda não estão publicados, então os botões mostram **"Em breve na
Google Play / App Store"** em vez de apontarem pra link vazio. Quando sair na
loja: põe a URL e vira `disponivel: true`.

### 2. URL do painel do restaurante (`src/dados.ts` → `PAINEL_RESTAURANTE`)
Está com um valor provisório. Tem que virar a URL nova da Vercel depois que o
painel sair do domínio raiz (ver "Troca de domínio" abaixo).

### 3. ⚠️ Avaliações são de exemplo (`src/dados.ts` → `AVALIACOES`)
As 18 avaliações **não são de clientes reais** — foram escritas pra preencher o
layout. Trocar pelas verdadeiras assim que existirem: depoimento inventado
apresentado como real é propaganda enganosa (CDC art. 37) e derruba ficha na
Play Store se alguém reportar. O bloco está marcado no arquivo.

Os números do hero (`NUMEROS`) **não** têm métrica inventada de tração de
propósito — só fato do produto, que continua verdade amanhã.

## O vídeo que roda com a rolagem

`public/scroll.mp4` (1280×720, 10s). Ele não toca sozinho: cada tiquinho de
scroll avança um pedaço do filme.

**Marca d'água do Gemini.** O vídeo foi gerado no Gemini e tem o "sparkle" de 4
pontas gravado no pixel, em x 1124–1163 / y 568–608 — a borda esquerda dela
começa a **87,8%** da largura. Como não tem ffmpeg na máquina pra apagar de
verdade (`delogo`), o corte é no CSS: o `<video>` entra com **116%** da largura
do container, ancorado à esquerda, e o container tem `overflow: hidden`. Medido
no navegador, sobra **86,2%** visível — a marca fica fora em qualquer proporção
de tela. Se um dia reprocessarem o vídeo sem a marca, é só voltar
`LARGURA_VIDEO` pra `100%`.

> Detalhe que já quebrou uma vez: o preflight do Tailwind põe `max-width: 100%`
> em `video`. Sem `maxWidth: 'none'` no elemento, os 116% são truncados de volta
> pra 100% e a marca reaparece.

**Fluidez.** O scrub faz **um seek por vez** (espera o evento `seeked` antes do
próximo) e vai direto pro alvo, sem interpolar. A primeira versão interpolava e
escrevia `currentTime` em todo quadro — a fila de seeks crescia e o filme andava
~0,2s a cada 0,5s real, nunca alcançando o scroll. Do jeito atual, medido:
**~24ms por seek (~42fps)**.

**No celular** (`pointer: coarse`) e pra quem pediu menos animação, o scrub é
desligado e o vídeo toca em loop — scrub de vídeo em iOS Safari é instável.

## `useTransform` ligado ao scroll: sempre com função

Ver `src/lib/animacao.ts`. Resumo: `useTransform(p, [0, 0.75], [1, 0])` faz o
Framer compilar pra animação **nativa** de scroll (WAAPI), e nessa versão o
mapeamento sai errado quando a faixa não cobre `[0, 1]` inteiro. Dois defeitos
reais que isso causou: o hero voltava a aparecer fantasma sobre o vídeo, e a
dica "role o mouse" ficava visível até o fim da seção. Usando `faixa(...)` a
conta fica em JS e acompanha certo.

## Deploy — estado atual

| Item | Estado |
|---|---|
| Projeto Vercel | `praiago-site` (criado) |
| URL de produção | https://praiago-site.vercel.app — **no ar** |
| Deployment Protection | desligada (nasce ligada; foi preciso `PATCH ssoProtection:null`) |
| Painel do restaurante | https://praiago-restaurante.vercel.app — **no ar**, já é o valor de `PAINEL_RESTAURANTE` |
| `www.praiago.com.br` | ✅ **verificado e servindo este site** (12/08/2026) |
| `/termos.html` e `/privacidade.html` | ✅ 200 no domínio — as URLs da Play Store continuam valendo |

### Como a troca de domínio foi feita (e o que aprendemos)

O domínio saiu do projeto `praiago-restaurante` e foi pro `praiago-site`. O
painel do restaurante ficou em https://praiago-restaurante.vercel.app.

> ⚠️ **Desanexar um domínio na Vercel libera a verificação dele.** Depois disso,
> reanexar em **qualquer** projeto — inclusive no original — exige um TXT novo em
> `_vercel.<dominio>`, e o valor **muda a cada reatribuição**. Como o DNS é do
> **Registro.br** (nameservers `a.sec.dns.br` / `c.sec.dns.br`, não Vercel), isso
> só se resolve com acesso ao painel do registrador. Se for mexer em domínio de
> novo: **ter o acesso ao DNS na mão antes de desanexar**, senão o domínio fica
> fora do ar (só cache de borda) até o TXT entrar.

Para conferir o estado a qualquer momento:

```bash
npx vercel@latest domains inspect www.praiago.com.br
```

### 🔧 Diagnóstico de DNS nesta máquina: não use `nslookup` pra TXT

O `nslookup` do Windows aqui imprime `text =` **vazio** para qualquer TXT —
inclusive os do `google.com`. Isso fez um registro correto parecer em branco e
mandou a investigação pro lado errado. Usar DNS-over-HTTPS:

```bash
curl -s "https://dns.google/resolve?name=_vercel.praiago.com.br&type=TXT"
```

### Apex `praiago.com.br` — ✅ resolvido (12/08/2026)

Antes não tinha registro A nenhum e não abria nada. Agora: **A** no apex →
`216.150.1.1` (Registro.br) e o domínio adicionado no projeto como **redirect
308** pra `www.praiago.com.br`. Testado: `https://praiago.com.br` → 308 → `www`,
e o HTTP na porta 80 também cai no HTTPS do `www`.

### Zona DNS — estado final

No `_vercel.praiago.com.br` existem **dois** registros TXT, um por domínio. Os
dois têm que continuar lá: a Vercel revalida de tempos em tempos, e apagar um
derruba a verificação daquele domínio.

```
_vercel  TXT  vc-domain-verify=www.praiago.com.br,8ac3e3216d29d8bbded9
_vercel  TXT  vc-domain-verify=praiago.com.br,4beedd4e13abca0e33d6
```

> Ao checar propagação no Registro.br, use o **serial do SOA** como sinal: se ele
> não mudou, a alteração não foi publicada ainda — não adianta reconsultar o
> registro. Cada publicação aqui incrementou (`...001` → `...002` → `...003`).
