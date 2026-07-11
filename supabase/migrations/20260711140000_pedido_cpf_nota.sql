-- CPF na nota (opcional): cliente pode informar o CPF pra sair na nota fiscal.
-- Não emite NF-e aqui — só guarda o CPF pra quando a emissão for integrada.
alter table public.pedidos add column if not exists cpf_nota text;
