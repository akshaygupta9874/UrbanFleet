import { ErrorRequestHandler } from "express";
import { AppError } from "../utils/AppError.js"; // Adjust path if necessary

//_response means ----> I am required to include this parameter, but I am intentionally not using it. Do not throw a warning

const errorHandler: ErrorRequestHandler = (error, _request, response, _next) => {
    // 1. Determine the status code (default to 500)
    const statusCode = error.statusCode || error.status || 500;

    // 2. Log the error on the server for debugging
    console.error(`[Error] ${error.name}:`, error.message);
    if (process.env.NODE_ENV !== "production" && !error.isOperational) {
        console.error(error.stack); // Only print heavy stack traces for unexpected bugs
    }

    // 3. Handle known, trusted errors (AppError)
    if (error instanceof AppError || error.isOperational) {
        return response.status(statusCode).json({
            success: false,
            message: error.message, // Passes your exact string (e.g., "Invalid email")
            code: error.code,
            details: error.details, // Passes Zod field errors if provided
        });
    }

    // 4. Handle unexpected/untrusted errors (e.g., Node.js crashes, unhandled DB errors)
    // We hide the real error message here so we don't leak server secrets to the client.
    const genericMessage = statusCode >= 500
        ? "Something went wrong. Please try again later."
        : "The request could not be processed. Please check your input and try again.";

    return response.status(statusCode).json({
        success: false,
        message: genericMessage,
        code: "INTERNAL_SERVER_ERROR",
        // Pass the real error in development mode so you can debug frontend easily
        ...(process.env.NODE_ENV === "development" && { devError: error.message }) 
    });
};

export default errorHandler;