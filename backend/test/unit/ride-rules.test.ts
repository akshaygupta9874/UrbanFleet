import { describe, expect, it } from "vitest";
import { RideStatus } from "../../src/models/ride.model.js";
import { canCompleteRide } from "../../src/services/ride.service.js";

describe("ride lifecycle rules", () => {
  it("allows completion only after destination arrival and payment capture", () => {
    expect(
      canCompleteRide({
        status: RideStatus.ARRIVED_AT_DESTINATION,
        paymentStatus: "CAPTURED" as any,
      })
    ).toBe(true);

    expect(
      canCompleteRide({
        status: RideStatus.ARRIVED_AT_DESTINATION,
        paymentStatus: "PENDING" as any,
      })
    ).toBe(false);

    expect(
      canCompleteRide({
        status: RideStatus.STARTED,
        paymentStatus: "CAPTURED" as any,
      })
    ).toBe(false);
  });
});
