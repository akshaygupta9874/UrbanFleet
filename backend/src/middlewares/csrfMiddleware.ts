import crypto from "crypto";
import { Response, NextFunction } from "express";
import { redisClient } from "../redis/client.js";
import { AuthenticatedRequest } from "./auth.middleware.js";
import { getCsrfCookieOptions } from "../utils/cookie.js";
import { AppError } from "../utils/AppError.js";
import asyncHandler from "./asyncHandler.js";

// Fetch from env, default to 24 hours (86400 seconds) if missing
const CSRF_EXPIRE_SECONDS = process.env.CSRF_TOKEN_EXPIRE_SECONDS 
    ? parseInt(process.env.CSRF_TOKEN_EXPIRE_SECONDS, 10) 
    : 24 * 60 * 60;

export const generateCSRFToken = async (userId: string, response: Response) => {
    const csrfToken = crypto.randomBytes(32).toString("hex");
    const csrfKey = `csrf:${userId}`;
    
    // Use the env variable for Redis expiration
    await redisClient.setEx(csrfKey, CSRF_EXPIRE_SECONDS, csrfToken);

    // Multiply by 1000 because cookie maxAge requires milliseconds
    response.cookie("csrfToken", csrfToken, getCsrfCookieOptions({
        maxAge: CSRF_EXPIRE_SECONDS * 1000 
    }));
    
    return csrfToken;
};

export const verifyCsrfToken = asyncHandler(async (request : AuthenticatedRequest, response : Response, next : NextFunction ) => {
    // 1. Skip CSRF checks for safe HTTP methods (GET, HEAD, OPTIONS)
    if (["GET", "HEAD", "OPTIONS"].includes(request.method)) {
        return next();
    }

    // 2. Ensure user is authenticated
    const userId = request.userId;
    if (!userId) {
        throw new AppError("User not found / not authenticated", 403, "UNAUTHORIZED");
    }

    // 3. Extract token from headers
    const clientToken = 
        request.headers["x-csrf-token"] || 
        request.headers["x-xsrf-token"] || 
        request.headers["csrf-token"];

    if (!clientToken) {
        throw new AppError("CSRF token missing", 403, "CSRF_TOKEN_MISSING");
    }

    // 4. Verify token against Redis
    const storedCSRFToken = await redisClient.get(`csrf:${userId}`);
    
    if (!storedCSRFToken) {
        throw new AppError("CSRF Token expired", 403, "CSRF_TOKEN_EXPIRED");
    }

    if (clientToken !== storedCSRFToken) {
        throw new AppError("CSRF Token INVALID", 403, "CSRF_TOKEN_INVALID");
    }

    // 5. Proceed if valid
    next();
});

export const revokeCSRFToken = async (userId: string) => {
    await redisClient.del(`csrf:${userId}`);
};

export const refreshCSRFToken = async (userId: string, response: Response) => {
    await revokeCSRFToken(userId);
    return await generateCSRFToken(userId, response);
};