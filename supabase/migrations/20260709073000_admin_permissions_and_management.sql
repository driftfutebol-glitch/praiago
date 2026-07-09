-- Permissões granulares por admin (quais seções do painel ele acessa).
-- null = acesso total (compat: admins antigos continuam com tudo).
alter table public.profiles add column if not exists permissions text[];

-- Pedro é o dono do sistema: sysadmin (único que gerencia outros admins).
update public.profiles set role = 'sysadmin' where email = 'pedro@praiago.com.br';
