import mongoose from "mongoose";

import dns from "node:dns";

dns.setServers(["1.1.1.1", "8.8.8.8"]);

const connectDB: () => Promise<void> = async () => {
  const mongodbUri = process.env.MONGODB_URI;
  const mongodbDbName = process.env.MONGODB_DB_NAME ?? "UrbanFleet";

  if (!mongodbUri) {
    throw new Error("MONGODB_URI is not defined in environment variables.");
  }

  try {
    await mongoose.connect(mongodbUri, {
      dbName: mongodbDbName,
    });

    console.log(`Connected to Mongo DB (${mongodbDbName})`);
  } catch (error) {
    throw error;
  }
};

export default connectDB;
