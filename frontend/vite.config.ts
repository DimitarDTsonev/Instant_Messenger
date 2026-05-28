import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig(({ command }) => ({
  plugins: [react()],
  // Local dev always uses "/" so http://localhost:5173 works without any sub-path.
  // Production builds (vite build in CI) pick up VITE_BASE_PATH for GitHub Pages.
  base: command === "serve" ? "/" : (process.env.VITE_BASE_PATH || "/"),
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://localhost:4000",
        changeOrigin: true,
      },
    },
  },
  test: {
    pool: "vmThreads",
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test-utils/setup.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov", "html"],
      include: ["src/**/*.{ts,tsx}"],
      exclude: [
        "src/test-utils/**",
        "src/main.tsx",
        "src/__tests__/**",
        "src/sw.ts",
        "src/types.ts",
        "src/context/socketTypes.ts",
        "src/hooks/useApi.ts",
        "src/vite-env.d.ts",
      ],
      thresholds: {
        lines:      90,
        functions:  90,
        branches:   85,
        statements: 90,
      },
    },
  },
}));
