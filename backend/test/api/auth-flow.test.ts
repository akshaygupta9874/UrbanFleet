import request from "supertest";
import crypto from "node:crypto";
import { beforeAll, afterAll, describe, expect, it, vi } from "vitest";
import { createApp } from "../../src/app.js";
import { connectRedis, disconnectRedis, redisClient } from "../../src/redis/client.js";
import { prisma } from "../../src/db/client.js";

const app = createApp();
const testEmail = `test-rider-${crypto.randomUUID()}@example.com`;
const testPassword = "Password123!";
let verifyToken = "";
let accessToken = "";
let sessionCookie: string[] = [];

async function clearAuthRedisKeys(email: string) {
  try {
    const keys = await redisClient.keys(`*${email}*`);
    for (const key of keys) {
      await redisClient.del(key);
    }
    // Also clear rate limits
    const rateLimitKeys = await redisClient.keys("*-rate-limit:*");
    for (const k of rateLimitKeys) {
      await redisClient.del(k);
    }
  } catch {
    // Ignore cleanup error
  }
}

describe("Authentication & User Lifecycle E2E API Flow", () => {
  beforeAll(async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(null, { status: 202 }),
    );
    await connectRedis();
    await clearAuthRedisKeys(testEmail);
  });

  afterAll(async () => {
    await prisma.user.deleteMany({
      where: { email: testEmail },
    });
    await clearAuthRedisKeys(testEmail);
    if (verifyToken) {
      await redisClient.del(`verify:${verifyToken}`);
    }
    await disconnectRedis();
    await prisma.$disconnect();
    vi.restoreAllMocks();
  });

  describe("1. Registration & Input Validation", () => {
    it("rejects registration with invalid email format", async () => {
      const response = await request(app)
        .post("/v1/auth/register")
        .send({
          firstName: "John",
          lastName: "Doe",
          email: "invalid-email-format",
          password: testPassword,
        });

      expect(response.status).toBe(400);
      expect(response.body.message).toBeDefined();
    });

    it("rejects registration with weak password (missing digit/uppercase)", async () => {
      const response = await request(app)
        .post("/v1/auth/register")
        .send({
          firstName: "John",
          lastName: "Doe",
          email: `weak-${Date.now()}@example.com`,
          password: "weakpassword",
        });

      expect(response.status).toBe(400);
      expect(response.body.message).toContain("password");
    });

    it("registers new account and queues verification email token in Redis", async () => {
      const response = await request(app)
        .post("/v1/auth/register")
        .send({
          firstName: "John",
          lastName: "Doe",
          email: testEmail,
          password: testPassword,
        });

      expect(response.status).toBe(200);
      expect(response.body.message).toContain("verification link");

      // Verify token was stored in Redis
      const emailRecord = await redisClient.get(`verify:email:${testEmail}`);
      expect(emailRecord).not.toBeNull();
      const parsed = JSON.parse(emailRecord!);
      expect(parsed.email).toBe(testEmail);
      expect(parsed.firstName).toBe("John");
      expect(parsed.lastName).toBe("Doe");

      // Extract verification token from Redis
      const keys = await redisClient.keys("verify:*");
      for (const k of keys) {
        if (!k.includes("email:")) {
          const val = await redisClient.get(k);
          if (val && JSON.parse(val).email === testEmail) {
            verifyToken = k.replace("verify:", "");
            break;
          }
        }
      }
      expect(verifyToken).toBeTruthy();
    });
  });

  describe("2. Email Verification & PostgreSQL Account Activation", () => {
    it("rejects verification with an invalid token", async () => {
      const response = await request(app).post("/v1/auth/verify/invalid-token-12345");
      expect(response.status).toBe(400);
    });

    it("activates user and persists to PostgreSQL on valid verification token", async () => {
      const response = await request(app).post(`/v1/auth/verify/${verifyToken}`);
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);

      // Verify user now exists in PostgreSQL with hashed password
      const dbUser = await prisma.user.findUnique({
        where: { email: testEmail },
      });
      expect(dbUser).not.toBeNull();
      expect(dbUser?.email).toBe(testEmail);
      expect(dbUser?.firstName).toBe("John");
      expect(dbUser?.lastName).toBe("Doe");
      expect(dbUser?.roles).toContain("RIDER");
      expect(dbUser?.password).not.toBe(testPassword);
    });

    it("rejects re-using the consumed verification token", async () => {
      const response = await request(app).post(`/v1/auth/verify/${verifyToken}`);
      expect(response.status).toBe(400);
    });
  });

  describe("3. Two-Factor Login & Session Management", () => {
    it("rejects login with wrong password", async () => {
      await clearAuthRedisKeys(testEmail);

      const response = await request(app)
        .post("/v1/auth/login")
        .send({
          email: testEmail,
          password: "WrongPassword999!",
        });

      expect(response.status).toBe(400);
    });

    it("initiates login and dispatches OTP to Redis", async () => {
      await clearAuthRedisKeys(testEmail);

      const response = await request(app)
        .post("/v1/auth/login")
        .send({
          email: testEmail,
          password: testPassword,
        });

      expect(response.status).toBe(200);
      expect(response.body.message).toContain("verification code");

      // Verify OTP is present in Redis
      const otpVal = await redisClient.get(`otp:${testEmail}`);
      expect(otpVal).not.toBeNull();
    });

    it("completes 2FA login with valid OTP, returns accessToken and sets session cookies", async () => {
      const rawOtp = await redisClient.get(`otp:${testEmail}`);
      const otp = JSON.parse(rawOtp!);

      const response = await request(app)
        .post("/v1/auth/verify-otp")
        .send({
          email: testEmail,
          otp,
        });

      expect(response.status).toBe(200);
      expect(response.body.accessToken).toBeDefined();
      accessToken = response.body.accessToken;

      const cookies = response.headers["set-cookie"];
      expect(cookies).toBeDefined();
      sessionCookie = cookies as unknown as string[];
    });

    it("fetches authenticated user profile via /v1/auth/me", async () => {
      const response = await request(app)
        .get("/v1/auth/me")
        .set("Authorization", `Bearer ${accessToken}`)
        .set("Cookie", sessionCookie);

      expect(response.status).toBe(200);
      expect(response.body.email).toBe(testEmail);
      expect(response.body.firstName).toBe("John");
    });

    it("logs out user and revokes session", async () => {
      const response = await request(app)
        .post("/v1/auth/logout")
        .set("Authorization", `Bearer ${accessToken}`)
        .set("Cookie", sessionCookie);

      expect(response.status).toBe(200);
      expect(response.body.message).toContain("Logged out");
    });

    it("rejects subsequent requests to protected routes after logout", async () => {
      const response = await request(app)
        .get("/v1/auth/me")
        .set("Authorization", `Bearer ${accessToken}`);

      expect(response.status).toBe(401);
    });
  });
});
