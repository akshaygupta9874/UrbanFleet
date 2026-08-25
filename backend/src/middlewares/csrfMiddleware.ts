import crypto from "crypto";
import { redisClient } from "../redis/client.js";
import { NextFunction, Request, RequestHandler, Response } from "express";
import { AuthenticatedRequest } from "./auth.middleware.js";
import { getCsrfCookieOptions } from "../utils/cookie.js";


export const generateCSRFToken = async (userId: string, response: Response)=>{
    const csrfToken = crypto.randomBytes(32).toString("hex");
    const csrfKey = `csrf:${userId}`;
    await redisClient.setEx(csrfKey, 24*60*60, csrfToken);

    response.cookie("csrfToken", csrfToken, getCsrfCookieOptions({
        maxAge : 24 * 60 * 60 * 1000
    }))
    return csrfToken;
}

export const verifyCsrfToken : RequestHandler = async (request: Request, response: Response, next: NextFunction) => {
    const authRequest = request as AuthenticatedRequest;

    try {
        if (authRequest.method == "GET") {
            return next()
        }
        const userId = authRequest.userId;

        if (!userId) {
            return response.status(403).json(
                {
                    message: "user not found /not authenticated"
                }
            )
        }

        const clientToken = authRequest.headers["x-csrf-token"] || authRequest.headers["x-xsrf-token"] || authRequest.headers["csrf-token"]

        if (!clientToken) {
            return response.status(403).json(
                {
                    message: "CSRF token missing",
                    code: "CSRF_TOKEN_MISSING"
                }
            )
        }
        const csrfKey = `csrf:${userId}`;
        const storedCSRFToken = await redisClient.get(csrfKey);
        if (!storedCSRFToken) {
            return response.status(403).json(
                {
                    message: "CSRF Token expired",
                    code: "CSRF_TOKEN_EXPIRED"
                }
            )
        }

        if (clientToken != storedCSRFToken) {
            return response.status(403).json(
                {
                    message: "CSRF Token INVALID",
                    code: "CSRF_TOKEN_INVALID"
                }
            )
        }

        next();

    }catch(err){
        console.log("CSRF verification failed " + err);
        return response.status(500).json(
            {
                message : "csrf token verification failed",
                code : "CSRF_VERIFY_FAILED"

            }
        )
    }

}

export const revokeCSRFToken = async (userId : string) => {
     const csrfKey = `csrf:${userId}`;
     await redisClient.del(csrfKey)
     
}

export const refreshCSRFToken = async (userId:string , response : Response) => {
    await revokeCSRFToken(userId)
    return await generateCSRFToken(userId,response)
}