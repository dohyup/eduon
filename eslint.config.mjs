import { defineConfig, globalIgnores } from "eslint/config";
import next from "eslint-config-next/core-web-vitals";
import ts from "eslint-config-next/typescript";
export default defineConfig([
  ...next,
  ...ts,
  globalIgnores([
    ".next/**",
    ".next-p2/**",
    ".next-p3/**",
    ".next-p4/**",
    ".next-p1/**",
    ".tmp/**",
    "src/generated/**",
    "playwright-report/**",
    "test-results/**",
    "test-results-p2/**",
    "test-results-p3/**",
    "test-results-p4/**",
    "next-env.d.ts",
  ]),
]);
