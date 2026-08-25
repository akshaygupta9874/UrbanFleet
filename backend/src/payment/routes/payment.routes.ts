import { Router } from "express";
import { authMiddleware } from "../../middlewares/auth.middleware.js";
import {
    validate,
    createOrderSchema,
    verifyCheckoutSchema,
    refundSchema,
    paymentIdParamSchema,
    rideIdParamSchema,
    listPaymentsQuerySchema,
} from "../validation/payment.validation.js";
import {
    createOrder,
    verifyCheckout,
    getPayment,
    getPaymentsByRide,
    listPayments,
    refundPayment,
} from "../controllers/payment.controller.js";

const router = Router();
router.use(authMiddleware);

router.post(
    "/orders",
    validate(createOrderSchema),
    createOrder
);

router.post(
    "/verify",
    validate(verifyCheckoutSchema),
    verifyCheckout
);

router.get(
    "/",
    validate(listPaymentsQuerySchema),
    listPayments
);

router.get(
    "/ride/:rideId",
    validate(rideIdParamSchema),
    getPaymentsByRide
);

router.get(
    "/:paymentId",
    validate(paymentIdParamSchema),
    getPayment
);

router.post(
    "/:paymentId/refund",
    validate(paymentIdParamSchema),
    validate(refundSchema),
    refundPayment
);

export default router;