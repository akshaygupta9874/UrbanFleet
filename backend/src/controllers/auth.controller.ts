import { Request, Response } from "express";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import asyncTryCatchHandler from "../middlewares/TryCatch.js";
import { ForgotPasswordSchema, ResendOtpSchema, ResendVerificationEmailSchema, ResetPasswordSchema, UserLoginSchema, UserRegistrationSchema } from "../zodSchemas/user.schema.js";
import { redisClient } from "../redis/client.js";
import { sendOtpEmail, sendResetPasswordEmail, sendVerifyEmail } from "../config/sendMail.config.js";
import { AuthenticatedRequest } from "../middlewares/auth.middleware.js";
import { generateAccessToken, revokeRefreshToken, rotateRefreshToken, verifyRefreshToken } from "../utils/generateToken.js";
import { generateCSRFToken, refreshCSRFToken, revokeCSRFToken } from "../middlewares/csrfMiddleware.js";
import UserModel from "../models/user.model.js";
import { getCookieOptions, getCsrfCookieOptions } from "../utils/cookie.js";
import { destroySession } from "../middlewares/session.middleware.js";

async function claimEmailRateLimit(key: string): Promise<boolean> {
    const result = await redisClient.set(key, "1", {
        NX: true, //Only set the key if it DOES NOT already exist.
        EX: 60, //Expire this key automatically after 60 seconds.
    });
    return result === "OK";
}

export const userRegistrationController = asyncTryCatchHandler(
    async (request: Request, response: Response) => {
        const validatedData = UserRegistrationSchema.safeParse(request.body);
        if (!validatedData.success) {
            return response.status(400).json({
                message: "Please ensure your password contains at least one uppercase letter, one lowercase letter, and one digit, and check all registration details."
            })
        }
        const { firstName, lastName, email, password } = validatedData.data;

        const rateLimitKey = `register-rate-limit:${request.ip}:${email}`;

        if (!await claimEmailRateLimit(rateLimitKey)) {
            return response.status(429).json(
                {
                    message: "Too many attempts. Please try again later."
                }
            )
        }
        const existingUser = await UserModel.findOne({
            email: email
        })

        if (existingUser) {
            return response.status(400).json(
                {
                    message: "This email is already registered. Please sign in or use another email."
                }
            )
        }
        if (await redisClient.get(`verify:email:${email}`)) {
            return response.status(400).json(
                {
                    message: "A verification link has already been sent to this email. Please check your inbox."
                }
            )
        }
        const hashedPassword = await bcrypt.hash(password, 12);
        const verifyToken = crypto.randomBytes(32).toString("hex");
        const verifyKey = `verify:${verifyToken}`

        const dataToStore = JSON.stringify({
            firstName,
            lastName,
            email,
            password: hashedPassword
        })
        //store the data to store in redis using a verify key which is built using token...so that the data can be fetched from the token while verification..
        await redisClient.set(
            verifyKey,
            dataToStore,
            {
                EX: 300
            }
        )
        //also we are storing the same data to store using the key which contains just the email . now when the user clicks the resend verification email the user has only the email to we can easily retrieve the data from redis .... no need to ask from user again ..
        await redisClient.set(
            `verify:email:${email}`,
            dataToStore,
            {
                EX: 300
            }
        )

        await sendVerifyEmail({ email: email, token: verifyToken });

        response.status(200).json({
            message: "A verification link has been sent to your email. Please check your inbox."
        })
    }
)




export const userLoginController = asyncTryCatchHandler(
    async (request: Request, response: Response) => {
        const validatedData = UserLoginSchema.safeParse(request.body);
        if (!validatedData.success) {
            return response.status(400).json({
                message: "Please enter a valid email and password."
            })
        }
        const { email, password } = validatedData.data;

        const rateLimitKey = `login-rate-limit:${request.ip}:${email}`;

        if (!await claimEmailRateLimit(rateLimitKey)) {
            return response.status(429).json(
                {
                    message: "Too many attempts. Please try again later."
                }
            )
        }

        const userFound = await UserModel.findOne({
            email: email
        }).select("+password")

        if (!userFound) {
            return response.status(400).json(
                {
                    message: "Invalid email or password."
                }
            )
        }
        const isPasswordMatched = await userFound.comparePassword(password);

        if (!isPasswordMatched) {
            return response.status(400).json(
                {
                    message: "Invalid email or password."
                }
            )
        }

        const otp = crypto.randomInt(100000, 1000000).toString();
        const otpJSON = JSON.stringify(otp)
        const otpKey = `otp:${email}`
        await redisClient.set(otpKey, otpJSON, { EX: 300 })

        await sendOtpEmail({ email, otp, expiresInMinutes: 5 })

        response.status(200).json({
            message: "A verification code has been sent to your email."
        })
    }
)

