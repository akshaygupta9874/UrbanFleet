import dotenv from "dotenv";
dotenv.config();

import express from "express";
import http from "http";

import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import mongoSanitize from "express-mongo-sanitize";

import connectDB from "./config/db.config.js";
import { connectRedis } from "./redis/client.js";

import authRouter from "./routes/auth.route.js";
import userRouter from "./routes/user.route.js";
import driverRouter from "./routes/driver.route.js";
import rideRouter from "./routes/ride.route.js";
import paymentRouter from "./payment/routes/payment.routes.js";
import webhookRouter from "./payment/routes/webhook.routes.js";

// import { errorHandler } from "./middlewares/error.middleware.js";

import { initializeWebSocketServer } from "./sockets/socket.js";
import errorHandler from "./middlewares/errorHandler.js";

const app = express();
const httpServer = http.createServer(app);

app.use(
    cors({
        origin: process.env.FRONTEND_URL ?? "http://localhost:5173",
        credentials: true,
    })
);

// Razorpay signs the exact request bytes. This must be registered before the
// global JSON parser so the webhook route receives an untouched Buffer.
app.use("/v1/webhooks", webhookRouter);

app.use(express.json());

app.use(
    express.urlencoded({
        extended: true,
    })
);

app.use(mongoSanitize());

app.use(helmet());

app.use(cookieParser());

// Routes
app.use("/v1/auth", authRouter);
app.use("/v1/user", userRouter);
app.use("/v1/driver", driverRouter);
app.use("/v1/ride", rideRouter);
app.use("/v1/payments", paymentRouter);

app.use(errorHandler);

const PORT = Number(process.env.PORT) || 3000;

async function bootstrap() {
    try {
        await connectRedis();

        await connectDB();

        initializeWebSocketServer(httpServer);

        httpServer.listen(PORT, () => {
            console.log(`🚀 Backend running on http://localhost:${PORT}`);
        });
    } catch (error) {
        console.error("Failed to start application:", error);
        process.exit(1);
    }
}

bootstrap();
