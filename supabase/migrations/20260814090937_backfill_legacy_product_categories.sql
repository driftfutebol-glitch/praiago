update public.produtos
set
  categoria = 'Bebidas',
  nome = case
    when lower(trim(nome)) = 'cervja' then 'Cerveja'
    else nome
  end
where lower(trim(coalesce(categoria, ''))) in ('ambulante', 'geral', 'outros')
  and lower(trim(nome)) in ('cervja', 'cerveja');