export const forgotPasswordController = asyncTryCatchHandler(
    async (request: Request, response: Response) => {
        const validatedData = ForgotPasswordSchema.safeParse(request.body);
        if (!validatedData.success) {
            return response.status(400).json({
                message: "Please enter a valid email address."
            })
        }

        const { email } = validatedData.data;
        const rateLimitKey = `forgot-password-rate-limit:${request.ip}:${email}`;

        if (!await claimEmailRateLimit(rateLimitKey)) {
            return response.status(429).json({
                message: "Too many attempts. Please try again later."
            });
        }

        const userFound = await UserModel.findOne({ email });

        if (!userFound) {
            return response.status(200).json({
                message: "If an account exists for this email, a password reset link has been sent."
            });
        }

        const resetToken = crypto.randomBytes(32).toString("hex");
        const resetKey = `reset-password:${resetToken}`;

        await redisClient.set(resetKey, JSON.stringify({ email }), { EX: 15 * 60 });
        await sendResetPasswordEmail({ email, token: resetToken });
        response.status(200).json({
            message: "If an account exists for this email, a password reset link has been sent."
        });
    }
);

export const resetPasswordController = asyncTryCatchHandler(
    async (request: AuthenticatedRequest, response: Response) => {
        const validatedData = ResetPasswordSchema.safeParse(request.body);
        if (!validatedData.success) {
            return response.status(400).json({
                message: "Please provide a valid password containing at least one uppercase letter, one lowercase letter, and one digit."
            });
        }

        const { token, newPassword } = validatedData.data;
        const resetKey = `reset-password:${token}`;
        const resetDataJSON = await redisClient.get(resetKey);

        if (!resetDataJSON) {
            return response.status(400).json({
                message: "This password reset link is invalid or has expired."
            });
        }

        const { email } = JSON.parse(resetDataJSON);
        const userFound = await UserModel.findOne({ email });

        if (!userFound) {
            return response.status(404).json({
                message: "This password reset link is invalid or has expired."
            });
        }

        const hashedPassword = await bcrypt.hash(newPassword, 12);
        await UserModel.updateOne({ _id: userFound._id }, { password: hashedPassword });
        await revokeRefreshToken(userFound._id.toString(), response, request.cookies["sessionId"] ?? undefined);
        await redisClient.del(`user:${userFound._id.toString()}`);
        await redisClient.del(resetKey);

        response.status(200).json({
            message: "Password reset successfully"
        });
    }
);

export const resendVerificationEmailController = asyncTryCatchHandler(
    async (request: Request, response: Response) => {
        const validatedData = ResendVerificationEmailSchema.safeParse(request.body);
        if (!validatedData.success) {
            return response.status(400).json({
                message: "Please provide a valid email address."
            });
        }

        const { email } = validatedData.data;
        const rateLimitKey = `resend-verification-rate-limit:${request.ip}:${email}`;

        if (!await claimEmailRateLimit(rateLimitKey)) {
            return response.status(429).json({
                message: "Too many attempts. Please try again later."
            });
        }

        const existingUser = await UserModel.findOne({ email });
        if (existingUser) {
            return response.status(409).json({
                message: "We couldn't resend the verification email. Please try again later."
            });
        }

        const pendingDataJSON = await redisClient.get(`verify:email:${email}`);
        if (!pendingDataJSON) {
            return response.status(400).json({
                message: "We couldn't resend the verification email. Please try again later."
            });
        }

        const verifyToken = crypto.randomBytes(32).toString("hex");

        await redisClient.set(`verify:${verifyToken}`, pendingDataJSON, { EX: 300 });
        await redisClient.set(`verify:email:${email}`, pendingDataJSON, { EX: 300 });
        await sendVerifyEmail({ email, token: verifyToken });
        response.status(200).json({
            message: "Verification email resent successfully"
        });
    }
);

