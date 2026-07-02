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
  user_id UUID, user_nome TEXT,
  plataforma TEXT NOT NULL CHECK (plataforma IN ('iphone', 'android', 'restaurante', 'ambulante', 'cliente')),
  assunto TEXT NOT NULL, mensagem TEXT NOT NULL,
  status TEXT DEFAULT 'aberto' CHECK (status IN ('aberto', 'em_andamento', 'resolvido')),
  prioridade TEXT DEFAULT 'media' CHECK (prioridade IN ('baixa', 'media', 'alta', 'urgente')),
  resposta_admin TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

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

DROP POLICY IF EXISTS "Allow all profiles"     ON public.profiles;
DROP POLICY IF EXISTS "Allow all verificacoes" ON public.verificacoes;
DROP POLICY IF EXISTS "Allow all entregadores" ON public.entregadores;
DROP POLICY IF EXISTS "Allow all tickets"      ON public.tickets;

CREATE POLICY "Allow all profiles"     ON public.profiles     FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all verificacoes" ON public.verificacoes FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all entregadores" ON public.entregadores FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all tickets"      ON public.tickets      FOR ALL USING (true) WITH CHECK (true);

-- =====================================================
-- 7. REALTIME (guardado: não dá erro se já estiver ativo)
-- =====================================================
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['profiles','verificacoes','entregadores','tickets','pedidos'] LOOP
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
