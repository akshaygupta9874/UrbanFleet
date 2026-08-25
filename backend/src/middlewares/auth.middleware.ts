import { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { redisClient } from "../redis/client.js";
import type { JwtPayload } from "jsonwebtoken";
import UserModel, { UserRole } from "../models/user.model.js";

export interface AuthenticatedRequest extends Request {
    userId?: string;
    role?: UserRole[];
}

const ACCESS_TOKEN_SECRET = process.env.JWT_ACCESS_SECRET as string;

export interface AuthPayload extends JwtPayload {
    id: string;
    sessionId: string;
    role: UserRole[];
}

export async function authMiddleware(
    request: AuthenticatedRequest,
    response: Response,
    next: NextFunction
) {
    const token = request.headers.authorization?.replace(/^Bearer\s+/i, "");

    if (!token) {
        return response.status(401).json({
            message: "You are not authorized to access this resource."
        });
    }
    try {
        if (!ACCESS_TOKEN_SECRET) {
            throw new Error("JWT_SECRET missing");
        }

        const decodedData = jwt.verify(token, ACCESS_TOKEN_SECRET) as AuthPayload;

        if (!decodedData.sessionId || !decodedData.id ) {
            return response.status(401).json({
                message: "Your session has expired. Please sign in again."
            });
        }

        const activeSessionId = decodedData.sessionId;

        if (activeSessionId) {
            const storedSession = await redisClient.get(`session:${activeSessionId}`);
            if (!storedSession) {
                response.clearCookie("refreshToken");
                return response.status(401).json({ message: "Your session is no longer valid. Please sign in again." });
            }

            const activeSessionIds = await redisClient.sMembers(`user-sessions:${decodedData.id}`);
            if (!activeSessionIds.includes(activeSessionId)) {
                response.clearCookie("refreshToken");
                return response.status(401).json({ message: "Your session is no longer valid. Please sign in again." });
            }

            const parsedSession = JSON.parse(storedSession);
            if (parsedSession.userId && parsedSession.userId !== decodedData.id) {
                response.clearCookie("refreshToken");
                return response.status(401).json({ message: "Your session is no longer valid. Please sign in again." });
            }
        }

        const cachedUser = await redisClient.get(`user:${decodedData.id}`);

        if (!cachedUser) {
            const user = await UserModel.findById(decodedData.id).select("-password");

            if (!user) {
                return response.status(404).json({ message: "User no longer exists" });
            }

            await redisClient.setEx(`user:${decodedData.id}`, 15 * 60, JSON.stringify(user));
            request.userId = user._id.toString();
            request.role = user.role;
        } else {
            const user = JSON.parse(cachedUser);

            request.userId = user._id;
            request.role = user.role;
        }
        return next();
    } catch {
        response.clearCookie("refreshToken");
        return response.status(401).json({
            message: "Your session is no longer valid. Please sign in again."
        });
    }
}
