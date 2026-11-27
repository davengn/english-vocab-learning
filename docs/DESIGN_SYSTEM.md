# DESIGN_SYSTEM.md — Warm Editorial Minimalism

## 1. Inspo MCP Research Synthesis

Before designing the UI, the Inspo MCP archive (`https://inspomcp.dev/api/mcp`) was queried for minimalist, calm, light-surface knowledge workspaces:

- **`heptabase-com`** (*Split Studio*, `paperL: 90.1`): Warm off-white background (`#f5f1dc` spirit), dark legible ink, restrained warm/sage highlights, split workspace panels where the working interface itself is the centerpiece.
- **`amie-so--documentation`** (*Feature Stack*, `paperL: 98.2`): Three-column documentation layout with left topic navigation, centered `~70ch` readable canvas, and sticky right "On This Page" progress outline.
- **`mintlify-com`** (*Bento Grid*, `paperL: 94.7`): Restrained deep slate-teal accent (`#176f85` / `#04547c`), crisp sans-serif hierarchy, generous whitespace, calm card framing.
- **`craft-do`** (*Ecosystem Index*, `paperL: 89.6`): Soft neutral surfaces, quiet border contrast, editorial clarity for notes and structured blocks.

**Design Philosophy**: Warm paper minimalism combining Linear's keyboard speed, Notion's clean structured blocks, Readwise's focused review rhythm, and Anki's honest spaced repetition—with zero AI SaaS clichés, zero heavy gradients, zero glassmorphism, and zero cartoon gamification.

---

## 2. Color & Surface Tokens

| Token | Hex | Usage |
|---|---|---|
| `--bg-canvas` | `#FAF9F6` | Primary warm paper background |
| `--bg-surface` | `#FFFFFF` | Elevated cards, modals, study cards, table surface |
| `--bg-subtle` | `#F3F1EC` | Sidebar wash, table header, formula blocks, code/tag pills |
| `--bg-hover` | `#ECE9E2` | Subtle interactive hover state |
| `--border-hairline` | `#E7E5E0` | Primary 1px crisp borders and dividers |
| `--border-strong` | `#D6D3CD` | Focusable input borders and secondary outlines |
| `--ink-primary` | `#1C1917` | Primary headings, body text, English headwords |
| `--ink-secondary` | `#57534E` | Vietnamese secondary explanations, table metadata |
| `--ink-muted` | `#78716C` | Timestamps, keyboard shortcut badges, IPA delimiters |
| `--accent` | `#0F766E` | Restrained slate-teal primary actions & active indicators |
| `--accent-hover` | `#115E59` | Accent hover state |
| `--accent-soft` | `#F0FDFA` | Active sidebar pill & subtle callout background |
| `--accent-border` | `#99F6E4` | Subtle accent border |

### Semantic Functional Tokens (Strictly for Status, Feedback & SM-2)
- **Success / Mastered / Good**: Ink `#15803D`, Soft `#F0FDF4`, Border `#BBF7D0`
- **Warning / Hard / Incomplete**: Ink `#B45309`, Soft `#FFFBEB`, Border `#FDE68A`
- **Danger / Error / Again**: Ink `#B91C1C`, Soft `#FEF2F2`, Border `#FECACA`
- **Info / Learning / Active**: Ink `#0369A1`, Soft `#F0F9FF`, Border `#BAE6FD`

---

## 3. Typography Scale

- **Sans (`--font-sans`)**: `'Inter', 'Be Vietnam Pro', -apple-system, BlinkMacSystemFont, sans-serif`
- **IPA (`--font-ipa`)**: `'Noto Sans', 'Inter', sans-serif`
- **Mono (`--font-mono`)**: `'JetBrains Mono', ui-monospace, monospace`

| Role | Size / Weight | Line Height | Usage |
|---|---|---|---|
| Page Title (`h1`) | `24px` (`1.5rem`) / `600` | `1.3` | Route headers, word headword detail |
| Flashcard Headword | `32px` (`2rem`) / `600` | `1.2` | Active recall study prompt |
| Section Heading (`h2`) | `16px` (`1rem`) / `600` | `1.4` | Card/section headings |
| Body / Explanation | `14px`–`15px` / `400` | `1.6` | Grammar prose (`max-width: 72ch`), notes |
| Compact UI / Table | `13px` / `400–500` | `1.45` | Table cells, filters, metadata |
| Micro Label / Kbd | `11px`–`12px` / `500` | `1.3` | Badges, shortcut chips, timestamps |

---

## 4. Layout & Spacing

- **App Shell**:
  - Desktop: Fixed `240px` left sidebar (`#F3F1EC` / `#FAF9F6` with 1px right border) + main scroll workspace (`max-width: 1200px` centered padding `24px–32px`).
  - Tablet/Mobile (`< 1024px`): Compact top bar (`<= 56px`) with slide-over navigation drawer (`<dialog>`).
- **Content-First Low-Noise Rules**:
  - No unsolicited popups, banners, or multi-row sticky headers.
  - Secondary actions tucked into crisp `<details>` disclosures or compact menus.
- **Grammar 3-Column Layout**:
  - Left `240px` category/topic tree · Center `max-width: 72ch` structured lesson · Right `220px` sticky "Trong bài này" TOC & quick action card.
- **Distraction-Free Practice Layout**:
  - Centered `max-width: 680px` study card, minimal top progress strip (`4px` height), keyboard legend anchored quietly below the card.

---

## 5. Core Components & Platform Standards

- **Buttons & Inputs**: `8px` radius (`--radius-md`), `1px` crisp borders, clear `:focus-visible` `2px` `#0F766E` ring, minimal shadow (`0 1px 2px rgba(28, 25, 23, 0.04)` only on floating cards/dialogs).
- **Native `<dialog>` Modals**:
  - Always opened with `.showModal()` (never fake `div` overlays without native top-layer semantics).
  - Applies `overscroll-behavior: contain` on both `dialog:modal` and `dialog::backdrop`.
  - Dirty forms guard against accidental `cancel` (`Esc`) dismissal.
- **Responsive Semantic `<table>`**:
  - Wrapped in `tabIndex={0}` `role="region"` scroll containers with sticky `<thead>`.
  - Container-query (`@container (width < 640px)`) collapses table rows cleanly into scannable cards with injected header labels.
- **Keyboard Shortcuts**:
  - `⌘K` / `Ctrl+K`: Open Command Palette.
  - `Space`: Flip flashcard / reveal answer during practice.
  - `1`, `2`, `3`, `4`: Submit SM-2 rating (`Quên`, `Khó`, `Nhớ`, `Rất dễ`).
  - `Enter`: IME-safe submit in quick-add, search, and exercise inputs.
