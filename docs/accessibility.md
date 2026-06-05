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

Future releases may add axe, Lighthouse, Playwright, and pa11y-based checks for authenticated route behavior.

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
