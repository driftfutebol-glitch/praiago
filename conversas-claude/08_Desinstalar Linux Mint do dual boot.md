# Desinstalar Linux Mint do dual boot

- **ID:** `0923080f-2c07-4164-bae3-38ccf2ca8091`
- **Criado em:** 2026-06-24T13:00:26.042890Z
- **Atualizado em:** 2026-06-24T13:01:30.460500Z

---

### 👤 **Usuário** (2026-06-24T13:00:26.405302Z)

📱 GUIA — Instalar Linux Mint (Dual Boot)
✅ Já feito no PC (não precisa fazer)
Windows encolhido → 150 GB livres pro Linux
ISO do Mint baixada e verificada
Pendrive gravado e pronto
🚫 REGRA DE OURO
NUNCA escolha "Apagar disco / Erase disk" → isso apaga o Windows!
Sempre use "Ao lado do Windows / alongside Windows".

🔵 FASE 1 — Bootar pelo pendrive
Pendrive conectado → Reinicie o PC
No logo LENOVO, aperte F12 várias vezes (menu de boot)
Escolha a linha UEFI: ... USB DISK ... → Enter
No menu do Mint → "Start Linux Mint"
Espere abrir a área de trabalho (rodando do pendrive, nada instalado ainda)
🔵 FASE 2 — Internet
Canto inferior direito → conecte no Wi-Fi (ou use cabo)
🔵 FASE 3 — Instalar
Clique 2x em "Install Linux Mint"
Idioma: Português → Continuar
Teclado: Português (Brasil) – ABNT2 → Continuar
Marque "Instalar codecs multimídia" → Continuar
⭐ TELA MAIS IMPORTANTE — "Tipo de instalação":
Escolha "Instalar o Linux Mint ao lado do Windows Boot Manager" ✅
NÃO marque "Apagar disco" 🚫
Se não aparecer "ao lado do Windows" → PARE, tire foto e me chame
Se pedir pra ajustar o tamanho (barra) → pode deixar → Instalar agora → Continuar
Fuso: São Paulo → Continuar
Crie usuário + SENHA (anote!) → Continuar
Aguarde ~15–20 min (PC na tomada)
Reiniciar agora → quando mandar, retire o pendrive → Enter
🔵 FASE 4 — Primeiro boot (escolher sistema)
Aparece um menu escuro (GRUB):
Linux Mint ← setas + Enter
Windows Boot Manager ← desce + Enter
Esse menu aparece toda vez que ligar → você escolhe o sistema 🎉
🆘 Se der problema
F12 não abriu menu: reinicie e aperte F12 mais cedo/repetido
Ligou direto no Windows: reinicie → F12 → escolha UEFI: USB
Não apareceu "ao lado do Windows": PARE e me chame (foto da tela)
Qualquer dúvida: tira foto da tela e me manda aqui 📸 eu fiz esse processos gora como faço pra desinstalar ele

---

### 🤖 **Claude** (2026-06-24T13:01:30.460500Z)

O usuário instalou Linux Mint em dual boot com Windows e quer desinstalá-lo. Vou responder em português. A remoção envolve duas etapas principais: deletar as partições do Linux e restaurar o bootloader do Windows, já que o GRUB assumiu o controle do processo de inicialização — se apenas deletar a partição Linux, o PC pode falhar ao iniciar.

Para um sistema UEFI (como em Lenovo), o processo seguro é: iniciar no Windows, restaurar o Windows Boot Manager como padrão removendo a entrada GRUB da ordem de boot no firmware UEFI, deletar as partições Linux, e opcionalmente estender a partição Windows para recuperar o espaço. Vou fornecer um guia prático e cuidadoso, já que o usuário parece ser relativamente novato nessas operações. The safest approach for someone unfamiliar with this is to boot into Windows, then use the UEFI firmware settings to set Windows Boot Manager as the default boot option, followed by deleting the Linux partitions through Disk Management. I'm working through the command-line method using bcdedit to manage the boot entries directly from Windows. Mounting the EFI System Partition from Windows and navigating to the EFI folder structure to locate and delete the GRUB entry directory...

Alternatively, I could use `bcdedit` to enumerate firmware boot entries and delete the ubuntu entry by its GUID, or recommend a GUI tool like EasyUEFI for users who prefer a simpler approach.

