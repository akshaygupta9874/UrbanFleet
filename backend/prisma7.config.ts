// backend/prisma7.config.ts
import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts", // 👈 Add this line!
  },
  datasource: {
    url: process.env["DATABASE_URL"],
  },
});