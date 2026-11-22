# Design

## Direction

**Personnel registry, not a card deck.** The interface borrows from paper personnel
files, archive indexes and ruled registers: flat surfaces, hairline rules, tabular
rows and one restrained ink accent. It is a working instrument for HR, managers and
employees, so familiarity and density win over decoration.

The old look — soft cards, purple accent, gradient headers, rounded pills and glass
blur — is explicitly rejected.

## Themes

Two themes with the same hierarchy:

- **Dark (default):** true black ground `#070707`, near-black surfaces `#0c0c0c`
  and `#151515`, bone text `#f2efe8`.
- **Light:** warm paper `#f1f0ec`, off-white surfaces `#fbfaf7`, ink `#171816`.

No colored theme accents. `primary` is ink in light and bone in dark; colour is
reserved for meaning: danger, warning, success.

## Type

- System grotesque: `ui-sans-serif`, Segoe UI, Helvetica Neue, Arial.
- No display face, no monospace costume. Monospace only for code-like values if
  ever needed.
- Fixed sizes: page title 24–26px, section title 13px, body 13px, metadata 10–11px.
- Numerals tabular in tables, metrics and money.
- Sentence case for labels. Small uppercase only for table headers and nav groups.

## Geometry

- Border radius **0** everywhere. No pills, no soft cards, no floating buttons.
- Borders: 1px `--border`. Cards, tables, overlays and inputs share the same
  hairline. No colored left/right stripes.
- Depth: none on cards; only overlays use a solid backdrop and a 1px border.
- Spacing rhythm: 4 / 8 / 12 / 16 / 24 / 32. Page padding 16–24px, dense tables.

## Components

- **Shell:** flat sidebar surface, no vertical divider; top bar shares the page
  ground and has no bottom rule. Active nav is a 2px left rule plus a subtle fill.
- **Cards:** square, border only. Header has a bottom rule, compact 12/16px padding.
- **Tables:** 10px uppercase headers with 0.08em tracking, 1px row rules, hover fill.
- **Buttons:** square; primary is inverted ink, secondary/outline are bordered
  surfaces, ghost is text-only, danger is outlined red text.
- **Inputs/selects:** square, visible border, 36px height, focus = ink border + 1px
  ring. Disabled = surface-2 fill.
- **Badges:** text-only, uppercase 10px, color carries the state; no colored pills.
- **Tabs:** underline tabs on a bottom rule, not segmented pills.
- **Avatars:** square monochrome initials, not colored circles.
- **Toasts/dialogs:** square, bordered, no blur or soft shadow.
- **Progress:** 2px squared rule.

## Motion

- 140–200ms, state-only. No page-load choreography, no pulsing decoration.
- `prefers-reduced-motion` disables transitions and animations.

## Anti-slop rules

- No purple-blue gradients, glow, neon, glassmorphism or grid backgrounds.
- No eyebrow labels above headings.
- No rounded-pill badges, icon tiles or nested cards.
- No decorative colored alerts; alerts are neutral unless they carry a real error.
- No emoji icons; one icon library (Lucide), consistent stroke.
- No placeholder-proof sections or invented metrics.

## Accessibility

- Body and placeholder text ≥ 4.5:1 in both themes.
- Visible keyboard focus: 1px ink outline.
- Standard native controls; no custom scrollbars beyond themed thin scrollbars.
