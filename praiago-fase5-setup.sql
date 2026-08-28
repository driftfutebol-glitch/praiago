-- =====================================================
-- PRAIAGO: SETUP DO BANCO (idempotente — pode rodar de novo sem erro)
-- Rode TUDO no Supabase → SQL Editor → New query → Run
-- =====================================================

-- =====================================================
-- 0. RESET OPCIONAL (apaga dados de teste)
-- Descomente as linhas abaixo SÓ se quiser zerar o banco.
-- =====================================================
-- delete from public.tickets;
-- delete from public.entregadores;
-- delete from public.verificacoes;
-- delete from public.profiles;
-- delete from auth.users;   -- apaga TODOS os usuários (cuidado!)

-- =====================================================
-- 1. TABELA PROFILES
-- =====================================================
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  nome TEXT,
  email TEXT,
  role TEXT,
  verificado BOOLEAN DEFAULT false,
  email_verificado BOOLEAN DEFAULT false,
  telefone TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS verificado BOOLEAN DEFAULT false;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS email_verificado BOOLEAN DEFAULT false;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS telefone TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS role TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS email TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS cnpj TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS razao_social TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS endereco TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS telefone_comercial TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS lat DOUBLE PRECISION;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS lng DOUBLE PRECISION;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS online BOOLEAN DEFAULT false;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS zona TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'ativo';
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS banido_em TIMESTAMPTZ;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS ban_motivo TEXT;
CREATE INDEX IF NOT EXISTS profiles_status_idx ON public.profiles(status);
CREATE INDEX IF NOT EXISTS profiles_cnpj_idx ON public.profiles(cnpj) WHERE cnpj IS NOT NULL;
CREATE INDEX IF NOT EXISTS profiles_email_idx ON public.profiles(lower(email)) WHERE email IS NOT NULL;

-- =====================================================
-- 2. TRIGGER: cria o profile AUTOMATICAMENTE no cadastro
-- (resolve o "cadastro não entra" — o app não precisa mais
--  inserir profile manualmente, o que falhava no RLS)
-- =====================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, nome, email, role, email_verificado)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'nome', split_part(NEW.email, '@', 1)),
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'role', 'cliente'),
    (NEW.email_confirmed_at IS NOT NULL)
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Marca email_verificado = true quando o usuário confirma o e-mail
CREATE OR REPLACE FUNCTION public.handle_user_confirmed()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.email_confirmed_at IS NOT NULL THEN
    UPDATE public.profiles SET email_verificado = true WHERE id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_confirmed ON auth.users;
CREATE TRIGGER on_auth_user_confirmed
  AFTER UPDATE ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_user_confirmed();

-- =====================================================
-- 3. VERIFICAÇÕES (KYC)
-- =====================================================
CREATE TABLE IF NOT EXISTS public.verificacoes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  tipo TEXT NOT NULL CHECK (tipo IN ('ambulante', 'restaurante', 'entregador')),
  nome_completo TEXT, cpf TEXT, data_nascimento TEXT,
  rg_frente_url TEXT, rg_verso_url TEXT, selfie_url TEXT,
  licenca_ambulante BOOLEAN, praia_principal TEXT,
  foto_loja_url TEXT, cnpj TEXT, razao_social TEXT,
  num_funcionarios INTEGER, horario_funcionamento TEXT, tipo_cozinha TEXT,
  restaurante_id UUID, cnh_url TEXT, tipo_veiculo TEXT, placa TEXT,
  status TEXT DEFAULT 'pendente' CHECK (status IN ('pendente', 'aprovado', 'rejeitado')),
  motivo_rejeicao TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- =====================================================
-- 4. ENTREGADORES
-- =====================================================
CREATE TABLE IF NOT EXISTS public.entregadores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurante_id UUID NOT NULL,
  nome TEXT NOT NULL, telefone TEXT, cpf TEXT,
  verificacao_id UUID REFERENCES public.verificacoes(id),
  status TEXT DEFAULT 'pendente' CHECK (status IN ('pendente', 'aprovado', 'rejeitado')),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- =====================================================
-- 5. TICKETS DE SUPORTE
-- =====================================================
CREATE TABLE IF NOT EXISTS public.tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID,
  usuario_nome TEXT,
  usuario_email TEXT,
  plataforma TEXT NOT NULL CHECK (plataforma IN ('iphone', 'android', 'restaurante', 'ambulante', 'cliente')),
  assunto TEXT NOT NULL, mensagem TEXT NOT NULL,
  status TEXT DEFAULT 'aberto' CHECK (status IN ('aberto', 'em_andamento', 'resolvido', 'fechado')),
  prioridade TEXT DEFAULT 'media' CHECK (prioridade IN ('baixa', 'media', 'alta', 'urgente')),
  resposta TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ
);
ALTER TABLE public.tickets ADD COLUMN IF NOT EXISTS user_id UUID;
ALTER TABLE public.tickets ADD COLUMN IF NOT EXISTS usuario_nome TEXT;
ALTER TABLE public.tickets ADD COLUMN IF NOT EXISTS usuario_email TEXT;
ALTER TABLE public.tickets ADD COLUMN IF NOT EXISTS plataforma TEXT;
ALTER TABLE public.tickets ADD COLUMN IF NOT EXISTS assunto TEXT;
ALTER TABLE public.tickets ADD COLUMN IF NOT EXISTS mensagem TEXT;
ALTER TABLE public.tickets ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'aberto';
ALTER TABLE public.tickets ADD COLUMN IF NOT EXISTS prioridade TEXT DEFAULT 'media';
ALTER TABLE public.tickets ADD COLUMN IF NOT EXISTS resposta TEXT;
ALTER TABLE public.tickets ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ;

