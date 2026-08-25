import crypto from "crypto";
import jwt, { JwtPayload, SignOptions } from "jsonwebtoken";
import { redisClient } from "../redis/client.js";
import { Response } from "express";
import { revokeCSRFToken } from "../middlewares/csrfMiddleware.js";
import { getCookieOptions, getCsrfCookieOptions } from "./cookie.js";
import UserModel, { UserRole } from "../models/user.model.js";

export interface TokensPayload extends JwtPayload {
  id: string;
  sessionId: string;
}

interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

const ACCESS_TOKEN_SECRET = process.env.JWT_ACCESS_SECRET as string;
const REFRESH_TOKEN_SECRET = process.env.JWT_REFRESH_SECRET as string;

const ACCESS_TOKEN_TTL = "1d";
const REFRESH_TOKEN_TTL = "7d";

const REFRESH_TOKEN_TTL_SECONDS = Number(process.env.REFRESH_TOKEN_TTL_SECONDS) || 7 * 24 * 60 * 60;
const ACCESS_TOKEN_TTL_SECONDS = Number(process.env.ACCESS_TOKEN_TTL_SECONDS) || 24*60* 60;

export const getRefreshTokenRedisKey = (userId: string, sessionId?: string) => `refresh-token:${userId}${sessionId ? `:${sessionId}` : ""}`;

if (!ACCESS_TOKEN_SECRET || !REFRESH_TOKEN_SECRET) {
  throw new Error("JWT secrets are not configured in environment variables");
}

export async function generateToken(payload: TokensPayload): Promise<AuthTokens> {
  const user = await UserModel.findById(payload.id).select("+role");
  if(!user){
    throw new Error("No user found ...");
  }
  const accessPayload: TokensPayload = {
    ...payload,
    role : user?.role,
    sessionId: payload.sessionId,
  };
  const refreshPayload: TokensPayload = {
    ...payload,
    sessionId: payload.sessionId,
  };

  const accessOptions: SignOptions = {
    expiresIn: ACCESS_TOKEN_TTL,
    subject: payload.id,
  };

  const refreshOptions: SignOptions = {
    expiresIn: REFRESH_TOKEN_TTL,
    subject: payload.id,
  };

  const accessToken = jwt.sign(accessPayload, ACCESS_TOKEN_SECRET, accessOptions);
  const refreshToken = jwt.sign(refreshPayload, REFRESH_TOKEN_SECRET, refreshOptions);

  await redisClient.setEx(getRefreshTokenRedisKey(payload.id, payload.sessionId), REFRESH_TOKEN_TTL_SECONDS, refreshToken);

  return {
    accessToken,
    refreshToken,
    expiresIn: ACCESS_TOKEN_TTL_SECONDS,
  };
}

export const verifyRefreshToken = async (refreshToken: string, sessionId: string) => {
  try {
    const decodedRefreshToken = jwt.verify(refreshToken, REFRESH_TOKEN_SECRET) as TokensPayload;
    if (!decodedRefreshToken) {
      return null;
    }

    const activeSessionId = sessionId ?? decodedRefreshToken.sessionId;
    const storedRefreshToken = await redisClient.get(getRefreshTokenRedisKey(decodedRefreshToken.id, activeSessionId));

    if (storedRefreshToken !== refreshToken) {
      return null;
    }

    return decodedRefreshToken.id;
  } catch {
    return null;
  }
};

export const generateAccessToken = async (id: string, sessionId: string) => {
  const accessToken = jwt.sign({ id, sessionId: sessionId }, ACCESS_TOKEN_SECRET, {
    expiresIn: "1d",
  });

  return {
    accessToken,
    expiresIn: 24*60*60,
    sessionId: sessionId,
  };
};

export const rotateRefreshToken = async (userId: string, response: Response, sessionId: string) => {
  const newRefreshToken = jwt.sign({ id: userId, sessionId }, REFRESH_TOKEN_SECRET, {
    expiresIn: REFRESH_TOKEN_TTL,
    subject: userId,
  });

  await redisClient.setEx(getRefreshTokenRedisKey(userId, sessionId), REFRESH_TOKEN_TTL_SECONDS, newRefreshToken);

  response.cookie("refreshToken", newRefreshToken, getCookieOptions({
    maxAge: 7 * 24 * 60 * 60 * 1000,
  }));

  return newRefreshToken;
};

export const revokeRefreshToken = async (userId: string, response: Response, sessionId?: string): Promise<void> => {
  if (!userId) {
    throw new Error("revokeRefreshToken: userId is required");
  }
  response.clearCookie("refreshToken", getCookieOptions());
  response.clearCookie("csrfToken",getCsrfCookieOptions());
  const refreshTokenKey = getRefreshTokenRedisKey(userId, sessionId);
  await redisClient.del(refreshTokenKey);
  await revokeCSRFToken(userId)
};