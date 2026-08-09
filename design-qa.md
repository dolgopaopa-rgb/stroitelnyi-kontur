# Design QA: D2Dom Open Village visual system

## Scope

The Open Village 2026 UI kit supplied by Alina was used as the current visual source of truth. The change transfers its brand system to the existing operational Contour interface without changing routes, data, roles, permissions, or business workflows.

## Source references

- UI kit: `.tmp/alina-ui-kit-20260809/extracted`
- Desktop reference: `reference-screens/02-projects-desktop.png` at 1440x900
- Mobile reference: `reference-screens/07-hero-mobile.png` at 390x844
- Design tokens: `DESIGN_SYSTEM.md`
- Component guidance: `COMPONENT_MAP.md`

## Rendered implementation

- Desktop: `qa-snapshots/brand-2026/today-desktop-viewport.png` at 1440x900, DPR 1
- Mobile: `qa-snapshots/brand-2026/today-mobile-viewport.png` at 390x844, DPR 1
- Estimates: `qa-snapshots/brand-2026/estimates-desktop.png`
- Login: `qa-snapshots/brand-2026/login-mobile.png`
- Side-by-side desktop comparison: `qa-snapshots/brand-2026/comparison-desktop.png`
- Side-by-side mobile comparison: `qa-snapshots/brand-2026/comparison-mobile.png`

## Intentional product differences

The reference is a public landing page, while Contour is a dense daily-work application. The app therefore keeps its role-aware navigation, compact information hierarchy, filters, and action density. It does not copy the landing hero, promotional photography, or marketing composition.

The transferred visual language is:

- cold paper background and raised paper surfaces;
- graphite navigation and text;
- wine active states and primary actions;
- Haval headings and Involve interface text;
- restrained moss, brass, blue, and red semantic states;
- strict 5-8px radii and thin neutral borders;
- D2Dom mark and naming across the app shell, login, favicon, and PWA manifest.

## Verification

- No whole-page horizontal overflow at 1440px or 390px.
- Mobile cards remain at least 350px wide inside a 390px viewport.
- The mobile primary action is visually separated and at least 44x44px.
- The mobile top bar remains compact and the page title is fully visible.
- The desktop sidebar hides intrinsic text overflow and has no visible horizontal scrollbar.
- Primary actions, active navigation, panels, and login surfaces use the expected brand tokens.
- Fonts and brand assets load successfully from local static files.
- Reduced-motion preferences are respected.

## Iterations

1. P2: the mobile top bar stacked service controls into a long column. Fixed with a compact two-column action layout and a full-width role selector.
2. P2: the mobile Haval page title touched the top edge. Fixed with stable top-bar spacing and verified with bounding-box assertions.
3. P2: the desktop sidebar exposed a horizontal scrollbar from long labels. Fixed with hidden horizontal overflow and label ellipsis.
4. QA procedure: the first mobile screenshot was mislabeled because the capture script used an ignored viewport option. Recaptured with the Playwright `viewport` option and verified at 390x844.

## Result

No open P0, P1, or P2 visual findings remain in the checked states. The accepted external cookieless audit-viewer limitation is unrelated to this visual change and remains reported by the project quality gate as PARTIAL.

final result: passed
