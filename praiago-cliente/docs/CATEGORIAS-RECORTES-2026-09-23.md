# Recortes das categorias · 23/09/2026

As imagens v1 continham um fundo branco opaco. Alterar apenas o fundo CSS não removia os retângulos no tema escuro. A edição foi feita com a ferramenta integrada image_gen (skill imagegen), em modo background-extraction. Originais v1 preservados.

Arquivos usados pelo app:

- `public/images/categorias-comida-v2.webp`: grade 5 × 6, 1254 × 1254, 511.982 bytes.
- `public/images/bebidas-alcoolicas-v2.webp`: 1254 × 1254, 248.956 bytes.

Os PNGs editados foram convertidos para WebP com qualidade 88 e alphaQuality 100, sem redimensionamento, mantendo transparência. Conferidos visualmente na grade e no tema claro/escuro; alpha mínimo 0 e máximo 255. Os arquivos ilustram categorias; não representam estoque, vendedores ou produtos cadastrados. Não foram adicionados dados de demonstração.

## Prompts finais

### Grade de comidas

Use case: background-extraction. Input image 1 is the EDIT TARGET, a food category sprite sheet for a mobile app. Remove ONLY the white background and leave genuine transparent alpha, no checkerboard drawn in the image. Preserve all 30 food objects and plates, their original colors, lighting and fine edges. Critically preserve the exact existing 5-column by 6-row grid, each object stays in the same cell and same relative position and scale, square canvas. This is used as a CSS sprite, so do NOT rearrange, resize individual subjects, add padding or crop. Do not remove white plates, rice, ice cream or other actual white food. Remove white background halos. No new objects, no words, no watermark. Output transparent PNG.

### Bebidas alcoólicas

Use case: background-extraction. Input image 1 is the EDIT TARGET. Remove only the white studio background to genuine transparent alpha, not a painted checkerboard. Preserve exactly these three beverage glasses: beer left, wine right, caipirinha in front, all drinks, foam, lime, glass edges, positions, sizes and realistic colors unchanged. Preserve white beer foam as actual subject, remove white background halos and blank space between the glass stems. Square canvas same framing. No extra objects, text or watermark. Output transparent PNG.
