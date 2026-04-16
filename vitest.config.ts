import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    globals: true,
    include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"],
    exclude: ["tests/ui/**"],
    coverage: {
      provider: "v8",
      include: [
        "server/lib/**",
        "server/auth/**",
        "server/middleware/**",
      ],
      reporter: ["text", "html"],
      // Current baseline: ~35% lines, ~28% branches, ~33% functions.
      // Aspirational target: 70% lines per ROADMAP M1.7-CI. The floor
      // is set just below current reality so CI catches regressions but
      // doesn't block PRs on a threshold the codebase can't meet today.
      // Ratchet these upward as coverage improves.
      thresholds: {
        lines: 30,
        branches: 25,
        functions: 25,
      },
    },
  },
  resolve: {
    alias: {
      "@shared": path.resolve(__dirname, "./shared"),
      "@": path.resolve(__dirname, "./client/src"),
      "@server": path.resolve(__dirname, "./server"),
    },
  },
});
