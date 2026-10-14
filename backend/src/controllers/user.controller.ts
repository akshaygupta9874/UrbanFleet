import { Request, Response } from "express";
import { AuthenticatedRequest } from "../middlewares/auth.middleware.js";
import { redisClient } from "../redis/client.js";
import UserModel from "../models/user.model.js";
import { removeSessionFromUser } from "../middlewares/session.middleware.js";
import asyncHandler from "../middlewares/asyncHandler.js";

interface userData {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    role: string;
}

export const userProfileController = asyncHandler( async (request: Request, response: Response) => {

    const authRequest = request as AuthenticatedRequest;

    const userId = authRequest.userId;
    if (!userId) {
        return response.status(400).json(
            {
                message: "Authentication error"
            }
        )
    }
    const cachedUserDataKey = `user:${userId}`;
    const user = await redisClient.get(cachedUserDataKey);
    if (!user) {
        const userFound = await UserModel.findById(userId).select("-password");
        if (!userFound) {
            return response.status(404).json(
                {
                    message: "User not Found !! Please Register Yourself"
                }
            )
        }

        await redisClient.setEx(
            cachedUserDataKey,
            15 * 60,
            JSON.stringify(userFound)
        );

        return response.status(200).json(
            {
                message: "User Fetched successfully from database",
                user: userFound
            }
        )
    } else {
        const parsedUser: userData = JSON.parse(user);
        return response.status(200).json({
            message: "User data retrieved from cache",
            user: parsedUser
        });
    }
}
)

export const userSessionsController = asyncHandler(async (request: Request, response: Response) => {
    const authRequest = request as AuthenticatedRequest;
    const userId = authRequest.userId;
    const sessionsKey = `user-sessions:${userId}`;
    const sessions = await redisClient.sMembers(sessionsKey);
    // const parsedSessions: string[] = sessions.map((session) => JSON.parse(session));
    return response.status(200).json(
        {
            message: "User Sessions Fetched Successfully",
            sessions
        }
    )
}
)
export const revokeSessionController = asyncHandler(async (request: Request, response: Response) => {
    const authRequest = request as AuthenticatedRequest;
    const sessionIdToRemove = request.params.sessionId;
    if (!sessionIdToRemove) {
        return response.status(400).json(
            {
                message: "Please Provide a Session Id to remove users session"
            }
        )
    }
    await removeSessionFromUser(authRequest.userId as string, sessionIdToRemove);
    return response.status(200).json(
        {
            message: "the session with the given session id is removed successully"
        }
    )
}

)