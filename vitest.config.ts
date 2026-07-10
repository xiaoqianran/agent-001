import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    include: ["packages/**/*.test.ts", "apps/**/*.test.ts"],
    environment: "node",
  },
  resolve: {
    alias: {
      "@gss/contracts": path.resolve(__dirname, "packages/contracts/src/index.ts"),
      "@gss/world": path.resolve(__dirname, "packages/world/src/index.ts"),
      "@gss/runtime": path.resolve(__dirname, "packages/runtime/src/index.ts"),
      "@gss/agent": path.resolve(__dirname, "packages/agent/src/index.ts"),
      "@gss/cognition": path.resolve(__dirname, "packages/cognition/src/index.ts"),
      "@gss/llm": path.resolve(__dirname, "packages/llm/src/index.ts"),
      "@gss/sim": path.resolve(__dirname, "packages/sim/src/index.ts"),
    },
  },
});
