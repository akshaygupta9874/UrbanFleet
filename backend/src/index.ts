import dotenv from "dotenv";
dotenv.config();

import http from "http";
import mongoose from "mongoose"; // Assuming you use Mongoose, adjust if using Prisma/pg
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
  console.log("🛑 Shutting down server gracefully...");

  // 1. Stop background jobs
  if (stopReconciliation) stopReconciliation();

  // 2. Stop accepting new HTTP & WebSocket connections
  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) reject(error);
      else resolve();
    });
  });

  // 3. Safely close database and cache connections
  await disconnectRedis();
  if (mongoose.connection.readyState === 1) {
    await mongoose.disconnect();
  }

  console.log("✅ Server shutdown complete");
}

// --- Start the Application ---
startServer()
  .then((server) => {
    const address = server.address();
    const boundPort = typeof address === "object" && address ? address.port : PORT;

    console.log(`🚀 Backend running on http://localhost:${boundPort} in ${process.env.NODE_ENV} mode`);

    // Graceful Shutdown Event Listeners
    const exitHandler = async () => {
      try {
        await shutdown(server);
        process.exit(0);
      } catch (error) {
        console.error("❌ Error during shutdown:", error);
        process.exit(1);
      }
    };

    process.on("SIGINT", exitHandler);  // Ctrl+C in terminal
    process.on("SIGTERM", exitHandler); // Docker/PM2 shutdown signal
  })
  .catch((error) => {
    console.error("❌ Failed to start application:", error);
    process.exit(1);
  });

// --- Global Safety Nets ---
// Prevents your server from silently hanging if a Promise fails without a catch block
process.on("unhandledRejection", (reason) => {
  console.error("🚨 UNHANDLED REJECTION! Shutting down...", reason);
  process.exit(1);
});

// Catches synchronous programming errors (e.g., trying to read a property of undefined)
process.on("uncaughtException", (error) => {
  console.error("🚨 UNCAUGHT EXCEPTION! Shutting down...", error);
  process.exit(1); 
});