For a comprehensive guide, I should outline the phases: first ensure Windows boots from the BIOS, then delete the Linux partitions in Disk Management, optionally clean up the GRUB EFI entry, and finally reclaim the space back to the Windows drive. The key point is not to delete partitions first without setting the boot order properly.

This is well-established technical knowledge about UEFI dual boot removal that hasn't changed, so I don't need to search for current information. I'll respond in Portuguese to match the user's language, keeping the tone friendly and clear while emphasizing safety. I'm structuring this as a phased guide with critical warnings upfront—the key is fixing Windows's bootloader first before touching any partitions, and making sure the user understands the risks of modifying EFI and partition tables. I'll start with a pre-flight checklist covering backups and the golden rules, then walk through the bootloader repair phase.

For the actual steps, I'm covering how to access the BIOS on a Lenovo machine (usually F2 or through the F12 boot menu), reorder the boot sequence to prioritize Windows Boot Manager, and verify the system boots directly into Windows without showing the GRUB menu. If GRUB persists, there's a secondary phase to remove its EFI entry using Command Prompt with admin privileges—mounting the EFI partition and deleting the Ubuntu folder, then cleaning up the boot configuration. Finally, once Windows is stable and booting independently, the user can safely move to disk management to remove the Linux partitions.

In Disk Management, I need to identify which partitions belong to Linux—they'll show no drive letter and typically display as unknown file systems since Windows doesn't recognize ext4. The key warning is to avoid touching the EFI System Partition, Recovery partition, or the Windows C: drive. After deleting the Linux volumes, the freed space becomes unallocated, which can then be merged back into the Windows partition using the Extend Volume feature, provided the unallocated space sits directly adjacent to C:. I need to keep this concise but detailed since it's a risky procedure, and I'll write everything in Brazilian Portuguese.Boa, Pedro. Desinstalar dual boot tem um detalhe importante: **a ordem importa**. Quem está controlando o boot agora é o GRUB (aquele menu escuro). Se você apagar o Linux primeiro, o PC pode travar num "grub rescue" e não abrir nem o Windows. Então primeiro a gente devolve o controle pro Windows, depois apaga as partições.

## 🚫 REGRA DE OURO
Faça **primeiro** o Windows bootar sozinho. **Só depois** apague as partições do Linux. Nunca o contrário.

## 🔵 FASE 1 — Fazer o Windows bootar sozinho
1. Ligue o PC e entre no **Windows** normalmente
2. Reinicie e, no logo Lenovo, entre na **BIOS/Setup** (geralmente **F2**, ou F12 → "Enter Setup")
3. Vá em **Boot** / ordem de boot
4. Coloque **"Windows Boot Manager"** no topo da lista
5. Salve e saia (**F10** → Yes)
6. Teste: o PC deve ir **direto pro Windows**, sem o menu escuro

Se foi direto pro Windows → pule pra Fase 2.
Se o GRUB **ainda aparecer** → faça a Fase 1b.

## 🔵 FASE 1b — Remover a entrada do GRUB (só se precisou)
No Windows, abra o **Prompt de Comando como Administrador** e digite:
```
mountvol S: /s
rmdir /s /q S:\EFI\ubuntu
```
(o Mint usa a pasta "ubuntu"). Depois reinicie e confirme que vai direto pro Windows.

## 🔵 FASE 2 — Apagar as partições do Linux
1. Aperte **Win + X** → **Gerenciamento de Disco**
2. Ache as partições do Linux: elas ficam **sem letra** (sem C:, D:...) e **sem sistema de arquivos reconhecido** (não dizem NTFS), somando os ~150 GB que você liberou
3. ⚠️ **NÃO apague:** o "EFI System Partition" (pequena, ~100–500 MB), a partição de **Recuperação**, nem o **C:** do Windows
4. Botão direito em cada partição do Linux → **Excluir Volume**
5. Vai virar um espaço **"Não alocado"**

## 🔵 FASE 3 — Recuperar o espaço pro Windows
1. Botão direito no **C:** → **Estender Volume**
2. Adicione o espaço não alocado → avançar até o fim

⚠️ "Estender" só funciona se o espaço livre estiver **logo à direita** do C:. Se tiver uma partição de recuperação no meio atrapalhando, me avise que tem outro caminho.

🆘 Em qualquer fase, se aparecer uma partição que você não tem certeza do que é, **pare e me manda foto da tela** antes de excluir. Quer que eu te ajude a identificar pela foto do Gerenciamento de Disco?

---

