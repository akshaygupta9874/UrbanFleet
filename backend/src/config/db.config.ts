import mongoose from "mongoose";
import dns from "node:dns";

dns.setServers(["1.1.1.1", "8.8.8.8"]);

const connectDB = async (): Promise<void> => {
  const { MONGODB_URI, MONGODB_DB_NAME = "UrbanFleet" } = process.env;

  if (!MONGODB_URI) {
    throw new Error("MONGODB_URI is not defined in environment variables.");
  }

  try {
    await mongoose.connect(MONGODB_URI, {
      dbName: MONGODB_DB_NAME,
      serverSelectionTimeoutMS: 10_000,
    });

    console.log(`MongoDB connected successfully — database: ${MONGODB_DB_NAME}`);
  } catch (error) {
    console.error("MongoDB connection failed:", error);
    throw error;
  }
};

export default connectDB;