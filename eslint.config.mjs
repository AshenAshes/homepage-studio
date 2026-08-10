import { defineConfig } from "eslint/config";
import tseslint from "typescript-eslint";
import obsidianmd from "eslint-plugin-obsidianmd";

export default defineConfig([
  {
    ignores: [
      "node_modules/**",
      ".agents/**",
      ".claude/**",
      ".scratch/**",
      "coverage/**",
      "docs/**",
      "test-vault/**",
      "main.js",
      "styles.css",
      "*.mjs"
    ]
  },
  ...obsidianmd.configs.recommended,
  {
    files: ["**/*.ts"],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        project: "./tsconfig.json",
        sourceType: "module"
      }
    },
    rules: {
      "obsidianmd/prefer-active-doc": "error",
      "@typescript-eslint/no-explicit-any": "error",
      "no-console": [
        "error",
        {
          "allow": [
            "warn",
            "error",
            "debug"
          ]
        }
      ]
    }
  },
  {
    files: ["tests/**/*.ts", "vitest.config.ts"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unsafe-argument": "off",
      "@typescript-eslint/no-unsafe-assignment": "off",
      "@typescript-eslint/no-unsafe-call": "off",
      "@typescript-eslint/no-unsafe-member-access": "off",
      "@typescript-eslint/no-unsafe-return": "off",
      "@typescript-eslint/unbound-method": "off",
      "@typescript-eslint/no-unused-vars": "off",
      "obsidianmd/hardcoded-config-path": "off",
      "obsidianmd/no-nodejs-modules": "off",
      "obsidianmd/prefer-active-doc": "off",
      "obsidianmd/prefer-create-el": "off"
    }
  },
  {
    files: ["scripts/**/*.mjs"],
    rules: {
      "obsidianmd/hardcoded-config-path": "off"
    }
  }
]);
