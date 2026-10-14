// src/sockets/socket.ts

import type { Server as HttpServer } from "http";
import { WebSocketServer } from "ws";

import type { AuthenticatedSocket } from "./types.js";

import { authenticateSocket } from "./socket.middleware.js";
import { registerSocketHandlers } from "./handlers/index.js";
import { socketRegistry } from "./registry/socket.registry.js";

import { UserRole } from "@prisma/client";

import {
    setDriverOffline,
} from "../redis/services/driver-presence.service.js";

let wss: WebSocketServer;

export function initializeWebSocketServer(
    httpServer: HttpServer
): WebSocketServer {


    wss = new WebSocketServer({
        noServer: true,
    });

    httpServer.on(
        "upgrade",
        (request, socket, head) => {
            console.log("🔥 Upgrade request received");
            wss.handleUpgrade(
                request,
                socket,
                head,
                async (ws) => {

                    const authenticatedSocket =
                        ws as AuthenticatedSocket;

                    try {

                        // Authenticate


                        await authenticateSocket(
                            authenticatedSocket,
                            request
                        );

                        // Register Socket

                        socketRegistry.register(
                            authenticatedSocket
                        );

                        // Register Socket Handlers

                        registerSocketHandlers(authenticatedSocket);

                        // Socket Closed

                        authenticatedSocket.on(
                            "close",
                            () => {

                                void (async () => {

                                    socketRegistry.unregister(
                                        authenticatedSocket
                                    );

                                    if (
                                        authenticatedSocket.user.role.includes(UserRole.DRIVER) &&
                                        authenticatedSocket.user.driverId
                                    ) {

                                        await setDriverOffline(
                                            authenticatedSocket.user.driverId
                                        );

                                    }

                                })();

                            }
                        );

                    } catch (err) {
                        console.error("Socket initialization failed:");
                        console.error(err);

                        authenticatedSocket.close(
                            1011,
                            "Internal Server Error"
                        );
                    }

                }
            );

        }
    );

    wss.on(
        "listening",
        () => {

            console.log(
                "✅ WebSocket server initialized."
            );

        }
    );

    wss.on(
        "error",
        (err) => {

            console.error(
                "WebSocket Server Error:",
                err
            );

        }
    );

    return wss;

}

export function getWebSocketServer(): WebSocketServer {

    if (!wss) {

        throw new Error(
            "WebSocket server has not been initialized."
        );

    }

    return wss;

}