# Configuração de BIOS no Lenovo IdeaPad

- **ID:** `eaa4941f-879d-47ee-be6d-9d1eb32ddf00`
- **Criado em:** 2026-06-26T10:28:37.036232Z
- **Atualizado em:** 2026-06-26T10:29:15.609805Z

---

### 👤 **Usuário** (2026-06-26T10:28:37.451860Z)

Oi tô na bios do meu Lenovo slim adepad 15IRH10R

---

### 🤖 **Claude** (2026-06-26T10:28:48.394170Z)

O usuário está em português brasileiro e está acessando a BIOS do seu Lenovo Slim IdeaPad 15IRH10R, mas ainda não fez uma pergunta específica — parece que está apenas informando onde está agora.

Preciso responder em português brasileiro de forma natural e concisa, perguntando o que ele quer fazer na BIOS, já que há várias possibilidades (ordem de boot, desabilitar secure boot, etc.). Vou manter a resposta breve e amigável, sem fazer muitas perguntas de uma vez.Boa, Pedro! Tá dentro da BIOS. O que você quer fazer aí?

Algumas coisas comuns nesse IdeaPad:

- **Ordem de boot / bootar de pendrive** (instalar ou rodar um Linux live)
- **Secure Boot** (ligar/desligar — às vezes precisa desligar pra instalar certas distros)
- **Modo SATA / VMD** (esse costuma travar a instalação do Linux se estiver em RAID/VMD em vez de AHCI)
- **Virtualização (VT-x)** pra rodar máquina virtual
- **F-keys / Fn Lock**

Me diz o que você tá tentando resolver que eu te guio direitinho. E se puder, me fala qual aba você tá vendo na tela (tipo *Main*, *Configuration*, *Boot*, *Security*).

---

### 👤 **Usuário** (2026-06-26T10:28:53.103770Z)

E quero ativar o XML me acompanha e me aconselha por favor

---

### 🤖 **Claude** (2026-06-26T10:29:02.066603Z)

Pedro probably means XMP, not XML — that's the memory overclocking profile found in BIOS settings. Though on IdeaPad Slim laptops, the available options might be more limited than what he's expecting.

---

### 👤 **Usuário** (2026-06-26T10:29:03.689361Z)

Xmp

---

### 🤖 **Claude** (2026-06-26T10:29:15.609805Z)

Ah, **XMP**! (Extreme Memory Profile — o perfil que faz sua memória RAM rodar na velocidade anunciada, tipo 5600MHz, em vez de ficar travada na velocidade base mais lenta.)

Deixa eu te dar uma orientação honesta antes: nesses **IdeaPad Slim** (notebook), o BIOS costuma ser bem **enxuto/travado**, e na maioria das vezes **não tem a opção de XMP exposta** pro usuário. Em muitos modelos a RAM já roja na velocidade certa automaticamente, ou simplesmente não dá pra mexer. Então pode ser que você não ache mesmo — e tudo bem.

Mas vamos procurar. Me acompanha:

**1. Procure a aba certa**
Geralmente fica em uma dessas:
- **Configuration**
- **Advanced**

Navegue com as setas e veja se aparece algo como:
- **XMP** / **Extreme Memory Profile**
- **DRAM Profile** / **Memory Profile**
- **DOCP** (nome equivalente, mais comum em placa AMD)

**2. Se achar:**
Geralmente o valor tá em *Disabled*. Mude pra **Profile 1** (ou *Enabled*).

**3. Salvar e sair:**
Aperte **F10** → confirma com *Yes*. O note reinicia.

Antes de você sair procurando, me confirma uma coisa pra eu te ajudar melhor:
```
This block is not supported on your current device yet.
```



---

