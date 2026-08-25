import crypto from "crypto";
import { Response } from "express";
import { redisClient } from "../redis/client.js";
import { getRefreshTokenRedisKey } from "../utils/generateToken.js";
import UserModel, { UserRole } from "../models/user.model.js";
import { getCookieOptions } from "../utils/cookie.js";

export const registerSession = async (userId: string, sessionId: string) => {
  const sessionsKey = `user-sessions:${userId}`;
  await redisClient.sAdd(sessionsKey, sessionId);
  await redisClient.expire(sessionsKey, 60 * 60 * 24 * 7);
};

export const revokeUserSessions = async (userId: string) => {
  const sessionsKey = `user-sessions:${userId}`;
  const sessionIds = await redisClient.sMembers(sessionsKey);

  for (const sessionId of sessionIds) {
    await redisClient.del(`session:${sessionId}`);
    await redisClient.del(getRefreshTokenRedisKey(userId, sessionId));
  }

  await redisClient.del(sessionsKey);
};

export const removeSessionFromUser = async (userId: string, sessionId: string) => {
  const user = await UserModel.findById(userId).select("+email");
  if (!user) {
    throw new Error("User not found.");
  }
  await redisClient.sRem(`user-sessions:${userId}`, sessionId); // remove the session from set of sessions...
  await redisClient.del(`session:${sessionId}`);
  await redisClient.del(getRefreshTokenRedisKey(userId, sessionId));
  await redisClient.del(`user:${user.email}`);
  await redisClient.del(`csrf:${userId}`);
};

export async function createSession(
    userId: string,
    role: UserRole[],
    response: Response
): Promise<string> {
    const sessionId = crypto.randomBytes(32).toString("hex");

    await redisClient.set(
        `session:${sessionId}`,
        JSON.stringify({
            userId,
            role,
            createdAt: Date.now(),
        }),
        {
            EX: 60 * 60 * 24 * 7,
        }
    );

    await registerSession(userId, sessionId);

    response.cookie(
        "sessionId",
        sessionId,
        getCookieOptions({
            maxAge: 60 * 60 * 24 * 7 * 1000,
        })
    );

    return sessionId;
}

export async function destroySession(
    userId: string,
    sessionId: string,
    response: Response
): Promise<void> {
    await removeSessionFromUser(userId, sessionId);

    response.clearCookie(
        "sessionId",
        getCookieOptions({
            maxAge: 60 * 60 * 24 * 7 * 1000,
        })
    );
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