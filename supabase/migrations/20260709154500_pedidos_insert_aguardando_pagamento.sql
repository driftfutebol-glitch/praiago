-- Fix: pagamento online cria o pedido com status 'aguardando_pagamento' (nasce
-- travado até o webhook do MP confirmar). A política de INSERT só permitia
-- 'novo', então TODO pedido online era rejeitado pelo RLS (42501). Amplia pra
-- aceitar também 'aguardando_pagamento' no insert (status pré-pagamento, sem
-- privilégio). Presencial continua nascendo 'novo'.
alter policy pedidos_insert_checkout_safe on public.pedidos
with check (
  (coalesce(status, 'novo') in ('novo','aguardando_pagamento'))
  and (coalesce(total, 0) >= 0)
  and ((cliente_id is null) or (cliente_id = (select auth.uid())))
  and (coalesce(payment_provider, 'manual') in ('manual','mercadopago'))
  and (coalesce(payment_status, 'pendente') in ('pendente','presencial'))
);
