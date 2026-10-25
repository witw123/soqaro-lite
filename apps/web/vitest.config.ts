import { defineConfig } from "vitest/config";
import { resolve } from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    exclude: ["e2e/**", "node_modules/**", "dist/**", ".next/**"]
  },
  resolve: {
    alias: {
      "@": resolve(__dirname, "src"),
      "@soqaro/shared": resolve(__dirname, "../../packages/shared/src/index.ts")
    }
  }
});
