# Design Chat: Animação neon com eletricidade interativa - Chat

- **ID:** `40e7ed42-7384-40ed-9c3f-d24e66a79b56`
- **Criado em:** 2026-07-15T12:57:05.019153+00:00

---

### 👤 **Usuário**



> Anexo: Design Components

This project uses Design Components: every design is a single streaming `Name.dc.html` file. The full authoring spec is in your system prompt under "Writing code — Design Components" — follow it. Author and edit `.dc.html` content with the `dc_write`, `dc_html_str_replace`, `dc_js_str_replace`, and `dc_set_props` tools (not `write_file`; `str_replace_edit` works but won't stream); template edits stream into the live preview as you type.


> Anexo: Animated video

Create an animated video or motion design piece rendered as an HTML page. Build a timeline-based animation with smooth transitions. Design frame-by-frame sequences with playback controls (play/pause, scrubber). Focus on visual storytelling with the Anthropic brand palette. Export-ready at a fixed aspect ratio (16:9 or 9:16). If you need to know the position of an element (eg to move a cursor or character between elements) use refs to grab the position.

For any standalone animation (one that isn't embedded inside another design or page), ALWAYS build on the `animations_v2.jsx` starter — only skip it if the user explicitly asks you not to. Do NOT load `animations.jsx` alongside it: v2 contains the whole engine (same globals — importing both means last-wins).

START by calling `copy_starter_component` with `kind: "animations_v2.jsx"` — it gives you the full timeline engine (`<Stage>`, `<Sprite start end>`, `useTime()` / `useSprite()` hooks, an `Easing` library, `interpolate()` / `animate()` tweens, `TextSprite` / `ImageSprite` / `RectSprite` primitives) PLUS scene sequencing: `<SceneStage>` plays named scenes in authored order and keeps the exportable duration in sync. Read the file after copying.

ALWAYS structure the piece as a scene sequence — even a single-scene piece is a one-entry scene list. Follow the authoring contract exactly (it's in the file's usage block): declare the scene list as a JSON string literal in a plain inline `<script>` of the MAIN document — `<script>window.OM_SCENES = '[{"name":"Opening","dur":3},…]';</script>` (exact JSON.stringify formatting, no spaces) — NOT in a text/babel script and NOT in a sibling .jsx (only vanilla inline script literals are addressable for the editor's write-back); pass it through untouched as `<SceneStage scenes={window.OM_SCENES}>`, and map scene names to components in the children object. The user can then edit timing by hand on the host timeline: trim one scene, stretch the whole piece on the time ruler, reorder blocks — every edit writes back into your literal and reflows live.

TIMING IS USER-EDITABLE (time-stretch): when the user changes a scene's length, the engine remaps the scene clock so your full choreography plays faster or slower — never cut off. That only works for motion driven by the scene clock, so inside a scene component ALWAYS animate from useScene()'s `localTime`/`progress` (never your own clock, never useTime directly inside a scene). Scene entries can carry extra fields (`"text"`, palettes, any params) — your scene components receive the whole entry, so user-visible knobs belong in that JSON too.

Give every motion project a tweaks panel (`kind: "tweaks_panel.jsx"`) whose TWEAK_DEFAULTS include `"motionEditor": true` with a `<TweakToggle label="Motion editor">` wired to it. That key is the host timeline editor's visibility gate: the user flips it in the Tweaks panel to hide or show the editor bar, and the animation, its timing data, and export are untouched either way. Declare the TWEAK_DEFAULTS literal in a plain inline `<script>` of the MAIN document (the /*EDITMODE-BEGIN*/ convention), so the flip persists.

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

IF YOU ARE BUILDING ON THE `animations_v2.jsx` STARTER (see the "Animated video" skill — the normal case): `<SceneStage>` ALREADY SATISFIES THIS ENTIRE CONTRACT — it owns the exportable attribute, the seek listener, the svg/foreignObject wrapper, and font inlining, and it provides a `<VideoSprite>` helper for looped <video> clips. Do NOT add `data-om-exportable-video-with-duration-secs` to any element yourself. Adding it to a wrapper ABOVE the stage creates two nested exportable roots, and the export and timeline transport bind to the wrong (outer) one — playback control and export silently break.

Only for a page built WITHOUT the starter, implement the contract yourself:

- Put `data-om-exportable-video-with-duration-secs="<N>"` on the ONE root element you want exported (N ≤ 300; longer is clamped). Exactly one element in the document may carry this attribute — never nest it.
- That element MUST listen for the custom event `data-om-seek-to-time-frame` (`detail: {time, frame}`): on receipt, pause playback and synchronously render that exact timestamp so every visible child is at that point.
- Nested `<video>` elements that should contribute audio must carry `data-om-exportable-video-play-start`, `data-om-exportable-video-play-end` (seconds into the source), and optionally `data-om-exportable-video-play-speed`; they loop within [start,end] at that speed and their audio is mixed into the export. Keep their visual frame in sync with the timeline yourself (set `video.currentTime` from the seek event / your clock).
- For best results, make the root an `<svg><foreignObject>` wrapper and inline your @font-face rules into it once — the exporter then serializes the svg directly per frame (fast, pixel-perfect). A plain div works too, just slower (full-page snapshot per frame).

A page carrying this contract also gets a live timeline under the preview — the host scrubs and plays it by dispatching the same seek event, so treat every seek as pause-and-hold (don't resume your own clock until seeks stop arriving).


> Anexo: Start from code

<system-info>The user wants designs based on their existing code. A local codebase is mounted (devclub). Use the local_* tools to browse it. Immediately build a todo list with these items — these steps are not skippable: (1) Read the codebase's README first — it orients you on structure, naming, and where the UI code lives. (2) Explore the attached codebase BRIEFLY — 2 to 5 turns; you need to ask questions quickly. (3) Ask the user questions if relevant — use your judgement. (4) Recreate the current UI PIXEL-PERFECTLY and EXHAUSTIVELY. Write each relevant screen as a .dc.html file (or plain HTML in a non-DC project). This means a faithful copy of what exists today — exact layout, spacing, colors, typography, and component structure. Do NOT draw your own icons or invent UI elements — read every relevant source file first and copy assets directly (icons, fonts, images, tokens) with local_copy_to_project / github_copy_files / fig_copy_files rather than redrawing, so the style is pixel-perfect. Screenshot each screen and compare against the source; iterate until it matches. Reading the source is NOT a substitute — you need the recreated files, not just an understanding. DO NOT STOP this step until EVERY visible element on the screen is EITHER (a) part of the new design you were asked to add, OR (b) recreated from a specific source file you actually read or copied — NOTHING should come from your memory of what the product roughly looks like. If you notice yourself about to write a color, a spacing value, a component layout or an icon that you cannot point to in a repo file you have open: stop, go read the repo, then continue. Keep reading and recreating until that is true for the whole screen. (5) For EVERY element you are recreating or showing in-situ: walk the view hierarchy ALL THE WAY UP from that element to the root of the page, and read the source file for each layer — the component itself, its parent container, the panel/pane it sits in, the page shell, the top-level layout. The chrome AROUND your target is part of the recreation, and the only way to get it right is to read each ancestor, not to infer it. When you list directories to find these files, list DEEP (use a high depth / recursive listing, or search by name across the whole tree) — a one-level directory listing will miss components in subfolders, and one empty listing is not evidence the file does not exist. Do not stop walking up until you have read the file that renders the page root. (6) Create new designs based on the recreated screens.</system-info>


> Anexo: devclub

None


---

### 🤖 **Claude**



---

### 👤 **Usuário**



> Anexo: devclub

None


---

### 🤖 **Claude**



---

