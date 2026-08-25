import { ErrorRequestHandler } from "express";

interface HttpError extends Error {
  status?: number;
  statusCode?: number;
}

const errorHandler: ErrorRequestHandler = (error: HttpError, _request, response, _next) => {
  const statusCode = error.statusCode || error.status || 500;
  const message = statusCode >= 500
    ? "Something went wrong. Please try again later."
    : "The request could not be processed. Please check your input and try again.";

  console.error(error);

  response.status(statusCode).json({
    message
  });
};

export default errorHandler;
