import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../../src/app.js";

describe("HTTP application", () => {
  const app = createApp();

  it("exposes a dependency-free health endpoint", async () => {
    const response = await request(app).get("/healthz");
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: "ok" });
    expect(response.headers["x-content-type-options"]).toBe("nosniff");
  });

  it("applies security headers to webhook responses while preserving raw-body handling", async () => {
    const response = await request(app)
      .post("/v1/webhooks/razorpay")
      .set("content-type", "application/json")
      .send("{}");

    expect(response.status).toBe(400);
    expect(response.body.code).toBe("INVALID_WEBHOOK_REQUEST");
    expect(response.headers["x-content-type-options"]).toBe("nosniff");
  });

  it("rejects protected ride routes without an access token", async () => {
    const response = await request(app).get("/v1/ride/current");
    expect(response.status).toBe(401);
  });
});
