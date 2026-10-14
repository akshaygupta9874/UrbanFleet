// backend/src/middlewares/auth.middleware.ts
import { NextFunction, Request, Response } from "express";
import jwt, { JwtPayload } from "jsonwebtoken";
import { UserRole } from "@prisma/client";
import { redisClient } from "../redis/client.js";
import { AppError } from "../utils/AppError.js";
import asyncHandler from "./asyncHandler.js";
import { prisma } from "../db/client.js";

export interface AuthenticatedRequest extends Request {
    userId?: string;
    role?: UserRole[];
    driverId?: string;
}

export interface AuthPayload extends JwtPayload {
    id: string;
    sessionId: string;
    role: UserRole[];
}

const ACCESS_TOKEN_SECRET = process.env.JWT_ACCESS_SECRET as string;

if (!ACCESS_TOKEN_SECRET) {
    throw new Error("FATAL ERROR: JWT_ACCESS_SECRET is missing from environment variables.");
}

export const authMiddleware = asyncHandler(async (request: AuthenticatedRequest, response: Response, next: NextFunction) => {
    // 1. Extract Token
    const token = request.headers.authorization?.replace(/^Bearer\s+/i, "") || request.cookies?.accessToken;
    if (!token) {
        throw new AppError("You are not authorized to access this resource.", 401, "UNAUTHORIZED");
    }

    // 2. Verify Token
    let decodedData: AuthPayload;
    try {
        decodedData = jwt.verify(token, ACCESS_TOKEN_SECRET) as AuthPayload;
    } catch (error) {
        throw new AppError("Your token is invalid or expired.", 401, "TOKEN_EXPIRED");
    }

    const { id: userId, sessionId } = decodedData;
    if (!sessionId || !userId) {
        throw new AppError("Your session is invalid. Please sign in again.", 401, "INVALID_SESSION");
    }

    // 3. Validate Session (Concurrent Redis checks)
    const [storedSession, activeSessionIds] = await Promise.all([
        redisClient.get(`session:${sessionId}`),
        redisClient.sMembers(`user-sessions:${userId}`)
    ]);

    if (!storedSession || !activeSessionIds.includes(sessionId)) {
        throw new AppError("Your session is no longer valid. Please sign in again.", 401, "SESSION_EXPIRED");
    }

    const parsedSession = JSON.parse(storedSession);
    if (parsedSession.userId && parsedSession.userId !== userId) {
        throw new AppError("Session mismatch. Please sign in again.", 401, "SESSION_MISMATCH");
    }

    // 4. Fetch User Data (Cache first, then PostgreSQL)
    let userStr = await redisClient.get(`user:${userId}`);
    let user;

    if (!userStr) {
        user = await prisma.user.findUnique({
            where: { id: userId },
            include: { driver: { select: { id: true } } },
        });

        if (!user) throw new AppError("User no longer exists.", 404, "USER_NOT_FOUND");

        userStr = JSON.stringify(user);
        await redisClient.setEx(`user:${userId}`, 15 * 60, userStr);
    } else {
        user = JSON.parse(userStr);
    }

    // 5. Attach payload to Request and proceed
    request.userId = user.id;
    request.role = user.roles;
    if (user.driver?.id) {
        request.driverId = user.driver.id;
    }

    next();
});
