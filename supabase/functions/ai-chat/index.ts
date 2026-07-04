import "jsr:@supabase/functions-js/edge-runtime.d.ts"

import { corsHeaders, json, readJson } from "../_shared/cors.ts"

type ChatRole = "system" | "user" | "assistant"

type ChatMessage = {
  role?: ChatRole
  content?: unknown
}

type ChatRequest = {
  plataforma?: string
  messages?: ChatMessage[]
}

const allowedPlatforms = new Set(["cliente", "ambulante", "restaurante", "admin"])
const maxMessages = 12
const maxContentChars = 2_000
const maxTotalChars = 12_000

function normalizePlatform(value: unknown) {
  if (typeof value !== "string") return "cliente"
  const platform = value.trim().toLowerCase()
  return allowedPlatforms.has(platform) ? platform : "cliente"
}

function systemPrompt(plataforma: string) {
  return [
    `Voce e o assistente virtual oficial do PraiaGo para a plataforma ${plataforma}.`,
    "Seja breve, educado e pratico.",
    "A PraiaGo e uma plataforma de intermediacao tecnologica que conecta consumidores, vendedores parceiros e restaurantes.",
    "Nao invente dados de pedidos, pagamentos, usuarios ou repasses.",
    "Problemas com pedido, reembolso, estorno, cancelamento ou disputa devem virar atendimento humano no painel.",
    "Dados pessoais devem ser tratados apenas quando forem necessarios para suporte, pedido ou seguranca, seguindo a LGPD.",
    "Se a pessoa pedir humano, suporte, reembolso, estorno ou cancelamento, oriente a abrir suporte no app.",
  ].join(" ")
}

function cleanMessages(messages: ChatMessage[] | undefined) {
  const cleaned: { role: "user" | "assistant"; content: string }[] = []
  let totalChars = 0

  for (const message of messages ?? []) {
    if (message.role !== "user" && message.role !== "assistant") continue
    if (typeof message.content !== "string") continue

    const content = message.content.trim().slice(0, maxContentChars)
    if (!content) continue

    totalChars += content.length
    if (totalChars > maxTotalChars) break

    cleaned.push({ role: message.role, content })
  }

  return cleaned.slice(-maxMessages)
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders })
  }

  if (req.method !== "POST") {
    return json({ error: "Metodo nao permitido." }, { status: 405 })
  }

  const apiKey = Deno.env.get("AI_CHAT_API_KEY") ?? Deno.env.get("OPENAI_API_KEY")
  if (!apiKey) {
    return json({ error: "IA indisponivel no momento." }, { status: 503 })
  }

  const body = await readJson<ChatRequest>(req)
  const plataforma = normalizePlatform(body.plataforma)
  const messages = cleanMessages(body.messages)

  if (!messages.some((message) => message.role === "user")) {
    return json({ error: "Mensagem obrigatoria." }, { status: 400 })
  }

  const baseUrl = (Deno.env.get("AI_CHAT_BASE_URL") ?? "https://api.openai.com/v1").replace(/\/+$/, "")
  const model = Deno.env.get("AI_CHAT_MODEL") ?? "gpt-4o-mini"

  const upstream = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: systemPrompt(plataforma) },
        ...messages,
      ],
      temperature: 0.5,
      max_tokens: 450,
    }),
  })

  if (!upstream.ok) {
    const details = await upstream.text().catch(() => "")
    console.error("AI provider error", upstream.status, details.slice(0, 500))
    return json({ error: "Falha temporaria no atendimento automatico." }, { status: 502 })
  }

  const data = await upstream.json().catch(() => null)
  const reply = data?.choices?.[0]?.message?.content

  if (typeof reply !== "string" || !reply.trim()) {
    return json({ error: "Resposta vazia do atendimento automatico." }, { status: 502 })
  }

  return json({ reply: reply.trim() })
})
