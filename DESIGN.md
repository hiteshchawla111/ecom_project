# DESIGN.md — Visual Design System

Design tokens for the E-Commerce Portal (storefront + admin dashboard).

**Direction:** Warm & energetic. A coral/orange primary drives attention to calls-to-action (Add to cart, Checkout) while a calm neutral base keeps long catalog and admin screens readable. The PRD requires **WCAG compliance**, so every text/background pairing below is chosen to meet contrast minimums — don't introduce new combinations without checking contrast.

**Rule:** consume these as design tokens (CSS variables or Tailwind theme), never as raw hex values scattered in components. One source of truth.

---

## Color Palette

### Primary — Coral / Orange (brand, primary actions)

| Token | Hex | Use |
|-------|-----|-----|
| `--color-primary-50`  | `#FFF3ED` | Tint backgrounds, hover wash |
| `--color-primary-100` | `#FFE0CC` | Subtle fills, badges |
| `--color-primary-300` | `#FFA878` | Disabled-but-branded, borders |
| `--color-primary-500` | `#FF6B35` | **Primary brand color** — buttons, links, active states |
| `--color-primary-600` | `#E85420` | Hover / pressed on primary |
| `--color-primary-700` | `#C2410C` | Text on light, focus rings, high-contrast |

> `primary-700` (`#C2410C`) on white meets contrast for text; use the lighter `primary-500` for large UI fills (buttons), with white or `neutral-900` label text depending on contrast.

### Secondary — Deep Teal (balance, secondary actions, accents)

| Token | Hex | Use |
|-------|-----|-----|
| `--color-secondary-50`  | `#ECFEFF` | Tint backgrounds |
| `--color-secondary-500` | `#0E7C86` | **Secondary actions**, info accents, links in admin |
| `--color-secondary-700` | `#0A5A61` | Hover / text on light |

> Teal is the cool counterweight to the warm primary — used for secondary buttons, informational chips, and to keep the admin dashboard from feeling overheated.

### Accent — Amber (highlights, sale tags, promos)

| Token | Hex | Use |
|-------|-----|-----|
| `--color-accent-400` | `#FBBF24` | Sale prices, "deal" highlights, ratings |
| `--color-accent-600` | `#D97706` | Accent text needing contrast on light |

### Neutrals — Warm Gray (text, surfaces, borders)

| Token | Hex | Use |
|-------|-----|-----|
| `--color-neutral-0`   | `#FFFFFF` | Page / card surface |
| `--color-neutral-50`  | `#FAFAF9` | App background |
| `--color-neutral-100` | `#F5F5F4` | Subtle surface, table stripes |
| `--color-neutral-200` | `#E7E5E4` | Borders, dividers |
| `--color-neutral-400` | `#A8A29E` | Placeholder, disabled text |
| `--color-neutral-600` | `#57534E` | Secondary / muted text |
| `--color-neutral-800` | `#292524` | Headings |
| `--color-neutral-900` | `#1C1917` | **Primary body text** |

> Slightly warm grays (stone family) instead of pure cool gray — they harmonize with the coral primary.

### Semantic — State colors

| Token | Hex | Use |
|-------|-----|-----|
| `--color-success-500` | `#16A34A` | Confirmed / delivered / in-stock, success toasts |
| `--color-warning-500` | `#F59E0B` | Low stock, pending, caution |
| `--color-error-500`   | `#DC2626` | Errors, out of stock, cancelled, destructive actions |
| `--color-info-500`    | `#0E7C86` | Informational (reuses secondary teal) |

Each semantic color gets a `-50` tint for alert/banner backgrounds (e.g. `--color-error-50: #FEF2F2`), paired with the `-600`/`-700` shade for the text/icon on top to keep contrast safe.

### Order-status mapping
Reuse semantic tokens so status colors stay consistent across storefront and admin:

| Status | Token |
|--------|-------|
| Pending | `warning-500` |
| Confirmed / Processing | `info-500` (teal) |
| Shipped | `primary-500` |
| Delivered | `success-500` |
| Cancelled / Refunded | `error-500` |

---

## Typography

| Token | Value | Use |
|-------|-------|-----|
| `--font-sans` | `Inter, system-ui, sans-serif` | UI + body (default) |
| `--font-heading` | `"Plus Jakarta Sans", Inter, sans-serif` | Headings / brand |

**Type scale** (1.250 major-third):

| Token | Size / Line | Use |
|-------|-------------|-----|
| `--text-xs`   | 12 / 16 | Labels, captions, badges |
| `--text-sm`   | 14 / 20 | Secondary text, table cells |
| `--text-base` | 16 / 24 | Body (base) |
| `--text-lg`   | 18 / 28 | Lead text, card titles |
| `--text-xl`   | 20 / 28 | Section headings |
| `--text-2xl`  | 25 / 32 | Page headings |
| `--text-3xl`  | 31 / 40 | Hero / storefront headlines |
| `--text-4xl`  | 39 / 48 | Marketing hero |

