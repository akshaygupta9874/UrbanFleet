import { NextFunction, Request, Response } from "express";

//this async Try catch handler is utilising the concept of Higher order functions...


//the below function gets the given asynchronous function as a paramater and wraps it around a security layer say on occuring any kind of error the express error handler is called .. (in my case the AppError.ts in the util folder is called)

const asyncHandler  = (
    fn: (
        req: any,
        res: Response,
        next: NextFunction
    ) => Promise<any>
) => {
    return (req: Request, res: Response, next: NextFunction) => {
        Promise.resolve(fn(req, res, next)).catch(next);
    };
};

export default asyncHandler;