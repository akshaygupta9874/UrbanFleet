export class AppError extends Error {
    public readonly statusCode: number;
    public readonly code: string;
    public readonly isOperational: boolean;
    public readonly details?: any;

    constructor(
        message: string,
        statusCode = 500,
        code = "INTERNAL_SERVER_ERROR",
        isOperational = true,
        details?: any
    ) {
        super(message);

        // 1. Fixes prototype chain for TypeScript
        Object.setPrototypeOf(this, new.target.prototype);

        // 2. Automatically takes the name of the class (useful if you extend this further)
        this.name = this.constructor.name;

        this.statusCode = statusCode;
        this.code = code;
        
        // 3. Flag for trusted errors vs programming bugs
        this.isOperational = isOperational;
        
        // 4. Attach validation errors or extra data
        this.details = details;

        Error.captureStackTrace(this, this.constructor);
    }
}