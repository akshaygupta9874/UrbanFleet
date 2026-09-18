import http from "node:http";
import crypto from "node:crypto";
import { once } from "node:events";
import mongoose from "mongoose";
import jwt from "jsonwebtoken";
import { WebSocket } from "ws";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from "vitest";

import { createApp } from "../../src/app.js";
import { initializeWebSocketServer } from "../../src/sockets/socket.js";
import UserModel, { UserRole } from "../../src/models/user.model.js";
import { DriverModel } from "../../src/models/driver.model.js";
import connectDB from "../../src/config/db.config.js";
import {
  connectRedis,
  disconnectRedis,
} from "../../src/redis/client.js";

async function waitForSocketClose(socket: WebSocket): Promise<number> {
  const [code] = await once(socket, "close");
  return Number(code);
}

async function closeServer(server: http.Server): Promise<void> {
  if (!server.listening) {
    return;
  }

  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
}

describe("WebSocket authenticated behavior", () => {
  let server: http.Server | undefined;
  let userId: string;
  let driverId: string;

  beforeAll(async () => {
    await connectDB();
    await connectRedis();
  });

  afterAll(async () => {
    await disconnectRedis();
    await mongoose.disconnect();
  });

  beforeEach(async () => {
    const user = await UserModel.create({
      firstName: "Socket",
      lastName: "Tester",
      email: `socket-${crypto.randomUUID()}@example.com`,
      password: "Password1",
      role: [UserRole.DRIVER],
    });

    const driver = await DriverModel.create({
      user: user._id,

      profilePhoto: {
        url: "https://example.com/profile.png",
        publicId: "profile",
      },

      vehicleImages: {
        front: "",
        back: "",
        left: "",
        right: "",
        interior: "",
      },

      vehicle: {
        type: "CAR",
        brand: "Test",
        model: "Model",
        color: "Black",
        registrationNumber: `ABC-${crypto.randomUUID()}`,
        registrationYear: 2024,
      },

      documents: {
        drivingLicense: {
          number: `DL-${crypto.randomUUID()}`,
          expiryDate: new Date(),
          frontImage: "",
          backImage: "",
          verified: true,
        },

        registrationCertificate: {
          number: `RC-${crypto.randomUUID()}`,
          image: "",
          verified: true,
        },

        insurance: {
          number: `INS-${crypto.randomUUID()}`,
          expiryDate: new Date(),
          image: "",
          verified: true,
        },

        pollutionCertificate: {
          expiryDate: new Date(),
          image: "",
        },
      },

      isVerified: true,
      verificationStatus: "APPROVED",
    });

    userId = user._id.toString();
    driverId = driver._id.toString();

    const testServer = http.createServer(createApp());

    server = testServer;

    initializeWebSocketServer(testServer);

    await new Promise<void>((resolve, reject) => {
      testServer.once("error", reject);
      testServer.listen(0, resolve);
    });
  });

  afterEach(async () => {
    if (server) {
      await closeServer(server);
      server = undefined;
    }

    await DriverModel.deleteOne({
      _id: driverId,
    });

    await UserModel.deleteOne({
      _id: userId,
    });
  });

  it("rejects a WebSocket connection without a valid token", async () => {
    if (!server) {
      throw new Error("Test server was not initialized");
    }

    const address = server.address();

    if (!address || typeof address === "string") {
      throw new Error("Expected TCP listener");
    }

    const client = new WebSocket(
      `ws://127.0.0.1:${address.port}?token=invalid`,
    );

    const code = await waitForSocketClose(client);

    expect(code).toBe(1011);
  });

  it("accepts an authenticated driver connection when token is valid", async () => {
    if (!server) {
      throw new Error("Test server was not initialized");
    }

    const address = server.address();

    if (!address || typeof address === "string") {
      throw new Error("Expected TCP listener");
    }

    const token = jwt.sign(
      {
        id: userId,
        sessionId: `socket-session-${crypto.randomUUID()}`,
        role: [UserRole.DRIVER],
      },
      process.env.JWT_ACCESS_SECRET!,
    );

    const client = new WebSocket(
      `ws://127.0.0.1:${address.port}?token=${encodeURIComponent(token)}`,
    );

    await once(client, "open");

    expect(client.readyState).toBe(WebSocket.OPEN);

    /*
     * Give the server a chance to reject the authenticated socket.
     * A valid connection should remain OPEN.
     */
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 100);
    });

    expect(client.readyState).toBe(WebSocket.OPEN);

    client.close();

    await once(client, "close");
  });
});