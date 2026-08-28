# Design Chat: PraiaGo Restaurante Dashboard - Chat

- **ID:** `3bdbda6e-943e-4724-ad19-d800dc823ad7`
- **Criado em:** 2026-06-25T21:05:36.079821+00:00

---

### 👤 **Usuário**



> Anexo: Design Components

This project uses Design Components: every design is a single streaming `Name.dc.html` file. The full authoring spec is in your system prompt under "Writing code — Design Components" — follow it. Author and edit `.dc.html` content with the `dc_write`, `dc_html_str_replace`, `dc_js_str_replace`, and `dc_set_props` tools (not `write_file`; `str_replace_edit` works but won't stream); template edits stream into the live preview as you type.


> Anexo: Hi-fi design

Create a high-fidelity, polished design.

Follow this general design process (use the todo list to remember):
(1) ask questions, (2) find existing UI kits and collect design context — copy ALL relevant components and read ALL relevant examples; ask the user if you can't find them, (3) start your file with assumptions + context + design reasoning (as if you are a junior designer and the user is your manager), with placeholders for the designs, and show it to the user early, (4) build out the designs and show the user again ASAP; append some next steps, (5) use your tools to check, verify and iterate on the design.

Good hi-fi designs do not start from scratch — they are rooted in existing design context. Ask the user to Import their codebase, or find a suitable UI kit / design resources, or ask for screenshots of existing UI. You MUST spend time trying to acquire design context, including components. If you cannot find them, ask the user for them. In the Import menu, they can link a local codebase, provide screenshots or Figma links; they can also link another project. Mocking a full product from scratch is a LAST RESORT and will lead to poor design. If stuck, try listing design assets and ls'ing design system files — be proactive! Some designs may need multiple design systems — get them all. Use the starter components (device frames and the like) to get high-quality scaffolding for free.

When showing multiple design options on one page, decide between (a) a single full-size responsive prototype with a tweaks panel, or (b) a pannable canvas of frames. Choose based on how design-y vs prototype-y the ask is, how many options there are, and how big each frame is. For (b):

Use a pannable canvas to present multiple design options, explorations, or screens side-by-side — each option lives in its own absolutely-positioned frame on an infinite gray surface the user pans and zooms. Use this built-in canvas mode instead of rolling your own pan/zoom, unless the user explicitly asks you to.

**What the host recognizes:**
- `<meta name="design_doc_mode" content="canvas">` inside `<helmet>` — arms host pan/zoom, a gray backdrop, and `position:relative` on the root so your absolutely-positioned frames anchor to it. (Either `content=` or `value=` works.)
- `data-drags-parent="N"` on any element — in edit mode, grabbing that element drags its Nth ancestor instead (capped at the template boundary). Put it on a frame's label with `N=1` so dragging the label moves the whole frame.
- The (0,0) origin — frames at negative `left`/`top` are outside the exportable area (edit mode marks that region with a diagonal hatch). Keep every frame's `left` and `top` ≥ 0.

**How to write it:** each frame is a `<div>` that is a **direct child of the root** — right after `</helmet>`, NOT wrapped in any container. Give it `position:absolute` with explicit pixel `left`/`top`/`width`. Inside: a small label positioned just above (with `data-drags-parent="1"`) and a white card with a slight shadow holding the design. Lay frames on a loose grid with generous gaps (~80px). Do NOT add your own wrapper, background, scroll container, zoom controls, or centering — the host owns all of that.

```html
<helmet><meta name="design_doc_mode" content="canvas">…</helmet>
<div style="position:absolute;left:80px;top:80px;width:360px">
<div data-drags-parent="1" style="position:absolute;top:-22px;font:500 11px system-ui;color:rgba(60,50,40,.7)">Variant A</div>
<div style="background:#fff;border-radius:2px;box-shadow:0 1px 3px rgba(0,0,0,.08);padding:16px">…design…</div>
</div>
<div style="position:absolute;left:520px;top:80px;width:360px">…Variant B…</div>
```

Section headers and post-it annotations are just more absolutely-positioned root children: a section header is a larger text label at a group's top-left; a post-it is a small sticky-note card (`background:#fef4a8;padding:12px;font:12px/1.4 system-ui;box-shadow:0 1px 3px rgba(0,0,0,.08);transform:rotate(-1deg)`). Neither needs `data-drags-parent` — they drag as themselves.

When designing, asking many good questions is ESSENTIAL.

Give options: try to give 3+ variations across several dimensions. Mix by-the-book designs that match existing patterns with new and novel interactions, including interesting layouts, metaphors, and visual styles. Have some options that use color or advanced CSS; some with iconography and some without. Start your variations basic and get more advanced and creative as you go! Try remixing the brand assets and visual DNA in interesting ways — play with scale, fills, texture, visual rhythm, layering, novel layouts, type treatments. The goal is not the perfect option; it's exploring atomic variations the user can mix and match.

CSS, HTML, JS and SVG are amazing. Users often don't know what they can do. Surprise the user.

If you do not have an icon, asset or component, draw a placeholder: in hi-fi design, a placeholder is better than a bad attempt at the real thing.


> Anexo: Interactive prototype

Create a fully interactive prototype with realistic state management and transitions. Use React useState/useEffect for dynamic behavior. Include hover states, click interactions, form validation, animated transitions, and multi-step navigation flows. It should feel like a real working app, not a static mockup.


> Anexo: pasted-1782432288365-0.png

None


---

### 🤖 **Claude**



---

