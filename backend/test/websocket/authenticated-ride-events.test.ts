import http from "node:http";
import crypto from "node:crypto";
import { once } from "node:events";
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
import { prisma } from "../../src/db/client.js";
import { UserRole, VerificationStatus, VehicleCategory } from "@prisma/client";
import {
  connectRedis,
  disconnectRedis,
} from "../../src/redis/client.js";
import { DriverEvents } from "../../src/sockets/event.constants.js";
import { getDriverLocation } from "../../src/redis/services/geo.service.js";

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

describe("WebSocket Real-Time Gateway & Authenticated Lifecycle", () => {
  let server: http.Server | undefined;
  let driverUserId: string;
  let driverId: string;
  let vehicleId: string;
  let riderUserId: string;

  beforeAll(async () => {
    await connectRedis();
  });

  afterAll(async () => {
    await disconnectRedis();
  });

  beforeEach(async () => {
    const timestamp = Date.now();

    // 1. Create Driver User & Vehicle in PostgreSQL
    const driverUser = await prisma.user.create({
      data: {
        firstName: "Socket",
        lastName: "Driver",
        email: `socket-driver-${timestamp}-${crypto.randomUUID().slice(0, 8)}@example.com`,
        password: "HashedPassword123",
        roles: [UserRole.DRIVER],
      },
    });
    driverUserId = driverUser.id;

    const driver = await prisma.driver.create({
      data: {
        userId: driverUser.id,
        isVerified: true,
        verificationStatus: VerificationStatus.APPROVED,
      },
    });
    driverId = driver.id;

    const vehicle = await prisma.vehicle.create({
      data: {
        driverId: driver.id,
        type: VehicleCategory.CAR,
        brand: "Skoda",
        model: "Octavia",
        color: "White",
        registrationNumber: `WS-${timestamp}`,
        registrationYear: 2024,
      },
    });
    vehicleId = vehicle.id;

    // 2. Create Rider User in PostgreSQL
    const riderUser = await prisma.user.create({
      data: {
        firstName: "Socket",
        lastName: "Rider",
        email: `socket-rider-${timestamp}-${crypto.randomUUID().slice(0, 8)}@example.com`,
        password: "HashedPassword123",
        roles: [UserRole.RIDER],
      },
    });
    riderUserId = riderUser.id;

    // 3. Initialize HTTP & WebSocket Server
    const testServer = http.createServer(createApp());
    server = testServer;
    initializeWebSocketServer(testServer);

    await new Promise<void>((resolve, reject) => {
      testServer.once("error", reject);
      testServer.listen(0, resolve);
    });
  });

  let activeClients: WebSocket[] = [];

  function createTestClient(url: string): WebSocket {
    const ws = new WebSocket(url);
    activeClients.push(ws);
    return ws;
  }

  afterEach(async () => {
    for (const ws of activeClients) {
      try {
        if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
          ws.terminate();
        }
      } catch (err) {
        void err;
      }
    }
    activeClients = [];

    if (server) {
      await closeServer(server);
      server = undefined;
    }

    if (vehicleId) await prisma.vehicle.deleteMany({ where: { id: vehicleId } });
    if (driverId) await prisma.driver.deleteMany({ where: { id: driverId } });
    if (driverUserId) await prisma.user.deleteMany({ where: { id: driverUserId } });
    if (riderUserId) await prisma.user.deleteMany({ where: { id: riderUserId } });
  });

  it("rejects a WebSocket connection without a valid token (close code 1011)", async () => {
    if (!server) throw new Error("Test server was not initialized");
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Expected TCP listener");

    const client = createTestClient(`ws://127.0.0.1:${address.port}?token=invalid-token`);
    const code = await waitForSocketClose(client);

    expect(code).toBe(1011);
  });

  it("rejects a WebSocket connection with a token belonging to a non-existent user", async () => {
    if (!server) throw new Error("Test server was not initialized");
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Expected TCP listener");

    const nonExistentToken = jwt.sign(
      {
        id: crypto.randomUUID(),
        sessionId: `session-${crypto.randomUUID()}`,
        role: [UserRole.DRIVER],
      },
      process.env.JWT_ACCESS_SECRET!
    );

    const client = createTestClient(
      `ws://127.0.0.1:${address.port}?token=${encodeURIComponent(nonExistentToken)}`
    );
    const code = await waitForSocketClose(client);

    expect(code).toBe(1011);
  });

  it("accepts an authenticated driver connection when token is valid", async () => {
    if (!server) throw new Error("Test server was not initialized");
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Expected TCP listener");

    const token = jwt.sign(
      {
        id: driverUserId,
        sessionId: `socket-session-${crypto.randomUUID()}`,
        role: [UserRole.DRIVER],
      },
      process.env.JWT_ACCESS_SECRET!
    );

    const client = createTestClient(
      `ws://127.0.0.1:${address.port}?token=${encodeURIComponent(token)}`
    );

    await once(client, "open");
    expect(client.readyState).toBe(WebSocket.OPEN);

    // Ensure connection remains stable
    await new Promise<void>((resolve) => setTimeout(resolve, 100));
    expect(client.readyState).toBe(WebSocket.OPEN);

    client.close();
    await once(client, "close");
  });

  it("accepts an authenticated rider connection when token is valid", async () => {
    if (!server) throw new Error("Test server was not initialized");
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Expected TCP listener");

    const token = jwt.sign(
      {
        id: riderUserId,
        sessionId: `socket-session-${crypto.randomUUID()}`,
        role: [UserRole.RIDER],
      },
      process.env.JWT_ACCESS_SECRET!
    );

    const client = createTestClient(
      `ws://127.0.0.1:${address.port}?token=${encodeURIComponent(token)}`
    );

    await once(client, "open");
    expect(client.readyState).toBe(WebSocket.OPEN);

    client.close();
    await once(client, "close");
  });

  it("processes driver location updates over WebSocket and persists coordinates in Redis GEO", async () => {
    if (!server) throw new Error("Test server was not initialized");
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Expected TCP listener");

    const token = jwt.sign(
      {
        id: driverUserId,
        sessionId: `socket-session-${crypto.randomUUID()}`,
        role: [UserRole.DRIVER],
      },
      process.env.JWT_ACCESS_SECRET!
    );

    const client = createTestClient(
      `ws://127.0.0.1:${address.port}?token=${encodeURIComponent(token)}`
    );

    await once(client, "open");

    // Allow server-side authenticateSocket to finish registering handlers
    await new Promise<void>((resolve) => setTimeout(resolve, 100));

    // Send driver location update over WebSocket
    const locationPayload = {
      event: DriverEvents.UPDATE_LOCATION,
      data: {
        latitude: 12.971598,
        longitude: 77.594566,
      },
    };
    client.send(JSON.stringify(locationPayload));

    // Poll for coordinates in Redis GEO
    let savedGeo: { latitude: number; longitude: number } | null = null;
    for (let i = 0; i < 20; i++) {
      savedGeo = await getDriverLocation(driverId);
      if (savedGeo) break;
      await new Promise<void>((resolve) => setTimeout(resolve, 50));
    }

    expect(savedGeo).not.toBeNull();
    expect(savedGeo?.latitude).toBeCloseTo(12.971598, 3);
    expect(savedGeo?.longitude).toBeCloseTo(77.594566, 3);

    client.close();
    await once(client, "close");
  });
});