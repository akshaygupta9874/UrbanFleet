import { createClient } from "redis";

const redisUrl = process.env.REDIS_URL;

if (!redisUrl) {
    console.error("Please provide REDIS_URL in your .env file.");
    process.exit(1);
}

export const redisClient = createClient({
    url: redisUrl,
    socket: {
        reconnectStrategy: (retries) => {
            if (retries > 10) {
                console.error("Redis: max reconnect attempts reached, giving up.");
                return new Error("Redis max retries exceeded");
            }
            return Math.min(retries * 200, 5000); // capped exponential backoff
        },
    },
});

redisClient.on("error", (err) => console.error("Redis Client Error:", err));
redisClient.on("connect", () => console.log("Redis: connecting..."));
redisClient.on("ready", () => console.log("Redis: connection ready."));
redisClient.on("reconnecting", () => console.warn("Redis: reconnecting..."));
redisClient.on("end", () => console.warn("Redis: connection closed."));

// node-redis v4 does NOT auto-connect — this is required
export async function connectRedis() {
    try {
        if (!redisClient.isOpen) {
            await redisClient.connect();
        }
    } catch (err) {
        console.error("Failed to connect to Redis:", err);
        process.exit(1);
    }
}

const shutdown = async () => {
    console.log("Redis: shutting down gracefully...");

    try {
        if (redisClient.isOpen) {
            await redisClient.quit();
        }
    } catch (err) {
        console.error("Redis shutdown error:", err);
    } finally {
        process.exit(0);
    }
};
// SIGINT and SIGTERM are Unix signals sent to a running process to tell it to stop. They let your application clean up resources (like Redis, MongoDB, WebSockets, file handles, etc.) before exiting
// Pressing Ctrl + C sends SIGINT.
// SIGTERM is a request to terminate the process.

// It is usually sent by:

// Docker
// Kubernetes
// PM2
// systemd
// Railway
// Render
// Fly.io
// Your operating system.
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);