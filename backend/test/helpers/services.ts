import mongoose from "mongoose";

import { redisClient } from "../../src/redis/client.js";

export async function assertMongoReady(): Promise<void> {
  if (mongoose.connection.readyState === 1) {
    return;
  }

  await mongoose.connect(
    process.env.MONGODB_URI ??
      "mongodb://localhost:27017/?replicaSet=rs0",
    {
      dbName: process.env.MONGODB_DB_NAME ?? "UrbanFleet",
      serverSelectionTimeoutMS: 5000,
    }
  );
}

export async function assertRedisReady(): Promise<void> {
  if (!redisClient.isOpen) {
    await redisClient.connect();
  }

  await redisClient.ping();
}

export async function assertTestInfrastructureReady(): Promise<void> {
  await assertMongoReady();
  await assertRedisReady();
}