**Weights:** `400` body, `500` medium (labels/buttons), `600` semibold (headings), `700` bold (hero/price).

---

## Spacing & Layout

4px base scale: `--space-1`=4, `-2`=8, `-3`=12, `-4`=16, `-6`=24, `-8`=32, `-12`=48, `-16`=64.

| Token | Value | Use |
|-------|-------|-----|
| `--radius-sm` | 6px | Inputs, chips |
| `--radius-md` | 10px | Buttons, cards |
| `--radius-lg` | 16px | Modals, product cards |
| `--radius-full` | 9999px | Pills, avatars |

| Token | Value |
|-------|-------|
| `--shadow-sm` | `0 1px 2px rgba(28,25,23,.06)` |
| `--shadow-md` | `0 4px 12px rgba(28,25,23,.08)` |
| `--shadow-lg` | `0 12px 32px rgba(28,25,23,.12)` |

**Breakpoints** (responsive UI is a PRD requirement): `sm 640` · `md 768` · `lg 1024` · `xl 1280` · `2xl 1536`. Storefront container max-width `1280px`; admin can go full-bleed with a fixed sidebar.

---

## Component Color Guidance

- **Primary button:** bg `primary-500`, text white, hover `primary-600`, focus ring `primary-700`.
- **Secondary button:** bg `secondary-500` (or outline: border `neutral-200`, text `neutral-900`).
- **Destructive button:** bg `error-500`, text white.
- **Links:** `primary-700` on light surfaces (contrast-safe); `secondary-500` within admin tables.
- **Price:** regular `neutral-900` bold; sale price `error-600` / `accent-600` with original struck through in `neutral-400`.
- **Cards:** surface `neutral-0`, border `neutral-200`, `--shadow-sm`, `--radius-lg`.
- **Inputs:** border `neutral-200`, focus border `primary-500` + 2px focus ring, error border `error-500`.
- **Badges/chips:** semantic `-50` background + matching `-700` text.

---

## Accessibility

- Body text targets **WCAG AA** (≥ 4.5:1); use `neutral-900`/`neutral-800` on light surfaces, not `neutral-400`/`neutral-600` for primary content.
- Never rely on color alone (e.g. order status, stock state): pair with text or an icon.
- Visible focus state on every interactive element — `primary-700` ring, minimum 2px.
- For white text on `primary-500` buttons, keep button text ≥ 14px/medium; otherwise step up to `primary-600`/`primary-700`.

---

## Dark Mode (implemented)

Dark mode is **live** — opt-in via `data-theme="dark"` on `<html>`, with a semantic
surface/content token layer (`--color-surface`, `--color-content`, …) that flips under
the dark override. Both storefront and admin support it. **Every UI change must be
verified in BOTH themes** (screenshot light and dark) — the inverting tokens hide
contrast bugs that pass in light only.

---

## Applied UI System — "Quiet-Luxury" (current execution)

The shipped UI layers an editorial "quiet-luxury" execution on top of the tokens above
(same palette — coral/teal kept as a restrained accent). **Match this on all new/edited
UI so the storefront and admin stay consistent.**

**Typography**
- Display/page/section headings: **serif** — storefront uses Playfair Display
  (`font-heading`/`font-serif`); admin uses serif for page titles + KPI values, sans
  (Inter / Plus Jakarta) for dense data. Weight `font-medium`, tight tracking.
- Eyebrows / labels / table headers / nav: **uppercase, letterspaced**
  (`text-[0.7rem] font-medium uppercase tracking-[0.14em]–[0.18em] text-content-subtle`).
- Numbers, prices, counts, IDs: `tabular-nums`.

**Shape & material**
- **Squared radii** — cards, inputs, buttons, badges, menus are square (`rounded-none`
  or the small `--radius` only). No `rounded-full` pills or `rounded-lg/xl/2xl`.
- Cards: `border border-line bg-surface` (flat or soft layered shadow); avoid heavy shadows.
- Dividers: hairline `border-line`. Page headers: eyebrow + serif title + `border-b pb-6`.

**Buttons (theme-safe — important)**
- **Filled/primary buttons use the BRAND color with literal white text**:
  `bg-primary-600 text-white hover:bg-primary-700`. **Never** `bg-content`/`text-surface`
  on a filled button — those tokens invert per theme and wash out to cream-on-cream in
  dark mode. Destructive: `bg-error-500 text-white`. Secondary: `border border-line`,
  uppercase. (Overriding a shadcn Button's cva variant needs `!important`.)

**Components**
- Use **shadcn/ui** for dropdowns/selects/dialogs/tables (initialized in both apps;
  semantic tokens bridged to our quiet-luxury tokens in each app's entry CSS). Replace
  native `window.confirm()` with the shared AlertDialog confirm (`useConfirm`).
- Storefront uses **GSAP** for tasteful motion (reveals, parallax, tilt, magnetic) —
  reduced-motion-safe; see the motion components under `apps/storefront/src/components/motion`.

**Status colors** stay semantic (success/warning/error per the order-status mapping
above) but rendered as **squared uppercase badges**, never color-only.
