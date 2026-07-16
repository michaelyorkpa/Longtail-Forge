# Longtail Forge Accessibility

Longtail Forge targets WCAG 2.2 AA for user-facing browser UI.

Accessibility work has two parts:

- Automated checks that catch repeatable mistakes.
- Manual review that verifies the page is understandable and usable by people.

Automated tools help, but they do not replace manual keyboard, screen reader, zoom, and contrast review.

## Development Checks

Run the local accessibility foundation check with:

```text
npm run check
```

The accessibility regression currently verifies static page and shared-style basics:

- Every view declares `lang`, `title`, and responsive viewport metadata.
- Buttons, links, fields, selects, textareas, and outputs have accessible names.
- Dialogs have an accessible label.
- Status regions use `role="status"` and `aria-live`.
- Images have `alt` text.
- Shared CSS includes visible focus styling and reduced-motion support.

## Rendered Automated WCAG Gate

The rendered accessibility gate runs axe (`@axe-core/playwright`, dev/test tooling only — never a runtime dependency) inside the existing Playwright harness against authenticated surfaces:

```text
npm run test:a11y
```

The same specs run as part of the full `npm run test:e2e` gate. Both are browser-dependent and deliberately separate from `npm run check`.

- Scans gate the automatically detectable WCAG A/AA rules (`wcag2a`, `wcag2aa`, `wcag21a`, `wcag21aa`, `wcag22aa` tags) via the shared helper in `tests/e2e/support/axe.mjs`.
- Covered states at both named viewports: the app shell, Dashboard, Workbench, the Tasks list, the open Tasks filter sidebar, the open Add Task modal, its rendered validation-error state, the stacked tags child dialog, and (mobile) the open navigation drawer. Each scan waits for the stable rendered state a user can interact with.
- Failures attach the structured axe result (rule, target, impact, help URL) to the Playwright report.
- There are no blanket excludes or disabled rules. The known-issue baseline in `tests/e2e/support/axe.mjs` ships empty; an entry may only defer an exact rule/target fingerprint with a documented reason, so a deferred issue can never hide the same rule on a new target.
- Interaction-dependent behavior that axe cannot judge is asserted in `tests/e2e/a11y-keyboard.spec.mjs`: keyboard reachability, visible focus indicators, modal focus containment and Escape/focus-return, sidebar Escape/focus-return, and no keyboard trap on the covered states (the mobile drawer's focus contract lives in `mobile-nav.spec.mjs`).

A clean automated run is not WCAG conformance. Automated scans catch only part of WCAG; the manual checklist below — keyboard, screen reader, zoom/reflow, text spacing, motion, labeling-in-context, and inclusive usability review — remains required for touched pages.

## Manual Release Checklist

Use this checklist for pages touched in a release:

- Keyboard-only navigation works.
- Focus order follows the visible workflow.
- Focus is visible on links, buttons, fields, summaries, and custom controls.
- Modals open with focus inside, close with Escape where appropriate, and return focus to the trigger.
- Forms have labels, help text where useful, and useful validation errors.
- Status/error messages are announced through live regions.
- Color contrast passes WCAG 2.2 AA.
- The UI works at 200% zoom and reflows without horizontal scrolling for normal content.
- Motion respects reduced-motion preferences.

## Shared Patterns

Prefer native HTML controls before custom widgets.

Use:

- `button` for commands.
- `a` for navigation.
- `label` plus `input`, `select`, or `textarea` for form fields.
- `fieldset` and `legend` for grouped form controls.
- `dialog` for modal dialogs.
- `details` and `summary` for simple disclosure controls.
- `role="status"` with `aria-live="polite"` for non-blocking status updates.

If a visible label is not practical, use `aria-label` or `aria-labelledby`.

## Icon-Only Controls

Icon-only command controls must be native `button` elements with an accessible name, usually through `aria-label`, and a discoverable `title` when visible text is removed. Decorative SVG icons inside buttons should be hidden from assistive technology with `aria-hidden="true"` and `focusable="false"`.

Autocomplete tag entry fields use `role="combobox"`, name and control their `role="listbox"` suggestion surface through `aria-controls`, and keep `aria-expanded` synchronized with visible suggestions. A plain textbox must not carry disclosure state, and a suggestion listbox must not be unnamed.

Use the shared `window.LongtailForge.icons` helper for common action icons so icon-only controls keep the shared 44px touch target, visible focus styling, disabled styling, theme-aware `currentColor`, and danger styling for destructive actions.
