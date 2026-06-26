# 🏖️ PraiaGo

Plataforma que conecta **ambulantes** e **restaurantes** a **clientes** na praia, via
geolocalização. Piloto para Praia Grande, SP.

Este repositório contém **3 apps** (o app do entregador não faz parte deste repo):

| App | Pasta | Porta dev | Descrição |
|---|---|---|---|
| 🛍️ Cliente | [`praiago-cliente`](./praiago-cliente) | 5175 | Faz pedidos; informa reta/barraca; acompanha entrega |
| 🥥 Ambulante | [`praiago-ambulante`](./praiago-ambulante) | 5174 | Radar de zonas de venda (praia) + clientes |
| 🍽️ Restaurante | [`praiago-restaurante`](./praiago-restaurante) | 5176 | Painel de pedidos + mapa praia/cidade |

**Stack:** React 19 · Vite · TypeScript · Zustand · React-Leaflet · Capacitor · Supabase (a configurar)

## ▶️ Rodar localmente

Em cada pasta de app:

```bash
npm install
npm run dev      # sobe o Vite na porta do app
npm run build    # build de produção (tsc + vite)
```

## 🔌 Conectar ao Supabase

1. Crie um projeto em [supabase.com](https://supabase.com).
2. Em cada app, copie `.env.example` para `.env` e preencha:
   ```
   VITE_SUPABASE_URL=https://SEU-PROJETO.supabase.co
   VITE_SUPABASE_ANON_KEY=sua-anon-public-key
   ```
3. A camada `src/lib/realtime.ts` passa a usar o Supabase Realtime automaticamente
   (sem as chaves, ela usa BroadcastChannel local para desenvolvimento).
4. **Aplique as políticas de RLS e o RPC de preço** descritos em
   [`SECURITY.md`](./SECURITY.md) — é o que realmente protege os dados.

## 🔒 Segurança

Leia **[SECURITY.md](./SECURITY.md)** antes de ir para produção: RLS (banco único
multi-tenant), proteção contra adulteração de preço, SQLi, MOD APK, segredos e CSP.

> ⚠️ As chaves `VITE_*` são públicas por design — a segurança vem do **RLS no
> Supabase**, nunca de esconder a chave. Nunca versione a `service_role` key.
