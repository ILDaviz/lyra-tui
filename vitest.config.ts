import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    exclude: [
      "**/node_modules/**",
      "**/dist/**",
      "**/*.bun.test.ts",
      "**/*.bun.test.tsx",
    ],
    // Several integration tests share the stateful ~/.lyra_test Git repository.
    fileParallelism: false,
  },
});
