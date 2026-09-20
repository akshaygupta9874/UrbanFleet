import { Paise } from "../types/payment.types.js";

export interface RefundAllocationInput {
    /** payment.amountPaise (= driverEarningPaise + platformCommissionPaise). */
    totalPaise: Paise;
    driverEarningPaise: Paise;
    platformCommissionPaise: Paise;
    /** Refunds already booked (PENDING + PROCESSED) before this one. */
    refundedSoFarPaise: Paise;
    /** Part of refundedSoFar that was taken back from the driver leg. */
    driverReversedSoFarPaise: Paise;
    /** Part of refundedSoFar that was taken back from the platform leg. */
    platformReversedSoFarPaise: Paise;
    /** The refund being booked now. */
    refundPaise: Paise;
}

export interface RefundAllocation {
    driverPaise: Paise;
    platformPaise: Paise;
}

function assertNonNegativeInt(name: string, value: number): void {
    if (!Number.isSafeInteger(value) || value < 0) {
        throw new RangeError(`${name} must be a non-negative integer (got ${value})`);
    }
}

/**
 * Splits a refund between the DRIVER and PLATFORM legs of the original fare.
 *
 * Properties (all covered by unit tests):
 *  1. driverPaise + platformPaise === refundPaise             (always balances)
 *  2. integer arithmetic only - no floating point, no drift
 *  3. cumulative driver reversal is floor(cumulativeRefund * driverShare / total),
 *     so the split follows the original fare proportionally
 *  4. when the payment is refunded in full (in any number of steps) the driver
 *     leg is reversed by exactly driverEarningPaise and the platform leg by exactly
 *     platformCommissionPaise - the ledger nets to zero
 *  5. rounding paise are taken from the PLATFORM (driver reversal rounds down)
 */
export function allocateRefund(input: RefundAllocationInput): RefundAllocation {
    const {
        totalPaise,
        driverEarningPaise,
        platformCommissionPaise,
        refundedSoFarPaise,
        driverReversedSoFarPaise,
        platformReversedSoFarPaise,
        refundPaise,
    } = input;

    for (const [name, value] of Object.entries(input)) {
        assertNonNegativeInt(name, value);
    }

    if (refundPaise === 0) {
        throw new RangeError("refundPaise must be greater than zero");
    }

    if (driverEarningPaise + platformCommissionPaise !== totalPaise) {
        throw new RangeError("driverEarningPaise + platformCommissionPaise must equal totalPaise");
    }

    if (driverReversedSoFarPaise + platformReversedSoFarPaise !== refundedSoFarPaise) {
        throw new RangeError("Reversed-so-far amounts must add up to refundedSoFarPaise");
    }

    const cumulative = refundedSoFarPaise + refundPaise;

    if (cumulative > totalPaise) {
        throw new RangeError("Refund exceeds the refundable balance");
    }

    if (
        driverReversedSoFarPaise > driverEarningPaise ||
        platformReversedSoFarPaise > platformCommissionPaise
    ) {
        throw new RangeError("Reversed-so-far amounts exceed the original legs");
    }

    // BigInt keeps cumulative * driverShare exact for any realistic amount.
    const targetDriver = Number(
        (BigInt(cumulative) * BigInt(driverEarningPaise)) / BigInt(totalPaise)
    );

    const driverRoom = driverEarningPaise - driverReversedSoFarPaise;

    let driverPaise = Math.min(
        Math.max(targetDriver - driverReversedSoFarPaise, 0),
        refundPaise,
        driverRoom
    );

    let platformPaise = refundPaise - driverPaise;

    const platformRoom = platformCommissionPaise - platformReversedSoFarPaise;

    if (platformPaise > platformRoom) {
        const overflow = platformPaise - platformRoom;
        platformPaise -= overflow;
        driverPaise += overflow;
    }

    return { driverPaise, platformPaise };
}
