import request from "supertest";
import crypto from "node:crypto";
import mongoose from "mongoose";
import { beforeAll, afterAll, describe, expect, it, vi } from "vitest";
import { createApp } from "../../src/app.js";
import { connectRedis, disconnectRedis, redisClient } from "../../src/redis/client.js";
import connectDB from "../../src/config/db.config.js";
import UserModel from "../../src/models/user.model.js";

const app = createApp();
const invalidLoginEmail = `missing-${crypto.randomUUID()}@example.com`;
const registrationEmail = `test-user-${crypto.randomUUID()}@example.com`;

async function deleteKeysContaining(value: string): Promise<void> {
  const keys = await redisClient.keys(`*${value}*`);
  for (const key of keys) {
    await redisClient.del(key);
  }
}

describe("auth API", () => {
  beforeAll(async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(null, { status: 202 }),
    );
    await connectRedis();
    await connectDB();
  });

  afterAll(async () => {
    await UserModel.deleteOne({ email: registrationEmail });
    await deleteKeysContaining(invalidLoginEmail);
    await deleteKeysContaining(registrationEmail);
    await disconnectRedis();
    await mongoose.disconnect();
    vi.restoreAllMocks();
  });

  it("rejects login with invalid credentials", async () => {
    const response = await request(app)
      .post("/v1/auth/login")
      .send({
        email: invalidLoginEmail,
        password: "Password1",
      });

    expect(response.status).toBe(400);
  });

  it("registers a new rider account and exposes the email verification path", async () => {
    const response = await request(app)
      .post("/v1/auth/register")
      .send({
        firstName: "Test",
        lastName: "User",
        email: registrationEmail,
        password: "Password1",
      });

    expect(response.status).toBe(200);
    expect(response.body.message).toContain("verification");
  });
});