-- =====================================================
-- 5.1 FINANCEIRO / TAXA DA PLATAFORMA
-- =====================================================
CREATE TABLE IF NOT EXISTS public.payment_settings (
  id BOOLEAN PRIMARY KEY DEFAULT true,
  platform_fee_percent NUMERIC(5,2) NOT NULL DEFAULT 10.00,
  platform_fee_fixed NUMERIC(10,2) NOT NULL DEFAULT 0.00,
  presencial_fee_mode TEXT NOT NULL DEFAULT 'cobrar_vendedor' CHECK (presencial_fee_mode IN ('cobrar_vendedor','isento','mensalidade')),
  updated_at TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT payment_settings_singleton CHECK (id = true)
);

INSERT INTO public.payment_settings (id, platform_fee_percent, platform_fee_fixed, presencial_fee_mode)
VALUES (true, 10.00, 0.00, 'cobrar_vendedor')
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.vendor_payment_accounts (
  vendedor_id UUID PRIMARY KEY,
  provider TEXT NOT NULL DEFAULT 'pagarme',
  provider_account_id TEXT,
  gateway_user_id TEXT,
  gateway_linked_at TIMESTAMPTZ,
  pix_key TEXT,
  bank_name TEXT,
  bank_agency TEXT,
  bank_account TEXT,
  holder_name TEXT,
  holder_document TEXT,
  status TEXT NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente','verificado','bloqueado')),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.financial_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pedido_id UUID,
  vendedor_id UUID,
  tipo TEXT NOT NULL CHECK (tipo IN ('taxa_plataforma','repasse_vendedor','reembolso','ajuste')),
  valor NUMERIC(10,2) NOT NULL,
  status TEXT NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente','pago','cancelado')),
  provider TEXT DEFAULT 'manual',
  external_reference TEXT,
  descricao TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  settled_at TIMESTAMPTZ
);

ALTER TABLE public.pedidos ADD COLUMN IF NOT EXISTS payment_provider TEXT DEFAULT 'manual';
ALTER TABLE public.pedidos ADD COLUMN IF NOT EXISTS payment_status TEXT DEFAULT 'pendente';
ALTER TABLE public.pedidos ADD COLUMN IF NOT EXISTS payment_reference TEXT;
ALTER TABLE public.pedidos ADD COLUMN IF NOT EXISTS payment_checkout_url TEXT;
ALTER TABLE public.pedidos ADD COLUMN IF NOT EXISTS gateway_checkout_id TEXT;
ALTER TABLE public.pedidos ADD COLUMN IF NOT EXISTS gateway_payment_id TEXT;
ALTER TABLE public.pedidos ADD COLUMN IF NOT EXISTS payment_details JSONB DEFAULT '{}'::jsonb;
ALTER TABLE public.pedidos ADD COLUMN IF NOT EXISTS lat DOUBLE PRECISION;
ALTER TABLE public.pedidos ADD COLUMN IF NOT EXISTS lng DOUBLE PRECISION;
ALTER TABLE public.pedidos ADD COLUMN IF NOT EXISTS gross_amount NUMERIC(10,2);
ALTER TABLE public.pedidos ADD COLUMN IF NOT EXISTS platform_fee_amount NUMERIC(10,2);
ALTER TABLE public.pedidos ADD COLUMN IF NOT EXISTS vendor_amount NUMERIC(10,2);
ALTER TABLE public.pedidos ADD COLUMN IF NOT EXISTS settlement_status TEXT DEFAULT 'pendente';
ALTER TABLE public.pedidos ADD COLUMN IF NOT EXISTS paid_at TIMESTAMPTZ;
ALTER TABLE public.pedidos ADD COLUMN IF NOT EXISTS refunded_at TIMESTAMPTZ;

CREATE OR REPLACE FUNCTION public.set_order_finance_fields()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  cfg RECORD;
  gross NUMERIC(10,2);
  fee NUMERIC(10,2);
  vendor_value NUMERIC(10,2);
  method TEXT;
