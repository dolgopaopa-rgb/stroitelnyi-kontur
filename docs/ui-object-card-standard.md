# Active Object Card Standard

Scope: Today > Active Objects, for every role that can see this section.
This is the first reference component, not a claim that the entire UI is standardized.

## Component Contract

- One renderer and one internal layout for every role and density.
- The title is a text-styled button opening the object through the existing navigation handler.
- No duplicate Open button or separate row of large action buttons.
- Expand/collapse uses the shared chevron sprite, a quiet 18px icon and a 44px hit target.
- The chevron has a tooltip, accessible name, expanded state and controlled detail ID.
- Expansion preserves keyboard focus and does not navigate away from Today.
- Details are collapsed initially. Status remains readable without splitting words.
- Card padding is 12px; title/status and metrics are separated by at least 8px.
- Metrics are information, not primary actions. They may wrap with consistent gaps.
- Long titles wrap without squeezing the status or overlapping the chevron.
- Focus, hover and expanded states must not move neighboring controls.

## Ownership

Keep component rules together. Remove superseded component rules rather than adding
role-specific overrides. Outer section grids may change by viewport or role;
the card's internal controls and spacing must not.

## Release Gate

1. Freeze the product files before independent QA; record their hashes.
2. Run the existing full project quality gate and focused object-card tests.
3. Check compact and comfortable densities, manager/director and other visible roles,
   long titles/statuses, empty metrics, expansion and actual object navigation.
4. Check 320, 375, 390, 430, 768, 1024 and 1440px plus narrow cards on desktop.
5. Inspect desktop and mobile screenshots visually. Passing clicks alone is not visual acceptance.
6. Preserve reviewed screenshots with the source revision as reference evidence.
   Never silently accept changed screenshots or overwrite a baseline to make a test pass.
7. A source change after QA requires rerunning affected checks and refreshing screenshots.
8. Update asset and service-worker versions; verify the deployed files match the checked build.
9. Report only checks actually run. Device/browser gaps stay explicit.

Future components should adopt their own reviewed contract incrementally, without
global CSS changes that accidentally resize unrelated controls.
