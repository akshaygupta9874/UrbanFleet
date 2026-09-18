import { createClient } from "redis";

const redisUrl = process.env.REDIS_URL;

if (!redisUrl) {
    throw new Error("REDIS_URL is required.");
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
    if (!redisClient.isOpen) await redisClient.connect();
}

export async function disconnectRedis() {
    if (redisClient.isOpen) await redisClient.quit();
}

