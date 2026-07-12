// The highest-traffic protected surfaces the core smoke suite renders. Each
// surface loads the shared framework app shell (header, primary navigation,
// notifications, global search), so shell coverage rides along with every
// surface load. Selectors are stable framework anatomy hooks, not text or
// positional selectors.

const SMOKE_SURFACES = [
  {
    name: "Dashboard",
    path: "/dashboard.html",
    host: "main[data-dashboard-host]",
  },
  {
    name: "Workbench",
    path: "/workbench.html",
    host: "main[data-workbench-host]",
  },
];

// Framework app-shell anatomy hooks (owned by public/js/navigation.js).
const SHELL = {
  header: "header.site-header",
  primaryNav: "header.site-header nav.site-nav",
  navToggle: "header.site-header .nav-toggle",
  primaryMenu: "#primary-menu",
};

export { SHELL, SMOKE_SURFACES };
