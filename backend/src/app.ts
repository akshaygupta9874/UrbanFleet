import express from "express";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import mongoSanitize from "express-mongo-sanitize";

import authRouter from "./routes/auth.route.js";
import userRouter from "./routes/user.route.js";
import driverRouter from "./routes/driver.route.js";
import rideRouter from "./routes/ride.route.js";
import paymentRouter from "./payment/routes/payment.routes.js";
import webhookRouter from "./payment/routes/webhook.routes.js";
import errorHandler from "./middlewares/errorHandler.js";

/** Creates the HTTP application without opening network connections. */
export function createApp() {
  const app = express();

  app.use(cors({ origin: process.env.FRONTEND_URL ?? "http://localhost:5173", credentials: true }));
  app.use("/v1/webhooks", webhookRouter);
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  app.use(mongoSanitize());
  app.use(helmet());
  app.use(cookieParser());

  app.get("/healthz", (_request, response) => response.status(200).json({ status: "ok" }));
  app.use("/v1/auth", authRouter);
  app.use("/v1/user", userRouter);
  app.use("/v1/driver", driverRouter);
  app.use("/v1/ride", rideRouter);
  app.use("/v1/payments", paymentRouter);
  app.use(errorHandler);

  return app;
}
