# Visual Redesign Spec — Fintella Partner Portal

**Date:** 2026-04-24
**Status:** Approved (John: "just go with what you recommend")
**Staging:** trln.partners (Vercel)
**Production:** fintella.partners (untouched until confirmed)

---

## Design Direction

Modern fintech aesthetic inspired by robotax.app and apple.com. Dark-first, premium, clean. Serif display headlines for authority, Inter body for readability. Gold primary accent (Fintella brand), electric blue secondary for modern energy.

## Typography

### Font Pairing
- **Headlines (h1, h2):** DM Serif Display (Google Fonts), weight 400
- **Subheadlines (h3, h4):** Inter, weight 600, uppercase tracking
- **Body:** Inter, weight 400/500
- **Mono/Code:** JetBrains Mono or system monospace

### Scale
- Hero h1: `clamp(2rem, 5vw, 3.5rem)`
- Page h1: `clamp(1.5rem, 3vw, 2.25rem)`
- Section h2: `1.25rem` / `sm:1.5rem`
- Card h3: `1rem` / `sm:1.125rem`
- Body: `0.875rem` (14px)
- Small/caption: `0.75rem` (12px)

## Color Palette

### Dark Mode (Default)
```
--app-bg:              #060a14       (deepest navy, page background)
--app-bg-secondary:    #0c1220       (card/surface background)
--app-bg-elevated:     #111827       (elevated surfaces, popovers)
--app-text:            rgba(255,255,255,0.95)
--app-text-secondary:  rgba(255,255,255,0.75)
--app-text-muted:      rgba(255,255,255,0.50)
--app-border:          rgba(255,255,255,0.10)
--app-border-hover:    rgba(255,255,255,0.20)
--app-card-bg:         rgba(255,255,255,0.04)
--app-card-border:     rgba(255,255,255,0.08)

--brand-gold:          #c4a050
--brand-gold-light:    #e8c060
--brand-gold-glow:     rgba(196,160,80,0.25)

--accent-blue:         #4f6ef7
--accent-blue-light:   #6b8aff
--accent-blue-glow:    rgba(79,110,247,0.30)
--accent-purple:       #8b5cf6
--accent-gradient:     linear-gradient(135deg, #4f6ef7, #8b5cf6)
```

### Light Mode
```
--app-bg:              #f8f9fc
--app-bg-secondary:    #ffffff
--app-bg-elevated:     #ffffff
--app-text:            #0f172a
--app-text-secondary:  #475569
--app-text-muted:      #94a3b8
--app-border:          rgba(0,0,0,0.08)
--app-card-bg:         #ffffff
--app-card-border:     rgba(0,0,0,0.06)

--brand-gold:          #9a7820
--accent-blue:         #3b5ce4
```

## Component Styles

### Cards (`.card-glass`)
```css
.card-glass {
  background: var(--app-card-bg);
  border: 1px solid var(--app-card-border);
  border-radius: 1rem;
  backdrop-filter: blur(12px);
  transition: all 0.3s ease;
}
.card-glass:hover {
  border-color: var(--app-border-hover);
  transform: translateY(-2px);
  box-shadow: 0 8px 32px rgba(0,0,0,0.2);
}
```

### Card with Gradient Underline (`.card-glow`)
```css
.card-glow {
  position: relative;
  overflow: hidden;
}
.card-glow::after {
  content: '';
  position: absolute;
  bottom: 0;
  left: 10%;
  right: 10%;
  height: 3px;
  background: var(--accent-gradient);
  border-radius: 3px;
  opacity: 0;
  transition: opacity 0.3s, left 0.3s, right 0.3s;
}
.card-glow:hover::after {
  opacity: 1;
  left: 5%;
  right: 5%;
}
```

### Buttons

