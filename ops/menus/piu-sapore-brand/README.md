# Identidade da vitrine — Piu Sapore Pizzaria

- `piu-sapore-logo-original.jpg`: logo fornecida pelo restaurante, preservada sem redesenho; usada como foto do perfil.
- `piu-sapore-capa-vitrine-v2.webp`: capa publicada, 16:9, otimizada para o recorte horizontal do app Cliente. Foi gerada com a ferramenta integrada de imagem a partir da foto real da fachada e da logo, depois convertida para WebP.
- `piu-sapore-capa-vitrine.webp`: primeira opção de capa, mantida como alternativa; não é a versão publicada.

A capa é uma edição ilustrativa da foto da fachada: exposição corrigida, céu ampliado e elementos de primeiro plano removidos. Ela não deve ser usada como registro documental do estado físico do imóvel.

## Prompt final da capa publicada

```text
Use case: precise-object-edit
Asset type: responsive 16:9 storefront cover photo for a pizza delivery app, which will be vertically center-cropped into a very wide hero (about 4:1) on desktop.
Input images: Image 1 is the edit target, an already-retouched photograph of the real Piu Sapore storefront. Image 2 is the original exact Piu Sapore circular logo for reference only.
Primary request: recompose Image 1 as a more effective responsive cover while preserving the real facade and the exact business sign. The central horizontal band of the final 16:9 image, roughly the middle 45% of its height, MUST clearly contain the full large text 'Piu Sapore' and the circular logo; they must not be at the top edge. Shift the entire existing storefront photograph down within the canvas by naturally extending the dark night sky and roofline above it and reducing the less important pavement at the bottom. Keep a realistic camera photo, same building geometry, same entrances and shutters, no invented renovation. Improve contrast and warmth subtly. Preserve exact logo wording, Italian green-white-red accent, and sign text 'PIZZARIA', 'Piu Sapore', 'FORNO À LENHA' with correct spelling; no new text. No people, cars, clutter, watermark, added pizza graphics, or fake advertising. The result should look like a premium real restaurant storefront cover, not a collage. Wide 16:9 landscape.
```
