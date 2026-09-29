# Cardápio e exceções administrativas · 28/09/2026

## Uso pelos vendedores

Em Cardápio → Novo produto ou Editar, escolha a categoria e informe o nome da seção. Produtos com a mesma seção ficam juntos no Cliente; nomes como Bebidas, Pizzas salgadas e Pizzas doces são dados configuráveis da loja, não exemplos publicados automaticamente.

Para um sabor de pizza, marque **Oferecer este sabor na pizza meio a meio** e escolha o tamanho. É necessário habilitar pelo menos dois sabores do mesmo tamanho. Não altere o preço para metade: cadastre sempre o valor inteiro. O Cliente calcula 50% de cada sabor; o servidor recalcula a mesma regra, incluindo a melhor promoção pública vigente.

Quando o estoque é inteiro, são somadas as metades e o consumo por sabor é arredondado para cima. Exemplo: três pizzas contendo metade Calabresa consomem duas unidades de Calabresa. Sem controle de estoque (`NULL`), não há débito. O cancelamento de pedido novo usa o registro do débito efetivo; pedidos antigos preservam o tratamento legado.

## Uso pelo Admin

Em Financeiro, a baixa externa é uma conciliação do **líquido integral** já repassado. Confira o pedido, informe o valor exato, a referência e o motivo, e confirme se a comissão também já foi recebida. O servidor valida o valor do pedido e do lançamento financeiro, recusa duplicidade e registra auditoria. Não é um saque, não dispara pagamento na Pagar.me e não pode zerar saldo por uma baixa parcial.

Em Atendimento, no chamado aberto ou em andamento vinculado ao pedido, **Gerar novo código para o cliente** invalida o código anterior. Requer permissões de Atendimento e Pedidos, motivo, pedido pronto/em entrega e pagamento válido. O cliente consulta o código em Meus Pedidos. O código nunca vai para a mensagem compartilhada do chamado nem para a resposta da operação administrativa. Não usar essa ação como conclusão de entrega, aprovação cadastral, reembolso ou transferência.

Chamados antigos só podem ser vinculados automaticamente quando o assunto contém o UUID completo do pedido e o usuário pertence a esse pedido. Um número parcial ou nome parecido não basta.

## Verificação reproduzível

- Nos diretórios Cliente e Restaurante: `npm test` e `npm run build`.
- No Admin: `npm test` e `npm run build`. No Ambulante: `npm run build`.
- Na raiz: `node supabase/tests/menu_half_pizza.test.mjs <caminho-do-pglite>` e `node supabase/tests/admin_external_repasse.test.mjs <caminho-do-pglite>`.
- Os testes PostgreSQL criam um banco descartável; não fazem solicitações externas. Não criar pedido ou pagamento real para testar a implantação.
- Conferir o menu em 390 × 844, navegar para Bebidas e combinar dois sabores do mesmo tamanho. A Piu Sapore tem 90 pizzas habilitadas: 45 Broto e 45 Grande. Calabresa Grande (R$ 43,00) + Da Casa Grande (R$ 70,00) deve totalizar R$ 56,50.

## Banco, compatibilidade e distribuição

Migrações isoladas: `20260928200000_menu_half_pizza.sql` e `20260928203000_admin_ticket_order_exceptions.sql`. As colunas são aditivas e os pedidos de um único produto do app antigo continuam válidos. Não executar `supabase db push` sem reconciliar a cadeia histórica.

As funções auxiliares de preço e estoque não são executáveis pelo público. As exceções administrativas são acessíveis apenas a usuários autenticados, com verificação de permissões no servidor; comprador/vendedor comum não recebe acesso administrativo.

Restaurante e Admin são sites e podem ser implantados sem distribuir o novo Cliente/Ambulante. Esses dois apps ficam como código candidato para outubro; esta entrega não publica OTA, TestFlight ou App Store. A build nativa e a homologação física/sandbox permanecem necessárias. A regra preexistente de reserva de estoque de pagamento online não foi redesenhada; o teste local não demonstra ausência de todas as disputas concorrentes de pagamento em produção.

## Publicação e recuperação

Publicar a partir de checkout limpo do commit, sem incorporar alterações pendentes de outro escopo. Criar prévia de cada site, conferir seus arquivos e promover somente após build aprovada. Conferir novamente a implantação de produção, o SHA e os assets servidos pelo domínio.

Bases web anteriores a esta entrega:

- Admin: `dpl_7YkjpDaeKHeeRr3AZjQvjQx4tf5j`, SHA `fa95b9a308e7c041b09077c8bd05b3968a125db4`.
- Restaurante: `dpl_CYkGX2Bs6LinGwS2YSgtXs2aiwsn`, mesmo SHA.

Se falhar o menu, login, autorização, cálculo ou suporte, parar a distribuição dos apps e promover a implantação web anterior verificada. Manter as colunas aditivas e registros financeiros/auditoria; não apagar migrações, históricos ou saldos para fazer rollback. Qualquer reversão de função de banco exige comparação e teste da definição anterior em transação controlada. Registrar os IDs e o SHA das novas implantações na entrega após a verificação ao vivo.
