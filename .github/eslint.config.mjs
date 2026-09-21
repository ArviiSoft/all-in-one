import js from "@eslint/js";
import globals from "globals";

export default [
  {
    ignores: ["Dashboard/tests/artifacts/**", "Database/MongoDB/Database Backups/**"]
  },
  js.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: "latest"
    },
    rules: {
      "no-empty": ["error", { allowEmptyCatch: true }],
      "no-unused-vars": ["warn", { caughtErrors: "none", ignoreRestSiblings: true }],
      "no-undef": "error"
    }
  },
  {
    files: ["**/*.{js,cjs}"],
    ignores: ["Dashboard/public/**"],
    languageOptions: {
      sourceType: "commonjs",
      globals: globals.node
    }
  },
  {
    files: ["**/*.mjs"],
    languageOptions: {
      sourceType: "module",
      globals: globals.nodeBuiltin
    }
  },
  {
    files: ["Commands/**/*.js", "Events/**/*.js"],
    languageOptions: { globals: { client: "readonly" } }
  },
  {
    files: ["Dashboard/public/**/*.js"],
    languageOptions: {
      sourceType: "script",
      globals: globals.browser
    }
  },
  {
    files: ["Dashboard/public/app.js"],
    languageOptions: {
      globals: {
        avatarOturumunuSifirla: "readonly",
        avatarDurumu: "readonly",
        avatarYukle: "readonly",
        profilAvatarIcerigi: "readonly",
        avatarPaneli: "readonly",
        avatarEditorGuncelle: "readonly",
        avatarAyarlariniBagla: "readonly",
        modulKartIkonu: "readonly"
      }
    }
  },
  {
    files: ["Dashboard/public/avatar.js"],
    languageOptions: {
      globals: {
        api: "readonly",
        durum: "readonly",
        kacir: "readonly",
        profilHarfleri: "readonly",
        profilKimliginiUygula: "readonly",
        ikon: "readonly"
      }
    }
  },
  {
    files: ["Dashboard/public/module-icons.js"],
    languageOptions: { globals: { ikon: "readonly" } }
  },
  {
    files: ["Dashboard/tests/*.browser.js", "Dashboard/tests/browser.js"],
    languageOptions: { globals: globals.browser }
  }
];
