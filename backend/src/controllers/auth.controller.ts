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
import { createSession, revokeUserSessions } from "../middlewares/session.middleware.js";
import { generateToken } from "../utils/generateToken.js";
import { OAuth2Client } from "google-auth-library";

const googleClientId = process.env.GOOGLE_CLIENT_ID;
const googleClient = googleClientId ? new OAuth2Client(googleClientId) : null;

async function claimEmailRateLimit(key: string): Promise<boolean> {
    const result = await redisClient.set(key, "1", {
        NX: true, //Only set the key if it DOES NOT already exist.
        EX: 60, //Expire this key automatically after 60 seconds.
    });
    return result === "OK";
}

/**
 * Signs a user in after a Google ID token has been verified by Google. Google
 * accounts use the same session, refresh-token, and CSRF flow as password
 * accounts, so all protected routes keep working unchanged.
 */
export const googleAuthController = asyncTryCatchHandler(
    async (request: Request, response: Response) => {
        const credential = request.body?.credential;

        if (!googleClient || !googleClientId) {
            return response.status(503).json({ message: "Google sign-in is not configured yet." });
        }
        if (typeof credential !== "string" || !credential) {
            return response.status(400).json({ message: "A Google credential is required." });
        }

        const ticket = await googleClient.verifyIdToken({
            idToken: credential,
            audience: googleClientId,
        });
        const payload = ticket.getPayload();

        if (!payload?.sub || !payload.email || !payload.email_verified) {
            return response.status(401).json({ message: "Google could not verify this account." });
        }

        const email = payload.email.toLowerCase();
        let user = await UserModel.findOne({ email }).select("+password +googleId");

        if (user && user.googleId && user.googleId !== payload.sub) {
            return response.status(409).json({ message: "This email is already linked to another Google account." });
        }

        if (!user) {
            // A password is kept for schema compatibility; it is random and is
            // never exposed or usable as a user-selected password.
            const generatedPassword = await bcrypt.hash(crypto.randomBytes(32).toString("hex"), 12);
            const givenName = payload.given_name?.trim();
            const familyName = payload.family_name?.trim();
            user = await UserModel.create({
                firstName: givenName && givenName.length >= 2 ? givenName : "Google",
                lastName: familyName && familyName.length >= 2 ? familyName : "User",
                email,
                password: generatedPassword,
                googleId: payload.sub,
            });
        } else if (!user.googleId) {
            user.googleId = payload.sub;
            await user.save();
        }

        const userId = user._id.toString();
        await revokeUserSessions(userId);
        const sessionId = await createSession(userId, user.role, response);
        const { accessToken, refreshToken } = await generateToken({ id: userId, sessionId });

        await generateCSRFToken(userId, response);
        response.cookie("refreshToken", refreshToken, getCookieOptions({ maxAge: 7 * 24 * 60 * 60 * 1000 }));

        const userPayload = {
            _id: userId,
            firstName: user.firstName,
            lastName: user.lastName,
            email: user.email,
            role: user.role,
        };
        await redisClient.setEx(`user:${userId}`, 15 * 60, JSON.stringify(userPayload));

        return response.status(200).json({
            message: "Signed in with Google successfully.",
            accessToken,
            user: userPayload,
        });
    }
);

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

        // Session deletion is asynchronous. It must finish before sending the
        // response because it clears the session cookie as part of cleanup.
        if (currentSessionID) {
            await destroySession(userId, currentSessionID, response);
        } else {
            response.clearCookie("sessionId", getCookieOptions());
        }
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
