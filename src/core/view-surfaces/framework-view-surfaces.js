const FRAMEWORK_VIEW_SURFACE_MODULE_ID = "framework";

const frameworkProtectedViews = Object.freeze([
  Object.freeze({
    id: "files",
    path: "/files.html",
    moduleId: FRAMEWORK_VIEW_SURFACE_MODULE_ID,
    file: "files.html",
    requiredPermissions: ["files.view"],
  }),
]);

const frameworkViewSurfaces = Object.freeze([
  Object.freeze({
    id: "files.browse",
    moduleId: FRAMEWORK_VIEW_SURFACE_MODULE_ID,
    viewId: "files",
    layout: "slide-out-sidebar",
    sidebarLabel: "File filters",
    pageHeader: Object.freeze({
      title: "Files",
      description: "Browse file attachments visible in this workspace.",
    }),
    sidebarPanels: Object.freeze([
      Object.freeze({
        id: "files-browse-filters",
        type: "navigation",
        title: "Filters",
        behavior: "files.browse.filters",
        open: true,
        className: "files-filters-panel",
        ariaLabel: "Files filters",
      }),
    ]),
    detail: Object.freeze({
      regions: Object.freeze([
        Object.freeze({
          id: "files-browse-results",
          behavior: "files.browse.results",
          className: "files-browse-results-region",
          ariaLabel: "Files browse results",
        }),
      ]),
    }),
    dataSource: Object.freeze({
      route: "/api/files/attachments",
      method: "GET",
      fieldBindings: Object.freeze({
        id: "fileAttachmentId",
        fileId: "fileId",
        title: "file.displayName",
        displayName: "file.displayName",
        filename: "file.originalFilename",
        extension: "file.extension",
        mimeType: "file.mimeTypeDetected",
        fileSizeBytes: "file.fileSizeBytes",
        moduleId: "moduleId",
        targetType: "targetType",
        targetLabel: "targetLabel",
        clientLabel: "clientLabel",
        projectLabel: "projectLabel",
        status: "file.status",
        scanStatus: "file.scanStatus",
        uploadedAt: "file.createdAt",
        uploadedByLabel: "file.uploadedByLabel",
        deletedAt: "file.deletedAt",
        attachedAt: "createdAt",
      }),
    }),
  }),
]);

function listFrameworkProtectedViews() {
  return frameworkProtectedViews.map(cloneContribution);
}

function listFrameworkViewSurfaces() {
  return frameworkViewSurfaces.map(cloneContribution);
}

function cloneContribution(value) {
  return JSON.parse(JSON.stringify(value));
}

export {
  FRAMEWORK_VIEW_SURFACE_MODULE_ID,
  listFrameworkProtectedViews,
  listFrameworkViewSurfaces,
};
