/**
 * One recorded framework-view consolidation movement. Every field is the exact
 * value the retained owner asserts against, so the shapes are declared once
 * here rather than being re-derived at each assertion site.
 * @param {string} id
 * @param {string} sourcePath
 * @param {string} modulePath
 * @param {number} assertionCount
 * @param {string} retainedOwner
 * @param {string} exceptionId
 * @param {string} reason
 */
const movement = (id, sourcePath, modulePath, assertionCount, retainedOwner, exceptionId, reason) => Object.freeze({
  id,
  sourcePath,
  modulePath,
  assertionCount,
  retainedOwner,
  exception: Object.freeze({ id: exceptionId, reason }),
});

export const FRAMEWORK_VIEW_STATIC_CONSOLIDATION = Object.freeze({
  schemaVersion: 1,
  version: '0.33.33.9',
  before: Object.freeze({ discoveredScripts: 456, sourceOwners: 34, movedAssertions: 1257 }),
  after: Object.freeze({ discoveredScripts: 424, tableDrivenOwners: 2 }),
  movements: Object.freeze([
    movement('legacy.accessibility', 'scripts/accessibility-regression.mjs', 'scripts/regression-contracts/views/accessibility.contract.mjs', 9, 'views.current-static-contracts', 'accessibility-source-only', 'Source accessibility landmarks stay grouped here while live permission and browser accessibility owners remain separate.'),
    movement('legacy.client.modal.footer.actions', 'scripts/client-modal-footer-actions-regression.mjs', 'scripts/regression-contracts/views/client-modal-footer-actions.contract.mjs', 34, 'views.current-static-contracts', 'client-modal-footer', 'Client modal footer action placement has surface-specific selectors that must remain explicit data.'),
    movement('legacy.drawer.main.surface.contract', 'scripts/drawer-main-surface-contract-regression.mjs', 'scripts/regression-contracts/views/drawer-main-surface.contract.mjs', 16, 'views.current-static-contracts', 'drawer-main-surface', 'Drawer and main-surface anatomy retains its explicit framework boundary checks.'),
    movement('legacy.icon.control.conversion', 'scripts/icon-control-conversion-regression.mjs', 'scripts/regression-contracts/views/icon-control-conversion.contract.mjs', 17, 'views.current-static-contracts', 'icon-control-conversion', 'Converted icon controls retain their exact visible-label and icon mapping exceptions.'),
    movement('legacy.markdown.platform.contract', 'scripts/markdown-platform-contract-regression.mjs', 'scripts/regression-contracts/views/markdown-platform.contract.mjs', 30, 'views.current-static-contracts', 'markdown-platform', 'Markdown platform ownership retains its explicit renderer and sanitization source seams.'),
    movement('legacy.markdown.renderer.service', 'scripts/markdown-renderer-service-regression.mjs', 'scripts/regression-contracts/views/markdown-renderer-service.contract.mjs', 56, 'views.current-static-contracts', 'markdown-renderer-service', 'Markdown rendering keeps its service-specific modes and safe URL exceptions.'),
    movement('legacy.modal.action.standardization.contract', 'scripts/modal-action-standardization-contract-regression.mjs', 'scripts/regression-contracts/views/modal-action-standardization.contract.mjs', 46, 'views.current-static-contracts', 'modal-action-standardization', 'Modal action standardization retains exact per-dialog footer exceptions.'),
    movement('legacy.modal.footer.contract', 'scripts/modal-footer-contract-regression.mjs', 'scripts/regression-contracts/views/modal-footer.contract.mjs', 21, 'views.current-static-contracts', 'modal-footer', 'Modal footer anatomy retains named action-order and placement exceptions.'),
    movement('legacy.modal.section.contract', 'scripts/modal-section-contract-regression.mjs', 'scripts/regression-contracts/views/modal-section.contract.mjs', 34, 'views.current-static-contracts', 'modal-section', 'Modal section anatomy retains named section and field-grid exceptions.'),
    movement('legacy.overlay.host.contract', 'scripts/overlay-host-contract-regression.mjs', 'scripts/regression-contracts/views/overlay-host.contract.mjs', 23, 'views.current-static-contracts', 'overlay-host', 'Overlay hosts retain explicit stacking and shared-shell source exceptions.'),
    movement('legacy.remaining.icon.actions', 'scripts/remaining-icon-actions-regression.mjs', 'scripts/regression-contracts/views/remaining-icon-actions.contract.mjs', 18, 'views.current-static-contracts', 'remaining-icon-actions', 'Remaining icon actions retain exact per-surface text and icon exceptions.'),
    movement('legacy.shared.icons', 'scripts/shared-icons-regression.mjs', 'scripts/regression-contracts/views/shared-icons.contract.mjs', 24, 'views.current-static-contracts', 'shared-icons', 'Shared icon coverage retains its protected-view file inventory exception.'),
    movement('legacy.surface.adoption.pass', 'scripts/surface-adoption-pass-regression.mjs', 'scripts/regression-contracts/views/surface-adoption-pass.contract.mjs', 18, 'views.current-static-contracts', 'surface-adoption', 'Converted surfaces retain exact adoption exclusions instead of implicit allowlists.'),
    movement('legacy.surface.token.contract', 'scripts/surface-token-contract-regression.mjs', 'scripts/regression-contracts/views/surface-token.contract.mjs', 13, 'views.current-static-contracts', 'surface-token', 'Surface tokens retain exact legacy token exclusions and shared token requirements.'),
    movement('legacy.ui.contract', 'scripts/ui-contract-regression.mjs', 'scripts/regression-contracts/views/ui.contract.mjs', 51, 'views.current-static-contracts', 'ui-contract', 'Shared UI anatomy retains explicit retired helper and per-surface selector exceptions.'),
    movement('legacy.view.builder.contract', 'scripts/view-builder-contract-regression.mjs', 'scripts/regression-contracts/views/view-builder.contract.mjs', 13, 'views.current-static-contracts', 'view-builder', 'View builder anatomy retains its exact shared helper contract.'),
    movement('legacy.view.builder.converted.surface', 'scripts/view-builder-converted-surface-guardrails.mjs', 'scripts/regression-contracts/views/view-builder-converted-surface-guardrails.contract.mjs', 38, 'views.current-static-contracts', 'converted-view-builder', 'Converted surfaces retain named exceptions where module behavior has not moved into descriptors.'),
    movement('legacy.view.descriptor.declarative', 'scripts/view-descriptor-declarative-guardrails.mjs', 'scripts/regression-contracts/views/view-descriptor-declarative-guardrails.contract.mjs', 114, 'views.current-static-contracts', 'declarative-descriptors', 'Declarative descriptors retain exact protected-view and module registration exceptions.'),
    movement('legacy.view.descriptor.terminology', 'scripts/view-descriptor-terminology-regression.mjs', 'scripts/regression-contracts/views/view-descriptor-terminology.contract.mjs', 15, 'views.current-static-contracts', 'descriptor-terminology', 'Descriptor terminology keeps explicit module fallback and override exceptions.'),
    movement('legacy.view.index.primitive', 'scripts/view-index-primitive-regression.mjs', 'scripts/regression-contracts/views/view-index-primitive.contract.mjs', 28, 'views.current-static-contracts', 'view-index-primitive', 'View index behavior retains its fake-browser source-only exception.'),
    movement('legacy.view.renderer.data.binding', 'scripts/view-renderer-data-binding-regression.mjs', 'scripts/regression-contracts/views/view-renderer-data-binding.contract.mjs', 27, 'views.current-static-contracts', 'renderer-data-binding', 'Renderer data binding retains its source-only fake-browser exception.'),
    movement('legacy.view.renderer.shell', 'scripts/view-renderer-shell-regression.mjs', 'scripts/regression-contracts/views/view-renderer-shell.contract.mjs', 94, 'views.current-static-contracts', 'renderer-shell', 'Renderer shell anatomy retains explicit host and fake-browser exceptions.'),
    movement('views.calendar-host', 'scripts/regressions/views/calendar-host.regression.mjs', 'scripts/regression-contracts/views/calendar-host.contract.mjs', 60, 'views.current-static-contracts', 'calendar-host', 'Calendar host anatomy remains source-only while calendar HTTP and browser workflows remain separate.'),
    movement('views.dashboard-calendar-embed', 'scripts/regressions/views/dashboard-calendar-embed.regression.mjs', 'scripts/regression-contracts/views/dashboard-calendar-embed.contract.mjs', 30, 'views.current-static-contracts', 'dashboard-calendar-embed', 'Dashboard calendar embedding retains its dashboard-specific host exception.'),
    movement('views.dashboard-client-bootstrap', 'scripts/regressions/views/dashboard-client-bootstrap.regression.mjs', 'scripts/regression-contracts/views/dashboard-client-bootstrap.contract.mjs', 19, 'views.current-static-contracts', 'dashboard-client-bootstrap', 'Dashboard bootstrap ordering retains its exact client asset exception.'),
    movement('views.dashboard-es-module-entry', 'scripts/regressions/views/dashboard-es-module-entry.regression.mjs', 'scripts/regression-contracts/views/dashboard-es-module-entry.contract.mjs', 43, 'views.current-static-contracts', 'dashboard-es-module-entry', 'Dashboard module entry retains exact keyboard and asset source exceptions while Playwright stays separate.'),
    movement('views.field-factory', 'scripts/regressions/views/field-factory.regression.mjs', 'scripts/regression-contracts/views/field-factory.contract.mjs', 94, 'views.current-static-contracts', 'field-factory', 'Field factory source contracts retain explicit field-kind and reporting exceptions.'),
    movement('views.mobile-app-shell-header', 'scripts/regressions/views/mobile-app-shell-header.regression.mjs', 'scripts/regression-contracts/views/mobile-app-shell-header.contract.mjs', 13, 'views.current-static-contracts', 'mobile-app-shell-header', 'Mobile shell header anatomy retains its responsive navigation exception.'),
    movement('views.mobile-foundation', 'scripts/regressions/views/mobile-foundation.regression.mjs', 'scripts/regression-contracts/views/mobile-foundation.contract.mjs', 10, 'views.current-static-contracts', 'mobile-foundation', 'Mobile foundation retains exact CSS breakpoint source exceptions.'),
    movement('framework.calendar-subscription-settings', 'scripts/regressions/framework/calendar-subscription-settings.regression.mjs', 'scripts/regression-contracts/framework/calendar-subscription-settings.contract.mjs', 69, 'framework.current-static-contracts', 'calendar-subscription-settings', 'Calendar subscription settings retain exact settings anatomy while route and browser owners remain separate.'),
    movement('framework.reporting-closeout', 'scripts/regressions/framework/reporting-closeout.regression.mjs', 'scripts/regression-contracts/framework/reporting-closeout.contract.mjs', 28, 'framework.current-static-contracts', 'reporting-closeout', 'Reporting closeout retains source-only navigation and anatomy exceptions.'),
    movement('framework.reporting-host', 'scripts/regressions/framework/reporting-host.regression.mjs', 'scripts/regression-contracts/framework/reporting-host.contract.mjs', 39, 'framework.current-static-contracts', 'reporting-host', 'Reporting host retains exact catalog and protected-view anatomy exceptions.'),
    movement('framework.settings-branch-closeout', 'scripts/regressions/framework/settings-branch-closeout.regression.mjs', 'scripts/regression-contracts/framework/settings-branch-closeout.contract.mjs', 34, 'framework.current-static-contracts', 'settings-branch-closeout', 'Settings branch anatomy retains exact current surface and retired-host exceptions.'),
    movement('framework.settings-page-actions', 'scripts/regressions/framework/settings-page-actions.regression.mjs', 'scripts/regression-contracts/framework/settings-page-actions.contract.mjs', 79, 'framework.current-static-contracts', 'settings-page-actions', 'Settings page actions retain exact dirty-state and navigation source exceptions.'),
  ]),
  retainedBehavioralOwners: Object.freeze([
    Object.freeze({ id: 'framework.browser-security-headers', reason: 'Runs HTTP security-header and CSP probes.' }),
    Object.freeze({ id: 'framework.csrf-protection', reason: 'Exercises CSRF behavior through its dedicated owner.' }),
    Object.freeze({ id: 'framework.express-5-http-contract', reason: 'Exercises live Express HTTP behavior.' }),
    Object.freeze({ id: 'framework.http-error-contract', reason: 'Exercises HTTP error behavior.' }),
    Object.freeze({ id: 'framework.browser-recovery-boundary', reason: 'Exercises browser recovery behavior.' }),
    Object.freeze({ id: 'framework.session-auth-warning', reason: 'Exercises session warning behavior.' }),
    Object.freeze({ id: 'framework.tls-cookie-posture', reason: 'Exercises TLS and cookie behavior.' }),
    Object.freeze({ id: 'framework.trusted-proxy-request-context', reason: 'Exercises trusted proxy request behavior.' }),
    Object.freeze({ id: 'permissions.http-authorization-matrix', reason: 'Runs the isolated-database permission matrix.' }),
  ]),
  retainedPlaywrightOwners: Object.freeze([
    'tests/e2e/a11y.spec.mjs',
    'tests/e2e/a11y-keyboard.spec.mjs',
    'tests/e2e/browser-recovery.spec.mjs',
    'tests/e2e/calendar-subscription-settings.spec.mjs',
    'tests/e2e/dashboard-bootstrap-sequencing.spec.mjs',
    'tests/e2e/settings-admin-navigation.spec.mjs',
    'tests/e2e/settings-universal-actions.spec.mjs',
  ]),
});
