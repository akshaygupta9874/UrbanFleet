import http from "node:http";
import { once } from "node:events";
import { afterEach, describe, expect, it } from "vitest";
import { WebSocket } from "ws";
import { createApp } from "../../src/app.js";
import { initializeWebSocketServer } from "../../src/sockets/socket.js";

describe("WebSocket authentication", () => {
  let server: http.Server | undefined;

  afterEach(async () => {
    if (server?.listening) await new Promise<void>((resolve) => server?.close(() => resolve()));
  });

  it("closes a connection that does not provide an access token", async () => {
    server = http.createServer(createApp());
    initializeWebSocketServer(server);
    await new Promise<void>((resolve) => server?.listen(0, resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Expected TCP listener");

    const client = new WebSocket(`ws://127.0.0.1:${address.port}`);
    const [code] = await once(client, "close") as [number];
    expect(code).toBe(1011);
  });
});