**Primary (Gold):**
```css
.btn-primary {
  background: linear-gradient(135deg, var(--brand-gold), var(--brand-gold-light));
  color: #000;
  border-radius: 0.75rem;
  font-weight: 600;
  padding: 0.75rem 1.5rem;
  transition: all 0.2s;
}
.btn-primary:hover {
  transform: translateY(-1px);
  box-shadow: 0 6px 20px var(--brand-gold-glow);
}
.btn-primary:active {
  transform: scale(0.98);
}
```

**Secondary (Blue outline):**
```css
.btn-secondary {
  background: transparent;
  border: 1px solid var(--accent-blue);
  color: var(--accent-blue);
  border-radius: 0.75rem;
}
.btn-secondary:hover {
  background: rgba(79,110,247,0.08);
  box-shadow: 0 0 16px var(--accent-blue-glow);
}
```

### Sidebar
- Dark solid background (`#000000` or `--app-bg`)
- Gold accent on active item (left border + subtle gold bg)
- Hover: subtle white overlay (`rgba(255,255,255,0.04)`)
- Icons: line-art gold SVGs (existing)
- Collapsed state: icon-only with tooltip

### Tab Bars
- Underline style (not pill)
- Active: gold underline + gold text
- Inactive: muted text
- Smooth slide transition on underline

### Tables
- Header: uppercase, tracking-wider, muted text, no bg
- Rows: subtle border-bottom, hover bg
- Alternating rows: not used (cleaner)

### Forms
- Input: dark bg (`var(--app-bg-elevated)`), subtle border, focus ring blue
- Labels: uppercase tracking, small, muted
- Rounded-lg (not rounded-xl like cards)

## Layout Patterns

### Page Structure
```
<div class="max-w-7xl mx-auto px-4 sm:px-8 lg:px-12">
  <header class="mb-8 sm:mb-12">
    <h1 class="font-serif text-3xl sm:text-4xl">Page Title</h1>
    <p class="text-muted mt-2">Subtitle</p>
  </header>
  <section>
    <!-- content -->
  </section>
</div>
```

### Spacing
- Page padding: `px-4 sm:px-8 lg:px-12` (tighter than current `lg:px-24`)
- Section gaps: `gap-6 sm:gap-8`
- Card padding: `p-5 sm:p-6`
- Max content width: `max-w-7xl` (1280px)

## Animations

### Hover Effects
- Cards: `translateY(-2px)` + shadow expansion
- Buttons: `translateY(-1px)` + glow shadow
- Links: underline slide-in from left

### Transitions
- Default: `300ms ease` for colors/opacity
- Interactive: `200ms ease` for transform/scale
- No spring physics (keep CSS-only, no framer-motion)

### Page Transitions
- Fade-up on mount: `opacity 0→1, translateY(8px→0), 400ms`

## Implementation Phases

### Phase 1: Design System Foundation
- Update `globals.css` with new color palette
- Add DM Serif Display font import
- Add new component classes (card-glass, card-glow, btn-primary, btn-secondary)
- Update Tailwind config with new colors/fonts
- Restyle `.card`, `.btn-gold`, `.stat-card` base classes

### Phase 2: Layout Shell
- Partner dashboard layout (sidebar, header, mobile nav)
- Admin layout (sidebar, header)
- Shared page wrapper component

### Phase 3: Partner Pages (21 pages)
- Home, Getting Started, Training, Reporting, Deals, Commissions
- Settings, Referral Links, Submit Client, Downline, Conference
- Messages, Notifications, Support, AI Assistant, etc.

### Phase 4: Admin Pages (33 pages)
- Partners, Deals, Reports, Settings, Communications
- Training admin, Automations, Dev tools, etc.

### Phase 5: Theme Picker
- Admin: default theme selector in Settings
- Partner: theme override in personal Settings
- 10 presets + custom theme builder

### Phase 6: Animations & Polish
- Card hover effects
- Page mount transitions
- Gradient underline glows
- Particle/star field background (optional, landing page only)

## Deployment

- Branch: `claude/visual-redesign-v2`
- Staging: Deploy to trln.partners on Vercel
- Production: fintella.partners stays untouched until John confirms
- Review: John previews on trln.partners, says "ship it", then merge to main
