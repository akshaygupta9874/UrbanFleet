import dotenv from "dotenv";
dotenv.config();

import http from "http";

import connectDB from "./config/db.config.js";
import { connectRedis, disconnectRedis } from "./redis/client.js";
import { createApp } from "./app.js";
import { initializeWebSocketServer } from "./sockets/socket.js";
import { startPaymentReconciliationJob } from "./payment/jobs/payment-reconciliation.job.js";

const PORT = Number(process.env.PORT) || 3000;

let stopReconciliation: (() => void) | undefined;

export async function startServer(port = PORT) {
  await connectRedis();
  await connectDB();

  stopReconciliation = startPaymentReconciliationJob();

  const server = http.createServer(createApp());

  initializeWebSocketServer(server);

  await new Promise<void>((resolve) => {
    server.listen(port, resolve);
  });

  return server;
}

async function shutdown(server: http.Server) {
  console.log("🛑 Shutting down server...");

  // Stop background jobs first
  stopReconciliation?.();

  // Stop accepting new HTTP connections
  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
      } else {
        resolve();
      }
    });
  });

  // Close Redis after no background job can use it
  await disconnectRedis();

  console.log("✅ Server shutdown complete");
}

if (process.env.NODE_ENV !== "test") {
  startServer()
    .then((server) => {
      const address = server.address();

      const boundPort =
        typeof address === "object" && address
          ? address.port
          : PORT;

      console.log(
        `🚀 Backend running on http://localhost:${boundPort}`
      );

      const stop = () => {
        void shutdown(server).finally(() => {
          process.exit(0);
        });
      };

      process.once("SIGINT", stop);
      process.once("SIGTERM", stop);
    })
    .catch((error) => {
      console.error("Failed to start application:", error);
      process.exit(1);
    });
}