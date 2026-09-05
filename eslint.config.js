const browserGlobals = {
  alert: "readonly",
  confirm: "readonly",
  console: "readonly",
  document: "readonly",
  Element: "readonly",
  fetch: "readonly",
  FormData: "readonly",
  HTMLElement: "readonly",
  HTMLInputElement: "readonly",
  HTMLSelectElement: "readonly",
  Intl: "readonly",
  localStorage: "readonly",
  location: "readonly",
  navigator: "readonly",
  setInterval: "readonly",
  setTimeout: "readonly",
  URL: "readonly",
  URLSearchParams: "readonly",
  window: "readonly",
};

const nodeGlobals = {
  Buffer: "readonly",
  console: "readonly",
  process: "readonly",
  structuredClone: "readonly",
  setTimeout: "readonly",
  URL: "readonly",
};

export default [
  {
    ignores: [
      "archive/**",
      "data/**",
      "logs/**",
      "node_modules/**",
    ],
  },
  {
    files: ["src/**/*.js", "server.js", "worker.js", "scripts/**/*.mjs", "tests/**/*.mjs", "vitest.config.mjs", "playwright.config.js", "eslint.config.js"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: nodeGlobals,
    },
    rules: {
      "no-undef": "error",
      "no-unused-vars": ["error", {
        argsIgnorePattern: "^_",
        varsIgnorePattern: "^_",
      }],
    },
  },
  {
    files: ["public/**/*.js"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "script",
      globals: browserGlobals,
    },
    rules: {
      "no-undef": "error",
      "no-unused-vars": ["error", {
        argsIgnorePattern: "^_",
        varsIgnorePattern: "^_",
      }],
    },
  },
  {
    files: ["public/js/dashboard.entry.js", "public/js/tasks-dashboard.js"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: browserGlobals,
    },
  },
];
