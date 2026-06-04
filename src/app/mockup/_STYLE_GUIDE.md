# Bike Store Dashboard — Design System (mockup)

A single, consistent shadcn system for the whole store dashboard. The old
dashboard re-invented its layout on every page; this fixes that. **Every page is
assembled from the same primitives** so spacing, type and alignment are
identical everywhere. Change a primitive → it changes everywhere.

> Stack: Next.js (App Router) · shadcn/ui (style `radix-vega`, base `stone`) ·
> Tailwind v4 · lucide-react. Sidebar from `npx shadcn@latest add sidebar-07`.

---

## 1. Tokens (never hard-code these)

All colour comes from CSS variables in `globals.css` — light + dark are already
defined, so components never need `dark:` colour overrides.

| Token | Use |
| --- | --- |
| `background` / `foreground` | page canvas / primary text |
| `card` / `card-foreground` | raised surfaces |
| `muted` / `muted-foreground` | subtle fills / secondary text |
| `primary` | **Yellow Jersey amber** — CTAs, active nav, focus |
| `border` · `input` · `ring` | hairlines · field borders · focus ring |
| `sidebar*` | sidebar surface, accent, border |
| `destructive` | danger actions only |

- **Radius:** `--radius: 0.625rem`. Use `rounded-md` (controls), `rounded-lg`
  (tiles), `rounded-xl` (cards). Never invent radii.
- **Status colours** (emerald / amber / rose) are the *only* literal colours,
  reserved for live / warning / error states. Always pair light + dark.

## 2. Type scale

| Role | Classes |
| --- | --- |
| Page title (H1) | `text-2xl font-semibold tracking-tight` |
| Section title | `text-base font-semibold` (`font-heading`) |
| Body | `text-sm` |
| Helper / meta | `text-[13px]` or `text-xs text-muted-foreground` |
| Numbers (price, stock, stats) | add `tabular-nums` |

## 3. Spacing rhythm

- Page padding: `PageContainer` (`px-4 sm:px-6 lg:px-8`, `py-6 lg:py-8`).
- Width: `narrow` (`max-w-4xl`, forms) vs `wide` (`max-w-[1400px]`, tables/dash).
- Between sections: `space-y-6`. Inside a card: `px-6 py-5`, rows `gap-5`.
- Icons: lucide at `size-4` inline, `size-5` in tiles. Buttons use `size="sm"`
  on toolbars/headers, default in forms.

## 4. The primitives

Located in `src/app/mockup/_components/`.

| Primitive | Purpose |
| --- | --- |
| `PageContainer` | outer width + padding (`size="narrow" \| "wide"`) |
| `PageHeader` | H1 + description + right-aligned action slot — **on every page** |
| `PageBody` | `mt-6 space-y-6` stack under the header |
| `SettingsSection` | titled card: icon + title + description, optional footer/save bar |
| `SettingsRow` | label+helper on the left, control on the right (toggles, short inputs) |
| `SettingsDivider` | full-bleed hairline between rows |
| `StatCard` | one metric tile (label, value, icon, trend, `tone`) |
| `StatusBadge` | marketplace state pill + status dot (live / draft / needs images / hidden) |
| `ProductThumb` | dependency-free product image tile, or “needs image” placeholder |

### Page recipe

```tsx
<PageContainer size="wide">
  <PageHeader title="Products" description="…" actions={<Button…/>} />
  <PageBody>
    {/* StatCards, Cards, Tables — all shadcn */}
  </PageBody>
</PageContainer>
```

### Settings recipe (one shell for every settings screen)

A left secondary-nav + a right panel. Each panel is `SettingsSection`s built
from `SettingsRow` (preferences) or label-above-`Input` fields (forms). This is
what makes every settings page look like one product.

## 5. Layout shell (sidebar-07)

`layout.tsx` → `SidebarProvider` + `AppSidebar` (`collapsible="icon"`) +
`SidebarInset` (`Topbar` + page). The sidebar has three parts:

- **Header** — `StoreSwitcher` (switch between stores).
- **Content** — grouped `nav-main` (Store / Growth / Operations) with collapsible
  sub-items; collapses to icons with tooltips.
- **Footer** — `NavUser` (account menu).

`Topbar` = `SidebarTrigger` + breadcrumb (left) and search + notifications +
theme toggle (right).

## 6. Rules of thumb

1. **shadcn only.** No bespoke buttons/cards/inputs — compose the primitives.
2. **No raw hex / `gray-*`.** Use tokens; let dark mode come for free.
3. **One page header, one container.** Don't hand-roll titles per page.
4. Right-align actions; destructive lives in a separate “Danger zone”.
5. `tabular-nums` on every figure. `font-mono` on SKUs/IDs.
6. Empty, loading and selected states are designed, not afterthoughts.
