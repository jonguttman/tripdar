import js from "@eslint/js";
import next from "@next/eslint-plugin-next";
import reactHooks from "eslint-plugin-react-hooks";
import tseslint from "typescript-eslint";

const browserGlobals = {
  Blob: "readonly",
  Document: "readonly",
  File: "readonly",
  FormData: "readonly",
  HTMLInputElement: "readonly",
  KeyboardEvent: "readonly",
  MouseEvent: "readonly",
  RequestInit: "readonly",
  Response: "readonly",
  URL: "readonly",
  URLSearchParams: "readonly",
  alert: "readonly",
  clearTimeout: "readonly",
  console: "readonly",
  crypto: "readonly",
  document: "readonly",
  fetch: "readonly",
  navigator: "readonly",
  setTimeout: "readonly",
  window: "readonly",
};

const nodeGlobals = {
  Buffer: "readonly",
  NodeJS: "readonly",
  console: "readonly",
  crypto: "readonly",
  process: "readonly",
};

export default [
  {
    ignores: ["node_modules/**", ".next/**", "dist/**", "coverage/**", ".worktrees/**"],
  },
  {
    files: ["src/**/*.{ts,tsx,mts}", "eslint.config.mjs"],
    ...js.configs.recommended,
  },
  ...tseslint.configs.recommended.map((config) => ({
    ...config,
    files: ["src/**/*.{ts,tsx,mts}"],
  })),
  {
    files: ["src/**/*.{ts,tsx,mts}"],
    ...reactHooks.configs.flat.recommended,
  },
  {
    files: ["src/**/*.{ts,tsx,mts}"],
    plugins: { "@next/next": next },
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      parserOptions: { ecmaFeatures: { jsx: true } },
      globals: { ...browserGlobals, ...nodeGlobals },
    },
    rules: {
      ...next.configs.recommended.rules,
      ...next.configs["core-web-vitals"].rules,
      "@next/next/no-img-element": "warn",
      "react-hooks/immutability": "warn",
      "react-hooks/set-state-in-effect": "warn",
    },
  },
  {
    files: ["eslint.config.mjs"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: nodeGlobals,
    },
  },
];
