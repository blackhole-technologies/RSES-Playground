import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: [
      "core/**/*.test.ts",
      "engines/**/*.test.ts",
      "modules/**/*.test.ts",
      "tests/**/*.test.ts",
    ],
    exclude: ["node_modules", "dist", "vendor/**", "ui/**"],
  },
});
