# Memórias do Claude

[
  {
    "conversations_memory": "**Work context**\n\nPedro operates under the brand **FerrazCode**, building custom software for small businesses (POS systems, parking, restaurant ordering, mobile/desktop apps). Pedro is an independent developer and is currently in the process of selling a completed platform to a client, marking an early stage of running a client-facing software business.\n\n**Personal context**\n\nPedro is based in Brazil (Baixada Santista region), communicates primarily in Brazilian Portuguese, and has an informal, direct communication style. Pedro follows Brazilian football and engages with it conversationally.\n\n**Top of mind**\n\nPedro recently finalized a service contract with a client (Bruno) for **PraiaGo**, a food/vendor delivery platform built for beaches in Praia Grande. The contract covers pricing, monthly maintenance scope, infrastructure cost assignment, IP ownership, and service suspension rights — with all infrastructure accounts remaining under Pedro's control. Formalization of this client relationship and the transition to a paid engagement appear to be the immediate priority.\n\n**Brief history**\n\n*Recent months*\n\nPedro has been actively developing **PraiaGo** — a native mobile marketplace platform (\"iFood for the beach\") targeting Baixada Santista, with four user profiles (client, ambulant beach vendor, restaurant partner, delivery person), a real-time vendor/tracking map, day/night mode switching, and in-app Pix/card payments. The technical stack uses Capacitor for cross-platform iOS/Android builds from an existing PWA codebase (client app at praiago-cliente.vercel.app, vendor app at praiago-ambulante.vercel.app), Supabase as the backend/database, and Codemagic for cloud iOS builds. Pedro developed a detailed 7-phase native app development plan and worked through real-time GPS tracking architecture (using `watchPosition()`, WebSocket/Firestore, background geolocation, and smooth marker interpolation). The project also has a delivery driver app built but intentionally held back for future activation.\n\nPedro also made progress on **FerrazCode** branding: SVG logo (`<F/>` hexagon badge, cyan-to-violet gradient), promotional graphics, Instagram bio, WhatsApp deep-link, and social media copywriting for the business.\n\nOn the Linux/development environment side, Pedro set up Ubuntu on a Lenovo IdeaPad Slim 3-15IRH10, installed VS Code (native `.deb`), worked through Wine compatibility questions, resolved `apt` package manager lock issues, explored dual-boot setup/removal with Linux Mint, and navigated BIOS settings (XMP/memory profile) on the same machine.\n\n*Earlier context*\n\nPedro asked about Claude's image generation capabilities (SVG/vector vs. photorealistic), suggesting early-stage exploration of design tooling for FerrazCode or PraiaGo assets.\n\n*Long-term background*\n\nPedro initiated a unit test generation workflow at some point, suggesting recurring interest in code quality practices, though the specific project context was not established.",
    "memory_files": [
      {
        "path": "/areas/ferrazcode-branding.md",
        "content": "---\nname: ferrazcode-branding\ndescription: FerrazCode brand and marketing assets\nsources: [backfill]\naliases: [FerrazCode]\n---\n- [stated] SVG logo: <F/> hexagon badge with cyan-to-violet gradient\n- [stated] Created promotional graphics, Instagram bio, WhatsApp deep-link, and social media copywriting for the business",
        "updated_at": "2026-07-13T21:45:50.907385+00:00"
      },
      {
        "path": "/areas/praiago.md",
        "content": "---\nname: praiago\ndescription: PraiaGo — native mobile marketplace/delivery platform for beaches in Baixada Santista\nsources: [backfill]\naliases: [praiago-cliente, praiago-ambulante]\n---\n- [stated] Native mobile marketplace platform (\"iFood for the beach\") targeting Baixada Santista beaches, initially Praia Grande\n- [stated] Four user profiles: client, ambulant beach vendor, restaurant partner, delivery person\n- [stated] Features a real-time vendor/tracking map, day/night mode switching, and in-app Pix/card payments\n- [stated] Technical stack: Capacitor for cross-platform iOS/Android builds from an existing PWA codebase, Supabase as backend/database, Codemagic for cloud iOS builds\n- [stated] Client app hosted at praiago-cliente.vercel.app; vendor app at praiago-ambulante.vercel.app\n- [stated] Developed a detailed 7-phase native app development plan\n- [stated] Worked through real-time GPS tracking architecture: watchPosition(), WebSocket/Firestore, background geolocation, smooth marker interpolation\n- [stated] Delivery driver app is built but intentionally held back for future activation\n- [stated] Finalized a service contract with client Bruno covering pricing, monthly maintenance scope, infrastructure cost assignment, IP ownership, and service suspension rights\n- [stated] All infrastructure accounts remain under Pedro's control per the contract",
        "updated_at": "2026-07-13T21:45:50.514666+00:00"
      },
      {
        "path": "/people/bruno.md",
        "content": "---\nname: bruno\ndescription: Client for the PraiaGo platform\nsources: [backfill]\naliases: []\n---\n- [stated] Client who contracted Pedro for the PraiaGo food/vendor delivery platform in Praia Grande\n- [stated] Signed a service contract covering pricing, monthly maintenance, infrastructure cost assignment, IP ownership, and service suspension rights",
        "updated_at": "2026-07-13T21:45:51.223082+00:00"
      },
      {
        "path": "/preferences.md",
        "content": "---\nname: preferences\ndescription: How Pedro wants Claude to respond\nsources: [backfill]\naliases: []\n---\n- [stated] Prefers an informal, direct communication style\n- [stated] Communicates primarily in Brazilian Portuguese",
        "updated_at": "2026-07-13T21:45:52.415501+00:00"
      },
      {
        "path": "/profile.md",
        "content": "---\nname: profile\ndescription: Who Pedro is — independent software developer operating as FerrazCode\nsources: [backfill]\naliases: []\n---\n- [stated] Independent software developer operating under the brand FerrazCode\n- [stated] Builds custom software for small businesses (POS systems, parking, restaurant ordering, mobile/desktop apps)\n- [stated] Based in Brazil, Baixada Santista region\n- [stated] Communicates primarily in Brazilian Portuguese",
        "updated_at": "2026-07-13T21:45:50.220293+00:00"
      },
      {
        "path": "/topics/dev-environment.md",
        "content": "---\nname: dev-environment\ndescription: Pedro's Linux development environment and machine setup\nsources: [backfill]\naliases: []\n---\n- [stated] Runs Ubuntu on a Lenovo IdeaPad Slim 3-15IRH10\n- [stated] Installed VS Code via native .deb package\n- [stated] Worked through Wine compatibility questions\n- [stated] Resolved apt package manager lock issues\n- [stated] Explored dual-boot setup/removal with Linux Mint\n- [stated] Navigated BIOS settings (XMP/memory profile) on the same machine",
        "updated_at": "2026-07-13T21:45:51.526632+00:00"
      },
      {
        "path": "/topics/interests.md",
        "content": "---\nname: interests\ndescription: Pedro's personal interests\nsources: [backfill]\naliases: []\n---\n- [stated] Follows Brazilian football and engages with it conversationally",
        "updated_at": "2026-07-13T21:45:51.828198+00:00"
      },
      {
        "path": "/topics/recent-work.md",
        "content": "---\nname: recent-work\ndescription: Work-shaped notes that don't warrant their own project file\nsources: [backfill]\naliases: []\n---\n- [stated] In the process of selling a completed platform to a client\n- [stated] Asked about Claude's image generation capabilities (SVG/vector vs. photorealistic), exploring design tooling for FerrazCode or PraiaGo assets\n- [stated] Initiated a unit test generation workflow at some point, suggesting recurring interest in code quality practices",
        "updated_at": "2026-08-19T03:29:56.176772+00:00"
      }
    ],
    "account_uuid": "1bf69d46-1954-4694-8b0d-335be85d3f12"
  }
]