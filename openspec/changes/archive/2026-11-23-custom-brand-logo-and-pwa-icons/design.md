# Design: Custom Minimal Box Brand Logo & PWA Icons

## Context

See `proposal.md` for motivation. Currently:
- `web/src/components/Layout.tsx` (line 144) and `web/src/pages/AuthPage.tsx` (line 40) render Lucide's generic `<Box />` inside a solid `bg-indigo-600` square as the app brand mark.
- `web/index.html` has no `<link rel="icon">` or `<link rel="apple-touch-icon">` tags.
- `web/public/manifest.json` has no `"icons"` array.
- Vite copies everything in `web/public/` into `web/dist/`, which Go embeds directly via `web/embed.go`.

## Goals / Non-Goals

**Goals:**
- Create a crisp, minimal, box-inspired geometric vector logo that reads clearly at every size from 16×16 favicon to 512×512 PWA splash icon.
- Maintain visual harmony with Itemized's existing dark slate (`#0f172a` / `#020617`) and indigo (`#6366f1` / `#4f46e5`) palette.
- Keep a single canonical SVG design so the in-app `<BrandLogo />`, browser favicon, Apple Touch Icon, and PWA PNG icons are visually identical.

**Non-Goals:**
- Changing the Lucide `Box` icon used for the generic `All Items` or mobile `Inventory` navigation items.
- Overhauling the app color theme or typography.

## Decisions

### 1. Minimal Geometric Box Mark (`BrandLogo`)
Design a clean, minimal isometric box mark on an indigo gradient (`#6366f1` → `#4f46e5`) rounded-square badge:
- **Outer silhouette**: Crisp isometric hexagon / cube with subtle rounded joins and distinct tonal planes (pure white top face, soft indigo-tinted left/right faces or crisp high-contrast negative-space seams) plus a subtle centered tape/item-bar detail on the top face that evokes both a storage box and an "itemized" label/barcode line.
- **Legibility**: Heavy, balanced geometry with generous negative space and zero tiny details, so it remains sharp at 16×16px in browser tabs and scales cleanly to 512×512px.
- **Component API (`web/src/components/BrandLogo.tsx`)**: Export `<BrandLogo className?: string />` rendering an accessible inline `<svg>` (with `aria-hidden="true"` when paired with the `itemized` wordmark) so `Layout.tsx` and `AuthPage.tsx` drop it in directly at `h-8 w-8` and `h-12 w-12`.

### 2. Master SVG & Raster PNG Generation
- Author `web/public/favicon.svg` (512×512 viewBox, rounded-square badge) and a full-bleed maskable variant (with ~15% extra safe-zone padding around the cube so Android adaptive masks never crop the mark).
- Generate raster PNGs directly from the SVG using local macOS/Node tooling (`qlmanage` / `sips` or SVG rasterizer) and commit the static files under `web/public/`:
  - `favicon-32x32.png` (32×32)
  - `apple-touch-icon.png` (180×180, full-bleed indigo background — iOS applies its own squircle mask)
  - `icon-192.png` (192×192, `purpose: "any"`)
  - `icon-512.png` (512×512, `purpose: "any"`)
  - `icon-maskable-512.png` (512×512, `purpose: "maskable"`, full-bleed indigo background with safe-zone inset)
- Wire `<link rel="icon" type="image/svg+xml" href="/favicon.svg" />`, `<link rel="icon" type="image/png" sizes="32x32" href="/favicon-32x32.png" />`, and `<link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png" />` in `web/index.html`, and add the `"icons"` array to `web/public/manifest.json`.

## Risks / Trade-offs

- **iOS home-screen corners**: iOS ignores transparent corners on `apple-touch-icon.png` and fills transparency with black. Using a full-bleed solid/gradient indigo background (no transparent corners) for `apple-touch-icon.png` and `icon-maskable-512.png` prevents black corner artifacts on iOS and Android.
