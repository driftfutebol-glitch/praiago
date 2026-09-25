# Piu Sapore Pizzaria · cardápio recebido em 25/09/2026

Fonte: imagem `IMG-20260923-WA0541.jpg` fornecida pelo usuário. O arquivo `piu-sapore-2026-09-25.json` transcreve os 27 sabores legíveis, com preços Broto e Grande, totalizando 54 produtos. Os itens numerados 3 e 22 estão cobertos; não foram inventados ou cadastrados. A imagem não contém bebidas, portanto nenhuma bebida foi adicionada.

O campo `menuSection` preserva a separação Premium/Salgadas do impresso. Na publicação atual, `category` é `Pizza`, pois esta é a categoria reconhecida pelo app Cliente em produção. O app candidato de outubro já se prepara para rótulos mais específicos, sem forçar um OTA público antes da homologação.

As 27 imagens em `piu-sapore-images/` são fotografias **geradas e ilustrativas**, uma por sabor, usadas nos dois tamanhos. Não são fotos tiradas no estabelecimento. Cada descrição publicada inclui “Foto ilustrativa.”

Prompt-base usado no gerador de imagens: “Foto ilustrativa de produto para cardápio digital de pizzaria brasileira; pizza inteira do sabor indicado, vista a 45 graus, fundo neutro escuro, molho e ingredientes informados no cardápio, orégano e azeitonas quando cabíveis; fotografia gastronômica natural, sem pessoas, texto, marca ou watermark.” Cada imagem acrescentou os ingredientes visuais do respectivo sabor. As imagens finais foram convertidas para WebP 720 × 720 para a loja.

O importador do Restaurante expande `variants` em itens separados, valida preços/categorias/fotos, pula nomes já cadastrados e permite retomar uma falha sem duplicar produtos. Os uploads vão para o bucket `produtos` na pasta da conta autenticada. Nenhuma migração do banco foi aplicada.