BEGIN
  SELECT platform_fee_percent, platform_fee_fixed, presencial_fee_mode
  INTO cfg
  FROM public.payment_settings
  WHERE id = true;

  gross := COALESCE(NEW.gross_amount, NEW.total, 0)::NUMERIC(10,2);
  fee := ROUND(((gross * COALESCE(cfg.platform_fee_percent, 10.00) / 100) + COALESCE(cfg.platform_fee_fixed, 0.00))::NUMERIC, 2);
  vendor_value := GREATEST(0, ROUND((gross - fee)::NUMERIC, 2));
  method := COALESCE(NEW.pagamento, 'pix');

  NEW.gross_amount := gross;
  NEW.platform_fee_amount := COALESCE(NEW.platform_fee_amount, fee);
  NEW.vendor_amount := COALESCE(NEW.vendor_amount, vendor_value);
  NEW.payment_provider := COALESCE(NEW.payment_provider, CASE WHEN method IN ('pix','cartao','credito_online','debito_online') THEN 'pagarme' ELSE 'manual' END);
  NEW.payment_status := COALESCE(NEW.payment_status, CASE WHEN method IN ('dinheiro','cartao_fisico','debito_fisico','credito_fisico') THEN 'presencial' ELSE 'pendente' END);
  NEW.settlement_status := COALESCE(NEW.settlement_status, CASE WHEN method IN ('dinheiro','cartao_fisico','debito_fisico','credito_fisico') THEN COALESCE(cfg.presencial_fee_mode, 'cobrar_vendedor') ELSE 'pendente' END);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_order_finance_fields ON public.pedidos;
CREATE TRIGGER trg_set_order_finance_fields
BEFORE INSERT OR UPDATE OF total, pagamento, gross_amount, platform_fee_amount, vendor_amount, payment_provider, payment_status, settlement_status
ON public.pedidos
FOR EACH ROW EXECUTE FUNCTION public.set_order_finance_fields();

CREATE OR REPLACE FUNCTION public.create_order_financial_ledger()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.financial_ledger (pedido_id, vendedor_id, tipo, valor, status, descricao)
  VALUES
    (NEW.id, NEW.vendedor_id, 'taxa_plataforma', COALESCE(NEW.platform_fee_amount, 0), 'pendente', 'Taxa da plataforma PraiaGo'),
    (NEW.id, NEW.vendedor_id, 'repasse_vendedor', COALESCE(NEW.vendor_amount, 0), 'pendente', 'Valor do vendedor apos taxa');
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_create_order_financial_ledger ON public.pedidos;
CREATE TRIGGER trg_create_order_financial_ledger
AFTER INSERT ON public.pedidos
FOR EACH ROW EXECUTE FUNCTION public.create_order_financial_ledger();

-- =====================================================
-- 6. RLS + POLÍTICAS  (idempotente: DROP antes de CREATE)
-- ⚠️ ATENÇÃO: estas políticas são ABERTAS (true) — boas para
-- TESTAR. Antes de ir ao ar, troque pelas políticas restritas
-- por usuário/role descritas no SECURITY.md.
-- =====================================================
ALTER TABLE public.profiles     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.verificacoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.entregadores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tickets      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vendor_payment_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.financial_ledger ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all profiles"     ON public.profiles;
DROP POLICY IF EXISTS "Allow all verificacoes" ON public.verificacoes;
DROP POLICY IF EXISTS "Allow all entregadores" ON public.entregadores;
DROP POLICY IF EXISTS "Allow all tickets"      ON public.tickets;
DROP POLICY IF EXISTS "Allow all payment_settings" ON public.payment_settings;
DROP POLICY IF EXISTS "Allow all vendor_payment_accounts" ON public.vendor_payment_accounts;
DROP POLICY IF EXISTS "Allow all financial_ledger" ON public.financial_ledger;

CREATE POLICY "Allow all profiles"     ON public.profiles     FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all verificacoes" ON public.verificacoes FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all entregadores" ON public.entregadores FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all tickets"      ON public.tickets      FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all payment_settings" ON public.payment_settings FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all vendor_payment_accounts" ON public.vendor_payment_accounts FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all financial_ledger" ON public.financial_ledger FOR ALL USING (true) WITH CHECK (true);

-- =====================================================
-- 7. REALTIME (guardado: não dá erro se já estiver ativo)
-- =====================================================
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['profiles','verificacoes','entregadores','tickets','pedidos','avisos','cupons','eventos','produtos','avaliacoes','payment_settings','vendor_payment_accounts','financial_ledger'] LOOP
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name=t)
       AND NOT EXISTS (
         SELECT 1 FROM pg_publication_tables
         WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename=t
       )
    THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
    END IF;
  END LOOP;
END $$;

-- =====================================================
-- 8. BACKFILL: cria profiles para usuários que já existem
-- (caso você já tenha cadastrado antes do trigger existir)
-- =====================================================
INSERT INTO public.profiles (id, nome, email, role, email_verificado)
SELECT u.id,
       COALESCE(u.raw_user_meta_data->>'nome', split_part(u.email,'@',1)),
       u.email,
       COALESCE(u.raw_user_meta_data->>'role', 'cliente'),
       (u.email_confirmed_at IS NOT NULL)
FROM auth.users u
ON CONFLICT (id) DO NOTHING;

-- ✅ Pronto. Banco configurado.
