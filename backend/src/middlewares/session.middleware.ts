import crypto from "crypto";
import { Response } from "express";
import { redisClient } from "../redis/client.js";
import { getRefreshTokenRedisKey } from "../utils/generateToken.js";
import { UserRole } from "@prisma/client";
import { getCookieOptions } from "../utils/cookie.js";

const SESSION_EXPIRY_SECONDS = 7 * 24 * 60 * 60; // 7 days

export const registerSession = async (userId: string, sessionId: string) => {
    const sessionsKey = `user-sessions:${userId}`;
    await redisClient.sAdd(sessionsKey, sessionId);
    await redisClient.expire(sessionsKey, SESSION_EXPIRY_SECONDS);
};

export const revokeUserSessions = async (userId: string) => {
    const sessionsKey = `user-sessions:${userId}`;
    const sessionIds = await redisClient.sMembers(sessionsKey);

    if (sessionIds.length > 0) {
        // Collect all related keys into a single array
        const keysToDelete = sessionIds.flatMap(sessionId => [
            `session:${sessionId}`,
            getRefreshTokenRedisKey(userId, sessionId)
        ]);

        // Delete all session data and the set itself in one single Redis command
        await redisClient.del([...keysToDelete, sessionsKey]);
    }
};

export const removeSessionFromUser = async (userId: string, sessionId: string) => {
    await Promise.all([
        redisClient.sRem(`user-sessions:${userId}`, sessionId),
        redisClient.del(`session:${sessionId}`),
        redisClient.del(getRefreshTokenRedisKey(userId, sessionId)),
        redisClient.del(`user:${userId}`),
        redisClient.del(`csrf:${userId}`)
    ]);
};

export async function createSession(
    userId: string,
    role: UserRole[],
    response: Response
): Promise<string> {
    const sessionId = crypto.randomBytes(32).toString("hex");

    await redisClient.setEx(
        `session:${sessionId}`,
        SESSION_EXPIRY_SECONDS,
        JSON.stringify({ userId, role, createdAt: Date.now() })
    );

    await registerSession(userId, sessionId);

    response.cookie("sessionId", sessionId, getCookieOptions({ 
        maxAge: SESSION_EXPIRY_SECONDS * 1000 
    }));

    return sessionId;
}

export async function destroySession(
    userId: string,
    sessionId: string,
    response: Response
): Promise<void> {
    await removeSessionFromUser(userId, sessionId);
    response.clearCookie("sessionId", getCookieOptions());
}

export async function regenerateSession(
    userId: string,
    role: UserRole[],
    oldSessionId: string,
    response: Response
): Promise<string> {
    await removeSessionFromUser(userId, oldSessionId);
    return createSession(userId, role, response);
}