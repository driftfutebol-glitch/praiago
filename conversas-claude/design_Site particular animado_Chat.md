# Design Chat: Site particular animado - Chat

- **ID:** `8d156003-31a0-4b1a-9301-712097e3471b`
- **Criado em:** 2026-07-13T11:25:44.055080+00:00

---

### 👤 **Usuário**



> Anexo: Design Components

This project uses Design Components: every design is a single streaming `Name.dc.html` file. The full authoring spec is in your system prompt under "Writing code — Design Components" — follow it. Author and edit `.dc.html` content with the `dc_write`, `dc_html_str_replace`, `dc_js_str_replace`, and `dc_set_props` tools (not `write_file`; `str_replace_edit` works but won't stream); template edits stream into the live preview as you type.


> Anexo: Animated video

Create an animated video or motion design piece rendered as an HTML page. Build a timeline-based animation with smooth transitions. Design frame-by-frame sequences with playback controls (play/pause, scrubber). Focus on visual storytelling with the Anthropic brand palette. Export-ready at a fixed aspect ratio (16:9 or 9:16). If you need to know the position of an element (eg to move a cursor or character between elements) use refs to grab the position.

For any standalone animation (one that isn't embedded inside another design or page), ALWAYS build on the `animations.jsx` starter — only skip it if the user explicitly asks you not to.

START by calling `copy_starter_component` with `kind: "animations.jsx"` — it gives you a ready-made timeline engine: `<Stage width height duration>` (auto-scales to viewport, scrubber + play/pause + ←/→ seek + space + 0-to-reset, persists playhead), `<Sprite start end>` to gate children to a time window, `useTime()` / `useSprite()` hooks, an `Easing` library, `interpolate()` / `animate()` tweens, and `TextSprite` / `ImageSprite` / `RectSprite` primitives with built-in entry/exit. Read the file after copying and build YOUR scenes by composing Sprites inside a Stage; only fall back to Popmotion (https://unpkg.com/popmotion@11.0.5/dist/popmotion.min.js) if the starter genuinely can't do what you need.

Stage renders inside <svg><foreignObject>; if a screenshot of it comes back black, that's a capture artifact — trust the live preview.

Animations are complex code! Make reusable JSX components for each visual element and each scene. Invest in tweaking the timeline iteratively.

Animation tips:
- Storytelling is KEY! Before you create ANYTHING, identify the story arc, key tensions, characters, etc. Align on the message you want to convey. Run it by the user.
- Use good animation principles... anticipation, easing, follow-through, exaggeration, all the Disney animator principles.
- Scenes should have establishing shots setting the scene (use titles or captions if NECESSARY, but prefer to show not tell), followed by heavy zooms on the action. (either hard cuts, or ken-burns-style zooms, or mouse-follows.) Most scenes should exist in a realistic context: they should have a background, or exist in the UI of a computer or phone; etc. Elements should generally not float in the aether.
- In short animations, most 'scenes' are a single shot, or a sequence of shots in the same setting. Scenes may be slides (e.g. text or graphics onscreen, animating or being emphasized (highlighted etc) in an engaging way that calls attention to the key thing). Decide what the shot is going to be. Maybe it's starting zoomed out, then slowly zooming in on the area of focus or action. Maybe it's rapidly cutting back/forth between two people or graphics in tension. Maybe you're following something, like a cursor or a line on a graph, as it flits around. Be creative!
- Except for deliberate dramatic effect (a held beat), SOMETHING should always be in motion. The camera, an element, or a transition — slowly panning, zooming, subtly scaling up, drifting, or building. A truly static frame reads as a bug. Images especially: always slowly zoom in/out, pan, have some 'action', have text or graphics appearing or building, or be rapidly cutting in sequence.
- Whenever you show text or images, remember that you need pauses for it to sink in -- on the order of seconds -- before you can show something else.

If cursor or pointer movement is depicted (eg in a product walkthrough or prototype), you should zoom in on it and follow it with a damped viewport animation, like Screen Studio would. You MUST use HTML refs to locate elements onscreen so the cursor points at the right things.

For clarity when commenting, update the video root's data-screen-label attr with the current timestamp each second, so you can easily comment on a particular timestamp and know that the agent will be told exactly the timestamp.

To make content the user can export as a video (Share → Export → Video):

IF YOU ARE BUILDING ON THE `animations.jsx` STARTER (see the "Animated video" skill — the normal case): `<Stage>` ALREADY SATISFIES THIS ENTIRE CONTRACT — it owns the exportable attribute, the seek listener, the svg/foreignObject wrapper, and font inlining, and it provides a `<VideoSprite>` helper for looped <video> clips. Do NOT add `data-om-exportable-video-with-duration-secs` to any element yourself. Adding it to a wrapper ABOVE the stage creates two nested exportable roots, and the export and timeline transport bind to the wrong (outer) one — playback control and export silently break.

Only for a page built WITHOUT the starter, implement the contract yourself:

- Put `data-om-exportable-video-with-duration-secs="<N>"` on the ONE root element you want exported (N ≤ 300; longer is clamped). Exactly one element in the document may carry this attribute — never nest it.
- That element MUST listen for the custom event `data-om-seek-to-time-frame` (`detail: {time, frame}`): on receipt, pause playback and synchronously render that exact timestamp so every visible child is at that point.
- Nested `<video>` elements that should contribute audio must carry `data-om-exportable-video-play-start`, `data-om-exportable-video-play-end` (seconds into the source), and optionally `data-om-exportable-video-play-speed`; they loop within [start,end] at that speed and their audio is mixed into the export. Keep their visual frame in sync with the timeline yourself (set `video.currentTime` from the seek event / your clock).
- For best results, make the root an `<svg><foreignObject>` wrapper and inline your @font-face rules into it once — the exporter then serializes the svg directly per frame (fast, pixel-perfect). A plain div works too, just slower (full-page snapshot per frame).


> Anexo: Design System (design system)

[Design System] This project uses the **Design System** design system. This is a binding choice for visual style — every visual must follow it. Don't invent colors, type, spacing, or components not grounded here.

Scope: the design system is a visual style reference only. Its guide may describe example products, brands, or people that are unrelated to the user and unrelated to the subject of this conversation. Never treat anything in the design system as a fact about the user, their work, or the topic they asked about.

    Explore it to find what you need:
    - Always copy out the fonts and colors you need
    - For prototypes and designs, always copy out any relevant components
    - If the design system contains existing mocks of products, and you were asked to design or prototype something similar, copy and fork those mocks to start your design. This helps you make high-quality designs.

    Explore it quickly to find relevant UI kits (e.g. mocks of existing products you can copy and fork)

Full system at `/projects/27acf0c3-3bc3-43c1-8c80-8fbc8a2bd7b2/`. Before producing any visuals, explore it: call `list_files("/projects/27acf0c3-3bc3-43c1-8c80-8fbc8a2bd7b2/")` to see the structure, then `read_file` the README/base.md or whatever index file it has. Don't guess at the design system's contents.

CSS tokens: the guide may describe tokens in prose, but the exact `--*` names are defined in the design system's stylesheet(s). Before writing any `var(--*)`, look up the real name in the design system's `.css` files (`list_files` + `read_file` under `/projects/27acf0c3-3bc3-43c1-8c80-8fbc8a2bd7b2/`). Never guess a token name — an unresolved `var()` silently falls back to the browser default.

For assets and UI kits beyond the guide: `read_file("/projects/27acf0c3-3bc3-43c1-8c80-8fbc8a2bd7b2/<path>")` and `copy_files` to bring them into the current project.


---

### 🤖 **Claude**



---

### 👤 **Usuário**



---

### 🤖 **Claude**



---

