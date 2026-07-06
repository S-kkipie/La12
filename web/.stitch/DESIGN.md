# La Doce — Bold Stadium — Design System

This block is the shared design-prompt fragment copied verbatim into every Stitch
`generate_screen_from_text` / `generate_variants` call, so all screens share one visual
vocabulary. Values are fixed by the project's Global Constraints — do not drift from them.

## Look & feel

Dark-first "bold stadium" — a football matchday energy translated into fintech chrome.
Confident, high-contrast, scoreboard-like. Not cute, not corporate.

## Color tokens

- Background (stadium black): `#0b0f0d`
- Cards / surfaces: `#131a16`
- Primary (neon lime): `#b6ff3c`
- Text on lime (near-black): `#08120a`
- Off-white text (primary text on dark): `#e8f0ea`
- Muted text: `#8fa397`

## Typography

- **Display / headings** — condensed jersey display caps (Bebas Neue vibe): hero titles,
  section titles, and big stat numbers (scoreboard feel). Always uppercase, tight tracking.
- **Body** — Geist, for paragraphs, labels, form fields, buttons.
- **Mono** — for wallet addresses and USD₮ amounts (tabular figures).

## Shape & effects

- Corner radius: `0.625rem` on cards, buttons, inputs.
- Subtle neon-lime glow (soft box-shadow bloom in `#b6ff3c` at low opacity) on hero cards
  and primary CTAs — never overdone, just enough to read as under-stadium-lights.

## Content & language

- Spanish (rioplatense / Argentine River Plate Spanish) copy throughout — "vos", "sos",
  "hincha", "socio", "reparto", "sin reembolso", etc.
- Football / matchday energy in copy and imagery: stadium textures, scoreboards, jersey
  motifs, crowd energy — never generic stock-fintech.

## Device

- DESKTOP layouts (this is a desktop-first web app).

## Design-prompt block (paste verbatim into every Stitch prompt)

> Dark-first "bold stadium" design language. Background stadium-black `#0b0f0d`, cards
> `#131a16`, primary neon lime `#b6ff3c`, text-on-lime near-black `#08120a`, off-white text
> `#e8f0ea`, muted `#8fa397`. Condensed jersey display caps (Bebas Neue vibe) for hero
> titles, section titles, and big stat numbers (scoreboard feel); Geist for body; mono for
> addresses/amounts. Radius `0.625rem`. Subtle lime glow on hero cards. Spanish (rioplatense)
> copy. Football/matchday energy. DESKTOP device.
