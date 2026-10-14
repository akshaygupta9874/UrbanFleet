import jwt, { JwtPayload, SignOptions } from "jsonwebtoken";
import { redisClient } from "../redis/client.js";
import { Response } from "express";
import { revokeCSRFToken } from "../middlewares/csrfMiddleware.js";
import { getCookieOptions, getCsrfCookieOptions } from "./cookie.js";
import UserModel from "../models/user.model.js";

// --- Interfaces ---

// Defines the data stored inside the JWTs
export interface TokensPayload extends JwtPayload {
  id: string;
  sessionId: string;
}

// Defines the return structure when tokens are generated
interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

// --- Configuration & Environment Variables ---

const ACCESS_TOKEN_SECRET = process.env.JWT_ACCESS_SECRET as string;
const REFRESH_TOKEN_SECRET = process.env.JWT_REFRESH_SECRET as string;

// Token time-to-live (TTL) for JWT signing
const ACCESS_TOKEN_TTL = "1d";
const REFRESH_TOKEN_TTL = "7d";

// Token time-to-live in seconds (used for Redis expiration and cookies)
const REFRESH_TOKEN_TTL_SECONDS = Number(process.env.REFRESH_TOKEN_TTL_SECONDS) || 7 * 24 * 60 * 60;
const ACCESS_TOKEN_TTL_SECONDS = Number(process.env.ACCESS_TOKEN_TTL_SECONDS) || 24 * 60 * 60;

// Ensure server crashes early if secrets are missing
if (!ACCESS_TOKEN_SECRET || !REFRESH_TOKEN_SECRET) {
  throw new Error("JWT secrets are not configured in environment variables");
}

// --- Helper Functions ---

/**
 * Generates a consistent Redis key for storing/retrieving a refresh token.
 * Example output: "refresh-token:65abc123:987xyz"
 */
export const getRefreshTokenRedisKey = (userId: string, sessionId: string) => 
  `refresh-token:${userId}:${sessionId}`;


// --- Core Token Functions ---

/**
 * Generates both an Access Token and a Refresh Token for a user.
 * It also saves the refresh token into Redis to allow for manual revocation.
 */
export async function generateToken(payload: TokensPayload): Promise<AuthTokens> {
  // Fetch user to include their role in the access token
  const user = await UserModel.findById(payload.id).select("+role");
  if (!user) {
    throw new Error("No user found ...");
  }

  // Define payloads (Access token gets the role, refresh token does not need it)
  const accessPayload: TokensPayload = {
    ...payload,
    role: user?.role,
    sessionId: payload.sessionId,
  };
  
  const refreshPayload: TokensPayload = {
    ...payload,
    sessionId: payload.sessionId,
  };

  // Define signing options (Expiration and Subject/User ID)
  const accessOptions: SignOptions = {
    expiresIn: ACCESS_TOKEN_TTL,
    subject: payload.id,
  };

  const refreshOptions: SignOptions = {
    expiresIn: REFRESH_TOKEN_TTL,
    subject: payload.id,
  };

  // Create the actual JWT strings
  const accessToken = jwt.sign(accessPayload, ACCESS_TOKEN_SECRET, accessOptions);
  const refreshToken = jwt.sign(refreshPayload, REFRESH_TOKEN_SECRET, refreshOptions);

  // Store the refresh token in Redis so we can invalidate it later if needed
  await redisClient.setEx(
    getRefreshTokenRedisKey(payload.id, payload.sessionId), 
    REFRESH_TOKEN_TTL_SECONDS, 
    refreshToken
  );

  return {
    accessToken,
    refreshToken,
    expiresIn: ACCESS_TOKEN_TTL_SECONDS,
  };
}

/**
 * Validates a refresh token. 
 * Checks both the JWT signature and verifies it hasn't been revoked in Redis.
 * Returns the user's ID if valid, or null if invalid.
 */
export const verifyRefreshToken = async (refreshToken: string, sessionId: string) => {
  try {
    // 1. Verify the JWT cryptographic signature
    const decodedRefreshToken = jwt.verify(refreshToken, REFRESH_TOKEN_SECRET) as TokensPayload;
    if (!decodedRefreshToken) {
      return null;
    }

    // 2. Cross-reference with Redis to ensure it matches the currently active token
    const storedRefreshToken = await redisClient.get(
      getRefreshTokenRedisKey(decodedRefreshToken.id, sessionId)
    );

    // If it's missing from Redis or doesn't match, it was revoked or overwritten
    if (storedRefreshToken !== refreshToken) {
      return null;
    }

    return decodedRefreshToken.id;
  } catch {
    // Catch token expiration or malformed token errors
    return null;
  }
};

/**
 * Generates just a single Access Token (useful when refreshing a session).
 */
export const generateAccessToken = async (id: string, sessionId: string) => {
  const accessToken = jwt.sign({ id, sessionId: sessionId }, ACCESS_TOKEN_SECRET, {
    expiresIn: "1d",
  });

  return {
    accessToken,
    expiresIn: 24 * 60 * 60,
    sessionId: sessionId,
  };
};

/**
 * Generates a new Refresh Token, updates Redis, and attaches it to the response cookies.
 * Used to keep a user logged in without requiring them to re-enter credentials.
 */
export const rotateRefreshToken = async (userId: string, response: Response, sessionId: string) => {
  // Create the new refresh token
  const newRefreshToken = jwt.sign({ id: userId, sessionId }, REFRESH_TOKEN_SECRET, {
    expiresIn: REFRESH_TOKEN_TTL,
    subject: userId,
  });

  // Update Redis with the newly generated token
  await redisClient.setEx(
    getRefreshTokenRedisKey(userId, sessionId), 
    REFRESH_TOKEN_TTL_SECONDS, 
    newRefreshToken
  );

  // Attach the new token to the client's cookies
  response.cookie("refreshToken", newRefreshToken, getCookieOptions({
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days in milliseconds
  }));

  return newRefreshToken;
};

/**
 * Logs a user out of a specific session by clearing cookies and deleting tokens from Redis.
 */
export const revokeRefreshToken = async (userId: string, response: Response, sessionId: string): Promise<void> => {
  if (!userId) {
    throw new Error("revokeRefreshToken: userId is required");
  }
  
  // 1. Clear the tokens from the user's browser
  response.clearCookie("refreshToken", getCookieOptions());
  response.clearCookie("csrfToken", getCsrfCookieOptions());
  
  // 2. Remove the refresh token from Redis
  const refreshTokenKey = getRefreshTokenRedisKey(userId, sessionId);
  await redisClient.del(refreshTokenKey);
  
  // 3. Remove the CSRF token from Redis
  await revokeCSRFToken(userId);
};