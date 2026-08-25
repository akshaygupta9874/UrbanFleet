import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';

export const fareBreakdownSchema = z.object({
  baseFarePaise: z.number().int().nonnegative(),
  distanceFarePaise: z.number().int().nonnegative(),
  timeFarePaise: z.number().int().nonnegative(),
  surgePaise: z.number().int().nonnegative().default(0),
  platformCommissionPaise: z.number().int().nonnegative(),
  driverEarningPaise: z.number().int().nonnegative(),
  totalPaise: z.number().int().positive(),
});

export const createOrderSchema = z.object({
  body: z.object({
    rideId: z.string().min(1),
    driverId: z.string().min(1),
    fareBreakdown: fareBreakdownSchema,
    idempotencyKey: z.string().min(8).optional(),
  }),
});

export const verifyCheckoutSchema = z.object({
  body: z.object({
    razorpay_order_id: z.string().min(1),
    razorpay_payment_id: z.string().min(1),
    razorpay_signature: z.string().min(1),
  }),
});

export const refundSchema = z.object({
  body: z.object({
    amountPaise: z.number().int().positive().optional(),
    reason: z.string().min(3).max(500),
  }),
});

export const paymentIdParamSchema = z.object({
  params: z.object({ paymentId: z.string().min(1) }),
});

export const rideIdParamSchema = z.object({
  params: z.object({ rideId: z.string().min(1) }),
});

export const listPaymentsQuerySchema = z.object({
  query: z.object({
    page: z.coerce.number().int().positive().optional(),
    limit: z.coerce.number().int().positive().max(100).optional(),
    status: z.string().optional(),
  }),
});

export function validate(schema : z.ZodType) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse({ body: req.body, params: req.params, query: req.query });
    if (!result.success) {
      res.status(422).json({
        message: 'Validation failed',
        errors: z.treeifyError(result.error),
      });
      return;
    }
    const parsed = result.data as { body?: unknown; params?: unknown; query?: unknown };
    if (parsed.body !== undefined) req.body = parsed.body;
    if (parsed.params !== undefined) req.params = parsed.params as typeof req.params;
    if (parsed.query !== undefined) req.query = parsed.query as typeof req.query;

    next();
  };
}
