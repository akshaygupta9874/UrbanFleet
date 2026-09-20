# Extras (optional)

Everything in `payment/` is the drop-in replacement for your existing `payment` folder.
This `extras/` folder is optional and is not part of your application.

## Test suite (`extras/tests`)

139 unit tests for the upgraded module (+ 5 reproductions of the original defects).
They mock Redis, Razorpay and MongoDB sessions, so **no database or network is needed**.

```bash
npm i -D vitest
# copy `tests/` and `vitest.config.ts` to your project root (next to `src/`)
npx vitest run
```

Assumptions (adjust the tests if yours differ):
- project layout `src/payment`, `src/models`, `src/redis/client`, `src/config/razorpay.config`, `src/sockets/emitters/*`, `src/utils/AppError`, `src/middlewares/*`;
- `AppError` exposes a numeric `.statusCode`;
- `models/user.model` default-exports `UserModel` and exports `UserRole` (with `RIDER`, `DRIVER`, `ADMIN`);
- `models/ride.model` exports `RideModel`, `RideStatus.ARRIVED_AT_DESTINATION|ACCEPTED|COMPLETED`, `RidePaymentStatus.PENDING|CAPTURED|FAILED`.

Keep `tests/` out of your production `tsc` build (or outside `src`).
`tests/repro_original.test.ts` is optional: it needs your ORIGINAL payment folder at `src/payment_orig/`.

## What the tests do NOT cover
Real MongoDB transactions / index builds, real Redis and live Razorpay calls. See section 12.3
of `payment/docs/PAYMENT_LIFECYCLE_REPORT.md` for the integration checklist.

## Read first
`payment/docs/PAYMENT_LIFECYCLE_REPORT.md` - section 11 lists the changes required in the rest of the project
(webhook mount order, `syncIndexes()`, reconciliation job, Razorpay events, frontend).
