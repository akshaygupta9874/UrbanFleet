import { prisma } from "../db/client.js";
import type { IncomingMessage } from "http";
import jwt, { JwtPayload } from "jsonwebtoken";

import type {
    AuthenticatedSocket,
    AuthenticatedSocketUser,
} from "./types.js";
import { UserRole } from "@prisma/client";
import { TokensPayload } from "../utils/generateToken.js";

interface AccessTokenPayload extends JwtPayload {
    userId: string;
    role: UserRole[];
    sessionId: string;
}


export function extractAccessToken(request: IncomingMessage): string {
    const url = new URL(
        request.url ?? "",
        `http://${request.headers.host}`
    );

    const token = url.searchParams.get("token");

    if (!token) {
        throw new Error("Missing access token.");
    }

    return token;
}
export async function authenticateSocket(
    ws: AuthenticatedSocket,
    request: IncomingMessage
): Promise<void> {

    const token = extractAccessToken(request);
    const payload = jwt.verify(
        token,
        process.env.JWT_ACCESS_SECRET!
    ) as TokensPayload;

    const USER = await prisma.user.findUnique({
        where: { id: payload.id },
    });

    if (!USER) {
        throw new Error("User not found.");
    }

    const user: AuthenticatedSocketUser = {
        userId: payload.id,
        role: USER.roles,
        sessionId: payload.sessionId!,
    };

    if (USER.roles.includes(UserRole.DRIVER)) {

        const driver = await prisma.driver.findFirst({
            where: {
                userId: payload.id,
            },
            select: { id: true },
        });

        if (!driver) {
            throw new Error("Driver profile not found.");
        }

        user.driverId = driver.id;
    }

    ws.user = user;
}