export const resendOtpController = asyncTryCatchHandler(
    async (request: Request, response: Response) => {
        const validatedData = ResendOtpSchema.safeParse(request.body);
        if (!validatedData.success) {
            return response.status(400).json({
                message: "Please provide a valid email address."
            });
        }

        const { email, password } = validatedData.data;
        const rateLimitKey = `resend-otp-rate-limit:${request.ip}:${email}`;

        if (!await claimEmailRateLimit(rateLimitKey)) {
            return response.status(429).json({
                message: "Too many attempts. Please try again later."
            });
        }

        const userFound = await UserModel.findOne({ email }).select("+password");
        if (!userFound) {
            return response.status(400).json({
                message: "We couldn't resend the verification code. Please try again later. or check the credentials"
            });
        }

        const passwordMatched = await bcrypt.compare(password, userFound.password);
        if (!passwordMatched) {
            return response.status(401).json(
                {
                    message: "We couldn't resend the verification code. Please try again later. or check the credentials"
                }
            )
        }

        const otp = crypto.randomInt(100000, 1000000).toString();
        const otpJSON = JSON.stringify(otp);
        const otpKey = `otp:${email}`;

        await redisClient.set(otpKey, otpJSON, { EX: 300 });
        await sendOtpEmail({ email, otp, expiresInMinutes: 5 });
        response.status(200).json({
            message: "OTP resent successfully"
        });
    }
);

export const myProfile = asyncTryCatchHandler(async (request: AuthenticatedRequest, response: Response) => {
    const userId = request.userId;

    if (!userId) {
        return response.status(401).json({ message: "Unauthorized" });
    }

    const cachedUser = await redisClient.get(`user:${userId}`);
    if (cachedUser) {
        try {
            return response.json(JSON.parse(cachedUser));
        } catch {
            await redisClient.del(`user:${userId}`);
        }
    }

    const user = await UserModel.findById(userId).select("-password");
    if (!user) {
        return response.status(404).json({ message: "User not found" });
    }

    await redisClient.set(`user:${userId}`, JSON.stringify(user), {
        EX: 15 * 60
    });
    return response.json(user);
})

export const refreshToken = asyncTryCatchHandler(
    async (request: AuthenticatedRequest, response: Response) => {
        const refreshToken = request.cookies.refreshToken;

        if (!refreshToken) {
            return response.status(403).json({
                message: "Please provide refresh token",
            });
        }

        const userId = await verifyRefreshToken(
            refreshToken,
            request.cookies["sessionId"]
        );

        if (!userId) {
            return response.status(401).json({
                message: "Invalid refresh token",
            });
        }

        await revokeRefreshToken(userId, response, request.cookies["sessionId"]);
        await rotateRefreshToken(userId, response, request.cookies["sessionId"]);
        await refreshCSRFToken(userId, response);

        const { accessToken } = await generateAccessToken(
            userId,
            request.cookies["sessionId"]
        );

        const user = await UserModel.findById(userId).select("-password");

        if (!user) {
            return response.status(404).json({
                message: "User not found",
            });
        }

        return response.status(200).json({
            message: "Token refreshed successfully.",
            user,
            accessToken,
        });
    }
);

export const userLogoutController = asyncTryCatchHandler(
    async (request: AuthenticatedRequest, response: Response) => {
        const userId = request.userId;

        if (!userId) {
            return response.status(401).json({
                message: "Unauthorized",
            });
        }

        const currentSessionID = request.cookies["sessionId"];
        await revokeRefreshToken(userId, response, currentSessionID);
        await redisClient.del(`user:${userId}`);
        response.clearCookie("sessionId", getCookieOptions())
        response.clearCookie("refreshToken", getCookieOptions());
        response.clearCookie("csrfToken", getCsrfCookieOptions());

        destroySession(userId,request.cookies["sessionId"],response);
        return response.status(200).json({
            success: true,
            message: "Logged out successfully",
        });
    }
);

export const refreshCSRF = asyncTryCatchHandler(async (request: AuthenticatedRequest, response: Response) => {
    const userId = request.userId;
    if (!userId) {
        return response.status(401).json({
            message: "User Not Authenticated"
        })
    }
    await revokeCSRFToken(userId);
    const newCSRFToken = await generateCSRFToken(userId, response)
    return response.status(200).json(
        {
            message: "CSRF Token Refreshed",
            csrfToken: newCSRFToken
        }
    )
})
