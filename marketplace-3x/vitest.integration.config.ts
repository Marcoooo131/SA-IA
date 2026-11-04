import { defineConfig } from "vitest/config";
import path from "node:path";

const TEST_DB = process.env.TEST_DATABASE_URL ?? "postgresql://postgres:postgres@localhost:5432/marketplace3x_test";

export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
  test: {
    environment: "node",
    include: ["tests/integration/**/*.test.ts"],
    globalSetup: ["tests/integration/global-setup.ts"],
    env: { DATABASE_URL: TEST_DB, PAYMENT_PROVIDER: "demo", APP_URL: "http://localhost:3000" },
    fileParallelism: false,
    testTimeout: 30000,
    hookTimeout: 120000,
  },
});
