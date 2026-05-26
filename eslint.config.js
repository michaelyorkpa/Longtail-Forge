const browserGlobals = {
  alert: "readonly",
  confirm: "readonly",
  console: "readonly",
  document: "readonly",
  fetch: "readonly",
  FormData: "readonly",
  Intl: "readonly",
  localStorage: "readonly",
  location: "readonly",
  navigator: "readonly",
  setInterval: "readonly",
  setTimeout: "readonly",
  URLSearchParams: "readonly",
  window: "readonly",
};

const nodeGlobals = {
  Buffer: "readonly",
  console: "readonly",
  process: "readonly",
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
    files: ["src/**/*.js", "server.js", "scripts/**/*.mjs", "eslint.config.js"],
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
];
