import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["src/**/*.test.ts", "src/**/*.spec.ts"],
    setupFiles: ["./vitest.setup.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      include: ["src/**/*.ts"],
      exclude: [
        "src/**/*.test.ts",
        "src/**/*.spec.ts",
        "src/scripts/**",
        // Pre-existing modules that pre-date this feature; we don't touch
        // their coverage in this PR.
        "src/agents/speaking-tutor.ts",
        "src/agents/content-producer.ts",
        "src/routes/speaking-tutor.ts",
        "src/routes/progress.ts",
        "src/routes/lessons.ts",
        "src/lib/db.ts",
        "src/lib/storage.ts",
        "src/entrypoint.ts",
        "src/index.ts",
      ],
    },
  },
});
