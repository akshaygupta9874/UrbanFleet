import { defineConfig } from "vitest/config";
import os from "node:os";
import path from "node:path";

export default defineConfig({
  cacheDir: path.join(os.tmpdir(), "urbanfleet-backend-vitest-cache"),
  test: {
    environment: "node",
    setupFiles: ["./test/setup.ts"],
    include: ["test/**/*.test.ts"],
    hookTimeout: 30_000,
    testTimeout: 30_000,
    pool: "forks",
    fileParallelism: false,
    maxWorkers: 1,
    env: {
      NODE_ENV: "test",
      MONGODB_URI: "mongodb://localhost:27017/?replicaSet=rs0",
      MONGODB_DB_NAME: "UrbanFleet",
      REDIS_URL: "redis://127.0.0.1:6379/15",
      JWT_ACCESS_SECRET: "test-access-secret-only",
      JWT_REFRESH_SECRET: "test-refresh-secret-only",
      FRONTEND_URL: "http://localhost:5173",
      RAZORPAY_KEY_ID: "test_key",
      RAZORPAY_KEY_SECRET: "test_secret",
      SENDGRID_API_KEY: "test-sendgrid-key",
      SENDGRID_FROM_EMAIL: "test@example.com",
    },
  },
});
